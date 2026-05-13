/**
 * @module src/engines/router
 * @description High-level routing orchestration, engine selection, and
 * route validation for CPU-based pathfinding algorithms.
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
import { PowerLogger } from 'performance-helpers/powerLogger';
import { PowerCache } from 'performance-helpers/powerCache';
import { haversineDistance as haversine } from '../utils/misc.js';
import {
  DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M,
  chooseEndpointCandidate,
  createAugmentedGraph,
  findEndpointCandidate,
  isValidCoords,
  nearestNode,
} from '../graphs/snapper.js';
import {
  getParallelPolicyForEngine,
  hasParallelRoutingRuntime,
  selectBestEngine,
} from '../tuning/tuning.js';
import { bidirectionalAStar } from './BidirectionalAStar/index.js';
import { adaptiveBarrierSSPRouter } from './AdaptiveBarrierSSSP/index.js';
import { deltaSteppingRouter } from './DeltaStepping/index.js';
import { ultraDijkstraRouter } from './UltraDijkstra/index.js';
import { WAY_PRIORITIES } from '../utils/ways_defaults.js';
import { normalizePenalties } from '../utils/routeValidation.js';
import EngineMainWorker from './engineMainWorker?worker&inline';
import { getAllGraphMetrics } from '../graphs/graphMetrics.js'; 

/**
 * @typedef {[number, number]} LatLng
 * @typedef {'distance'|'travelTime'|'optimal'} CostField
 * @typedef {'cpu'|'gpu'|'auto'|'bidirectional-astar'|'adaptive-barrier'|'delta-stepping'|'ultra-dijkstra'} EngineId
 *
 * @typedef {Object} RouteQueryOptions
 * @property {'cpu'|'gpu'|null} [forceEngine]
 * @property {EngineId} [engineId]
 * @property {string} [graphCategory]
 * @property {CostField} [costField]
 * @property {boolean} [useCache]
 * @property {boolean} [allowFallback]
 * @property {boolean} [forceSerialRouting]
 *
 * @typedef {Object} RouteResult
 * @property {boolean} found
 * @property {number[]} path
 * @property {Array<LatLng>} coordinates
 * @property {number} cost
 * @property {CostField} costField
 * @property {string} [engine]
 * @property {'tile_cors'|'poor_snap'|'no_node'|'no_path'|'incomplete_path'|'missing_result'|'endpoint_mismatch'|'invalid_path'|'cost_mismatch'|'invalid_route'|'no_route'} [reason]
 * @property {Object} [fallback]
 * @property {number} [startSnapDistanceM]
 * @property {number} [endSnapDistanceM]
 */
export { selectBestEngine, nearestNode };

const logger = new PowerLogger(import.meta.env?.DEV ? 3 : 0, { name: 'omt-router' });

const DIST_SCALE = 10;
const PARALLEL_ROUTING_RUNTIME_AVAILABLE = hasParallelRoutingRuntime();
// ── Route result cache ──────────────────────────────────────────────────────
// Keyed by `${startId}:${endId}:${costField}`, stored on each `prepared`
// object so the cache is graph-scoped and naturally evicted with the graph.
// 200 entries covers ~30 min of typical navigation use before LRU eviction.
const ROUTE_CACHE_MAX = 200;
const ROUTE_CACHE_TTL = 10 * 60_000; // 10 min
const ROUTE_CACHE_KEY_VERSION = 'v2';
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

export const RouteFailureReason = Object.freeze({
  MISSING_RESULT: 'missing_result',
  ENDPOINT_MISMATCH: 'endpoint_mismatch',
  INVALID_PATH: 'invalid_path',
  COST_MISMATCH: 'cost_mismatch',
  NO_PATH: 'no_path',
  NO_NODE: 'no_node',
  POOR_SNAP: 'poor_snap',
  INCOMPLETE_PATH: 'incomplete_path',
  TILE_CORS: 'tile_cors',
  NO_ROUTE: 'no_route',
  INVALID_ROUTE: 'invalid_route',
});

export const EngineErrorCode = Object.freeze({
  ENGINE_ERROR: 'engine_error',
  ENGINE_WORKER_FAILED: 'engine_worker_failed',
  ENGINE_WORKER_CRASHED: 'engine_worker_crashed',
  ENGINE_WORKER_UNAVAILABLE: 'engine_worker_unavailable',
  ENGINE_CANCELLED: 'engine_cancelled',
  ENGINE_SHUTDOWN: 'engine_shutdown',
  ENGINE_WORKER_BUSY: 'engine_worker_busy',
});

