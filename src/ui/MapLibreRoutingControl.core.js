import { getTilesWithinRadius } from '../tiles/tilesManager.js';
import { RouteFailureReason } from '../engines/router.js';
import { isoline } from '../isolines/index.js';
import { buildTileURL, buildGraphForTiles } from '../index.js';
import worker from './MapLibreRoutingControl.isoline.worker?worker&inline.js';

/**
 * Ensure the isoline worker is created and wired for this control.
 * @param {object} ctrl Control instance that owns worker state.
 * @returns {Worker|null} Worker instance or null when workers are unavailable.
 */
function _ensureIsolineWorker(ctrl) {
  if (ctrl._isolineWorker) return ctrl._isolineWorker;  
  if (typeof Worker === 'undefined') return null;
  try {
    // The imported `worker` may be a Worker constructor (Vite returns a
    // constructor for `?worker` imports) or an already-instantiated worker
    // instance. Instantiate when it's a constructor, otherwise use as-is.
    let w;
    if (typeof worker === 'function') {
      w = new worker();
    } else if (worker && typeof worker.addEventListener === 'function') {
      w = worker;
    } else {
      throw new Error('Isoline worker import is not a constructor or instance');
    }

    w.addEventListener('message', (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      const { type, id, result, error } = msg;
      try {
        const pending = ctrl._isolinePendingRequests && ctrl._isolinePendingRequests.get(id);
        if (!pending) return;
        if (type === 'result') pending.resolve(result);
        else pending.reject(Object.assign(new Error(error?.message || 'Isoline worker error'), { code: error?.code }));
      } finally {
        ctrl._isolinePendingRequests && ctrl._isolinePendingRequests.delete(id);
      }
    });
    w.addEventListener('error', (ev) => {
      const err = new Error(ev?.message ?? 'Isoline worker error');
      if (ctrl._isolinePendingRequests) {
        for (const [id, p] of ctrl._isolinePendingRequests) {
          try { p.reject(err); } catch (_e) { void _e; }
          ctrl._isolinePendingRequests.delete(id);
        }
      }
    });
    ctrl._isolineWorker = w;
    ctrl._isolinePendingRequests = ctrl._isolinePendingRequests || new Map();
    return w;
  } catch (e) {
    // Worker creation failed (e.g., environment without worker support). Fall back to main-thread execution.
    console.warn('[omt-router] isoline worker unavailable, falling back to main-thread', e);
    return null;
  }
}

/**
 * Compute an isoline using a dedicated worker when available.
 * Falls back to main-thread computation when worker support is missing.
 * @param {object} ctrl Control instance owning worker state.
 * @param {object} params Isoline computation parameters.
 * @returns {Promise<*>} Resolves with GeoJSON isoline result.
 */
async function computeIsolineInWorker(ctrl, params) {
  // Clear any old pending requests: we only keep one active isoline job per control.
  if (!ctrl._isolinePendingRequests) ctrl._isolinePendingRequests = new Map();
  if (ctrl._isolinePendingRequests.size) {
    for (const [id, p] of ctrl._isolinePendingRequests) {
      try { p.reject(new Error('isoline cancelled')); } catch (_e) { void _e; }
      ctrl._isolinePendingRequests.delete(id);
    }
  }

  const worker = _ensureIsolineWorker(ctrl);
  if (!worker) {
    // No worker available — run on main thread as a fallback.
    return isoline(params);
  }

  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const promise = new Promise((resolve, reject) => {
    ctrl._isolinePendingRequests.set(id, { resolve, reject });
  });

  try {
    // Prepare a copy of the params.graph where any large typed arrays
    // are copied and transferred as ArrayBuffers to avoid expensive
    // structured-clone overhead. We copy before transferring so the
    // original (possibly cached) graph remains usable on the main thread.
    const transferList = [];
    let postParams = params;
    const g = params && params.graph;
    if (g && typeof g === 'object') {
      const graphForTransfer = {};
      for (const key of Object.keys(g)) {
        const val = g[key];
          if (ArrayBuffer.isView(val) && val.buffer) {
            // copy the typed array to avoid neutering original cache
            try {
              const copy = val.slice();
              graphForTransfer[key] = copy;
              transferList.push(copy.buffer);
            } catch (_err) {
              // Fallback: if slice fails for some reason, include original (will be structured-cloned)
              graphForTransfer[key] = val;
            }
        } else {
          graphForTransfer[key] = val;
        }
      }
      postParams = { ...params, graph: graphForTransfer };
    }

    if (transferList.length) {
      worker.postMessage({ type: 'compute', id, payload: postParams }, transferList);
    } else {
      worker.postMessage({ type: 'compute', id, payload: postParams });
    }
  } catch (e) {
    ctrl._isolinePendingRequests.delete(id);
    throw e;
  }

  return promise;
}

