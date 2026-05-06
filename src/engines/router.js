/**
 * chRouter.js - Routing engine with CPU bidirectional A*.
 *
 * CPU path: bidirectional A* (forward from start + backward from end).
 *   Frontiers alternate on the smaller heap. Meeting node found when a node
 *   is settled by both directions; optimal path cost = min over all settled
 *   meeting nodes of (distFwd[v] + distBwd[v]).
 *
 * Route results are memoised in a module-level PowerCache keyed by
 *   `${startId}:${endId}:${costField}` on the prepared graph object.
 *   The cache lives on `prepared._routeCache` so it is graph-scoped
 *   and evicted automatically when the graph is GC'd.
 *
 * Exports: buildCH, queryRoute, computeRoute, nearestNode
 */
import KDBush from 'kdbush';
import { PowerLogger } from 'performance-helpers/powerLogger';
import { PowerCache } from 'performance-helpers/powerCache';
import { haversineDistance as haversine } from '../utils/misc.js';
import {
  getParallelPolicyForEngine,
  hasParallelRoutingRuntime,
  selectBestEngine,
} from '../tuning/tuning.js';
import { bidirectionalAStar } from './BidirectionalAStar/index.js';
import { adaptiveBarrierSSPRouter } from './AdaptiveBarrierSSSP/index.js';
import { deltaSteppingRouter } from './DeltaStepping/index.js';
import { ultraDijkstraRouter } from './UltraDijkstra/index.js';
import EngineMainWorker from './engineMainWorker?worker&inline';
import { getAllGraphMetrics } from '../graphs/graphMetrics.js'; 

export { selectBestEngine };

const logger = new PowerLogger(import.meta.env?.DEV ? 3 : 0, { name: 'omt-router' });

const DIST_SCALE = 10;
const DEG_TO_RAD = Math.PI / 180;
const LATITUDE_METERS = 111_320;
const PARALLEL_ROUTING_RUNTIME_AVAILABLE = hasParallelRoutingRuntime();
// ── Route result cache ──────────────────────────────────────────────────────
// Keyed by `${startId}:${endId}:${costField}`, stored on each `prepared`
// object so the cache is graph-scoped and naturally evicted with the graph.
// 200 entries covers ~30 min of typical navigation use before LRU eviction.
const ROUTE_CACHE_MAX = 200;
const ROUTE_CACHE_TTL = 10 * 60_000; // 10 min
const ROUTE_CACHE_KEY_VERSION = 'v2';
const DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M = 60;
const SEGMENT_SNAP_EXTRA_M = 250;
const SEGMENT_SNAP_SPAN_FACTOR = 0.5;
const ENGINE_WORKER_STATES = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  CANCELLING: 'cancelling',
  ERROR: 'error',
});
const ENGINE_ID_ALIASES = Object.freeze({
  cpu: 'bidirectional-astar',
  bidirectionalAStar: 'bidirectional-astar',
  adaptiveBarrier: 'adaptive-barrier',
  deltaStepping: 'delta-stepping',
  ultraDijkstra: 'ultra-dijkstra',
});

function normalizeEngineId(engineId, fallback = 'bidirectional-astar') {
  if (typeof engineId !== 'string' || !engineId) return fallback;
  return ENGINE_ID_ALIASES[engineId] ?? engineId;
}

let _engineWorker = null;
let _engineWorkerRequestId = 0;
let _activeEngineJob = null;
let _engineWorkerStatus = {
  state: ENGINE_WORKER_STATES.IDLE,
  running: false,
  engineId: null,
  requestId: null,
  startedAt: null,
  lastError: null,
};
const _engineWorkerStatusListeners = new Set();

function emitEngineWorkerStatus(nextState) {
  _engineWorkerStatus = {
    ..._engineWorkerStatus,
    ...nextState,
  };

  for (const listener of _engineWorkerStatusListeners) {
    try {
      listener({ ..._engineWorkerStatus });
    } catch {
      // Keep status fan-out resilient to listener errors.
    }
  }
}

function rejectActiveEngineJob(error) {
  const job = _activeEngineJob;
  _activeEngineJob = null;
  if (job) job.reject(error);
}

function terminateEngineWorker() {
  if (!_engineWorker) return;
  try {
    _engineWorker.terminate();
  } catch {
    // Best-effort cleanup.
  }
  _engineWorker = null;
}

function makeEngineError(message, code = 'engine_error') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ensureEngineWorker() {
  if (_engineWorker) return _engineWorker;
  if (typeof Worker === 'undefined') return null;

  _engineWorker = new EngineMainWorker();

  _engineWorker.onmessage = (event) => {
    const message = event.data ?? {};

    if (message.type === 'status') {
      if (_activeEngineJob && message.requestId !== _activeEngineJob.requestId) return;

      if (message.state === ENGINE_WORKER_STATES.RUNNING) {
        emitEngineWorkerStatus({
          state: ENGINE_WORKER_STATES.RUNNING,
          running: true,
          engineId: normalizeEngineId(message.engineId, _activeEngineJob?.engineId ?? null),
          requestId: message.requestId ?? _activeEngineJob?.requestId ?? null,
          startedAt: _activeEngineJob?.startedAt ?? Date.now(),
          lastError: null,
        });
      } else if (message.state === ENGINE_WORKER_STATES.ERROR) {
        emitEngineWorkerStatus({
          state: ENGINE_WORKER_STATES.ERROR,
          running: false,
          engineId: null,
          requestId: null,
          startedAt: null,
          lastError: message.error ?? 'engine worker error',
        });
      } else if (message.state === ENGINE_WORKER_STATES.IDLE && !_activeEngineJob) {
        emitEngineWorkerStatus({
          state: ENGINE_WORKER_STATES.IDLE,
          running: false,
          engineId: null,
          requestId: null,
          startedAt: null,
        });
      }
      return;
    }

    if (message.type !== 'result') return;
    if (!_activeEngineJob || message.requestId !== _activeEngineJob.requestId) return;

    const { resolve, reject } = _activeEngineJob;
    _activeEngineJob = null;

    if (message.ok) {
      emitEngineWorkerStatus({
        state: ENGINE_WORKER_STATES.IDLE,
        running: false,
        engineId: null,
        requestId: null,
        startedAt: null,
        lastError: null,
      });
      resolve(message.result);
      return;
    }

    emitEngineWorkerStatus({
      state: ENGINE_WORKER_STATES.ERROR,
      running: false,
      engineId: null,
      requestId: null,
      startedAt: null,
      lastError: message.error?.message ?? 'engine worker error',
    });
    reject(makeEngineError(message.error?.message ?? 'engine worker failed', 'engine_worker_failed'));
  };

  _engineWorker.onerror = (event) => {
    const message = event?.message ?? 'engine worker crashed';
    const error = makeEngineError(message, 'engine_worker_crashed');

    emitEngineWorkerStatus({
      state: ENGINE_WORKER_STATES.ERROR,
      running: false,
      engineId: null,
      requestId: null,
      startedAt: null,
      lastError: message,
    });

    terminateEngineWorker();
    rejectActiveEngineJob(error);
  };

  return _engineWorker;
}

