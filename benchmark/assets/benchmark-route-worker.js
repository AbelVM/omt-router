/**
 * benchmark-route-worker.js — Dedicated benchmark worker for a single route.
 *
 * Receives a route job with start/end coordinates and timing configuration,
 * fetches tiles, builds the graph, prepares the route, benchmarks engines,
 * caches prepared graphs in worker scope, and saves results to IndexedDB.
 */

import {
  queryRoute,
  prepareGraph,
  prepareRoutableGraph,
  selectBestEngine,
  validateRouteResult,
  releasePrepared,
  releaseGraph,
} from '../../src/engines/router.js';
import { buildGraphAsync } from '../../src/graphs/graphBuilder.js';
import { getTilesAlongLine } from '../../src/tiles/tilesManager.js';
import { interpolate, haversineDistance } from '../../src/utils/misc.js';
import { classifySelectorFeatures } from './benchmark-selector-features.js';
import { savePreparedMetricsToDB, saveResultToDB } from './bench-db.js';
import { PowerCache } from 'performance-helpers/powerCache';

function installPowerCacheSafeguards({ reapMs = 30_000 } = {}) {
  try {
    if (typeof PowerCache !== 'function' || !PowerCache.prototype) return;

    const origGetOrSetAsync = PowerCache.prototype.getOrSetAsync;
    if (typeof origGetOrSetAsync === 'function') {
      PowerCache.prototype.getOrSetAsync = function (...args) {
        const cache = this;
        if (!cache) {
          return origGetOrSetAsync.apply(this, args);
        }

        try {
          if (!cache._safetyReapTimers) cache._safetyReapTimers = new Set();
        } catch (_e) {
          /* ignore */
        }

        const p = origGetOrSetAsync.apply(cache, args);
        if (p && typeof p.then === 'function') {
          let settled = false;
          const t = setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
              if (cache._inflightPromises && typeof cache._inflightPromises.clear === 'function') {
                cache._inflightPromises.clear();
              }
            } catch (_e) {
              /* ignore */
            }
            try { cache.clear?.(); } catch (_e) { /* ignore */ }
          }, Number.isFinite(reapMs) ? reapMs : 30_000);

          try { cache._safetyReapTimers.add(t); } catch (_e) { /* ignore */ }

          const cleanup = () => {
            if (settled) return;
            settled = true;
            try { clearTimeout(t); } catch (_e) { /* ignore */ }
            try { cache._safetyReapTimers.delete(t); } catch (_e) { /* ignore */ }
          };

          p.then(cleanup, cleanup);
        }

        return p;
      };
    }

    const origClear = PowerCache.prototype.clear;
    PowerCache.prototype.clear = function (...args) {
      try {
        if (this._safetyReapTimers) {
          for (const tt of this._safetyReapTimers) {
            try { clearTimeout(tt); } catch (_e) { /* ignore */ }
          }
          try { this._safetyReapTimers.clear(); } catch (_e) { /* ignore */ }
        }
      } catch (_e) {
        /* ignore */
      }
      return origClear ? origClear.apply(this, args) : undefined;
    };

    const origStopCleanup = PowerCache.prototype.stopCleanup;
    PowerCache.prototype.stopCleanup = function (...args) {
      try {
        if (this._safetyReapTimers) {
          for (const tt of this._safetyReapTimers) {
            try { clearTimeout(tt); } catch (_e) { /* ignore */ }
          }
          try { this._safetyReapTimers.clear(); } catch (_e) { /* ignore */ }
        }
      } catch (_e) {
        /* ignore */
      }
      return origStopCleanup ? origStopCleanup.apply(this, args) : undefined;
    };
  } catch (_err) {
    /* guard installation failed — non-fatal */
  }
}

// Install safeguards eagerly so all PowerCache instances in this worker inherit them.
// Benchmark cache TTL (ms)
const BENCHMARK_CACHE_TTL = 5_000;

installPowerCacheSafeguards({ reapMs: BENCHMARK_CACHE_TTL * 3 });

const ENGINE_IDS = ['bidirectional-astar', 'adaptive-barrier', 'delta-stepping', 'ultra-dijkstra'];

let _sharedTilePool = null;
let _sharedTilePoolPort = null;
const _sharedTilePoolPendingResponses = new Map();
let _sharedTilePoolNextRequestId = 1;
let _tileCache = null;
const TILE_CACHE_MAX_ENTRIES = 512;
const _routeCache = new Map();
const ROUTE_CACHE_MAX_ENTRIES = 2;
let _routeCacheHits = 0;
let _routeCacheMisses = 0;
let _routeCacheEvictions = 0;
let _routeCachePeakSize = 0;

function createSharedTilePoolProxy(port) {
  const hw = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  const maxSize = Math.min(8, Math.max(1, hw - 1));

  const proxy = {
    maxSize,
    async postMessage(message, transfer, { awaitResponse = true, timeout = 10_000 } = {}) {
      if (!port || typeof port.postMessage !== 'function') {
        throw new Error('Shared tile pool port has not been initialized.');
      }

      if (!awaitResponse) {
        port.postMessage(
          { type: 'sharedTilePoolRequest', message, timeout: Number.isFinite(timeout) ? timeout : 10_000 },
          transfer
        );
        return true;
      }

      const correlationId = `sharedTilePool:${_sharedTilePoolNextRequestId++}`;
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          _sharedTilePoolPendingResponses.delete(correlationId);
          reject(new Error('shared_tile_pool_request_timeout'));
        }, Number.isFinite(timeout) && timeout > 0 ? timeout : 10_000);

        _sharedTilePoolPendingResponses.set(correlationId, { resolve, reject, timeoutId });
        port.postMessage(
          { type: 'sharedTilePoolRequest', correlationId, message, timeout },
          transfer
        );
      });
    },
  };

  port.onmessage = (event) => {
    const data = event?.data;
    if (!data || data.type !== 'sharedTilePoolResponse' || typeof data.correlationId !== 'string') return;

    const entry = _sharedTilePoolPendingResponses.get(data.correlationId);
    if (!entry) return;

    clearTimeout(entry.timeoutId);
    _sharedTilePoolPendingResponses.delete(data.correlationId);

    if (data.error) {
      const err = new Error(data.error.message ?? 'Shared tile pool error');
      if (data.error.code) err.code = data.error.code;
      entry.reject(err);
      return;
    }

    entry.resolve(data.response);
  };
  port.start?.();
  return proxy;
}