const ENGINE_LABELS = Object.freeze({
  'ultra-dijkstra': 'UltraDijkstra',
  'bidirectional-astar': 'Bidirectional A★',
  'adaptive-barrier': 'Adaptive Barrier',
  'delta-stepping': 'Delta Stepping',
  cpu: 'CPU',
});

const ENGINE_BADGE_ICONS = Object.freeze({
  parallel:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m4.9 4.9 2.2 2.2"/><path d="m16.9 16.9 2.2 2.2"/><path d="m16.9 7.1 2.2-2.2"/><path d="m4.9 19.1 2.2-2.2"/></svg>',
  cpu:
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 7V4"/><path d="M14 7V4"/><path d="M10 20v-3"/><path d="M14 20v-3"/><path d="M7 10H4"/><path d="M7 14H4"/><path d="M20 10h-3"/><path d="M20 14h-3"/></svg>',
});

const RAD = Math.PI / 180;
const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Calculate the great-circle distance between two `[lng, lat]` points.
 * @param {number[]} a First coordinate [lng, lat].
 * @param {number[]} b Second coordinate [lng, lat].
 * @returns {number} Distance in meters.
 */
export function haversineMeters(a, b) {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const lat1Rad = lat1 * RAD;
  const lat2Rad = lat2 * RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/**
 * Compute the total route distance from a sequence of coordinates.
 * @param {Array<number[]>} coords Route coordinates as [lng, lat] pairs.
 * @returns {number} Total distance in meters.
 */
export function getRouteDistance(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1], coords[i]);
  }
  return total;
}

/**
 * Parse a comma-separated latitude/longitude string into [lng, lat].
 * @param {string} str Input string like "lat, lng".
 * @returns {[number, number]|null} Parsed coordinates or null if invalid.
 */
