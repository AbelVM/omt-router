import { PowerCache } from 'performance-helpers/powerCache';
import { getTilesAlongLine } from './tiles/tilesManager.js';
import { buildGraphAsync } from './graphs/graphBuilder.js';
import { getSharedTilePool, disposeSharedTilePool } from './tiles/tilePool.js';
import { interpolate, haversineDistance } from './utils/misc.js';
import {
  validateRouteCoordinates,
  normalizeRouteMode,
  validateZoom,
  normalizeTileSchema,
  validateUrlTemplate,
  validateMaxAcceptableSnapDistance,
  validateRadius,
  validateCostField,
  validateEngineId,
  validateTileUrlTransform,
  validateTileProxyTemplate,
  normalizePenalties,
} from './utils/routeValidation.js';
import {
  buildCH,
  queryRoute,
  computeRoute,
  nearestNode,
  getEngineWorkerStatus,
  onEngineWorkerStatusChange,
  cancelRunningEngine,
  shutdownEngineWorker,
} from './engines/router.js';
import { MapLibreRoutingControl } from './ui/MapLibreRoutingControl.js';

/**
 * @typedef {[number, number]} LatLng
 * @typedef {'distance'|'travelTime'|'optimal'} CostField
 *
 * @typedef {Object} RouteResult
 * @property {boolean} found
 * @property {number} cost
 * @property {CostField} costField
 * @property {number[]} path
 * @property {Array<LatLng>} coordinates
 * @property {string} [engine]
 * @property {string} [reason]
 * @property {string} [message]
 * @property {string} [code]
 * @property {Object} [fallback]
 * @property {Object} [graph]
 * @property {number} [startSnapDistanceM]
 * @property {number} [endSnapDistanceM]
 *
 * @typedef {Object} RouteOptions
 * @property {number} [zoom]
 * @property {'zxy'|'tms'} [schema]
 * @property {number} [radius]
 * @property {number} [maxAutoRadius]
 * @property {CostField} [costField]
 * @property {Object} [penalties]
 * @property {number} [maxAcceptableSnapDistanceM]
 * @property {string} [engineId]
 * @property {boolean} [useWorkerPool]
 * @property {number} [engineWorkerPoolSize]
 * @property {number} [engineWorkerMaxPoolSize]
 * @property {(rawURL: string, tile: object) => string} [tileUrlTransform]
 * @property {string} [tileProxyTemplate]
 * @property {boolean} [includeGraph]
 */

export {
  buildCH,
  queryRoute,
  computeRoute,
  nearestNode,
  getEngineWorkerStatus,
  onEngineWorkerStatusChange,
  cancelRunningEngine,
  MapLibreRoutingControl,
  buildTileURL,
};

// Module-level singletons — created once at import time, shared across all
// route() calls. Avoids ~50–200 ms of worker-spawn latency per call and lets
// the tile cache persist between calls so revisited tiles are never re-fetched.

// Tile-segment cache: individual parsed tile results.
// 5000 entries × ~5 KB avg = ~25 MB max; tiles expire after 5 min.
const _tileCache = new PowerCache({ maxEntries: 5000, defaultTTL: 300_000 });

// Graph cache: merged graphs keyed by sorted tile list + mode.
// Reuses an already-merged graph when the exact same tile set is requested again
// (e.g. repeated route queries in the same area or after transportation-mode
// toggle back to a previously used mode). 50 entries is enough for typical use.
const _graphCache = new PowerCache({ maxEntries: 50, defaultTTL: 300_000 });
const DEG_TO_RAD = Math.PI / 180;

function buildTileURL(urlTemplate, tile, { tileUrlTransform, tileProxyTemplate } = {}) {
  const rawURL = interpolate(urlTemplate, { z: tile.z, x: tile.x, y: tile.y });

  if (typeof tileUrlTransform === 'function') {
    const transformed = tileUrlTransform(rawURL, tile);
    if (typeof transformed !== 'string') {
      throw new Error('Invalid tileUrlTransform: expected a string return value.');
    }
    return transformed;
  }

  if (typeof tileProxyTemplate === 'string' && tileProxyTemplate) {
    if (tileProxyTemplate.includes('{url}')) {
      return interpolate(tileProxyTemplate, {
        z: tile.z,
        x: tile.x,
        y: tile.y,
        url: encodeURIComponent(rawURL),
      });
    }
    return `${tileProxyTemplate}${encodeURIComponent(rawURL)}`;
  }

  return rawURL;
}