function clearSharedTilePoolPendingResponses() {
  if (_sharedTilePoolPendingResponses.size === 0) return;

  for (const [correlationId, entry] of _sharedTilePoolPendingResponses.entries()) {
    clearTimeout(entry.timeoutId);
    try {
      entry.reject(new Error('shared_tile_pool_request_cleared'));
    } catch (_err) {
      // Ignore rejection failures.
    }
    _sharedTilePoolPendingResponses.delete(correlationId);
  }
}

function disposeSharedTilePoolPort() {
  if (!_sharedTilePoolPort) return;

  clearSharedTilePoolPendingResponses();
  try {
    _sharedTilePoolPort.onmessage = null;
  } catch (_err) {
    /* ignore */
  }
  try {
    _sharedTilePoolPort.close();
  } catch (_err) {
    /* ignore */
  }

  _sharedTilePoolPort = null;
  _sharedTilePool = null;
}

function initSharedTilePoolPort(port) {
  if (_sharedTilePoolPort) {
    disposeSharedTilePoolPort();
  }

  if (!port || typeof port.postMessage !== 'function') {
    throw new Error('Invalid shared tile pool port received');
  }

  _sharedTilePoolPort = port;
  _sharedTilePool = createSharedTilePoolProxy(port);
  port.start?.();
}

function getWorkerMemoryUsage() {
  if (typeof performance === 'undefined' || typeof performance.memory !== 'object') return null;
  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;
  return { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit };
}

function reportWorkerMemoryPhase(phase, details = {}) {
  if (typeof postMessage !== 'function') return;

  try {
    postMessage({
      type: 'status',
      status: 'memory',
      phase,
      ...details,
      memory: getWorkerMemoryUsage(),
    });
  } catch (_err) {
    // In non-worker test environments, postMessage may require a targetOrigin.
  }
}

function instrumentRouteCacheEvent(type, details) {
  // Suppress very noisy 'release' messages; keep others for debug.
  if (type === 'release') return;
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[benchmark-route-worker] cache', type, details);
  }
}

function buildRouteCacheKey(routeDef, mode, zoom, costField, radius) {
  return [routeDef.start.join(','), routeDef.end.join(','), mode, zoom, costField, radius, routeDef.forceRadius ?? 'auto'].join('|');
}

function disposePowerCache(cache) {
  if (!cache) return;
  try {
    // Stop scheduled cleanup timer if present
    try {
      cache.stopCleanup?.();
    } catch (_e) {
      /* ignore */
    }

    try {
      if (cache._cleanupTimer) {
        try { clearTimeout(cache._cleanupTimer); } catch (_e) { /* ignore */ }
        cache._cleanupTimer = null;
      }
    } catch (_e) {
      /* ignore */
    }

    // Clear any inflight promises the cache is tracking to break closures
    try {
      if (cache._inflightPromises && typeof cache._inflightPromises.clear === 'function') {
        cache._inflightPromises.clear();
      }
    } catch (_e) {
      /* ignore */
    }

    // Clear any safety reap timers injected by runtime safeguards
    try {
      if (cache._safetyReapTimers && typeof cache._safetyReapTimers.forEach === 'function') {
        cache._safetyReapTimers.forEach((tt) => {
          try { clearTimeout(tt); } catch (_e) {}
        });
        try { cache._safetyReapTimers.clear(); } catch (_e) {}
      }
    } catch (_e) {
      /* ignore */
    }

    // Final clear of entries
    try {
      cache.clear?.();
    } catch (_e) {
      /* ignore */
    }
  } catch (_err) {
    // Ignore cleanup failures and continue releasing references.
  }
}

// Return a compact metrics object for a PowerCache instance (best-effort)
function getPowerCacheMetrics(cache) {
  if (!cache) return null;
  try {
    return {
      size: typeof cache.size === 'number' ? cache.size : cache._map?.size ?? null,
      stats: typeof cache.stats === 'function' ? cache.stats() : null,
      inflight: cache._inflightPromises?.size ?? null,
      cleanupTimerPresent: !!cache._cleanupTimer,
    };
  } catch (_e) {
    return { error: String(_e) };
  }
}

function reportAllPowerCaches() {
  const metrics = { tileCache: null, preparedRouteCaches: [] };
  try {
    metrics.tileCache = getPowerCacheMetrics(_tileCache);
  } catch (_e) {
    metrics.tileCache = { error: String(_e) };
  }

  try {
    for (const [key, entry] of _routeCache.entries()) {
      try {
        const prepared = entry?.prepared;
        if (prepared && prepared._routeCache) {
          metrics.preparedRouteCaches.push({ key, metrics: getPowerCacheMetrics(prepared._routeCache) });
        }
      } catch (_e) {
        metrics.preparedRouteCaches.push({ key, error: String(_e) });
      }
    }
  } catch (_e) {
    /* ignore */
  }

  try {
    postMessage({ type: 'powercache:stats', metrics, memory: getWorkerMemoryUsage() });
  } catch (_e) {
    /* ignore */
  }
}

function forceReleaseAllPowerCaches() {
  try {
    if (_tileCache) {
      disposePowerCache(_tileCache);
      _tileCache = null;
    }
  } catch (_e) {
    /* ignore */
  }

  try {
    for (const [key, entry] of _routeCache.entries()) {
      try {
        if (entry && entry.prepared) {
          disposePowerCache(entry.prepared._routeCache);
          entry.prepared._routeCache = null;
        }
        // Null out other heavy references on the cached entry
        entry.prepared = null;
        entry.graph = null;
        entry.routeSetup = null;
        entry.radius = null;
        entry.fetchMs = null;
        entry.startId = null;
        entry.endId = null;
      } catch (_e) {
        /* ignore */
      }
    }
    _routeCache.clear();
  } catch (_e) {
    /* ignore */
  }

  // Report memory right after forced release
  reportWorkerMemoryPhase('powercache:forceRelease', { cacheStats: getRouteCacheStats() });
  try { postMessage({ type: 'powercache:forceRelease:done', memory: getWorkerMemoryUsage() }); } catch (_e) { /* ignore */ }
}