export function parseCoords(str) {
  const [a, b] = String(str || '').split(',').map((s) => parseFloat(s.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return [b, a];
}

/**
 * Format a longitude/latitude pair into a standardized display string.
 * @param {{lng:number,lat:number}} param0 Coordinate object.
 * @returns {string} Formatted coordinate string.
 */
export function lngLatToStr({ lng, lat }) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Format a duration in minutes into a human-friendly string.
 * @param {number} minutes Duration in minutes.
 * @returns {string} Human-readable duration.
 */
export function formatDuration(minutes) {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} h ${remainder} min` : `${hours} h`;
}

/**
 * Format a distance in meters into meters or kilometers.
 * @param {number} m Distance in meters.
 * @returns {string} Formatted distance string.
 */
export function fmtDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Format a distance cost into estimated travel time based on mode.
 * @param {number} m Distance in meters.
 * @param {string} mode Travel mode identifier.
 * @returns {string} Estimated travel time label.
 */
export function fmtTime(m, mode) {
  const speeds = { car: 50, pedestrian: 5, bicycle: 15 };
  const mins = Math.round((m / 1000 / (speeds[mode] ?? 50)) * 60);
  return formatDuration(mins);
}

/**
 * Resolve a routing engine identifier to a human-friendly badge label.
 * @param {string} engineId Routing engine identifier.
 * @returns {string} Badge label.
 */
export function formatEngineBadgeName(engineId) {
  return ENGINE_LABELS[engineId] || engineId;
}

/**
 * Get the SVG icon for the engine badge.
 * @param {boolean} parallelUsed Whether a parallel engine was used.
 * @returns {string} Inline SVG icon markup.
 */
export function getEngineBadgeIcon(parallelUsed) {
  return parallelUsed ? ENGINE_BADGE_ICONS.parallel : ENGINE_BADGE_ICONS.cpu;
}

/**
 * Convert a routing graph into GeoJSON features for map visualization.
 * @param {object} graph Graph structure with nodes and edges.
 * @returns {object} GeoJSON FeatureCollection.
 */
export function buildGraphGeoJSON(graph) {
  const nodes = graph?.nodes;
  if (!graph?.nodes || !graph?.edges?.length) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features = [];
  for (const edge of graph.edges) {
    const sourceNode = nodes.get(edge.source);
    const targetNode = nodes.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [sourceNode.coords, targetNode.coords],
      },
      properties: {},
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Compute an isoline from the current control state and update the map source.
 * @param {object} ctrl Control instance.
 * @returns {Promise<void>}
 */
export async function tryIsoline(ctrl) {
  if (!ctrl._mounted) return;
  if (!ctrl._isoline || !ctrl._isoline.point) return;
  ctrl._setupRouteSource();
  if (!ctrl._map?.getSource(ctrl._options.isolineSourceId)) {
    ctrl._setStatus(ctrl._text.status.waitingStyle || 'Waiting for map style', 'loading');
    return;
  }
  if (!ctrl._urlTemplate && ctrl._tileJsonUrl) {
    try {
      await ctrl._loadTileTemplate();
    } catch (_err) {
      ctrl._setStatus(ctrl._text.status?.tileMetadata || 'Tile metadata error', 'error');
      return;
    }
  }

  const calcId = ++ctrl._calcId;
    try {
      try {
        ctrl._cancelRunningEngine?.('isoline_cancelled');
      } catch (_e) { void _e; }
    ctrl._setStatus(`<span class="rp-spinner"></span>${ctrl._text.status?.calculatingIsoline || 'Calculating isoline'}`, 'loading');
    const point = [ctrl._isoline.point[0], ctrl._isoline.point[1]];

    let graph = null;
    try {
      const zoom = 14;
      const speedsKmh = { car: 65, bicycle: 15, pedestrian: 5 };
      const speedKmh = speedsKmh[ctrl._mode] ?? 65;
      const radiusMeters = (ctrl._costField === 'travelTime' || ctrl._costField === 'optimal')
        ? Number(ctrl._isoline.maxCost) * (speedKmh / 3.6)
        : Number(ctrl._isoline.maxCost);

      const multiplier = Number(ctrl._options.isolineTileSearchMultiplier ?? 2);
      const extraMeters = Number(ctrl._options.isolineTileSearchExtraMeters ?? 500);
      const searchRadiusMeters = Math.max(radiusMeters * multiplier, radiusMeters + extraMeters);

      const tilesCoords = getTilesWithinRadius(point[0], point[1], zoom, searchRadiusMeters, 'zxy');
      const tiles = tilesCoords.map((t) => ({
        ...t,
        url: buildTileURL(ctrl._urlTemplate, t, {
          tileUrlTransform: ctrl._tileUrlTransform,
          tileProxyTemplate: ctrl._tileProxyTemplate,
        }),
      }));

      graph = await buildGraphForTiles(tiles, ctrl._mode, {
        zoom,
        schema: 'zxy',
        urlTemplate: ctrl._urlTemplate ?? '',
        tileProxyTemplate: ctrl._tileProxyTemplate ?? '',
        tileUrlTransform: ctrl._tileUrlTransform,
      });
    } catch (_graphErr) {
      const routeRes = await ctrl._routeFunction(point, point, ctrl._mode, ctrl._urlTemplate, {
        costField: ctrl._costField,
        includeGraph: true,
        maxAcceptableSnapDistanceM: ctrl._routeOptions.maxAcceptableSnapDistanceM,
        penalties: ctrl._routeOptions.penalties,
        tileUrlTransform: ctrl._tileUrlTransform,
        tileProxyTemplate: ctrl._tileProxyTemplate,
      });
      graph = routeRes.graph ?? null;
    }

    if (calcId !== ctrl._calcId) return;

    if (!graph) {
      ctrl._setStatus(ctrl._text.status?.noGraph || 'Graph unavailable', 'error');
      return;
    }

    if (graph?.hasMissingTiles) {
      ctrl._setStatus(ctrl._text.status?.tileCors || ctrl._text.status?.noGraph || 'Missing tiles', 'error');
      return;
    }

    let isoResult = null;
    try {
      isoResult = await computeIsolineInWorker(ctrl, {
        point,
        direction: ctrl._isoline.direction,
        mode: ctrl._mode,
        costField: ctrl._costField,
        graph,
        maxCost: ctrl._isoline.maxCost,
        snapMaxDistM: ctrl._routeOptions.maxAcceptableSnapDistanceM,
        penalties: ctrl._routeOptions.penalties,
      });
    } catch (isoErr) {
      if (calcId !== ctrl._calcId) return;
      try {
        const routeRes = await ctrl._routeFunction(point, point, ctrl._mode, ctrl._urlTemplate, {
          costField: ctrl._costField,
          includeGraph: true,
          maxAcceptableSnapDistanceM: ctrl._routeOptions.maxAcceptableSnapDistanceM,
          penalties: ctrl._routeOptions.penalties,
          tileUrlTransform: ctrl._tileUrlTransform,
          tileProxyTemplate: ctrl._tileProxyTemplate,
        });
        if (calcId !== ctrl._calcId) return;
        const fallbackGraph = routeRes.graph ?? null;
        if (fallbackGraph) {
          isoResult = await computeIsolineInWorker(ctrl, {
            point,
            direction: ctrl._isoline.direction,
            mode: ctrl._mode,
            costField: ctrl._costField,
            graph: fallbackGraph,
            maxCost: ctrl._isoline.maxCost,
            snapMaxDistM: ctrl._routeOptions.maxAcceptableSnapDistanceM,
            penalties: ctrl._routeOptions.penalties,
          });
          if (calcId !== ctrl._calcId) return;
        } else {
          throw isoErr;
        }
      } catch (_fallbackErr) {
        void _fallbackErr;
        throw isoErr;
      }
    }

    if (calcId !== ctrl._calcId) return;

    let fc = isoResult;
    if (!fc) fc = { type: 'FeatureCollection', features: [] };
    if (fc.type === 'Feature') fc = { type: 'FeatureCollection', features: [fc] };

    const src = ctrl._map.getSource(ctrl._options.isolineSourceId);
    if (src && typeof src.setData === 'function') {
      src.setData(fc);

      try {
        const values = Array.isArray(fc.features)
          ? fc.features.map((f) => Number(f?.properties?.valueMax ?? f?.properties?.break)).filter(Number.isFinite)
          : [];
        let minVal = 0;
        let maxVal = 1;
        if (values.length) {
          minVal = Math.min(...values);
          maxVal = Math.max(...values);
          if (minVal === maxVal) {
            minVal = minVal - 1e-6;
            maxVal = maxVal + 1e-6;
          }
        }

        const smallColor = ctrl._isoline.direction === 'from' ? ctrl._options.startColor : ctrl._options.endColor;
        const bigColor = ctrl._isoline.direction === 'from' ? ctrl._options.endColor : ctrl._options.startColor;
        const eps = Math.max(1e-6, (maxVal - minVal) * 1e-6);
        const expr = [
          'interpolate-hcl',
          ['linear'],
          ['get', 'valueMax'],
          minVal,
          smallColor,
          minVal + eps,
          smallColor,
          maxVal - eps,
          bigColor,
          maxVal,
          bigColor,
        ];

        if (ctrl._map && typeof ctrl._map.getLayer === 'function') {
          if (ctrl._map.getLayer(ctrl._options.isolineFillLayerId)) {
            ctrl._map.setPaintProperty(ctrl._options.isolineFillLayerId, 'fill-color', expr);
            ctrl._map.setPaintProperty(ctrl._options.isolineFillLayerId, 'fill-outline-color', expr);
            ctrl._map.setLayoutProperty(ctrl._options.isolineFillLayerId, 'fill-sort-key', ['-', ['get', 'valueMax']]);
          }
          if (ctrl._map.getLayer(ctrl._options.isolineOutlineLayerId)) {
            ctrl._map.setPaintProperty(ctrl._options.isolineOutlineLayerId, 'text-color', expr);
          }
        }
      } catch (_e) { void _e; }

      try {
        ctrl._centerMapOnSource(ctrl._options.isolineSourceId, { padding: 100, maxZoom: 16, duration: 600 });
      } catch (_e) { void _e; }
    }

    ctrl._setStatus('', '');
  } catch (err) {
    if (calcId !== ctrl._calcId) return;
    console.error('[omt-router] isoline error', err);
    try {
      const src = ctrl._map?.getSource(ctrl._options.isolineSourceId);
      if (src && typeof src.setData === 'function') {
        src.setData({ type: 'FeatureCollection', features: [] });
      }
    } catch (_e) { void _e; }
    if (ctrl._mounted) ctrl._setStatus(ctrl._text.status?.noRoute || 'Isoline failed', 'error');
  }
}

/**
 * Compute the current route and render route and optional graph layers.
 * @param {object} ctrl Control instance.
 * @returns {Promise<void>}
 */
export async function tryRoute(ctrl) {
  if (!ctrl._mounted) return;
  if (!ctrl._origin || !ctrl._dest) return;
  ctrl._setupRouteSource();
  if (!ctrl._map?.getSource(ctrl._options.routeSourceId)) {
    ctrl._setStatus(ctrl._text.status.waitingStyle, 'loading');
    return;
  }
  if (!ctrl._urlTemplate) {
    if (ctrl._tileJsonUrl) {
      await ctrl._loadTileTemplate();
      if (!ctrl._mounted) return;
    }
    if (!ctrl._urlTemplate) {
      ctrl._setStatus(ctrl._text.status.tileUrl, 'error');
      ctrl._clearRoute();
      return;
    }
  }

  const id = ++ctrl._calcId;
  ctrl._hideStats();
  ctrl._clearRoute();
  ctrl._clearGraph();
  ctrl._setStatus(`<span class="rp-spinner"></span>${ctrl._text.status.calculating}`, 'loading');

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    ctrl._cancelRunningEngine?.(`timeout_${ctrl._routeTimeoutMs}ms`);
  }, ctrl._routeTimeoutMs);

  try {
    const result = await ctrl._routeFunction(ctrl._origin, ctrl._dest, ctrl._mode, ctrl._urlTemplate, {
      costField: ctrl._costField,
      tileUrlTransform: ctrl._tileUrlTransform,
      tileProxyTemplate: ctrl._tileProxyTemplate,
      includeGraph: ctrl._options.showGraph,
      ...ctrl._routeOptions,
    });

    if (!ctrl._mounted || id !== ctrl._calcId) return;
    if (!result.found || !result.coordinates?.length) {
      ctrl._handleRouteFailure(result);
      return;
    }

    ctrl._map.getSource(ctrl._options.routeSourceId).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: result.coordinates },
      properties: {},
    });

    if (ctrl._options.showGraph) {
      if (result.graph) {
        ctrl._map.getSource(ctrl._options.graphSourceId).setData(buildGraphGeoJSON(result.graph));
      } else {
        ctrl._clearGraph();
      }
    }

    const coords = result.coordinates;
    if (coords.length > 0) {
      const snappedOrigin = coords[0];
      const snappedDest = coords[coords.length - 1];
      ctrl._origin = snappedOrigin;
      ctrl._dest = snappedDest;
      ctrl._placeMarker('origin', snappedOrigin);
      ctrl._placeMarker('dest', snappedDest);
      ctrl._originInput.value = lngLatToStr({ lng: snappedOrigin[0], lat: snappedOrigin[1] });
      ctrl._destInput.value = lngLatToStr({ lng: snappedDest[0], lat: snappedDest[1] });
    }

    if (coords.length > 1) {
      console.log('[dbg] requesting _centerMapOnSource (route)', ctrl._options.routeSourceId, !!ctrl._map?.getSource?.(ctrl._options.routeSourceId), 'coords.length=', coords.length);
      ctrl._centerMapOnSource(ctrl._options.routeSourceId, { padding: 100, maxZoom: 16, duration: 600 });
    }

    ctrl._showStats(result);
    if (result.partialGraph) {
      ctrl._setStatus(ctrl._text.status.partialGraph, 'error');
    } else {
      ctrl._setStatus('');
    }
  } catch (err) {
    if (!ctrl._mounted || id !== ctrl._calcId) return;
    console.error('[omt-router] routing error:', err);
    if (err?.code === 'engine_cancelled') {
      ctrl._setStatus(
        timedOut ? ctrl._text.status.timedOut : ctrl._text.status.cancelled,
        'error'
      );
    } else {
      const errorMessage = err?.message || (typeof err === 'string' ? err : ctrl._text.status.unknownError ?? 'Unknown routing error');
      ctrl._setStatus(`${ctrl._text.status.routeErrorPrefix} ${errorMessage}`, 'error');
    }
    ctrl._clearRoute();
    ctrl._clearGraph();
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Handle route failure reasons by setting a localized control status and clearing visuals.
 * @param {object} ctrl Control instance.
 * @param {object} result Route result object with failure reason.
 */
export function handleRouteFailure(ctrl, result) {
  console.warn('[omt-router] route failed:', result);
  const reason = result?.reason;
  switch (reason) {
    case RouteFailureReason.TILE_CORS:
      ctrl._setStatus(ctrl._text.status.tileCors, 'error');
      break;
    case RouteFailureReason.POOR_SNAP:
      ctrl._setStatus(ctrl._text.status.poorSnap, 'error');
      break;
    case RouteFailureReason.NO_NODE:
      ctrl._setStatus(ctrl._text.status.noNode, 'error');
      break;
    case RouteFailureReason.NO_PATH:
      ctrl._setStatus(ctrl._text.status.noPath, 'error');
      break;
    case RouteFailureReason.INCOMPLETE_PATH:
      ctrl._setStatus(ctrl._text.status.incompletePath, 'error');
      break;
    default:
      ctrl._setStatus(ctrl._text.status.noRoute, 'error');
      break;
  }
  ctrl._clearRoute();
  ctrl._clearGraph();
}

export { _ensureIsolineWorker, computeIsolineInWorker };

// `parseCoords` is exported above via named export declarations.