function serializePreparedForEngineWorker(prepared) {
  return {
    adjPtr: prepared.adjPtr,
    adjTo: prepared.adjTo,
    adjCost: prepared.adjCost,
    revAdjPtr: prepared.revAdjPtr,
    revAdjFrom: prepared.revAdjFrom,
    revAdjCost: prepared.revAdjCost,
    N: prepared.N,
    E: prepared.E,
    coordsArr: prepared.coordsArr,
    costField: prepared.costField,
  };
}

async function runEngineDirect(selectedEngine, startId, endId, prepared, beelineM, {
  forceSerialRouting = false,
  parallelPolicy = null,
} = {}) {
  switch (selectedEngine) {
    case 'bidirectional-astar':
      logger.log(() => `bidirectional A* (E=${prepared.E}, beeline=${beelineM.toFixed(0)} m)`);
      return bidirectionalAStar(startId, endId, prepared);

    case 'adaptive-barrier':
      logger.log(() => `adaptive barrier SSP (E=${prepared.E}, beeline=${beelineM.toFixed(0)} m)`);
      return adaptiveBarrierSSPRouter(startId, endId, prepared, {
        forceSerialRouting,
        minNodesForParallel: parallelPolicy?.minNodesForParallel,
        minFrontierForParallel: parallelPolicy?.minFrontierForParallel,
      });

    case 'delta-stepping':
      logger.log(() => `delta stepping (E=${prepared.E}, beeline=${beelineM.toFixed(0)} m)`);
      return deltaSteppingRouter(startId, endId, prepared, {
        forceSerialRouting,
        minFrontierForParallel: parallelPolicy?.minFrontierForParallel,
      });

    case 'ultra-dijkstra':
      logger.log(() => `ultra dijkstra (E=${prepared.E}, beeline=${beelineM.toFixed(0)} m)`);
      return ultraDijkstraRouter(startId, endId, prepared);

    default:
      logger.warn(`unknown selectedEngine: ${selectedEngine}, falling back to ultra-dijkstra`);
      return ultraDijkstraRouter(startId, endId, prepared);
  }
}

async function runEngineInWorker(selectedEngine, startId, endId, prepared, {
  forceSerialRouting = false,
  parallelPolicy = null,
} = {}) {
  const worker = ensureEngineWorker();
  if (!worker) throw makeEngineError('engine worker is unavailable', 'engine_worker_unavailable');
  if (_activeEngineJob) throw makeEngineError('engine worker is busy', 'engine_worker_busy');

  const requestId = ++_engineWorkerRequestId;
  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    _activeEngineJob = {
      requestId,
      resolve,
      reject,
      engineId: selectedEngine,
      startedAt,
    };

    emitEngineWorkerStatus({
      state: ENGINE_WORKER_STATES.RUNNING,
      running: true,
      engineId: selectedEngine,
      requestId,
      startedAt,
      lastError: null,
    });

    worker.postMessage({
      type: 'run',
      requestId,
      engineId: selectedEngine,
      startId,
      endId,
      forceSerialRouting,
      parallelPolicy,
      prepared: serializePreparedForEngineWorker(prepared),
    });
  });
}

export function getEngineWorkerStatus() {
  return { ..._engineWorkerStatus };
}

export function onEngineWorkerStatusChange(listener) {
  if (typeof listener !== 'function') return () => { };
  _engineWorkerStatusListeners.add(listener);
  listener({ ..._engineWorkerStatus });
  return () => {
    _engineWorkerStatusListeners.delete(listener);
  };
}

export function cancelRunningEngine(reason = 'cancelled') {
  if (!_activeEngineJob) return false;

  emitEngineWorkerStatus({
    state: ENGINE_WORKER_STATES.CANCELLING,
    running: true,
    lastError: reason,
  });

  terminateEngineWorker();
  rejectActiveEngineJob(makeEngineError(`routing cancelled: ${reason}`, 'engine_cancelled'));

  emitEngineWorkerStatus({
    state: ENGINE_WORKER_STATES.IDLE,
    running: false,
    engineId: null,
    requestId: null,
    startedAt: null,
    lastError: reason,
  });

  return true;
}

function buildRouteCacheKey(prepared, startId, endId, engineId) {
  // Include a cache schema version and graph signature to prevent stale reuse
  // when graph topology or key composition evolves.
  return [
    ROUTE_CACHE_KEY_VERSION,
    prepared.N,
    prepared.E,
    startId,
    endId,
    prepared.costField,
    prepared.penaltyKey,
    engineId,
  ].join(':');
}

function normalizePenalties(penalties = {}) {
  const {
    intersectionPenaltySec = 0,
    turnPenaltySec = 0,
    turnAngleThresholdDeg = 25,
  } = penalties;

  return { intersectionPenaltySec, turnPenaltySec, turnAngleThresholdDeg };
}