function releaseCachedPreparedRoute(cacheEntry) {
  if (!cacheEntry) return;
  if (cacheEntry.prepared) {
    releasePrepared(cacheEntry.prepared);
  }
  if (cacheEntry.graph) {
    releaseGraph(cacheEntry.graph);
  }
  cacheEntry.prepared = null;
  cacheEntry.graph = null;
  cacheEntry.routeSetup = null;
  cacheEntry.radius = null;
  cacheEntry.fetchMs = null;
  cacheEntry.startId = null;
  cacheEntry.endId = null;
}

function clearRouteCache() {
  if (_routeCache.size === 0) return;

  for (const cacheEntry of _routeCache.values()) {
    releaseCachedPreparedRoute(cacheEntry);
  }
  _routeCache.clear();
}

function pruneRouteCacheIfNeeded() {
  while (_routeCache.size > ROUTE_CACHE_MAX_ENTRIES) {
    const oldestKey = _routeCache.keys().next().value;
    if (typeof oldestKey === 'undefined') break;
    const oldestEntry = _routeCache.get(oldestKey);
    releaseCachedPreparedRoute(oldestEntry);
    _routeCache.delete(oldestKey);
    _routeCacheEvictions += 1;
    const evictDetails = {
      cacheSize: _routeCache.size,
      evictedKey: oldestKey,
      evictions: _routeCacheEvictions,
    };
    instrumentRouteCacheEvent('evict', evictDetails);
    // Post memory snapshot for investigation when evictions occur.
    reportWorkerMemoryPhase('route-cache-evict', { ...evictDetails, cacheStats: getRouteCacheStats() });
  }
}

function releasePreparedRoute(routeDef, urlTemplate, mode, zoom, costField) {
  const cacheKey = buildRouteCacheKey(routeDef, mode, zoom, costField, routeDef.forceRadius ?? computeRadius(routeDef.start, routeDef.end, zoom));
  const cacheEntry = _routeCache.get(cacheKey);
  if (!cacheEntry) return false;
  releaseCachedPreparedRoute(cacheEntry);
  _routeCache.delete(cacheKey);
  // Avoid noisy console logs for releases; instead post a memory snapshot for telemetry.
  reportWorkerMemoryPhase('route-cache-release', { cacheSize: _routeCache.size, cacheKey, cacheStats: getRouteCacheStats() });
  return true;
}

function getRouteCacheStats() {
  return {
    hits: _routeCacheHits,
    misses: _routeCacheMisses,
    evictions: _routeCacheEvictions,
    size: _routeCache.size,
    peak: _routeCachePeakSize,
  };
}

function getTilePool() {
  if (_sharedTilePool) return _sharedTilePool;
  if (_sharedTilePoolPort) {
    _sharedTilePool = createSharedTilePoolProxy(_sharedTilePoolPort);
    return _sharedTilePool;
  }
  throw new Error('Shared tile pool is not initialized. Route workers must use the shared tile pool.');
}

function clearTileCache() {
  if (_tileCache) {
    disposePowerCache(_tileCache);
    _tileCache = null;
    // Log memory after clearing tile cache to correlate with cache release events.
    reportWorkerMemoryPhase('clear-tile-cache', { cacheStats: getRouteCacheStats() });
  }
}

function clearRouteSpecificCaches() {
  clearRouteCache();
  clearTileCache();
  clearSharedTilePoolPendingResponses();
}

// Dispose all route-related caches and objects (best-effort).
// Keeps the shared tile pool port intact to avoid breaking external lifecycle,
// but clears per-route caches, pending responses and reports memory.
function disposeAllRouteResources() {
  try {
    forceReleaseAllPowerCaches();
  } catch (_e) {}

  try {
    clearSharedTilePoolPendingResponses();
  } catch (_e) {}

  try {
    reportWorkerMemoryPhase('dispose-all-route-resources', { cacheStats: getRouteCacheStats() });
  } catch (_e) {}
}

function getTileCache() {
  if (!_tileCache) {
    _tileCache = new PowerCache({ maxEntries: TILE_CACHE_MAX_ENTRIES, defaultTTL: BENCHMARK_CACHE_TTL });
    _tileCache.startCleanup?.({ interval: BENCHMARK_CACHE_TTL, maxCleanupPerTick: 128 });
    // Log that a tile cache was (re)created and capture memory snapshot.
    reportWorkerMemoryPhase('tile-cache-created', { cacheStats: getRouteCacheStats() });
  }
  return _tileCache;
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : value;
}