function getMissingTileError(graph, code) {
  return graph?.missingTileErrors?.find((err) => err?.code === code) ?? null;
}

export function dispose() {
  try {
    shutdownEngineWorker();
  } catch {
    // Best-effort cleanup.
  }

  _tileCache.clear();
  _graphCache.clear();
  disposeSharedTilePool();
}

export const shutdown = dispose;

/**
 * Compute the tile fetch radius needed to reliably contain the real path.
 *
 * `radius` is in tile units; it controls how many tiles on each side of the
 * Bresenham line are loaded.  At zoom 14, one tile ≈ 2π·R·cos(lat)/2^14 m
 * (≈ 1 870 m at 40°N).
 *
 * The real path can deviate *laterally* from the beeline due to one-way
 * streets, rivers, parks, and highway access restrictions.  That lateral
 * budget is:
 *   - Floor of 600 m (covers typical urban one-way detours)
 *   - Plus 15% of the beeline for long routes where geographic features
 *     (rivers, motorway spurs) force larger diversions
 *
 * radius = ceil(bufferM / tileWidthM), clamped to [1, 3].
 *
 * Examples at zoom 14 / 40°N (tileWidthM ≈ 1 870 m):
 *   500 m route  → bufferM = 600 m → radius = 1  (3-tile-wide corridor ≈ 5.6 km)
 *   5 km route   → bufferM = 750 m → radius = 1
 *   10 km route  → bufferM = 1 500 m → radius = 1
 *   14 km route  → bufferM = 2 100 m → radius = 2  (5-tile-wide corridor ≈ 9.4 km)
 *   30 km route  → bufferM = 4 500 m → radius = 3
 */
function computeRadius(start, end, zoom) {
  const midLat = (start[1] + end[1]) / 2;
  const tileWidthM = (2 * Math.PI * 6_371_000 * Math.cos(midLat * DEG_TO_RAD)) / 2 ** zoom;
  const beelineM = haversineDistance(start, end);
  const bufferM = Math.max(600, beelineM * 0.15);
  return Math.min(3, Math.max(1, Math.ceil(bufferM / tileWidthM)));
}

/**
 * Compute a route between two coordinate pairs using tiled graph data.
 * @param {LatLng} start
 * @param {LatLng} end
 * @param {string} mode
 * @param {string} urlTemplate
 * @param {RouteOptions} [options]
 * @returns {Promise<RouteResult>}
 * @throws {Error} When required route options are invalid.
 */