function getPenaltyKey(costField, penalties = {}) {
  if (costField !== 'travelTime') return 'none';
  const { intersectionPenaltySec } = normalizePenalties(penalties);
  return `i${intersectionPenaltySec}`;
}

function getCostTolerance(left, right) {
  return Math.max(1, Math.max(Math.abs(left), Math.abs(right)) * 0.02);
}

function hasMeaningfulCostMismatch(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  return Math.abs(left - right) > getCostTolerance(left, right);
}

function calculatePathCost(path, prepared) {
  if (!Array.isArray(path) || path.length === 0) return null;
  const { adjPtr, adjTo, adjCost } = prepared;
  let totalCostInt = 0;
  const pathLen = path.length;

  for (let i = 1; i < pathLen; i++) {
    const from = path[i - 1];
    const to = path[i];
    let edgeCostInt = -1;
    const start = adjPtr[from];
    const end = adjPtr[from + 1];

    for (let k = start; k < end; k++) {
      if (adjTo[k] === to) {
        edgeCostInt = adjCost[k];
        break;
      }
    }

    if (edgeCostInt < 0) return null;
    totalCostInt += edgeCostInt;
  }

  return totalCostInt / DIST_SCALE;
}

export function validateRouteResult(result, prepared, expectedEndpoints = null) {
  if (!result?.found) {
    return {
      valid: Boolean(result),
      actualCost: result?.cost ?? null,
      reason: result ? null : 'missing_result',
    };
  }

  const path = Array.isArray(result.path) ? result.path : [];
  if (expectedEndpoints && path.length > 0) {
    const { startId, endId } = expectedEndpoints;
    if (path[0] !== startId || path[path.length - 1] !== endId) {
      return { valid: false, actualCost: null, reason: 'endpoint_mismatch' };
    }
  }

  const actualCost = calculatePathCost(path, prepared);
  if (!Number.isFinite(actualCost)) {
    return { valid: false, actualCost: null, reason: 'invalid_path' };
  }

  if (hasMeaningfulCostMismatch(actualCost, result.cost)) {
    return { valid: false, actualCost, reason: 'cost_mismatch' };
  }

  return { valid: true, actualCost, reason: null };
}

/**
 * Flatten graph into arrays + CSR adjacency lists. O(E).
 *
 * Adjacency lists use Compressed Sparse Row (CSR) layout instead of an array
 * of arrays of objects.  Two flat Int32Arrays per direction:
 *   adjPtr[u]   — start offset of node u's neighbours in adjTo / adjCost
 *   adjPtr[u+1] — exclusive end offset (adjPtr[N] = E_fwd)
 *   adjTo[k]    — destination node of the k-th outgoing edge
 *   adjCost[k]  — cost (scaled integer) of the k-th outgoing edge
 *
 * Benefits over Array<Array<{to,costInt}>>:
 *   - All neighbour data for a node is contiguous → better CPU cache locality
 *     in the Dijkstra inner loop (no pointer-chasing through heap objects)
 *   - Single typed-array allocation vs N small heap arrays + N×E objects
 *   - ~3-4x lower memory footprint for the adjacency structure on large graphs
 *
 * Two passes over the directed edge list:
 *   Pass 1 — count out-degree of each node (fill adjPtr as degree counts).
 *   Pass 2 — fill adjTo/adjCost, advancing a cursor per node.
 *
 * Name kept for API compatibility; no contraction hierarchy is built.
 */
