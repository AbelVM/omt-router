import { PowerPool } from 'performance-helpers/powerPool';
import { PowerCache } from 'performance-helpers/powerCache';
import tilesWorker from './tiles/tilesWorker?worker&inline.js';
import { getTilesAlongLine } from './tiles/tilesManager.js';
import { buildGraphAsync } from './graphs/graphBuilder.js';
import { interpolate, haversineDistance } from './utils/misc.js';
import {
  validateRouteCoordinates,
  normalizeRouteMode,
  validateZoom,
  normalizeTileSchema,
  validateUrlTemplate,
  validateMaxAcceptableSnapDistance,
  validateRadius,
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
 * @property {'zxy'|'xyz'} [schema]
 * @property {number} [radius]
 * @property {number} [maxAutoRadius]
 * @property {CostField} [costField]
 * @property {Object} [penalties]
 * @property {number} [maxAcceptableSnapDistanceM]
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
const _hwConcurrency =
  typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
const TILE_POOL_MAX_SIZE = Math.min(8, Math.max(1, _hwConcurrency - 1));
const TILE_POOL_BASE_SIZE = Math.min(2, TILE_POOL_MAX_SIZE);
let _pool = null;
const IS_WORKER_AVAILABLE = typeof Worker !== 'undefined';

function getSharedPool() {
  if (_pool) return _pool;
  if (!IS_WORKER_AVAILABLE) {
    throw new Error('Web Worker is not available in this environment.');
  }

  _pool = new PowerPool(tilesWorker, {
    size: TILE_POOL_BASE_SIZE,
    maxSize: TILE_POOL_MAX_SIZE,
    lazy: true,
    autoScale: {
      // Tile parsing is short and bursty during pan/zoom. React fast, shrink gently.
      intervalMs: 350,
      targetMs: 55,
      alpha: 0.32,
      cooldownMs: 1_200,
      hysteresis: 0.2,
      stepUp: 2,
      stepDown: 1,
      backoffFactor: 1.5,
      backoffMaxMultiplier: 4,
      backoffResetMs: 6_000,
    },
    idleTimeout: 30_000,
  });

  return _pool;
}

// Tile-segment cache: individual parsed tile results.
// 5000 entries × ~5 KB avg = ~25 MB max; tiles expire after 5 min.
const _tileCache = new PowerCache({ maxEntries: 5000, defaultTTL: 300_000 });

// Graph cache: merged graphs keyed by sorted tile list + mode.
// Reuses an already-merged graph when the exact same tile set is requested again
// (e.g. repeated route queries in the same area or after transportation-mode
// toggle back to a previously used mode). 50 entries is enough for typical use.
const _graphCache = new PowerCache({ maxEntries: 50, defaultTTL: 300_000 });
const VALID_COST_FIELDS = new Set(['distance', 'travelTime', 'optimal']);
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

  if (_pool) {
    try {
      _pool.shutdown();
    } catch {
      // Best-effort cleanup.
    }
    _pool = null;
  }
}

export const shutdown = dispose;

function normalizePenalties(penalties = {}) {
  const {
    intersectionPenaltySec = 0,
    turnPenaltySec = 0,
    turnAngleThresholdDeg = 25,
  } = penalties;

  const values = [
    ['intersectionPenaltySec', intersectionPenaltySec],
    ['turnPenaltySec', turnPenaltySec],
    ['turnAngleThresholdDeg', turnAngleThresholdDeg],
  ];

  for (const [name, value] of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid penalties.${name}: expected a non-negative finite number`);
    }
  }

  return { intersectionPenaltySec, turnPenaltySec, turnAngleThresholdDeg };
}

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
  const tileWidthM = (2 * Math.PI * 6_371_000 * Math.cos(midLat * DEG_TO_RAD)) / (2 ** zoom);
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
    costField = 'distance',
    penalties = {},
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

  if (!VALID_COST_FIELDS.has(costField)) {
    throw new Error(
      `Unknown costField: ${costField}. Expected "distance", "travelTime", or "optimal".`,
    );
  }

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

  const pool = getSharedPool();
  let lastResult;
  let lastGraph = null;
  for (let r = initialRadius; r <= maxRadius; r++) {
    const candidateTiles = getTilesAlongLine(start, end, zoom, r, schema);
    const tiles = candidateTiles.map((tile) => ({
      ...tile,
      url: buildTileURL(urlTemplate, tile, { tileUrlTransform, tileProxyTemplate }),
    }));

    // Stable graph cache key: sorted tile ids + mode so the order of
    // getTilesAlongLine does not affect cache hits.
    const tileIds = tiles.map((t) => `${t.z}/${t.x}/${t.y}`);
    tileIds.sort();
    const canUseGraphCache = typeof tileUrlTransform !== 'function';
    const graphKey = canUseGraphCache
      ? `v3:${mode}:${zoom}:${schema}:${urlTemplate}:${tileProxyTemplate ?? ''}:${tileIds.join(',')}`
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
      maxAcceptableSnapDistanceM,
    });

    const corsError = getMissingTileError(graph, 'MissingAllowOriginHeader');
    if (!lastResult.found && corsError) {
      return {
        ...lastResult,
        reason: 'tile_cors',
        code: 'MissingAllowOriginHeader',
        message: corsError.message,
      };
    }

    if (lastResult.found) return includeGraph ? { ...lastResult, graph } : lastResult;
    if (
      lastResult.reason !== 'no_path'
      && lastResult.reason !== 'no_node'
      && lastResult.reason !== 'poor_snap'
      && lastResult.reason !== 'incomplete_path'
    ) return includeGraph ? { ...lastResult, graph } : lastResult;

    if (r < maxRadius) {
      // Log so the caller can see the retry in dev tools.
      console.debug(
        `[omt-router] ${lastResult.reason} at radius=${r}, retrying with radius=${r + 1}`,
      );
    }
  }

  return includeGraph ? { ...lastResult, graph: lastGraph } : lastResult;
};