export const route = async (
  start,
  end,
  mode,
  urlTemplate,
  {
    zoom = 14,
    schema = 'zxy',
    radius,
    maxAutoRadius = 8,
    engineId = 'auto',
    costField = 'distance',
    penalties = {},
    useWorkerPool = false,
    engineWorkerPoolSize = null,
    engineWorkerMaxPoolSize = null,
    maxAcceptableSnapDistanceM,
    tileUrlTransform,
    tileProxyTemplate,
    includeGraph = false,
  } = {}
) => {
  validateRouteCoordinates(start, 'start');
  validateRouteCoordinates(end, 'end');
  mode = normalizeRouteMode(mode);
  validateZoom(zoom);
  schema = normalizeTileSchema(schema);
  validateUrlTemplate(urlTemplate);
  validateMaxAcceptableSnapDistance(maxAcceptableSnapDistanceM);
  if (radius !== undefined) radius = validateRadius(radius);
  validateCostField(costField);
  validateEngineId(engineId);
  validateTileUrlTransform(tileUrlTransform);
  validateTileProxyTemplate(tileProxyTemplate);

  const normalizedPenalties = normalizePenalties(penalties);

  const initialRadius = radius ?? computeRadius(start, end, zoom);
  const parsedMaxAutoRadius = Number(maxAutoRadius);
  const effectiveMaxAutoRadius = Number.isFinite(parsedMaxAutoRadius)
    ? Math.floor(parsedMaxAutoRadius)
    : 8;
  const normalizedMaxAutoRadius = Math.max(initialRadius, Math.min(10, effectiveMaxAutoRadius));

  // Retry loop: if the graph at the current radius has no connecting path,
  // one endpoint has no nearby graph node, or endpoint snapping quality is
  // poor, widen by +1 tile and retry.
  //
  // `no_path` means both nodes were found but the corridor was too narrow for
  // the real detour; `no_node` can happen when a point is near a road that is
  // just outside the loaded corridor; `poor_snap` means snapped nodes are too
  // far from user-selected points at this radius; `incomplete_path` means the
  // selected engine produced an invalid/incomplete node sequence. The tile cache ensures
  // already-fetched tiles are not re-downloaded.
  //
  // Expand up to maxAutoRadius (default 8) to handle long detours that
  // exceed the old radius=4 ceiling, while still preventing unbounded growth.
  const maxRadius = normalizedMaxAutoRadius;

  const pool = getSharedTilePool();
  let lastResult;
  let lastGraph = null;
  // Cache sorted tileIds per radius to avoid repeated sorting in the retry loop

  // FNV-1a 32-bit hash for fast, stable cache keys
  function fnv1aHash(arr) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < arr.length; i++) {
      const str = arr[i];
      for (let j = 0; j < str.length; j++) {
        hash ^= str.charCodeAt(j);
        hash = (hash * 0x01000193) >>> 0;
      }
    }
    return hash.toString(16);
  }

  const sortedTileIdsByRadius = new Map();

  for (let r = initialRadius; r <= maxRadius; r++) {
    const candidateTiles = getTilesAlongLine(start, end, zoom, r, schema);
    const tiles = candidateTiles.map((tile) => ({
      ...tile,
      url: buildTileURL(urlTemplate, tile, { tileUrlTransform, tileProxyTemplate }),
    }));

    // Compute and cache sorted tileIds for this radius
    let tileIds = sortedTileIdsByRadius.get(r);
    if (!tileIds) {
      tileIds = tiles.map((t) => `${t.z}/${t.x}/${t.y}`);
      tileIds.sort();
      sortedTileIdsByRadius.set(r, tileIds);
    }

    // Use a fast rolling hash of tileIds for the cache key
    const tileIdsHash = fnv1aHash(tileIds);
    const canUseGraphCache = typeof tileUrlTransform !== 'function';
    const graphKey = canUseGraphCache
      ? `v3:${mode}:${zoom}:${schema}:${urlTemplate}:${tileProxyTemplate ?? ''}:${tileIdsHash}`
      : null;
    let graph = graphKey ? _graphCache.get(graphKey) : null;
    if (!graph) {
      graph = await buildGraphAsync(tiles, mode, { pool, cache: _tileCache });
      // Only cache complete graphs; partial graphs from failed tile fetches
      // would otherwise poison future route attempts in the same area.
      // Partial graphs may still be useful for the current route attempt,
      // but they must not be reused later as if they were complete.
      if (graphKey && !graph?.hasMissingTiles) {
        _graphCache.set(graphKey, graph);
      }
    }
    lastGraph = graph;

    lastResult = await computeRoute(start, end, graph, {
      costField,
      penalties: normalizedPenalties,
      engineId,
      useWorkerPool,
      engineWorkerPoolSize: engineWorkerPoolSize ?? engineWorkerMaxPoolSize,
      maxAcceptableSnapDistanceM,
    });

    // Always surface partial graph status in the result
    const partialGraphStatus = {
      partialGraph: graph?.hasMissingTiles ?? false,
      hasMissingTiles: graph?.hasMissingTiles ?? false,
      missingTileErrors: graph?.missingTileErrors ?? [],
    };

    const corsError = getMissingTileError(graph, 'MissingAllowOriginHeader');
    if (!lastResult.found && corsError) {
      return {
        ...lastResult,
        ...partialGraphStatus,
        reason: 'tile_cors',
        code: 'MissingAllowOriginHeader',
        message: corsError.message,
      };
    }

    if (lastResult.found) {
      const result = includeGraph ? { ...lastResult, graph } : lastResult;
      return { ...result, ...partialGraphStatus };
    }
    if (
      lastResult.reason !== 'no_path' &&
      lastResult.reason !== 'no_node' &&
      lastResult.reason !== 'poor_snap' &&
      lastResult.reason !== 'incomplete_path'
    ) {
      const result = includeGraph ? { ...lastResult, graph } : lastResult;
      return { ...result, ...partialGraphStatus };
    }

    if (r < maxRadius) {
      // Log so the caller can see the retry in dev tools.
      console.debug(
        `[omt-router] ${lastResult.reason} at radius=${r}, retrying with radius=${r + 1}`
      );
    }
  }

  // Always surface partial graph status in the result
  const partialGraphStatus = {
    partialGraph: lastGraph?.hasMissingTiles ?? false,
    hasMissingTiles: lastGraph?.hasMissingTiles ?? false,
    missingTileErrors: lastGraph?.missingTileErrors ?? [],
  };
  const result = includeGraph ? { ...lastResult, graph: lastGraph } : lastResult;
  return { ...result, ...partialGraphStatus };
};