export function buildCH(graph, costField = 'distance', penalties = {}) {
  const { nodes, edges } = graph;
  const N = nodes.size;
  const normalizedPenalties = normalizePenalties(penalties);
  const useIntersectionPenalty =
    costField === 'travelTime' && normalizedPenalties.intersectionPenaltySec > 0;

  let isIntersection = null;
  if (useIntersectionPenalty) {
    const incident = new Int32Array(N);
    for (const edge of edges) {
      if (edge.cost !== -1) {
        incident[edge.source]++;
        incident[edge.target]++;
      }
      if (edge.reverseCost !== -1) {
        incident[edge.target]++;
        incident[edge.source]++;
      }
    }
    isIntersection = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      isIntersection[i] = incident[i] >= 3 ? 1 : 0;
    }
  }

  // ── Collect directed edges (dedup) ─────────────────────────────────────────
  // Each undirected edge produces at most 2 directed edges (fwd + bwd).
  // Pre-size all scratch arrays to the theoretical maximum to avoid dynamic
  // growth / GC pressure during the O(E) build loop.
  const maxDE = edges.length * 2; // max directed edge count
  const edgeSrc = new Int32Array(maxDE);
  const edgeTgt = new Int32Array(maxDE);
  const edgeCostInt = new Int32Array(maxDE);
  // Flat triples [src, tgt, cost, src, tgt, cost, ...] for CSR pass 1/2.
  const fwdRaw = new Int32Array(maxDE * 3);
  const revRaw = new Int32Array(maxDE * 3);
  let eCount = 0, fwdLen = 0, revLen = 0;
  const seen = new Set();

  const addEdge = (src, tgt, floatCost) => {
    const intersectionPenalty =
      useIntersectionPenalty && isIntersection && isIntersection[tgt]
        ? normalizedPenalties.intersectionPenaltySec
        : 0;
    const key = (BigInt(src) << 32n) | BigInt(tgt);
    if (seen.has(key)) return;
    seen.add(key);
    const costInt = Math.round((floatCost + intersectionPenalty) * DIST_SCALE);
    edgeSrc[eCount] = src;
    edgeTgt[eCount] = tgt;
    edgeCostInt[eCount] = costInt;
    eCount++;
    fwdRaw[fwdLen++] = src; fwdRaw[fwdLen++] = tgt; fwdRaw[fwdLen++] = costInt;
    revRaw[revLen++] = tgt; revRaw[revLen++] = src; revRaw[revLen++] = costInt;
  };

  for (const edge of edges) {
    const fwdFloat =
      edge.cost !== -1 ? (costField === 'travelTime' ? edge.travelTime : edge.length) : -1;
    const bwdFloat =
      edge.reverseCost !== -1 ? (costField === 'travelTime' ? edge.travelTime : edge.length) : -1;
    if (fwdFloat !== -1) addEdge(edge.source, edge.target, fwdFloat);
    if (bwdFloat !== -1) addEdge(edge.target, edge.source, bwdFloat);
  }

  const E = eCount;

  // Trim the pre-allocated typed arrays to the actual edge count.
  // .subarray() is zero-copy — a view into the same buffer.
  const edgeSrcView = edgeSrc.subarray(0, E);
  const edgeTgtView = edgeTgt.subarray(0, E);
  const edgeCostIntView = edgeCostInt.subarray(0, E);

  // ── Build CSR for forward adjacency (adj) ──────────────────────────────────
  const adjPtr = new Int32Array(N + 1); // adjPtr[u]..adjPtr[u+1]-1 = range in adjTo/adjCost
  const adjTo = new Int32Array(E);
  const adjCost = new Int32Array(E);

  // Pass 1: count out-degrees
  for (let i = 0; i < fwdLen; i += 3) adjPtr[fwdRaw[i] + 1]++;
  // Prefix-sum → offsets
  for (let u = 0; u < N; u++) adjPtr[u + 1] += adjPtr[u];
  // Pass 2: fill (cursor tracks next write position per node)
  const adjCursor = adjPtr.slice(0, N); // copy of prefix sums as write cursors
  for (let i = 0; i < fwdLen; i += 3) {
    const src = fwdRaw[i], tgt = fwdRaw[i + 1], cost = fwdRaw[i + 2];
    const pos = adjCursor[src]++;
    adjTo[pos] = tgt;
    adjCost[pos] = cost;
  }

  // ── Build CSR for reverse adjacency (revAdj) ───────────────────────────────
  const revAdjPtr = new Int32Array(N + 1);
  const revAdjFrom = new Int32Array(E);
  const revAdjCost = new Int32Array(E);

  for (let i = 0; i < revLen; i += 3) revAdjPtr[revRaw[i] + 1]++;
  for (let u = 0; u < N; u++) revAdjPtr[u + 1] += revAdjPtr[u];
  const revCursor = revAdjPtr.slice(0, N);
  for (let i = 0; i < revLen; i += 3) {
    const tgt = revRaw[i], src = revRaw[i + 1], cost = revRaw[i + 2];
    const pos = revCursor[tgt]++;
    revAdjFrom[pos] = src;
    revAdjCost[pos] = cost;
  }

  // Flat coordinate array for fast heuristic lookups in A* (avoids Map.get per node).
  const coordsArr = new Array(N);
  for (let id = 0; id < N; id++) coordsArr[id] = nodes.get(id).coords;

  return {
    edgeSrc: edgeSrcView, edgeTgt: edgeTgtView, edgeCostInt: edgeCostIntView,
    adjPtr, adjTo, adjCost,
    revAdjPtr, revAdjFrom, revAdjCost,
    N, E, nodes, coordsArr, costField,
    penalties: normalizedPenalties,
    penaltyKey: getPenaltyKey(costField, normalizedPenalties),
  };
}

/**
 * CPU bidirectional A* route query with intelligent engine selection.
 */
/**
 * @param {number} startId
 * @param {number} endId
 * @param {object} prepared - result of buildCH()
 * @param {{ forceEngine?: 'cpu'|'gpu'|null, engineId?: 'bidirectional-astar'|'adaptive-barrier'|'delta-stepping'|'ultra-dijkstra'|'auto', graphCategory?: string, costField?: 'distance'|'travelTime', useCache?: boolean, allowFallback?: boolean }} [opts]
 *   forceEngine='cpu'|'gpu' is accepted for backward compatibility; routing is CPU-only.
 *   engineId selects the routing algorithm. Use 'auto' for intelligent selection (default).
 *   graphCategory optional: 'city-center' | 'city-consolidated' | 'suburban' | 'countryside' for better heuristics.
 */