function round4(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : value;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarizeSamples(samples) {
  const filtered = Array.isArray(samples) ? samples.filter((value) => Number.isFinite(value)) : [];
  if (filtered.length === 0) {
    return { min: null, max: null, mean: null, stddev: null, count: 0 };
  }
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const mean = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  const variance =
    filtered.reduce((sum, value) => sum + (value - mean) ** 2, 0) / filtered.length;
  return {
    min: round4(min),
    max: round4(max),
    mean: round4(mean),
    stddev: round4(Math.sqrt(variance)),
    count: filtered.length,
  };
}

function selectTimingWinner(times) {
  const entries = Object.entries(times).filter(([, value]) => Number.isFinite(value));
  if (entries.length === 0) {
    return { fastestMs: null, winner: null, winnerTied: false, winnerCandidates: [], secondBestMs: null, worstMs: null, bestToWorstMs: null, bestToWorstPct: null, engineCountWithin5Pct: 0, winnerMarginMs: null, winnerMarginPct: null, runnerUpEngine: null };
  }
  entries.sort((a, b) => a[1] - b[1]);
  const fastestMs = entries[0][1];
  const secondBestMs = entries.length > 1 ? entries[1][1] : null;
  const worstMs = entries[entries.length - 1][1];
  const bestToWorstMs = Number.isFinite(fastestMs) && Number.isFinite(worstMs) ? round4(worstMs - fastestMs) : null;
  const bestToWorstPct = Number.isFinite(fastestMs) && fastestMs > 0 ? round4(((worstMs - fastestMs) / fastestMs) * 100) : null;
  const winnerCandidates = entries.filter(([, value]) => Math.abs(value - fastestMs) <= Math.max(0.1, fastestMs * 0.05)).map(([engine]) => engine);
  const winner = winnerCandidates.length > 0 ? winnerCandidates[0] : entries[0][0];
  const winnerTied = winnerCandidates.length > 1;
  const winnerMarginMs = Number.isFinite(secondBestMs) ? round4(secondBestMs - fastestMs) : null;
  const winnerMarginPct = Number.isFinite(secondBestMs) && Number.isFinite(fastestMs) && fastestMs > 0 ? round4(((secondBestMs - fastestMs) / fastestMs) * 100) : null;
  const runnerUpEngine = entries.length > 1 ? entries[1][0] : null;
  const engineCountWithin5Pct = entries.filter(([, value]) => Number.isFinite(fastestMs) && fastestMs > 0 && value <= fastestMs * 1.05).length;
  return {
    fastestMs,
    winner,
    winnerTied,
    winnerCandidates,
    secondBestMs,
    worstMs,
    bestToWorstMs,
    bestToWorstPct,
    engineCountWithin5Pct,
    winnerMarginMs,
    winnerMarginPct,
    runnerUpEngine,
  };
}

function hasReferenceCostMismatch(cost, referenceCost) {
  if (!Number.isFinite(cost) || !Number.isFinite(referenceCost)) return false;
  const tolerance = Math.max(1, Math.max(Math.abs(cost), Math.abs(referenceCost)) * 0.02);
  return Math.abs(cost - referenceCost) > tolerance;
}

function normalizeEngineErrorMessage(error) {
  if (!error) return 'unknown_error';
  return error.message ?? String(error);
}

function normalizeEngineErrorCode(error) {
  if (!error) return null;
  if (error.code) return String(error.code);
  if (error.name === 'AbortError') return 'aborted';
  return null;
}

function normalizeBenchmarkResult(engineId, result, prepared, referenceCost = null) {
  const error = result?.error ?? null;
  const errorCode = result?.errorCode ?? normalizeEngineErrorCode(result);
  const parallelUsed = result?.parallelUsed ?? false;

  if (!result || error) {
    return {
      found: false,
      cost: null,
      error: error || 'unknown_error',
      errorCode,
      parallelUsed,
    };
  }

  if (!result.found) {
    return {
      found: false,
      cost: null,
      error: 'no_path',
      errorCode,
      parallelUsed,
    };
  }

  const validation = validateRouteResult(result, prepared);
  if (!validation.valid) {
    return {
      found: false,
      cost: null,
      error: validation.reason ?? 'invalid_route',
      errorCode,
      parallelUsed,
    };
  }

  if (
    engineId !== 'bidirectional-astar' &&
    Number.isFinite(referenceCost) &&
    hasReferenceCostMismatch(validation.actualCost, referenceCost)
  ) {
    return {
      found: false,
      cost: null,
      error: 'reference_cost_mismatch',
      errorCode,
      parallelUsed,
    };
  }

  return {
    found: true,
    cost: validation.actualCost,
    error: null,
    errorCode: null,
    parallelUsed,
  };
}

function computeRadius(start, end, zoom) {
  const midLat = (start[1] + end[1]) / 2;
  const tileWidthM = (2 * Math.PI * 6_371_000 * Math.cos((midLat * Math.PI) / 180)) / 2 ** zoom;
  const beelineM = haversineDistance(start, end);
  const bufferM = Math.max(600, beelineM * 0.15);
  return Math.min(3, Math.max(1, Math.ceil(bufferM / tileWidthM)));
}

async function getPreparedRoute(routeDef, urlTemplate, mode, zoom, costField, routeIndex, passIndex) {
  const routeLabel = routeDef?.name ?? `${routeDef?.start?.join(',')}→${routeDef?.end?.join(',')}`;
  const radius = routeDef.forceRadius ?? computeRadius(routeDef.start, routeDef.end, zoom);
  const cacheKey = buildRouteCacheKey(routeDef, mode, zoom, costField, radius);
  if (_routeCache.has(cacheKey)) {
    _routeCacheHits += 1;
    const cacheEntry = _routeCache.get(cacheKey);
    _routeCache.delete(cacheKey);
    _routeCache.set(cacheKey, cacheEntry);
    postMessage({
      type: 'status',
      status: 'route-cached',
      routeIndex,
      passIndex,
      routeLabel,
      cacheStats: getRouteCacheStats(),
      memory: getWorkerMemoryUsage(),
    });
    return cacheEntry;
  }

  _routeCacheMisses += 1;
  const tileList = getTilesAlongLine(routeDef.start, routeDef.end, zoom, radius);
  for (const tile of tileList) {
    tile.url = interpolate(urlTemplate, { z: tile.z, x: tile.x, y: tile.y });
  }
  const tiles = tileList;
  postMessage({ type: 'status', status: 'fetching-tiles', routeIndex, passIndex, routeLabel, tileCount: tiles.length });
  reportWorkerMemoryPhase('before-build-graph', {
    routeIndex,
    passIndex,
    routeLabel,
    tileCount: tiles.length,
    cacheStats: getRouteCacheStats(),
  });

  const fetchStart = performance.now();
  const graph = await buildGraphAsync(tiles, mode, {
    pool: getTilePool(),
    cache: getTileCache(),
  });
  const fetchMs = round2(performance.now() - fetchStart);
  postMessage({ type: 'status', status: 'building-graph', routeIndex, passIndex, routeLabel });
  reportWorkerMemoryPhase('after-build-graph', {
    routeIndex,
    passIndex,
    routeLabel,
    tileCount: tiles.length,
    graphNodeCount: graph.nodes?.size ?? null,
    hasMissingTiles: Boolean(graph.hasMissingTiles),
  });

  const routeSetup = prepareRoutableGraph(graph, routeDef.start, routeDef.end);
  const { graph: routedGraph, startId, endId } = routeSetup;
  postMessage({ type: 'status', status: 'prepare-route', routeIndex, passIndex, routeLabel });

  let prepared = null;
  if (startId !== -1 && endId !== -1) {
    prepared = await prepareGraph(routedGraph, costField, {}, startId, endId, { mode });
    reportWorkerMemoryPhase('after-prepare-graph', {
      routeIndex,
      passIndex,
      routeLabel,
      startId,
      endId,
      preparedN: prepared?.N ?? null,
      preparedE: prepared?.E ?? null,
    });
  }

  // Compute and attach selector features now while `prepared.metrics` exists
  // so later cache hits don't depend on keeping large `metrics` arrays live.
  let selectorFeatures = null;
  try {
    selectorFeatures = classifySelectorFeatures(prepared?.metrics);
  } catch (_e) {
    selectorFeatures = {};
  }
  if (prepared) {
    try { prepared.selectorFeatures = selectorFeatures; } catch (_e) {}
  }
  try {
    reportWorkerMemoryPhase('prepared-metrics-state', {
      routeIndex,
      passIndex,
      routeLabel,
      hasMetrics: Boolean(prepared?.metrics),
      hasSelectorFeatures: Boolean(selectorFeatures),
      metricsSnippet: prepared?.metrics ? {
        nodeCount: prepared.metrics.nodeCount ?? prepared.metrics.safeN ?? null,
        edgeCount: prepared.metrics.edgeCount ?? prepared.metrics.safeE ?? null,
        haversine: prepared.metrics.haversineDistance ?? prepared.metrics.safeBeelineKm ?? null,
      } : null,
    });
  } catch (_e) {}
  const cached = { prepared, radius, fetchMs, startId, endId, selectorFeatures };
  _routeCache.set(cacheKey, cached);
  _routeCachePeakSize = Math.max(_routeCachePeakSize, _routeCache.size);
  pruneRouteCacheIfNeeded();
  return cached;
}

async function runEngineQueryWithTimeout(startId, endId, prepared, options) {
  const routePromise = queryRoute(startId, endId, prepared, {
    engineId: options.engineId,
    costField: options.costField,
    useCache: false,
    allowFallback: false,
    forceSerialRouting: options.forceSerialRouting,
    // Avoid nested engine worker pools inside benchmark route workers.
    // Each route worker already runs in its own worker, so execute engine
    // routing directly in the route worker instead of creating a nested
    // singleton engine worker.
    useWorkerPool: false,
    useEngineWorker: false,
    engineWorkerFallbackToMainThread: false,
  });

  if (!Number.isFinite(options.engineRunTimeoutMs) || options.engineRunTimeoutMs <= 0) {
    return routePromise;
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`engine_timeout:${options.engineId}`)), options.engineRunTimeoutMs);
  });

  try {
    return await Promise.race([routePromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function benchmarkRouteJob(message) {
  const {
    runId,
    routeIndex = -1,
    routeDef,
    urlTemplate,
    mode = 'car',
    zoom = 14,
    nRuns = 10,
    costField = 'distance',
    engineRunTimeoutMs = 20_000,
  } = message;

  const routeLabel = routeDef?.name ?? `${routeDef?.start?.join(',')}→${routeDef?.end?.join(',')}`;
  const routePasses = Array.isArray(message.routePasses) && message.routePasses.length > 0
    ? message.routePasses
    : (() => {
        throw new Error('[benchmark] routePasses batch required');
      })();

  let preparedRoute = null;
  let preparedRouteAcquired = false;
  let prepareError = null;
  const initialPassIndex = typeof routePasses[0]?.passIndex === 'number' ? routePasses[0].passIndex : 0;

  try {
    try {
      preparedRoute = await getPreparedRoute(routeDef, urlTemplate, mode, zoom, costField, routeIndex, initialPassIndex);
      preparedRouteAcquired = true;
    } catch (error) {
      prepareError = error;
    }

    for (const pass of routePasses) {
      const passIndex = typeof pass.passIndex === 'number' ? pass.passIndex : 0;
      const forceSerialRouting = pass.forceSerialRouting === true;
      const sharedArrayBuffer = pass.sharedArrayBuffer ?? (typeof SharedArrayBuffer !== 'undefined' && !forceSerialRouting);

      postMessage({ type: 'status', status: 'started', routeIndex, passIndex, routeLabel });
      if (prepareError) {
        const errMessage = normalizeEngineErrorMessage(prepareError);
        const result = {
          id: routeDef?.id,
          name: routeDef?.name,
          category: routeDef?.category,
          lengthCategory: routeDef?.lengthCategory,
          start: routeDef?.start,
          end: routeDef?.end,
          radius: null,
          fetchMs: null,
          nRuns,
          bidirectional_astar_ms: null,
          adaptive_barrier_ms: null,
          adaptive_barrier_parallel: null,
          delta_stepping_parallel: null,
          delta_stepping_ms: null,
          ultra_dijkstra_ms: null,
          bidirectional_astar_cost: null,
          adaptive_barrier_cost: null,
          delta_stepping_cost: null,
          ultra_dijkstra_cost: null,
          winner: null,
          error: errMessage,
          _sab: sharedArrayBuffer,
          sharedArrayBuffer,
          _passIndex: passIndex,
        };
        await saveResultToDB(runId, passIndex, routeIndex, result);
        postMessage({ type: 'status', status: 'result-saved', runId, routeIndex, passIndex, routeLabel });
        continue;
      }

      const { prepared, radius, fetchMs, startId, endId } = preparedRoute;

        const baseResult = {
          id: routeDef?.id,
          name: routeDef?.name,
          category: routeDef?.category,
          lengthCategory: routeDef?.lengthCategory,
          start: routeDef?.start,
          end: routeDef?.end,
          radius,
          nRuns,
          fetchMs,
          _sab: sharedArrayBuffer,
          sharedArrayBuffer,
          _passIndex: passIndex,
        };

        if (startId === -1 || endId === -1 || !prepared) {
          const result = {
            ...baseResult,
            bidirectional_astar_ms: null,
            adaptive_barrier_ms: null,
            adaptive_barrier_parallel: null,
            delta_stepping_parallel: null,
            delta_stepping_ms: null,
            ultra_dijkstra_ms: null,
            bidirectional_astar_cost: null,
            adaptive_barrier_cost: null,
            delta_stepping_cost: null,
            ultra_dijkstra_cost: null,
            winner: null,
            error: 'no_node',
          };
          await saveResultToDB(runId, passIndex, routeIndex, result);
          postMessage({ type: 'status', status: 'result-saved', runId, routeIndex, passIndex, routeLabel });
          continue;
        }

        let selectorFeatures;
        if (prepared && prepared.selectorFeatures) {
          selectorFeatures = prepared.selectorFeatures;
        } else {
          if (!prepared || !prepared.metrics) {
            try { console.warn('[benchmark-route-worker] prepared.metrics missing and no cached selectorFeatures', { runId, routeIndex, passIndex }); } catch (_e) {}
          }
          selectorFeatures = classifySelectorFeatures(prepared?.metrics);
        }
        const benchmarkResult = {
          ...baseResult,
          ...selectorFeatures,
        };

        const warmResults = {};
        const warmTimings = {};
        const warmErrors = {};
        const timedResults = {};
        const timesMap = Object.fromEntries(ENGINE_IDS.map((engineId) => [engineId, []]));
        const engineRunErrors = {};
        reportWorkerMemoryPhase('before-engine-benchmark', {
          routeIndex,
          passIndex,
          routeLabel,
          startId,
          endId,
          preparedN: prepared?.N ?? null,
          preparedE: prepared?.E ?? null,
        });

        let referenceCost = null;
        for (const engineId of ENGINE_IDS) {
          postMessage({ type: 'status', status: 'warming-engine', routeIndex, passIndex, engineId });
          const startMs = performance.now();
          let rawWarm;
          try {
            rawWarm = await runEngineQueryWithTimeout(startId, endId, prepared, {
              engineId,
              costField,
              forceSerialRouting,
              engineRunTimeoutMs,
            });
            warmErrors[engineId] = null;
          } catch (error) {
            rawWarm = {
              error: normalizeEngineErrorMessage(error),
              errorCode: normalizeEngineErrorCode(error),
              parallelUsed: false,
            };
            warmErrors[engineId] = rawWarm.error;
          } finally {
            warmTimings[engineId] = round2(performance.now() - startMs);
          }

          if (engineId === 'bidirectional-astar') {
            warmResults[engineId] = normalizeBenchmarkResult('bidirectional-astar', rawWarm, prepared);
            referenceCost = warmResults[engineId]?.cost ?? null;
          } else {
            warmResults[engineId] = normalizeBenchmarkResult(engineId, rawWarm, prepared, referenceCost);
          }
        }

        for (let round = 0; round < nRuns; round++) {
          postMessage({ type: 'status', status: 'timing-round', routeIndex, passIndex, round: round + 1, totalRounds: nRuns });
          for (const engineId of ENGINE_IDS) {
            if (engineRunErrors[engineId]) {
              continue;
            }
            try {
              const t0 = performance.now();
              const timed = await runEngineQueryWithTimeout(startId, endId, prepared, {
                engineId,
                costField,
                forceSerialRouting,
                engineRunTimeoutMs,
              });
              let elapsed = performance.now() - t0;
              if (elapsed === 0) {
                const batchRuns = 16;
                const tb0 = performance.now();
                for (let j = 0; j < batchRuns; j++) {
                  await runEngineQueryWithTimeout(startId, endId, prepared, {
                    engineId,
                    costField,
                    forceSerialRouting,
                    engineRunTimeoutMs,
                  });
                }
                elapsed = (performance.now() - tb0) / batchRuns;
              }
              if (!timedResults[engineId]) {
                timedResults[engineId] = normalizeBenchmarkResult(engineId, timed, prepared, referenceCost);
              }
              timesMap[engineId].push(elapsed);
            } catch (error) {
              engineRunErrors[engineId] = normalizeEngineErrorMessage(error);
            }
          }
        }

        reportWorkerMemoryPhase('after-engine-warmup', {
          routeIndex,
          passIndex,
          routeLabel,
          warmEngineResults: Object.fromEntries(ENGINE_IDS.map((engineId) => [engineId, warmResults[engineId]?.found ?? false])),
        });

        const resultsByEngine = {};
        for (const engineId of ENGINE_IDS) {
          const rawWarm = warmResults[engineId];
          const rawTimed = timedResults[engineId] ?? null;
          const hasTimedSamples = timesMap[engineId].length > 0;
          const useTimed = rawTimed && !rawTimed.error;
          const resultSource = useTimed ? 'timed' : rawWarm ? 'warm' : 'none';
          const status = engineRunErrors[engineId]
            ? 'timed_error'
            : useTimed
              ? rawWarm?.error
                ? 'warm_error_recovered'
                : 'ok'
              : rawTimed?.error
                ? 'timed_error'
                : rawWarm?.error
                  ? 'warm_error'
                  : 'ok';
          const finalResult = useTimed ? rawTimed : rawWarm ?? {};
          resultsByEngine[engineId] = {
            medianMs: hasTimedSamples ? median(timesMap[engineId]) : null,
            warmupMs: Number.isFinite(warmTimings[engineId]) ? warmTimings[engineId] : null,
            found: finalResult.found ?? false,
            parallelUsed: finalResult.parallelUsed ?? false,
            cost: finalResult.cost ?? null,
            error: engineRunErrors[engineId] ?? rawTimed?.error ?? rawWarm?.error ?? null,
            warmError: rawWarm?.error ?? null,
            warmErrorCode: rawWarm?.errorCode ?? null,
            timedError: engineRunErrors[engineId] ?? rawTimed?.error ?? null,
            timedErrorCode: engineRunErrors[engineId] ? normalizeEngineErrorCode({ message: engineRunErrors[engineId] }) : rawTimed?.errorCode ?? null,
            resultSource,
            status,
          };
        }

        const times = Object.fromEntries(ENGINE_IDS.map((engineId) => [engineId, resultsByEngine[engineId].medianMs]).filter(([, value]) => Number.isFinite(value)));
        const timingWinner = selectTimingWinner(times);
        const winner = timingWinner.winner;
        const fastestMs = timingWinner.fastestMs;
        const autoEngine = selectBestEngine(selectorFeatures || prepared?.metrics);
        const autoEngineMs = resultsByEngine[autoEngine]?.medianMs ?? null;
        const winnerMs = winner != null ? resultsByEngine[winner]?.medianMs ?? fastestMs : fastestMs;
        const autoVsWinnerPct = Number.isFinite(autoEngineMs) && Number.isFinite(winnerMs) && winnerMs > 0 ? round2(((autoEngineMs - winnerMs) / winnerMs) * 100) : null;

        const costs = Object.fromEntries(
          ENGINE_IDS.map((engineId) => [engineId, resultsByEngine[engineId].cost])
            .filter(([, cost]) => cost != null)
        );
        const costWinner = Object.keys(costs).length > 0 ? Object.entries(costs).reduce((a, b) => (a[1] < b[1] ? a : b))[0] : null;

        let metricsId = null;
        if (prepared && prepared.metrics) {
          try {
            metricsId = await savePreparedMetricsToDB(prepared.metrics);
          } catch (err) {
            console.warn('[benchmark-route-worker] savePreparedMetricsToDB failed:', err);
          }
        }

        const result = {
          ...benchmarkResult,
          graph: { metricsId, radius, startNodeId: startId, endNodeId: endId },
          fetchMs,
          best_time_ms: timingWinner.fastestMs,
          bidirectional_astar_ms: resultsByEngine['bidirectional-astar'].medianMs,
          adaptive_barrier_ms: resultsByEngine['adaptive-barrier'].medianMs,
          adaptive_barrier_parallel: resultsByEngine['adaptive-barrier'].parallelUsed ? 1 : 0,
          delta_stepping_parallel: resultsByEngine['delta-stepping'].parallelUsed ? 1 : 0,
          delta_stepping_ms: resultsByEngine['delta-stepping'].medianMs,
          ultra_dijkstra_ms: resultsByEngine['ultra-dijkstra'].medianMs,
          bidirectional_astar_delta_ms: Number.isFinite(resultsByEngine['bidirectional-astar'].medianMs) ? round4(resultsByEngine['bidirectional-astar'].medianMs - fastestMs) : null,
          adaptive_barrier_delta_ms: Number.isFinite(resultsByEngine['adaptive-barrier'].medianMs) ? round4(resultsByEngine['adaptive-barrier'].medianMs - fastestMs) : null,
          delta_stepping_delta_ms: Number.isFinite(resultsByEngine['delta-stepping'].medianMs) ? round4(resultsByEngine['delta-stepping'].medianMs - fastestMs) : null,
          ultra_dijkstra_delta_ms: Number.isFinite(resultsByEngine['ultra-dijkstra'].medianMs) ? round4(resultsByEngine['ultra-dijkstra'].medianMs - fastestMs) : null,
          bidirectional_astar_cost: resultsByEngine['bidirectional-astar'].cost,
          adaptive_barrier_cost: resultsByEngine['adaptive-barrier'].cost,
          delta_stepping_cost: resultsByEngine['delta-stepping'].cost,
          ultra_dijkstra_cost: resultsByEngine['ultra-dijkstra'].cost,
          n_engines_found: Object.values(resultsByEngine).filter((r) => r.found).length,
          n_engines_timed: Object.values(resultsByEngine).filter((r) => Number.isFinite(r.medianMs)).length,
          n_engines_cost: Object.values(resultsByEngine).filter((r) => r.cost != null).length,
          n_engines_warm_errors: Object.values(resultsByEngine).filter((r) => Boolean(r.warmError)).length,
          n_engines_timed_errors: Object.values(resultsByEngine).filter((r) => Boolean(r.timedError)).length,
          any_engine_warm_error: Object.values(resultsByEngine).some((r) => Boolean(r.warmError)),
          any_engine_timed_error: Object.values(resultsByEngine).some((r) => Boolean(r.timedError)),
          any_engine_error: Object.values(resultsByEngine).some((r) => Boolean(r.error)),
          cost_winner_ms: costWinner ? resultsByEngine[costWinner]?.medianMs ?? null : null,
          winner_vs_cost_pct: costWinner && Number.isFinite(resultsByEngine[costWinner]?.medianMs) ? round2(((fastestMs - resultsByEngine[costWinner].medianMs) / resultsByEngine[costWinner].medianMs) * 100) : null,
          winner_vs_cost_ms: costWinner && Number.isFinite(resultsByEngine[costWinner]?.medianMs) ? round4(fastestMs - resultsByEngine[costWinner].medianMs) : null,
          auto_engine: autoEngine,
          auto_engine_ms: autoEngineMs,
          auto_vs_winner_pct: autoVsWinnerPct,
          auto_matches_winner: timingWinner.winnerCandidates.length > 0 ? Number(timingWinner.winnerCandidates.includes(autoEngine)) : null,
          auto_is_winner: autoEngine === winner,
          winner_tied: Number(timingWinner.winnerTied),
          winner_candidates: timingWinner.winnerCandidates,
          winner_candidate_count: timingWinner.winnerCandidates.length,
          winner_margin_ms: timingWinner.winnerMarginMs,
          winner_margin_pct: timingWinner.winnerMarginPct,
          second_best_ms: timingWinner.secondBestMs,
          runner_up_engine: timingWinner.runnerUpEngine,
          worst_time_ms: timingWinner.worstMs,
          best_to_worst_ms: timingWinner.bestToWorstMs,
          best_to_worst_pct: timingWinner.bestToWorstPct,
          engines_within_5pct: timingWinner.engineCountWithin5Pct,
          winner_is_cost_winner: winner !== null && winner === costWinner,
          costWinner,
          winner,
          engines_found: {
            bidirectional_astar: resultsByEngine['bidirectional-astar'].found,
            adaptive_barrier: resultsByEngine['adaptive-barrier'].found,
            delta_stepping: resultsByEngine['delta-stepping'].found,
            ultra_dijkstra: resultsByEngine['ultra-dijkstra'].found,
          },
          errors: {
            bidirectional_astar_error: resultsByEngine['bidirectional-astar'].error,
            adaptive_barrier_error: resultsByEngine['adaptive-barrier'].error,
            delta_stepping_error: resultsByEngine['delta-stepping'].error,
            ultra_dijkstra_error: resultsByEngine['ultra-dijkstra'].error,
          },
          bidirectional_astar_error: resultsByEngine['bidirectional-astar'].error,
          adaptive_barrier_error: resultsByEngine['adaptive-barrier'].error,
          delta_stepping_error: resultsByEngine['delta-stepping'].error,
          ultra_dijkstra_error: resultsByEngine['ultra-dijkstra'].error,
          bidirectional_astar_warm_error: resultsByEngine['bidirectional-astar'].warmError,
          adaptive_barrier_warm_error: resultsByEngine['adaptive-barrier'].warmError,
          delta_stepping_warm_error: resultsByEngine['delta-stepping'].warmError,
          ultra_dijkstra_warm_error: resultsByEngine['ultra-dijkstra'].warmError,
          bidirectional_astar_warm_error_code: resultsByEngine['bidirectional-astar'].warmErrorCode,
          adaptive_barrier_warm_error_code: resultsByEngine['adaptive-barrier'].warmErrorCode,
          delta_stepping_warm_error_code: resultsByEngine['delta-stepping'].warmErrorCode,
          ultra_dijkstra_warm_error_code: resultsByEngine['ultra-dijkstra'].warmErrorCode,
          bidirectional_astar_result_source: resultsByEngine['bidirectional-astar'].resultSource,
          adaptive_barrier_result_source: resultsByEngine['adaptive-barrier'].resultSource,
          delta_stepping_result_source: resultsByEngine['delta-stepping'].resultSource,
          ultra_dijkstra_result_source: resultsByEngine['ultra-dijkstra'].resultSource,
          bidirectional_astar_status: resultsByEngine['bidirectional-astar'].status,
          adaptive_barrier_status: resultsByEngine['adaptive-barrier'].status,
          delta_stepping_status: resultsByEngine['delta-stepping'].status,
          ultra_dijkstra_status: resultsByEngine['ultra-dijkstra'].status,
          bidirectional_astar_timed_error: resultsByEngine['bidirectional-astar'].timedError,
          adaptive_barrier_timed_error: resultsByEngine['adaptive-barrier'].timedError,
          delta_stepping_timed_error: resultsByEngine['delta-stepping'].timedError,
          ultra_dijkstra_timed_error: resultsByEngine['ultra-dijkstra'].timedError,
          bidirectional_astar_timed_error_code: resultsByEngine['bidirectional-astar'].timedErrorCode,
          adaptive_barrier_timed_error_code: resultsByEngine['adaptive-barrier'].timedErrorCode,
          delta_stepping_timed_error_code: resultsByEngine['delta-stepping'].timedErrorCode,
          ultra_dijkstra_timed_error_code: resultsByEngine['ultra-dijkstra'].timedErrorCode,
          bidirectional_astar_error_code: resultsByEngine['bidirectional-astar'].warmErrorCode ?? resultsByEngine['bidirectional-astar'].timedErrorCode,
          adaptive_barrier_error_code: resultsByEngine['adaptive-barrier'].warmErrorCode ?? resultsByEngine['adaptive-barrier'].timedErrorCode,
          delta_stepping_error_code: resultsByEngine['delta-stepping'].warmErrorCode ?? resultsByEngine['delta-stepping'].timedErrorCode,
          ultra_dijkstra_error_code: resultsByEngine['ultra-dijkstra'].warmErrorCode ?? resultsByEngine['ultra-dijkstra'].timedErrorCode,
        };

        await saveResultToDB(runId, passIndex, routeIndex, result);
        // Allow GC of large typed arrays attached to `prepared.metrics` now that
        // metrics have been persisted and result saved.
        try {
          if (prepared) {
            prepared.metrics = null;
            try {
              reportWorkerMemoryPhase('prepared-metrics-nulled', {
                runId,
                routeIndex,
                passIndex,
                routeLabel,
                hasMetrics: Boolean(prepared?.metrics),
                hasSelectorFeatures: Boolean(prepared?.selectorFeatures),
              });
            } catch (_e) {}
          }
        } catch (_e) {
          /* ignore */
        }
        postMessage({ type: 'status', status: 'result-saved', runId, routeIndex, passIndex, routeLabel });
      }
  } finally {
    if (preparedRouteAcquired) {
      const released = releasePreparedRoute(routeDef, urlTemplate, mode, zoom, costField);
      postMessage({
        type: 'status',
        status: released ? 'route-cache-released' : 'route-cache-empty',
        routeIndex,
        passIndex: null,
        routeLabel,
        cacheStats: getRouteCacheStats(),
        memory: getWorkerMemoryUsage(),
      });
    }
    clearRouteSpecificCaches();
    try { disposeAllRouteResources(); } catch (_e) {}
    postMessage({ type: 'routeCompleted', runId, routeIndex });
  }
}

self.addEventListener('message', async (event) => {
  let message = event?.data;
  if (message instanceof ArrayBuffer || ArrayBuffer.isView(message)) {
    try {
      const decoded = new TextDecoder().decode(message);
      message = JSON.parse(decoded);
    } catch (decodeError) {
      console.warn('[benchmark-route-worker] could not decode binary message', decodeError, message);
      return;
    }
  }

  if (!message || typeof message !== 'object') return;

  try {
    if (message.type === 'initSharedTilePoolPort') {
      const port = event?.ports?.[0] || message?.port;
      if (port) {
        initSharedTilePoolPort(port);
        return;
      }
    }

    if (message.type === 'routeJob') {
      // Route job cleanup is handled internally by benchmarkRouteJob.
      await benchmarkRouteJob(message);
      return;
    }

    if (message.type === 'powercache:stats') {
      reportAllPowerCaches();
      return;
    }

    if (message.type === 'powercache:forceRelease') {
      forceReleaseAllPowerCaches();
      return;
    }

    console.warn('[benchmark-route-worker] unknown message type', message?.type, message);
  } catch (error) {
    console.error('[benchmark-route-worker] failed to process route job', error);
    try { disposeAllRouteResources(); } catch (_e) {}
    postMessage({
      type: 'status',
      status: 'error',
      error: normalizeEngineErrorMessage(error),
      routeIndex: message?.routeIndex,
      passIndex: message?.passIndex,
      routeLabel: message?.routeDef?.name,
    });
    postMessage({ type: 'routeCompleted', runId: message?.runId, routeIndex: message?.routeIndex });
  }
});

// Global error/unhandledrejection handlers — best-effort cleanup and telemetry.
try {
  self.addEventListener('unhandledrejection', (ev) => {
    try { console.warn('[benchmark-route-worker] unhandledrejection', ev?.reason ?? ev); } catch (_e) {}
    try { forceReleaseAllPowerCaches(); } catch (_e) {}
    try { reportWorkerMemoryPhase('unhandledrejection', { reason: ev?.reason ? (ev.reason.message ?? String(ev.reason)) : null }); } catch (_e) {}
    try { postMessage({ type: 'worker:event', event: 'unhandledrejection', memory: getWorkerMemoryUsage() }); } catch (_e) {}
  });

  self.addEventListener('error', (ev) => {
    try { console.error('[benchmark-route-worker] error', ev?.message ?? ev); } catch (_e) {}
    try { forceReleaseAllPowerCaches(); } catch (_e) {}
    try { reportWorkerMemoryPhase('error', { message: ev?.message ?? null }); } catch (_e) {}
    try { postMessage({ type: 'worker:event', event: 'error', memory: getWorkerMemoryUsage() }); } catch (_e) {}
  });
} catch (_e) {
  /* ignore — adding global handlers is best-effort */
}

export {
  initSharedTilePoolPort,
  disposeSharedTilePoolPort,
  clearSharedTilePoolPendingResponses,
  clearRouteCache,
  releasePreparedRoute,
  getRouteCacheStats,
  _routeCache,
};