/**
 * Compute multiple routes in parallel using the same public route() flow.
 * @param {Array<{start:LatLng,end:LatLng,mode:string,costField?:CostField}>} requests
 * @param {string} urlTemplate
 * @param {RouteOptions} [options]
 * @returns {Promise<Array<RouteResult>>}
 */
export async function routeBatch(requests, urlTemplate, options = {}) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('routeBatch requires a non-empty array of requests');
  }

  if (typeof urlTemplate !== 'string' || urlTemplate.length === 0) {
    throw new Error('routeBatch requires a valid urlTemplate string');
  }

  const tilePool = getSharedTilePool();
  const maxConcurrentRoutes = Number.isFinite(options.maxConcurrentRoutes)
    ? Math.max(1, Math.floor(options.maxConcurrentRoutes))
    : Math.max(1, Math.min(requests.length, tilePool?.maxSize ?? requests.length));

  const results = new Array(requests.length);
  let nextIndex = 0;
  const active = new Set();

  const scheduleNext = async () => {
    const index = nextIndex;
    nextIndex += 1;
    const request = requests[index];

    if (!request || typeof request !== 'object') {
      throw new Error(
        `routeBatch request at index ${index} must be an object with start, end, and mode`
      );
    }

    const { start, end, mode, costField } = request;
    validateRouteCoordinates(start, `requests[${index}].start`);
    validateRouteCoordinates(end, `requests[${index}].end`);
    if (typeof mode !== 'string' || mode.length === 0) {
      throw new Error(`routeBatch request at index ${index} must include a valid mode`);
    }
    if (costField !== undefined) {
      validateCostField(costField);
    }

    results[index] = await route(start, end, mode, urlTemplate, { ...options, costField });
  };

  while (nextIndex < requests.length || active.size > 0) {
    while (active.size < maxConcurrentRoutes && nextIndex < requests.length) {
      const task = scheduleNext();
      active.add(task);
      task.finally(() => active.delete(task));
    }
    if (active.size === 0) break;
    await Promise.race(active);
  }

  return results;
}

/**
 * Build a merged graph for an arbitrary tile list using the shared
 * worker pool and tile cache. This is a thin wrapper around
 * `buildGraphAsync` that also reuses the module-level `_graphCache`.
 *
 * @param {Array<{z:number,x:number,y:number,url?:string}>} tiles
 * @param {string} mode
 * @param {Object} [opts]
 * @param {number} [opts.zoom]
 * @param {'zxy'|'tms'} [opts.schema]
 * @param {string} [opts.urlTemplate]
 * @param {string} [opts.tileProxyTemplate]
 * @param {(rawURL:string, tile:object)=>string} [opts.tileUrlTransform]
 * @param {import('./tiles/tilePool.js').TilePool} [opts.pool]
 * @returns {Promise<Object>} merged graph
 */
export async function buildGraphForTiles(
  tiles,
  mode,
  {
    zoom = 14,
    schema = 'zxy',
    urlTemplate = '',
    tileProxyTemplate = '',
    tileUrlTransform,
    pool = getSharedTilePool(),
  } = {}
) {
  if (!Array.isArray(tiles)) throw new Error('tiles must be an array');

  const tileIds = tiles.map((t) => `${t.z}/${t.x}/${t.y}`);
  tileIds.sort();

  // FNV-1a 32-bit hash (same as route())
  let hash = 0x811c9dc5;
  for (let i = 0; i < tileIds.length; i++) {
    const s = tileIds[i];
    for (let j = 0; j < s.length; j++) {
      hash ^= s.charCodeAt(j);
      hash = (hash * 0x01000193) >>> 0;
    }
  }
  const tileIdsHash = hash.toString(16);

  const canUseGraphCache = typeof tileUrlTransform !== 'function';
  const graphKey = canUseGraphCache
    ? `v3:${mode}:${zoom}:${schema}:${urlTemplate}:${tileProxyTemplate ?? ''}:${tileIdsHash}`
    : null;

  let graph = graphKey ? _graphCache.get(graphKey) : null;
  if (!graph) {
    graph = await buildGraphAsync(tiles, mode, { pool, cache: _tileCache });
    if (graphKey && !graph?.hasMissingTiles) {
      _graphCache.set(graphKey, graph);
    }
  }

  return graph;
}