export async function queryRoute(startId, endId, prepared, {
  forceEngine = null,
  engineId = 'auto',
  graphCategory = '',
  costField = prepared.costField ?? 'distance',
  useCache = true,
  allowFallback = true,
  forceSerialRouting = false,
} = {}) {
  // ── Route cache ────────────────────────────────────────────────────────────
  // Benchmarks can disable cache to measure pure engine runtime.
  if (useCache) {
    prepared._routeCache ??= new PowerCache({
      maxEntries: ROUTE_CACHE_MAX,
      defaultTTL: ROUTE_CACHE_TTL,
    });
  }

  // Intelligent engine selection
  const startNodeCoords = prepared.coordsArr[startId];
  const endNodeCoords = prepared.coordsArr[endId];
  const beelineM = haversine(startNodeCoords, endNodeCoords);
  const hasParallelRuntime = PARALLEL_ROUTING_RUNTIME_AVAILABLE;

  const selectedEngine = engineId === 'auto'
    ? selectBestEngine(prepared.metrics)
    : engineId;
  const normalizedSelectedEngine = normalizeEngineId(selectedEngine, 'bidirectional-astar');
  let resolvedForceSerialRouting = Boolean(forceSerialRouting);
  let parallelPolicy = null;

  if (!resolvedForceSerialRouting) {
    parallelPolicy = getParallelPolicyForEngine(
      normalizedSelectedEngine,
      hasParallelRuntime,
    );
    resolvedForceSerialRouting = !parallelPolicy;
  }

  const cacheKey = buildRouteCacheKey(prepared, startId, endId, normalizedSelectedEngine);
  if (useCache) {
    const cached = prepared._routeCache.get(cacheKey);
    if (cached) {
      if (cached._routeValidated) {
        logger.log(() => `route cache hit (${cacheKey})`);
        const { _routeValidated, ...cachedResult } = cached;
        return {
          ...cachedResult,
          engine: normalizeEngineId(cachedResult.engine, normalizedSelectedEngine),
          cost: Number.isFinite(cachedResult.cost) ? cachedResult.cost : Infinity,
        };
      }

      const cachedValidation = validateRouteResult(cached, prepared, { startId, endId });
      if (cachedValidation.valid) {
        cached._routeValidated = true;
        logger.log(() => `route cache hit (${cacheKey})`);
        const { _routeValidated, ...cachedResult } = cached;
        return {
          ...cachedResult,
          engine: normalizeEngineId(cachedResult.engine, normalizedSelectedEngine),
          cost: Number.isFinite(cachedValidation.actualCost)
            ? cachedValidation.actualCost
            : cachedResult.cost,
        };
      }

      logger.warn(
        `route cache stale/invalid (${cachedValidation.reason ?? 'unknown'}), recomputing (${cacheKey})`,
      );
    }
  }

  if (forceEngine === 'gpu') {
    logger.warn('forceEngine="gpu" requested, but GPU routing has been removed; using CPU routing');
  }

  let result;
  let fallback = null;
  if (typeof Worker === 'undefined') {
    result = await runEngineDirect(normalizedSelectedEngine, startId, endId, prepared, beelineM, {
      forceSerialRouting: resolvedForceSerialRouting,
      parallelPolicy,
    });
  } else {
    try {
      result = await runEngineInWorker(normalizedSelectedEngine, startId, endId, prepared, {
        forceSerialRouting: resolvedForceSerialRouting,
        parallelPolicy,
      });
    } catch (error) {
      if (error?.code === 'engine_cancelled' || error?.code === 'engine_worker_busy') {
        throw error;
      }
      logger.warn(
        `engine worker unavailable (${error?.code ?? 'unknown_error'}), falling back to main thread execution`,
      );
      result = await runEngineDirect(normalizedSelectedEngine, startId, endId, prepared, beelineM, {
        forceSerialRouting: resolvedForceSerialRouting,
        parallelPolicy,
      });
    }
  }

  result = { ...result, engine: normalizeEngineId(result?.engine, selectedEngine) };

  let validation = validateRouteResult(result, prepared, { startId, endId });
  if (result?.found && !validation.valid && allowFallback) {
    logger.warn(
      `engine "${normalizedSelectedEngine}" returned an invalid route (${validation.reason}), retrying with bidirectional A*`,
    );
    fallback = {
      from: normalizedSelectedEngine,
      to: 'bidirectional-astar',
      reason: 'invalid_route',
      detail: validation.reason,
    };
    try {
      result = await runEngineInWorker('bidirectional-astar', startId, endId, prepared, {
        forceSerialRouting: resolvedForceSerialRouting,
      });
    } catch {
      result = bidirectionalAStar(startId, endId, prepared);
    }
    result = { ...result, engine: 'bidirectional-astar' };
    validation = validateRouteResult(result, prepared, { startId, endId });
    if (!validation.valid) {
      logger.warn('bidirectional A* fallback also returned an invalid route; returning no_path');
      result = { found: false, path: [], cost: Infinity, engine: 'bidirectional-astar' };
    }
  }

  if (result?.found && Number.isFinite(validation.actualCost)) {
    result = { ...result, cost: validation.actualCost };
  }

  if (!result?.found && normalizedSelectedEngine !== 'bidirectional-astar' && allowFallback) {
    logger.warn(
      `engine "${normalizedSelectedEngine}" returned no path, retrying with bidirectional A* for correctness`,
    );
    fallback = {
      from: normalizedSelectedEngine,
      to: 'bidirectional-astar',
      reason: 'no_path',
      detail: null,
    };
    try {
      result = await runEngineInWorker('bidirectional-astar', startId, endId, prepared, {
        forceSerialRouting: resolvedForceSerialRouting,
      });
    } catch {
      result = bidirectionalAStar(startId, endId, prepared);
    }
    result = { ...result, engine: 'bidirectional-astar' };
  }

  if (fallback) {
    result = { ...result, fallback };
  }

  if (!result?.found) {
    result = { ...result, reason: result?.reason ?? 'no_path' };
  }

  if (useCache) {
    prepared._routeCache.set(cacheKey, { ...result, _routeValidated: true });
  }
  return result;
}

/**
 * Build a KDBush spatial index over graph nodes and cache it on the graph object.
 * Index insertion order matches node IDs (0..N-1), so within() results are node IDs directly.
 * @param {{ nodes: Map<number, { id: number, coords: [number, number] }> }} graph
 * @returns {KDBush}
 */
function buildSpatialIndex(graph) {
  const { nodes } = graph;
  const size = nodes.size;
  const index = new KDBush(size);
  const coordsArr = new Array(size);
  for (let id = 0; id < size; id++) {
    const { coords } = nodes.get(id);
    index.add(coords[0], coords[1]); // add(lng, lat)
    coordsArr[id] = coords;
  }
  index.finish();
  return { index, coordsArr };
}

function getNearbyNodeIds(graph, coords, maxDistM) {
  if (!graph._spatialIndex) {
    graph._spatialIndex = buildSpatialIndex(graph);
  }

  const { index } = graph._spatialIndex;
  const [lng, lat] = coords;
  const cosLat = Math.cos(lat * DEG_TO_RAD);
  const radiusDeg = maxDistM / (LATITUDE_METERS * cosLat);
  return index.within(lng, lat, radiusDeg);
}

function buildIncidentEdgeIndex(graph) {
  if (graph._incidentEdgeIndex) return graph._incidentEdgeIndex;
  const count = graph.nodes.size;
  const incident = Array.from({ length: count }, () => []);
  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    const edge = graph.edges[edgeIndex];
    if (edge.source >= 0 && edge.source < count) incident[edge.source].push(edgeIndex);
    if (edge.target >= 0 && edge.target < count) incident[edge.target].push(edgeIndex);
  }
  graph._incidentEdgeIndex = incident;
  return incident;
}

function projectPointOnSegment(coords, a, b, cosLat) {
  const px = coords[0] * cosLat;
  const py = coords[1];
  const ax = a[0] * cosLat;
  const ay = a[1];
  const bx = b[0] * cosLat;
  const by = b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return null;
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  return {
    t,
    projected: [ax + dx * t, ay + dy * t],
  };
}