function normalizeEngineId(engineId, fallback = 'bidirectional-astar') {
  if (typeof engineId !== 'string' || !engineId) return fallback;
  return ENGINE_ID_ALIASES[engineId] ?? engineId;
}

const OPTIMAL_PRIORITY_ALPHA = 0.7;

function isTravelTimeCostField(costField) {
  return costField === 'travelTime' || costField === 'optimal';
}

function getEdgePriority(edge, mode) {
  const roadClass = edge.properties?.class ?? '';
  const priorities = WAY_PRIORITIES[mode];
  if (!priorities) return 1.0;
  return Number(priorities[roadClass] ?? 1.0);
}

function getOptimalTravelTimeCost(edge, mode) {
  const priority = getEdgePriority(edge, mode);
  return edge.travelTime * (1 + OPTIMAL_PRIORITY_ALPHA * (priority - 1));
}

function getPreparedGraph(graph, costField, normalizedPenalties, sourceId, targetId, opts = {}) {
  const penaltyKey = getPenaltyKey(costField, normalizedPenalties);
  let prepared = graph._prepared?.[costField]?.[penaltyKey];
  if (!prepared) {
    prepared = buildCH(graph, costField, normalizedPenalties);
    (graph._prepared ??= {})[costField] ??= {};
    graph._prepared[costField][penaltyKey] = prepared;
  }
  prepared.metrics = getAllGraphMetrics(prepared, graph, sourceId, targetId, opts);
  return prepared;
}