function findClosestSegmentProjection(coords, graph, maxDistM) {
  const nodeIds = getNearbyNodeIds(graph, coords, maxDistM + SEGMENT_SNAP_EXTRA_M);
  const incident = buildIncidentEdgeIndex(graph);
  const candidateEdges = new Set();
  for (const nodeId of nodeIds) {
    const edges = incident[nodeId];
    if (!edges) continue;
    for (const edgeIndex of edges) candidateEdges.add(edgeIndex);
  }

  if (candidateEdges.size === 0) {
    for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
      candidateEdges.add(edgeIndex);
    }
  }

  const cosLat = Math.cos(coords[1] * DEG_TO_RAD);
  const spanThreshold = Math.max(1, maxDistM * SEGMENT_SNAP_SPAN_FACTOR);
  let best = null;

  const scanEdge = (edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    if (!edge) return;
    const a = graph.nodes.get(edge.source)?.coords;
    const b = graph.nodes.get(edge.target)?.coords;
    if (!a || !b) return;
    if (edge.cost === -1 && edge.reverseCost === -1) return;

    const projection = projectPointOnSegment(coords, a, b, cosLat);
    if (!projection) return;
    const { t, projected } = projection;
    if (t <= 0 || t >= 1) return;

    const projectedCoords = [projected[0] / cosLat, projected[1]];
    const distanceM = haversine(coords, projectedCoords);
    if (distanceM > maxDistM) return;

    const distToA = haversine(coords, a);
    const distToB = haversine(coords, b);
    if (distToA <= spanThreshold || distToB <= spanThreshold) return;

    if (!best || distanceM < best.distanceM) {
      best = {
        edge,
        edgeIndex,
        projectedCoords,
        distanceM,
        source: edge.source,
        target: edge.target,
        t,
      };
    }
  };

  for (const edgeIndex of candidateEdges) {
    scanEdge(edgeIndex);
  }

  if (candidateEdges.size > 0) {
    for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
      if (candidateEdges.has(edgeIndex)) continue;
      scanEdge(edgeIndex);
    }
  }

  return best;
}

function createAugmentedNodes(baseNodes, newNodeId, projectedCoords) {
  return {
    size: baseNodes.size + 1,
    get(id) {
      return id === newNodeId ? { id: newNodeId, coords: projectedCoords } : baseNodes.get(id);
    },
  };
}