let _engineWorker = null;
let _engineWorkerRequestId = 0;
const _engineWorkerJobs = new Map();
let _engineWorkerPreparedIdInWorker = null;
let _engineWorkerPreparedIdCounter = 0;
let _engineWorkerStatus = {
  state: ENGINE_WORKER_STATES.IDLE,
  running: false,
  engineId: null,
  requestId: null,
  requestCount: 0,
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

function rejectAllEngineJobs(error) {
  for (const job of _engineWorkerJobs.values()) {
    job.reject(error);
  }
  _engineWorkerJobs.clear();
}

function terminateEngineWorker() {
  if (!_engineWorker) return;
  try {
    _engineWorker.terminate();
  } catch {
    // Best-effort cleanup.
  }
  _engineWorker = null;
  _engineWorkerPreparedIdInWorker = null;
}

function makeEngineError(message, code = EngineErrorCode.ENGINE_ERROR) {
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
      const job = message.requestId != null ? _engineWorkerJobs.get(message.requestId) : null;
      const activeCount = _engineWorkerJobs.size;

      if (message.state === ENGINE_WORKER_STATES.RUNNING) {
        emitEngineWorkerStatus({
          state: ENGINE_WORKER_STATES.RUNNING,
          running: true,
          engineId: normalizeEngineId(message.engineId, job?.engineId ?? null),
          requestId: job?.requestId ?? null,
          requestCount: activeCount,
          startedAt: job?.startedAt ?? Date.now(),
          lastError: null,
        });
      } else if (message.state === ENGINE_WORKER_STATES.ERROR) {
        emitEngineWorkerStatus({
          state: ENGINE_WORKER_STATES.ERROR,
          running: activeCount > 0,
          engineId: null,
          requestId: null,
          requestCount: activeCount,
          startedAt: null,
          lastError: message.error ?? 'engine worker error',
        });
      } else if (message.state === ENGINE_WORKER_STATES.IDLE) {
        emitEngineWorkerStatus({
          state: activeCount > 0 ? ENGINE_WORKER_STATES.RUNNING : ENGINE_WORKER_STATES.IDLE,
          running: activeCount > 0,
          engineId: activeCount > 0 ? _engineWorkerStatus.engineId : null,
          requestId: activeCount > 0 ? _engineWorkerStatus.requestId : null,
          requestCount: activeCount,
          startedAt: activeCount > 0 ? _engineWorkerStatus.startedAt : null,
          lastError: null,
        });
      }
      return;
    }

    if (message.type !== 'result') return;
    const job = _engineWorkerJobs.get(message.requestId);
    if (!job) return;

    _engineWorkerJobs.delete(message.requestId);
    const { resolve, reject } = job;

    if (message.ok) {
      emitEngineWorkerStatus({
        state: _engineWorkerJobs.size > 0 ? ENGINE_WORKER_STATES.RUNNING : ENGINE_WORKER_STATES.IDLE,
        running: _engineWorkerJobs.size > 0,
        engineId: _engineWorkerJobs.size > 0 ? _engineWorkerStatus.engineId : null,
        requestId: _engineWorkerJobs.size > 0 ? _engineWorkerStatus.requestId : null,
        requestCount: _engineWorkerJobs.size,
        startedAt: _engineWorkerJobs.size > 0 ? _engineWorkerStatus.startedAt : null,
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
    reject(makeEngineError(message.error?.message ?? 'engine worker failed', EngineErrorCode.ENGINE_WORKER_FAILED));
  };

  _engineWorker.onerror = (event) => {
    const message = event?.message ?? 'engine worker crashed';
    const error = makeEngineError(message, EngineErrorCode.ENGINE_WORKER_CRASHED);

    emitEngineWorkerStatus({
      state: ENGINE_WORKER_STATES.ERROR,
      running: false,
      engineId: null,
      requestId: null,
      requestCount: 0,
      startedAt: null,
      lastError: message,
    });

    terminateEngineWorker();
    rejectAllEngineJobs(error);
  };

  return _engineWorker;
}

function getEngineWorkerPreparedId(prepared) {
  if (!prepared._engineWorkerPreparedId) {
    prepared._engineWorkerPreparedId = `prepared-${++_engineWorkerPreparedIdCounter}`;
  }
  return prepared._engineWorkerPreparedId;
}

function ensureWorkerPreparedBackup(prepared) {
  if (!prepared._engineWorkerBackup) {
    prepared._engineWorkerBackup = {
      adjPtr: prepared.adjPtr.slice(),
      adjTo: prepared.adjTo.slice(),
      adjCost: prepared.adjCost.slice(),
      revAdjPtr: prepared.revAdjPtr.slice(),
      revAdjFrom: prepared.revAdjFrom.slice(),
      revAdjCost: prepared.revAdjCost.slice(),
    };
  }
  return prepared._engineWorkerBackup;
}

function restorePreparedFromWorkerBackup(prepared) {
  const backup = prepared._engineWorkerBackup;
  if (!backup) return;

  prepared.adjPtr = backup.adjPtr;
  prepared.adjTo = backup.adjTo;
  prepared.adjCost = backup.adjCost;
  prepared.revAdjPtr = backup.revAdjPtr;
  prepared.revAdjFrom = backup.revAdjFrom;
  prepared.revAdjCost = backup.revAdjCost;
}

function serializePreparedForEngineWorker(prepared) {
  // Cache coordsX/coordsY on prepared to avoid recomputation
  if (!prepared._coordsX || !prepared._coordsY) {
    const coordsX = new Float32Array(prepared.N);
    const coordsY = new Float32Array(prepared.N);
    for (let i = 0; i < prepared.N; i += 1) {
      const coords = prepared.coordsArr[i];
      coordsX[i] = coords?.[0] ?? 0;
      coordsY[i] = coords?.[1] ?? 0;
    }
    prepared._coordsX = coordsX;
    prepared._coordsY = coordsY;
  }

  ensureWorkerPreparedBackup(prepared);

  return {
    preparedId: getEngineWorkerPreparedId(prepared),
    adjPtr: prepared.adjPtr,
    adjTo: prepared.adjTo,
    adjCost: prepared.adjCost,
    revAdjPtr: prepared.revAdjPtr,
    revAdjFrom: prepared.revAdjFrom,
    revAdjCost: prepared.revAdjCost,
    N: prepared.N,
    E: prepared.E,
    coordsX: prepared._coordsX,
    coordsY: prepared._coordsY,
    costField: prepared.costField,
  };
}

function getPreparedWorkerTransferables(serializedPrepared) {
  return [
    serializedPrepared.adjPtr.buffer,
    serializedPrepared.adjTo.buffer,
    serializedPrepared.adjCost.buffer,
    serializedPrepared.revAdjPtr.buffer,
    serializedPrepared.revAdjFrom.buffer,
    serializedPrepared.revAdjCost.buffer,
    serializedPrepared.coordsX.buffer,
    serializedPrepared.coordsY.buffer,
  ];
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
  if (!worker) throw makeEngineError('engine worker is unavailable', EngineErrorCode.ENGINE_WORKER_UNAVAILABLE);

  const requestId = ++_engineWorkerRequestId;
  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    _engineWorkerJobs.set(requestId, {
      requestId,
      resolve,
      reject,
      engineId: selectedEngine,
      startedAt,
    });

    emitEngineWorkerStatus({
      state: ENGINE_WORKER_STATES.RUNNING,
      running: true,
      engineId: selectedEngine,
      requestId,
      requestCount: _engineWorkerJobs.size,
      startedAt,
      lastError: null,
    });

    const preparedId = getEngineWorkerPreparedId(prepared);
    if (_engineWorkerPreparedIdInWorker !== preparedId) {
      const serializedPrepared = serializePreparedForEngineWorker(prepared);
      try {
        worker.postMessage(
          { type: 'prepare', prepared: serializedPrepared },
          getPreparedWorkerTransferables(serializedPrepared),
        );
      } finally {
        restorePreparedFromWorkerBackup(prepared);
      }
      _engineWorkerPreparedIdInWorker = preparedId;
    }

    worker.postMessage({
      type: 'run',
      requestId,
      engineId: selectedEngine,
      startId,
      endId,
      forceSerialRouting,
      parallelPolicy,
      preparedId,
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
  if (_engineWorkerJobs.size === 0) return false;

  emitEngineWorkerStatus({
    state: ENGINE_WORKER_STATES.CANCELLING,
    running: true,
    lastError: reason,
    requestCount: _engineWorkerJobs.size,
  });

  terminateEngineWorker();
  rejectAllEngineJobs(makeEngineError(`routing cancelled: ${reason}`, EngineErrorCode.ENGINE_CANCELLED));

  emitEngineWorkerStatus({
    state: ENGINE_WORKER_STATES.IDLE,
    running: false,
    engineId: null,
    requestId: null,
    requestCount: 0,
    startedAt: null,
    lastError: reason,
  });

  return true;
}

export function shutdownEngineWorker(reason = 'shutdown') {
  if (_engineWorkerJobs.size > 0) {
    emitEngineWorkerStatus({
      state: ENGINE_WORKER_STATES.CANCELLING,
      running: true,
      lastError: reason,
      requestCount: _engineWorkerJobs.size,
    });

    rejectAllEngineJobs(makeEngineError(`engine shutdown: ${reason}`, EngineErrorCode.ENGINE_SHUTDOWN));
  }

  terminateEngineWorker();
  emitEngineWorkerStatus({
    state: ENGINE_WORKER_STATES.IDLE,
    running: false,
    engineId: null,
    requestId: null,
    requestCount: 0,
    startedAt: null,
    lastError: null,
  });
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



function getPenaltyKey(costField, penalties = {}) {
  if (!isTravelTimeCostField(costField)) return 'none';
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
  const { adjPtr, adjTo, adjCost, adjCostMap } = prepared;
  let totalCostInt = 0;
  const pathLen = path.length;

  for (let i = 1; i < pathLen; i++) {
    const from = path[i - 1];
    const to = path[i];
    let edgeCostInt = -1;

    if (adjCostMap) {
      const lookup = adjCostMap[from];
      if (Array.isArray(lookup)) {
        if (lookup[0] === to) {
          edgeCostInt = lookup[1];
        }
      } else if (lookup instanceof Map) {
        const cost = lookup.get(to);
        if (cost !== undefined) {
          edgeCostInt = cost;
        }
      }
    }

    if (edgeCostInt < 0) {
      const start = adjPtr[from];
      const end = adjPtr[from + 1];
      for (let k = start; k < end; k++) {
        if (adjTo[k] === to) {
          edgeCostInt = adjCost[k];
          break;
        }
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
      reason: result ? null : RouteFailureReason.MISSING_RESULT,
    };
  }

  const path = Array.isArray(result.path) ? result.path : [];
  if (expectedEndpoints && path.length > 0) {
    const { startId, endId } = expectedEndpoints;
    if (path[0] !== startId || path[path.length - 1] !== endId) {
      return { valid: false, actualCost: null, reason: RouteFailureReason.ENDPOINT_MISMATCH };
    }
  }

  const actualCost = calculatePathCost(path, prepared);
  if (!Number.isFinite(actualCost)) {
    return { valid: false, actualCost: null, reason: RouteFailureReason.INVALID_PATH };
  }

  if (hasMeaningfulCostMismatch(actualCost, result.cost)) {
    return { valid: false, actualCost, reason: RouteFailureReason.COST_MISMATCH };
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
    isTravelTimeCostField(costField) && normalizedPenalties.intersectionPenaltySec > 0;

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
  // Use Map<src, Set<tgt>> for deduplication
  const seen = new Map();

  const addEdge = (src, tgt, floatCost) => {
    const intersectionPenalty =
      useIntersectionPenalty && isIntersection && isIntersection[tgt]
        ? normalizedPenalties.intersectionPenaltySec
        : 0;
    let tgtSet = seen.get(src);
    if (!tgtSet) {
      tgtSet = new Set();
      seen.set(src, tgtSet);
    }
    if (tgtSet.has(tgt)) return;
    tgtSet.add(tgt);
    const costInt = Math.round((floatCost + intersectionPenalty) * DIST_SCALE);
    edgeSrc[eCount] = src;
    edgeTgt[eCount] = tgt;
    edgeCostInt[eCount] = costInt;
    eCount++;
    fwdRaw[fwdLen++] = src; fwdRaw[fwdLen++] = tgt; fwdRaw[fwdLen++] = costInt;
    revRaw[revLen++] = tgt; revRaw[revLen++] = src; revRaw[revLen++] = costInt;
  };

  for (const edge of edges) {
    const useTravelTime = isTravelTimeCostField(costField);
    const fwdFloat = edge.cost !== -1
      ? useTravelTime
        ? costField === 'optimal'
          ? getOptimalTravelTimeCost(edge, graph.mode)
          : edge.travelTime
        : edge.length
      : -1;
    const bwdFloat = edge.reverseCost !== -1
      ? useTravelTime
        ? costField === 'optimal'
          ? getOptimalTravelTimeCost(edge, graph.mode)
          : edge.travelTime
        : edge.length
      : -1;
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

  // Fast lookup for route validation: avoids scanning outgoing edge lists repeatedly.
  const adjCostMap = new Array(N);
  for (let u = 0; u < N; u++) {
    const start = adjPtr[u];
    const end = adjPtr[u + 1];
    const degree = end - start;
    if (degree === 0) continue;

    if (degree === 1) {
      adjCostMap[u] = [adjTo[start], adjCost[start]];
      continue;
    }

    const lookup = new Map();
    for (let k = start; k < end; k++) {
      lookup.set(adjTo[k], adjCost[k]);
    }
    adjCostMap[u] = lookup;
  }

  // Prepare CH edge lists. For pedestrian mode collapse opposite-directed
  // edges into a single undirected pair using the minimum cost between them.
  let chEdgeSrc = edgeSrcView;
  let chEdgeTgt = edgeTgtView;
  let chEdgeCostInt = edgeCostIntView;
  if (graph.mode === 'pedestrian') {
    const pairMap = new Map();
    for (let i = 0; i < edgeSrcView.length; i++) {
      const u = edgeSrcView[i];
      const v = edgeTgtView[i];
      const a = u < v ? u : v;
      const b = u < v ? v : u;
      const key = a + ':' + b;
      const cost = edgeCostIntView[i];
      const prev = pairMap.get(key);
      if (prev === undefined || cost < prev) pairMap.set(key, cost);
    }
    const pairs = Array.from(pairMap.entries());
    const M = pairs.length;
    const srcArr = new Int32Array(M);
    const tgtArr = new Int32Array(M);
    const costArr = new Int32Array(M);
    let idx = 0;
    for (const [key, cost] of pairs) {
      const [a, b] = key.split(':').map(Number);
      srcArr[idx] = a;
      tgtArr[idx] = b;
      costArr[idx] = cost;
      idx++;
    }
    chEdgeSrc = srcArr;
    chEdgeTgt = tgtArr;
    chEdgeCostInt = costArr;
  }

  return {
    edgeSrc: chEdgeSrc, edgeTgt: chEdgeTgt, edgeCostInt: chEdgeCostInt,
    adjPtr, adjTo, adjCost,
    adjCostMap,
    revAdjPtr, revAdjFrom, revAdjCost,
    N, E, nodes, coordsArr, costField,
    penalties: normalizedPenalties,
    penaltyKey: getPenaltyKey(costField, normalizedPenalties),
    distScale: DIST_SCALE,
    coordsAreGeographic: Boolean(graph.coordsAreGeographic === true),
  };
}

/**
 * CPU bidirectional A* route query with intelligent engine selection.
 * @param {number} startId - Graph node ID for the route origin.
 * @param {number} endId - Graph node ID for the route destination.
 * @param {object} prepared - Prepared graph produced by buildCH().
 * @param {RouteQueryOptions} [opts]
 * @returns {Promise<RouteResult>}
 * @throws {Error} When route request arguments are invalid.
 */
export async function queryRoute(startId, endId, prepared, {
  forceEngine = null,
  engineId = 'auto',
  graphCategory: _graphCategory = '',
  costField: _costField = prepared.costField ?? 'distance',
  useCache = true,
  allowFallback = true,
  forceSerialRouting = false,
} = {}) {
  if (!Number.isInteger(startId) || startId < 0) {
    throw new Error('Invalid startId: expected a non-negative integer.');
  }
  if (!Number.isInteger(endId) || endId < 0) {
    throw new Error('Invalid endId: expected a non-negative integer.');
  }
  if (!prepared || typeof prepared !== 'object' || !Array.isArray(prepared.coordsArr) || !ArrayBuffer.isView(prepared.adjPtr)) {
    throw new Error('Invalid prepared graph object: expected result of buildCH().');
  }

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
        const { _routeValidated: _ignored, ...cachedResult } = cached;
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
        const { _routeValidated: _ignored, ...cachedResult } = cached;
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
      if (error?.code === EngineErrorCode.ENGINE_CANCELLED || error?.code === EngineErrorCode.ENGINE_WORKER_BUSY) {
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
      reason: RouteFailureReason.INVALID_ROUTE,
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
      reason: RouteFailureReason.NO_PATH,
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
    result = { ...result, reason: result?.reason ?? RouteFailureReason.NO_PATH };
  }

  if (useCache) {
    prepared._routeCache.set(cacheKey, { ...result, _routeValidated: true });
  }
  return result;
}

export function prepareRoutableGraph(
  graph,
  startCoords,
  endCoords,
  {
    snapDistancesM,
    maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M,
  } = {},
) {
  const distances =
    Array.isArray(snapDistancesM) && snapDistancesM.length > 0
      ? snapDistancesM
      : [250, 500, 800];

  let workingGraph = graph;
  let startId = -1;
  let endId = -1;
  let usedSnapDistanceM = distances[distances.length - 1];

  if (!isValidCoords(startCoords) || !isValidCoords(endCoords)) {
    return {
      graph: workingGraph,
      startId,
      endId,
      startSnapDistanceM: Infinity,
      endSnapDistanceM: Infinity,
      usedSnapDistanceM,
    };
  }

  let startCandidate = { type: 'none' };
  let endCandidate = { type: 'none' };

  for (const maxDistM of distances) {
    startCandidate = chooseEndpointCandidate(startCoords, workingGraph, maxDistM, maxAcceptableSnapDistanceM);
    endCandidate = chooseEndpointCandidate(endCoords, workingGraph, maxDistM, maxAcceptableSnapDistanceM);
    usedSnapDistanceM = maxDistM;
    if (startCandidate.type !== 'none' && endCandidate.type !== 'none') break;
  }

  let startSnapDistanceM = startCandidate.snapDistanceM ?? Infinity;
  let endSnapDistanceM = endCandidate.snapDistanceM ?? Infinity;
  let startSnapApplied = false;
  let _endSnapApplied = false;

  if (startCandidate.type === 'none' || endCandidate.type === 'none') {
    return {
      graph: workingGraph,
      startId: -1,
      endId: -1,
      startSnapDistanceM,
      endSnapDistanceM,
      usedSnapDistanceM,
    };
  }

  if (startCandidate.type === 'segment' && startCandidate.snapDistanceM <= maxAcceptableSnapDistanceM) {
    const snapResult = createAugmentedGraph(workingGraph, startCandidate.segmentSnap);
    workingGraph = snapResult;
    startId = workingGraph._lastAddedNodeId ?? workingGraph.nodes.size - 1;
    startSnapDistanceM = startCandidate.snapDistanceM;
    startSnapApplied = true;
  } else if (startCandidate.type === 'node') {
    startId = startCandidate.nodeId;
  }

  if (startSnapApplied) {
    endCandidate = findEndpointCandidate(endCoords, workingGraph, distances, maxAcceptableSnapDistanceM);
    endSnapDistanceM = endCandidate.snapDistanceM;
  }

  if (endCandidate.type === 'segment' && endCandidate.snapDistanceM <= maxAcceptableSnapDistanceM) {
    const snapResult = createAugmentedGraph(workingGraph, endCandidate.segmentSnap);
    workingGraph = snapResult;
    endId = workingGraph._lastAddedNodeId ?? workingGraph.nodes.size - 1;
    endSnapDistanceM = endCandidate.snapDistanceM;
    _endSnapApplied = true;
  } else if (endCandidate.type === 'node') {
    endId = endCandidate.nodeId;
  }

  if (startId === -1 || endId === -1) {
    return {
      graph: workingGraph,
      startId,
      endId,
      startSnapDistanceM,
      endSnapDistanceM,
      usedSnapDistanceM,
    };
  }

  return {
    graph: workingGraph,
    startId,
    endId,
    startSnapDistanceM,
    endSnapDistanceM,
    usedSnapDistanceM,
  };
}

/**
 * Compute a route between two coordinate pairs over a graph.
 * @param {LatLng} startCoords
 * @param {LatLng} endCoords
 * @param {object} graph - Graph object containing nodes and edges.
 * @param {Object} [options]
 * @param {CostField} [options.costField='distance']
 * @param {Object} [options.penalties]
 * @param {number[]} [options.snapDistancesM]
 * @param {string} [options.graphCategory]
 * @param {number} [options.maxAcceptableSnapDistanceM]
 * @param {string} [options.engineId='auto'] - Engine hint or `'auto'` to let the selector choose the engine.
 * @returns {Promise<RouteResult>}
 * @throws {Error} When input coordinates or the graph are invalid.
 */
export async function computeRoute(startCoords, endCoords, graph, options = {}) {
  if (!graph || typeof graph !== 'object' || !(graph.nodes instanceof Map) || !Array.isArray(graph.edges)) {
    throw new Error('Invalid graph: expected object with nodes Map and edges array.');
  }

  const {
    costField = 'distance',
    penalties = {},
    snapDistancesM,
    graphCategory = '',
    maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M,
    engineId = 'auto',
  } = options;
  const normalizedPenalties = normalizePenalties(penalties);
  if (isTravelTimeCostField(costField) && normalizedPenalties.turnPenaltySec > 0) {
    logger.warn('turn penalties are currently ignored; using standard engine routing');
  }

  logger.log(() => `computeRoute: graph has ${graph.nodes.size} nodes, ${graph.edges.length} edges`);

  const distances =
    Array.isArray(snapDistancesM) && snapDistancesM.length > 0
      ? snapDistancesM
      : [250, 500, 800];

  let startId = -1;
  let endId = -1;
  let usedSnapDistance = distances[distances.length - 1];

  if (!isValidCoords(startCoords) || !isValidCoords(endCoords)) {
    return { path: [], coordinates: [], cost: Infinity, costField, found: false, reason: 'no_node' };
  }

  let workingGraph = graph;
  for (const maxDistM of distances) {
    startId = nearestNode(startCoords, workingGraph, maxDistM);
    endId = nearestNode(endCoords, workingGraph, maxDistM);
    usedSnapDistance = maxDistM;
    if (startId !== -1 && endId !== -1) break;
  }
  logger.log(() => `nearestNode: start=${startId}, end=${endId}, snap=${usedSnapDistance} m`);

  if (!isValidCoords(startCoords) || !isValidCoords(endCoords)) {
    return { path: [], coordinates: [], cost: Infinity, costField, found: false, reason: RouteFailureReason.NO_NODE };
  }

  if (startId === -1 || endId === -1) {
    logger.warn(() => `No node found within ${usedSnapDistance} m of start or end coordinates`);
  }

  let startSnapDistanceM = startId === -1
    ? Infinity
    : haversine(startCoords, workingGraph.nodes.get(startId).coords);
  let endSnapDistanceM = endId === -1
    ? Infinity
    : haversine(endCoords, workingGraph.nodes.get(endId).coords);

  let startCandidate = findEndpointCandidate(startCoords, workingGraph, distances, maxAcceptableSnapDistanceM);
  let endCandidate = findEndpointCandidate(endCoords, workingGraph, distances, maxAcceptableSnapDistanceM);
  let startSegmentSnap = startCandidate.segmentSnap;
  let endSegmentSnap = endCandidate.segmentSnap;
  let startSnapApplied = false;
  let endSnapApplied = false;
  const baseGraph = workingGraph;
  const baseStartId = startId;
  const baseEndId = endId;
  const originalStartSnapDistanceM = startSnapDistanceM;
  const originalEndSnapDistanceM = endSnapDistanceM;

  if (startCandidate.type === 'segment') {
    const snapResult = createAugmentedGraph(workingGraph, startCandidate.segmentSnap);
    workingGraph = snapResult;
    startId = workingGraph._lastAddedNodeId ?? workingGraph.nodes.size - 1;
    startSnapDistanceM = startCandidate.snapDistanceM;
    startSnapApplied = true;

    endCandidate = findEndpointCandidate(endCoords, workingGraph, distances, maxAcceptableSnapDistanceM);
    endSegmentSnap = endCandidate.segmentSnap;
    endSnapDistanceM = endCandidate.snapDistanceM;
  } else if (startCandidate.type === 'node') {
    startId = startCandidate.nodeId;
    startSnapDistanceM = startCandidate.snapDistanceM;
  }

  if (endCandidate.type === 'segment') {
    const snapResult = createAugmentedGraph(workingGraph, endCandidate.segmentSnap);
    workingGraph = snapResult;
    endId = workingGraph._lastAddedNodeId ?? workingGraph.nodes.size - 1;
    endSnapDistanceM = endCandidate.snapDistanceM;
    endSnapApplied = true;
  } else if (endCandidate.type === 'node') {
    endId = endCandidate.nodeId;
    endSnapDistanceM = endCandidate.snapDistanceM;
  }

  if (startId === -1 || endId === -1) {
    return { path: [], coordinates: [], cost: Infinity, costField, found: false, reason: RouteFailureReason.NO_NODE };
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
      reason: RouteFailureReason.POOR_SNAP,
      startSnapDistanceM,
      endSnapDistanceM,
    };
  }

  if (startId === endId) {
    const coords = workingGraph.nodes.get(startId).coords;
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

  const prepared = getPreparedGraph(workingGraph, costField, normalizedPenalties, startId, endId);

  logger.log('dispatching route query...');
  const result = await queryRoute(startId, endId, prepared, { engineId, graphCategory, costField });

  if (!result.found) {
    const canFallbackWithStartSnap = startSegmentSnap && !startSnapApplied && startSegmentSnap.distanceM <= maxAcceptableSnapDistanceM;
    const canFallbackWithEndSnap = endSegmentSnap && !endSnapApplied && endSegmentSnap.distanceM <= maxAcceptableSnapDistanceM;

    if ((result.reason === RouteFailureReason.NO_PATH || result.reason === RouteFailureReason.INCOMPLETE_PATH) && (canFallbackWithStartSnap || canFallbackWithEndSnap)) {
      let fallbackGraph = workingGraph;
      let fallbackStartId = startId;
      let fallbackEndId = endId;

      if (canFallbackWithStartSnap) {
        const snapResult = createAugmentedGraph(fallbackGraph, startSegmentSnap);
        fallbackGraph = snapResult;
        fallbackStartId = fallbackGraph._lastAddedNodeId ?? fallbackGraph.nodes.size - 1;
      }

      if (canFallbackWithEndSnap) {
        const snapResult = createAugmentedGraph(fallbackGraph, endSegmentSnap);
        fallbackGraph = snapResult;
        fallbackEndId = fallbackGraph._lastAddedNodeId ?? fallbackGraph.nodes.size - 1;
      }

      if (fallbackGraph !== workingGraph) {
        const fallbackPrepared = getPreparedGraph(fallbackGraph, costField, normalizedPenalties, fallbackStartId, fallbackEndId);
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

    if ((startSnapApplied || endSnapApplied) && (result.reason === RouteFailureReason.NO_PATH || result.reason === RouteFailureReason.INCOMPLETE_PATH)) {
      const basePrepared = getPreparedGraph(baseGraph, costField, normalizedPenalties, baseStartId, baseEndId);
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

    return { ...result, coordinates: [], costField, reason: RouteFailureReason.NO_PATH };
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
        reason: RouteFailureReason.INCOMPLETE_PATH,
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
      reason: RouteFailureReason.INCOMPLETE_PATH,
      startSnapDistanceM,
      endSnapDistanceM,
    };
  }

  const engine = normalizeEngineId(result.engine, 'bidirectional-astar');
  return { ...result, coordinates, costField, engine, startSnapDistanceM, endSnapDistanceM };
}

export function prepareGraph(graph, costField = 'distance', penalties = {}, sourceId = -1, targetId = -1, opts = {}) {
  const normalizedPenalties = normalizePenalties(penalties);
  return getPreparedGraph(graph, costField, normalizedPenalties, sourceId, targetId, opts);
}