function createAugmentedEdges(baseEdges, removedEdgeIndex, insertedEdges) {
  const baseLength = baseEdges.length;
  const length = baseLength - 1 + insertedEdges.length;

  const getEdgeAt = (index) => {
    if (index < 0 || index >= length) return undefined;
    if (index < removedEdgeIndex) return baseEdges[index];
    if (index < baseLength - 1) return baseEdges[index + 1];
    return insertedEdges[index - (baseLength - 1)];
  };

  const edgeContainer = { baseEdges, removedEdgeIndex, insertedEdges };

  return new Proxy(edgeContainer, {
    get(target, prop, receiver) {
      if (prop === 'length') return length;
      if (prop === Symbol.iterator) {
        return function* () {
          for (let i = 0; i < length; i++) yield getEdgeAt(i);
        };
      }

      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop, receiver);
      }

      const index = Number(prop);
      if (!Number.isNaN(index) && String(index) === prop) {
        return getEdgeAt(index);
      }

      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === 'symbol') {
        return prop in target;
      }
      const index = Number(prop);
      if (!Number.isNaN(index) && String(index) === prop) {
        return index >= 0 && index < length;
      }
      return prop in target;
    },
    ownKeys() {
      const keys = [];
      for (let i = 0; i < length; i++) keys.push(String(i));
      keys.push('length');
      return keys;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === 'length') {
        return { configurable: true, enumerable: false, value: length, writable: false };
      }
      if (typeof prop === 'symbol') {
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
      const index = Number(prop);
      if (!Number.isNaN(index) && String(index) === prop && index >= 0 && index < length) {
        return { configurable: true, enumerable: true, value: getEdgeAt(index), writable: false };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
}

function createAugmentedGraph(graph, snap) {
  const newNodeId = graph.nodes.size;
  const augmentedNodes = createAugmentedNodes(graph.nodes, newNodeId, snap.projectedCoords);

  const sourceCoords = graph.nodes.get(snap.edge.source).coords;
  const targetCoords = graph.nodes.get(snap.edge.target).coords;
  const lengthA = haversine(sourceCoords, snap.projectedCoords);
  const lengthB = haversine(snap.projectedCoords, targetCoords);
  const travelTimeA = lengthA / (snap.edge.speed / 3.6);
  const travelTimeB = lengthB / (snap.edge.speed / 3.6);
  const props = snap.edge.properties;
  const score = snap.edge.fibonacciScore;
  const baseEdgeId = Number.isFinite(snap.edge.id) ? snap.edge.id : graph.edges.length;
  const firstEdgeId = -(baseEdgeId * 2 + 1);
  const secondEdgeId = -(baseEdgeId * 2 + 2);

  const costA = snap.edge.cost === -1 ? -1 : lengthA;
  const costB = snap.edge.cost === -1 ? -1 : lengthB;
  const reverseCostA = snap.edge.reverseCost === -1 ? -1 : lengthA;
  const reverseCostB = snap.edge.reverseCost === -1 ? -1 : lengthB;

  const insertedEdges = [
    {
      id: firstEdgeId,
      source: snap.edge.source,
      target: newNodeId,
      cost: costA,
      reverseCost: reverseCostA,
      length: lengthA,
      speed: snap.edge.speed,
      travelTime: travelTimeA,
      properties: props,
      fibonacciScore: score,
    },
    {
      id: secondEdgeId,
      source: newNodeId,
      target: snap.edge.target,
      cost: costB,
      reverseCost: reverseCostB,
      length: lengthB,
      speed: snap.edge.speed,
      travelTime: travelTimeB,
      properties: props,
      fibonacciScore: score,
    },
  ];

  const augmentedEdges = createAugmentedEdges(graph.edges, snap.edgeIndex, insertedEdges);

  const augmentedGraph = {
    ...graph,
    nodes: augmentedNodes,
    edges: augmentedEdges,
    nodeIndex: graph.nodeIndex && new Map(graph.nodeIndex),
  };
  delete augmentedGraph._spatialIndex;
  delete augmentedGraph._incidentEdgeIndex;
  delete augmentedGraph._prepared;
  return augmentedGraph;
}

function tryAddSegmentSnap(graph, coords, maxDistM) {
  const snap = findClosestSegmentProjection(coords, graph, maxDistM);
  if (!snap) return null;
  const augmentedGraph = createAugmentedGraph(graph, snap);
  return {
    graph: augmentedGraph,
    nodeId: augmentedGraph.nodes.size - 1,
    snapDistanceM: snap.distanceM,
  };
}

export function nearestNode(coords, graph, maxDistM = 500) {
  if (!graph._spatialIndex) {
    graph._spatialIndex = buildSpatialIndex(graph);
  }
  const { index, coordsArr } = graph._spatialIndex;

  const [lng, lat] = coords;
  const cosLat = Math.cos(lat * DEG_TO_RAD);
  const radiusDeg = maxDistM / (LATITUDE_METERS * cosLat);
  const candidates = index.within(lng, lat, radiusDeg);

  if (candidates.length === 0) return -1;

  let bestId = -1;
  let bestDist = maxDistM;
  for (const id of candidates) {
    // Direct array lookup — avoids Map.get() per candidate.
    const d = haversine(coords, coordsArr[id]);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

export async function computeRoute(startCoords, endCoords, graph, options = {}) {
  const {
    costField = 'distance',
    penalties = {},
    snapDistancesM,
    graphCategory = '',
    maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M,
  } = options;
  const normalizedPenalties = normalizePenalties(penalties);
  if (costField === 'travelTime' && normalizedPenalties.turnPenaltySec > 0) {
    logger.warn('turn penalties are currently ignored; using standard engine routing');
  }
  const penaltyKey = getPenaltyKey(costField, normalizedPenalties);

  logger.log(() => `computeRoute: graph has ${graph.nodes.size} nodes, ${graph.edges.length} edges`);

  const distances =
    Array.isArray(snapDistancesM) && snapDistancesM.length > 0
      ? snapDistancesM
      : [250, 500, 800];

  let startId = -1;
  let endId = -1;
  let usedSnapDistance = distances[distances.length - 1];

  let workingGraph = graph;
  for (const maxDistM of distances) {
    startId = nearestNode(startCoords, workingGraph, maxDistM);
    endId = nearestNode(endCoords, workingGraph, maxDistM);
    usedSnapDistance = maxDistM;
    if (startId !== -1 && endId !== -1) break;
  }
  logger.log(() => `nearestNode: start=${startId}, end=${endId}, snap=${usedSnapDistance} m`);

  if (startId === -1 || endId === -1) {
    logger.warn(() => `No node found within ${usedSnapDistance} m of start or end coordinates`);
    return { path: [], coordinates: [], cost: Infinity, costField, found: false, reason: 'no_node' };
  }

  const spatialCoordsArr = workingGraph._spatialIndex?.coordsArr;
  let startSnapDistanceM = haversine(
    startCoords,
    spatialCoordsArr?.[startId] ?? workingGraph.nodes.get(startId).coords,
  );
  let endSnapDistanceM = haversine(
    endCoords,
    spatialCoordsArr?.[endId] ?? workingGraph.nodes.get(endId).coords,
  );

  const startSegmentSnap = findClosestSegmentProjection(startCoords, workingGraph, maxAcceptableSnapDistanceM);
  const endSegmentSnap = findClosestSegmentProjection(endCoords, workingGraph, maxAcceptableSnapDistanceM);
  let startSnapApplied = false;
  let endSnapApplied = false;
  const baseGraph = workingGraph;
  const baseStartId = startId;
  const baseEndId = endId;
  const originalStartSnapDistanceM = startSnapDistanceM;
  const originalEndSnapDistanceM = endSnapDistanceM;

  if (
    startSegmentSnap
    && startSegmentSnap.distanceM <= maxAcceptableSnapDistanceM
  ) {
    const snapResult = createAugmentedGraph(workingGraph, startSegmentSnap);
    workingGraph = snapResult;
    startId = workingGraph.nodes.size - 1;
    startSnapDistanceM = startSegmentSnap.distanceM;
    startSnapApplied = true;
  } else if (startSnapDistanceM > maxAcceptableSnapDistanceM) {
    const snapResult = tryAddSegmentSnap(workingGraph, startCoords, maxAcceptableSnapDistanceM);
    if (snapResult) {
      workingGraph = snapResult.graph;
      startId = snapResult.nodeId;
      startSnapDistanceM = snapResult.snapDistanceM;
      startSnapApplied = true;
    }
  }

  if (
    endSegmentSnap
    && endSegmentSnap.distanceM <= maxAcceptableSnapDistanceM
  ) {
    const snapResult = createAugmentedGraph(workingGraph, endSegmentSnap);
    workingGraph = snapResult;
    endId = workingGraph.nodes.size - 1;
    endSnapDistanceM = endSegmentSnap.distanceM;
    endSnapApplied = true;
  } else if (endSnapDistanceM > maxAcceptableSnapDistanceM) {
    const snapResult = tryAddSegmentSnap(workingGraph, endCoords, maxAcceptableSnapDistanceM);
    if (snapResult) {
      workingGraph = snapResult.graph;
      endId = snapResult.nodeId;
      endSnapDistanceM = snapResult.snapDistanceM;
      endSnapApplied = true;
    }
  }

  if (
    startSnapDistanceM > maxAcceptableSnapDistanceM
    || endSnapDistanceM > maxAcceptableSnapDistanceM
  ) {
    logger.warn(
      () => `Poor snap quality: start=${startSnapDistanceM.toFixed(0)} m, end=${endSnapDistanceM.toFixed(0)} m`,
    );
    return {
      path: [],
      coordinates: [],
      cost: Infinity,
      costField,
      found: false,
      reason: 'poor_snap',
      startSnapDistanceM,
      endSnapDistanceM,
    };
  }

  if (startId === endId) {
    const coords = spatialCoordsArr?.[startId] ?? workingGraph.nodes.get(startId).coords;
    return {
      path: [startId],
      coordinates: [coords],
      cost: 0,
      costField,
      found: true,
      engine: 'bidirectional-astar',
      startSnapDistanceM,
      endSnapDistanceM,
    };
  }

  const prepared = workingGraph._prepared?.[costField]?.[penaltyKey] ?? (() => {
    const p = buildCH(workingGraph, costField, normalizedPenalties);
    const metrics = getAllGraphMetrics(p, workingGraph, startId, endId);
    (workingGraph._prepared ??= {});
    (workingGraph._prepared[costField] ??= {});
    workingGraph._prepared[costField][penaltyKey] = p;
    p.metrics = metrics;
    return p;
  })();

  logger.log('dispatching route query...');
  const result = await queryRoute(startId, endId, prepared, { graphCategory, costField });

  if (!result.found) {
    const canFallbackWithStartSnap = startSegmentSnap && !startSnapApplied && startSegmentSnap.distanceM <= maxAcceptableSnapDistanceM;
    const canFallbackWithEndSnap = endSegmentSnap && !endSnapApplied && endSegmentSnap.distanceM <= maxAcceptableSnapDistanceM;

    if ((result.reason === 'no_path' || result.reason === 'incomplete_path') && (canFallbackWithStartSnap || canFallbackWithEndSnap)) {
      let fallbackGraph = workingGraph;
      let fallbackStartId = startId;
      let fallbackEndId = endId;

      if (canFallbackWithStartSnap) {
        const snapResult = createAugmentedGraph(fallbackGraph, startSegmentSnap);
        fallbackGraph = snapResult;
        fallbackStartId = fallbackGraph.nodes.size - 1;
      }

      if (canFallbackWithEndSnap) {
        const snapResult = createAugmentedGraph(fallbackGraph, endSegmentSnap);
        fallbackGraph = snapResult;
        fallbackEndId = fallbackGraph.nodes.size - 1;
      }

      if (fallbackGraph !== workingGraph) {
        const fallbackPrepared = buildCH(fallbackGraph, costField, normalizedPenalties);
        const fallbackResult = await queryRoute(fallbackStartId, fallbackEndId, fallbackPrepared, { graphCategory, costField });
        if (fallbackResult.found) {
          const fallbackCoordinates = fallbackResult.path.map((id) => fallbackGraph.nodes.get(id).coords);
          return {
            ...fallbackResult,
            coordinates: fallbackCoordinates,
            costField,
            engine: normalizeEngineId(fallbackResult.engine, 'bidirectional-astar'),
            startSnapDistanceM,
            endSnapDistanceM,
          };
        }
      }
    }

    if ((startSnapApplied || endSnapApplied) && (result.reason === 'no_path' || result.reason === 'incomplete_path')) {
      const basePrepared = buildCH(baseGraph, costField, normalizedPenalties);
      const baseResult = await queryRoute(baseStartId, baseEndId, basePrepared, { graphCategory, costField });
      if (baseResult.found) {
        const baseCoordinates = baseResult.path.map((id) => baseGraph.nodes.get(id).coords);
        return {
          ...baseResult,
          coordinates: baseCoordinates,
          costField,
          engine: normalizeEngineId(baseResult.engine, 'bidirectional-astar'),
          startSnapDistanceM: originalStartSnapDistanceM,
          endSnapDistanceM: originalEndSnapDistanceM,
        };
      }
    }

    return { ...result, coordinates: [], costField, reason: 'no_path' };
  }

  // Never silently drop missing nodes. If an engine returns an incomplete path,
  // fail this attempt so the caller retries with a wider corridor/another engine.
  const pathLen = result.path.length;
  const coordinates = new Array(pathLen);
  for (let i = 0; i < pathLen; i++) {
    const id = result.path[i];
    const node = workingGraph.nodes.get(id);
    if (!node?.coords) {
      logger.warn(() => `incomplete path: missing node ${id}`);
      return {
        path: [],
        coordinates: [],
        cost: Infinity,
        costField,
        found: false,
        reason: 'incomplete_path',
        startSnapDistanceM,
        endSnapDistanceM,
      };
    }
    coordinates[i] = node.coords;
  }

  if (coordinates.length !== result.path.length) {
    logger.warn('incomplete path: path/coordinates length mismatch');
    return {
      path: [],
      coordinates: [],
      cost: Infinity,
      costField,
      found: false,
      reason: 'incomplete_path',
      startSnapDistanceM,
      endSnapDistanceM,
    };
  }

  const engine = normalizeEngineId(result.engine, 'bidirectional-astar');
  return { ...result, coordinates, costField, engine, startSnapDistanceM, endSnapDistanceM };
}

export function prepareGraph(graph, costField = 'distance', penalties = {}, sourceId = -1, targetId = -1, opts = {}) {
  const normalizedPenalties = normalizePenalties(penalties);
  const penaltyKey = getPenaltyKey(costField, normalizedPenalties);
  const prepared = graph._prepared?.[costField]?.[penaltyKey];
  if (prepared) {
    if (!prepared.metrics) {
      prepared.metrics = getAllGraphMetrics(prepared, graph, sourceId, targetId, opts);
    }
    return prepared;
  }

  const p = buildCH(graph, costField, normalizedPenalties);
  p.metrics = getAllGraphMetrics(p, graph, sourceId, targetId, opts);
  (graph._prepared ??= {});
  (graph._prepared[costField] ??= {});
  graph._prepared[costField][penaltyKey] = p;
  return p;
}
