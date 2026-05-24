// @ts-check
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
import { PowerPool } from 'performance-helpers/powerPool';
import { haversineDistance as haversine } from '../utils/misc.js';
import {
  DEFAULT_ENGINE_ID,
  ENGINE_ID_ALIASES,
  normalizeEngineId,
} from './constants.js';
import { isRoutableGraph } from '../graphs/graphValidation.js';
import {
  DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M,
  createAugmentedGraph,
  resolveRouteEndpoints,
} from '../graphs/snapper.js';

import {
  getParallelPolicyForEngine,
  hasParallelRoutingRuntime,
  selectBestEngine,
} from '../tuning/tuning.js';
import {
  bidirectionalAStar,
  releasePreparedWorkspace as releaseBidirectionalAStarWorkspace,
} from './BidirectionalAStar/index.js';
import {
  adaptiveBarrierSSPRouter,
  releasePreparedWorkspace as releaseAdaptiveBarrierWorkspace,
} from './AdaptiveBarrierSSSP/index.js';
import {
  deltaSteppingRouter,
  releasePreparedWorkspace as releaseDeltaSteppingWorkspace,
} from './DeltaStepping/index.js';
import {
  ultraDijkstraRouter,
  releasePreparedWorkspace as releaseUltraDijkstraWorkspace,
} from './UltraDijkstra/index.js';
import { WAY_PRIORITIES } from '../utils/ways_defaults.js';
import {
  normalizePenalties,
  validateCostField,
  validateEngineId,
} from '../utils/routeValidation.js';
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
 * @property {boolean} [useWorkerPool]
 * @property {boolean} [useEngineWorker]
 * @property {number} [engineWorkerPoolSize]
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
export { selectBestEngine } from '../tuning/tuning.js';
export { nearestNode } from '../graphs/snapper.js';

const logger = new PowerLogger(0, { name: 'omt-router' });

const DIST_SCALE = 10;
const PARALLEL_ROUTING_RUNTIME_AVAILABLE = hasParallelRoutingRuntime();
// ── Route result cache ──────────────────────────────────────────────────────
// Keyed by `${startId}:${endId}:${costField}`, stored on each `prepared`
// object so the cache is graph-scoped and naturally evicted with the graph.
// 100 entries reduces retained route result state while still supporting
// common repeated origin/destination lookups.
const ROUTE_CACHE_MAX = 100;
const ROUTE_CACHE_TTL = 5 * 60_000; // 5 min
const MAX_PREPARED_COSTFIELDS_PER_GRAPH = 2;
const MAX_PREPARED_VARIANTS_PER_COSTFIELD = 2;
const ROUTE_CACHE_KEY_VERSION = 'v2';

function disposeRouteCache(routeCache) {
  if (!routeCache) return;
  try {
    routeCache.stopCleanup?.();
    routeCache.clear?.();
  } catch {
    // Ignore cleanup failures.
  }
}

/**
 * Build adjCostMap on demand (validation / tests). O(E) when first called.
 * @param {object} prepared
 * @returns {Array<Array<number>|Map<number, number>|undefined>}
 */
export function ensureAdjCostMap(prepared) {
  if (!prepared || prepared.adjCostMap) return prepared?.adjCostMap;
  const { adjPtr, adjTo, adjCost, N } = prepared;
  if (!adjPtr || !adjTo || !adjCost || !N) return undefined;

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

  prepared.adjCostMap = adjCostMap;
  return adjCostMap;
}

/**
 * Release heavy structures held on a prepared graph (caches, backups, metrics).
 * @param {object|null|undefined} prepared
 */
export function releasePrepared(prepared) {
  if (!prepared || typeof prepared !== 'object') return;

  disposeRouteCache(prepared._routeCache);
  prepared._routeCache = null;

  releaseBidirectionalAStarWorkspace(prepared);
  releaseDeltaSteppingWorkspace(prepared);
  releaseAdaptiveBarrierWorkspace(prepared);
  releaseUltraDijkstraWorkspace(prepared);

  prepared._engineWorkerBackup = null;
  prepared._engineWorkerPreparedId = null;
  prepared.metrics = null;
  prepared.coordsFloat32 = null;
  prepared._densitySampler = null;
  prepared.adjCostMap = null;
  prepared._isoAdjPedestrian = null;
}

/**
 * Release prepared variants and spatial indexes on a raw routing graph.
 * @param {object|null|undefined} graph
 */
export function releaseGraph(graph) {
  if (!graph || typeof graph !== 'object') return;

  const preparedGroup = graph._prepared;
  if (preparedGroup && typeof preparedGroup === 'object') {
    for (const costFieldGroup of Object.values(preparedGroup)) {
      if (!costFieldGroup || typeof costFieldGroup !== 'object') continue;
      for (const prepared of Object.values(costFieldGroup)) {
        releasePrepared(prepared);
      }
    }
    delete graph._prepared;
  }

  delete graph._spatialIndex;
  delete graph._incidentEdgeIndex;
  delete graph._edgeSpatialIndex;
}
const ENGINE_WORKER_STATES = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  CANCELLING: 'cancelling',
  ERROR: 'error',
});
export { ENGINE_ID_ALIASES, normalizeEngineId };

const _hwConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
const ENGINE_WORKER_POOL_MAX_SIZE = Math.max(1, _hwConcurrency - 1);
const ENGINE_WORKER_POOL_DEFAULT_SIZE = Math.min(8, ENGINE_WORKER_POOL_MAX_SIZE);
let _engineWorkerPool = null;
let _engineWorkerPoolSize = 0;
/** @type {Set<string>} Prepared graphs already transferred to the worker pool (size-1 pools only). */
const _poolPreparedIds = new Set();

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
  const preparedGroup = (graph._prepared ??= {});
  const preparedCostFields = Object.keys(preparedGroup);
  if (
    preparedCostFields.length >= MAX_PREPARED_COSTFIELDS_PER_GRAPH &&
    preparedGroup[costField] === undefined
  ) {
    const oldestCostField = preparedCostFields[0];
    const oldestGroup = preparedGroup[oldestCostField];
    if (oldestGroup) {
      Object.values(oldestGroup).forEach((oldPrepared) => {
        if (oldPrepared?._routeCache) {
          disposeRouteCache(oldPrepared._routeCache);
          oldPrepared._routeCache = null;
        }
      });
    }
    delete preparedGroup[oldestCostField];
  }

  const costFieldGroup = (preparedGroup[costField] ??= {});
  let prepared = costFieldGroup[penaltyKey];
  if (!prepared) {
    const penaltyKeys = Object.keys(costFieldGroup);
    if (penaltyKeys.length >= MAX_PREPARED_VARIANTS_PER_COSTFIELD) {
      const oldestPenaltyKey = penaltyKeys[0];
      const oldestPrepared = costFieldGroup[oldestPenaltyKey];
      if (oldestPrepared?._routeCache) {
        disposeRouteCache(oldestPrepared._routeCache);
        oldestPrepared._routeCache = null;
      }
      delete costFieldGroup[oldestPenaltyKey];
    }
    prepared = buildCH(graph, costField, normalizedPenalties);
    costFieldGroup[penaltyKey] = prepared;
  }
  prepared.metrics = getAllGraphMetrics(prepared, graph, sourceId, targetId, {
    ...opts,
    mode: graph.mode ?? opts.mode,
  });
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
    if (job.preparedTransferred && job.prepared?.reclaimFromWorker) {
      try {
        job.prepared.reclaimFromWorker();
      } catch {
        // best effort
      }
    }
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
    const { resolve, reject, prepared, preparedTransferred } = job;
    if (preparedTransferred && prepared?.reclaimFromWorker) {
      try {
        prepared.reclaimFromWorker();
      } catch {
        // best effort
      }
    }

    if (message.ok) {
      emitEngineWorkerStatus({
        state:
          _engineWorkerJobs.size > 0 ? ENGINE_WORKER_STATES.RUNNING : ENGINE_WORKER_STATES.IDLE,
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
    reject(
      makeEngineError(
        message.error?.message ?? 'engine worker failed',
        EngineErrorCode.ENGINE_WORKER_FAILED
      )
    );
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
    ensurePreparedCoordsArrays(prepared);
    prepared._engineWorkerBackup = {
      adjPtr: prepared.adjPtr.slice(),
      adjTo: prepared.adjTo.slice(),
      adjCost: prepared.adjCost.slice(),
      revAdjPtr: prepared.revAdjPtr.slice(),
      revAdjFrom: prepared.revAdjFrom.slice(),
      revAdjCost: prepared.revAdjCost.slice(),
      coordsX: prepared._coordsX.slice(),
      coordsY: prepared._coordsY.slice(),
    };
  }
  return prepared._engineWorkerBackup;
}

function isDetachedArray(view) {
  return ArrayBuffer.isView(view) && view.buffer.byteLength === 0;
}

function ensurePreparedCoordsArrays(prepared) {
  if (
    !prepared._coordsX ||
    !prepared._coordsY ||
    isDetachedArray(prepared._coordsX) ||
    isDetachedArray(prepared._coordsY)
  ) {
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
}

function attachPreparedWorkerTransferMethods(prepared) {
  if (prepared.transferToWorker && prepared.reclaimFromWorker) return prepared;

  prepared.transferToWorker = function ({ preserveMainThread = true } = {}) {
    ensurePreparedCoordsArrays(this);
    if (preserveMainThread) {
      ensureWorkerPreparedBackup(this);
    }

    return {
      preparedId: getEngineWorkerPreparedId(this),
      adjPtr: this.adjPtr,
      adjTo: this.adjTo,
      adjCost: this.adjCost,
      revAdjPtr: this.revAdjPtr,
      revAdjFrom: this.revAdjFrom,
      revAdjCost: this.revAdjCost,
      N: this.N,
      E: this.E,
      coordsX: this._coordsX,
      coordsY: this._coordsY,
      costField: this.costField,
    };
  };

  prepared.reclaimFromWorker = function () {
    if (this._engineWorkerBackup) {
      const backup = this._engineWorkerBackup;
      this.adjPtr = backup.adjPtr;
      this.adjTo = backup.adjTo;
      this.adjCost = backup.adjCost;
      this.revAdjPtr = backup.revAdjPtr;
      this.revAdjFrom = backup.revAdjFrom;
      this.revAdjCost = backup.revAdjCost;
      this._coordsX = backup.coordsX;
      this._coordsY = backup.coordsY;
      this._engineWorkerBackup = null;
    } else if (
      isDetachedArray(this.adjPtr) ||
      isDetachedArray(this.adjTo) ||
      isDetachedArray(this.adjCost) ||
      isDetachedArray(this.revAdjPtr) ||
      isDetachedArray(this.revAdjFrom) ||
      isDetachedArray(this.revAdjCost)
    ) {
      throw new Error(
        'Prepared graph was transferred without a main-thread backup and cannot be reclaimed.'
      );
    }

    ensurePreparedCoordsArrays(this);
  };

  return prepared;
}

function serializePreparedForEngineWorker(prepared) {
  attachPreparedWorkerTransferMethods(prepared);
  ensurePreparedCoordsArrays(prepared);

  return {
    preparedId: getEngineWorkerPreparedId(prepared),
    adjPtr: prepared.adjPtr.slice(),
    adjTo: prepared.adjTo.slice(),
    adjCost: prepared.adjCost.slice(),
    revAdjPtr: prepared.revAdjPtr.slice(),
    revAdjFrom: prepared.revAdjFrom.slice(),
    revAdjCost: prepared.revAdjCost.slice(),
    N: prepared.N,
    E: prepared.E,
    coordsX: prepared._coordsX.slice(),
    coordsY: prepared._coordsY.slice(),
    costField: prepared.costField,
  };
}

function clonePreparedForEngineWorker(prepared) {
  return serializePreparedForEngineWorker(prepared);
}

function transferPreparedForEngineWorker(prepared) {
  attachPreparedWorkerTransferMethods(prepared);
  ensurePreparedCoordsArrays(prepared);
  return prepared.transferToWorker({ preserveMainThread: true });
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

async function runEngineDirect(
  selectedEngine,
  startId,
  endId,
  prepared,
  beelineM,
  { forceSerialRouting = false, parallelPolicy = null } = {}
) {
  if (prepared?.reclaimFromWorker) {
    prepared.reclaimFromWorker();
  }

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
      logger.warn(
        `unknown selectedEngine: ${selectedEngine}, falling back to ${DEFAULT_ENGINE_ID}`
      );
      return bidirectionalAStar(startId, endId, prepared);
  }
}

async function getEngineWorkerPool(maxSize = null) {
  if (typeof Worker === 'undefined') return null;
  const desiredSize =
    Number.isFinite(Number(maxSize)) && Number(maxSize) > 0
      ? Math.min(Math.max(1, Math.floor(Number(maxSize))), ENGINE_WORKER_POOL_MAX_SIZE)
      : ENGINE_WORKER_POOL_DEFAULT_SIZE;

  if (_engineWorkerPool && _engineWorkerPoolSize >= desiredSize) {
    return _engineWorkerPool;
  }

  if (_engineWorkerPool) {
    try {
      _engineWorkerPool.shutdown();
    } catch {
      // best effort
    }
    _engineWorkerPool = null;
  }

  _engineWorkerPoolSize = desiredSize;
  _engineWorkerPool = new PowerPool(EngineMainWorker, {
    size: Math.min(8, desiredSize),
    maxSize: desiredSize,
    lazy: true,
    autoScale: {
      intervalMs: 350,
      targetMs: 55,
      alpha: 0.32,
      cooldownMs: 1200,
      hysteresis: 0.2,
      stepUp: 1,
      stepDown: 1,
      backoffFactor: 1.5,
      backoffMaxMultiplier: 4,
      backoffResetMs: 6000,
    },
    idleTimeout: 30_000,
  });

  return _engineWorkerPool;
}

async function runEngineInWorker(
  selectedEngine,
  startId,
  endId,
  prepared,
  { forceSerialRouting = false, parallelPolicy = null } = {}
) {
  const worker = ensureEngineWorker();
  if (!worker)
    throw makeEngineError(
      'engine worker is unavailable',
      EngineErrorCode.ENGINE_WORKER_UNAVAILABLE
    );

  const requestId = ++_engineWorkerRequestId;
  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    _engineWorkerJobs.set(requestId, {
      requestId,
      resolve,
      reject,
      engineId: selectedEngine,
      startedAt,
      prepared,
      preparedTransferred: false,
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
    let preparedTransferred = false;
    if (_engineWorkerPreparedIdInWorker !== preparedId) {
      const serializedPrepared = transferPreparedForEngineWorker(prepared);
      try {
        worker.postMessage(
          { type: 'prepare', prepared: serializedPrepared },
          getPreparedWorkerTransferables(serializedPrepared)
        );
      } catch (error) {
        if (prepared?.reclaimFromWorker) {
          try {
            prepared.reclaimFromWorker();
          } catch {
            // best effort
          }
        }
        _engineWorkerJobs.delete(requestId);
        emitEngineWorkerStatus({
          state: ENGINE_WORKER_STATES.IDLE,
          running: false,
          engineId: null,
          requestId: null,
          requestCount: 0,
          startedAt: null,
          lastError: error?.message ?? null,
        });
        reject(error);
        return;
      }
      _engineWorkerPreparedIdInWorker = preparedId;
      preparedTransferred = true;
      const job = _engineWorkerJobs.get(requestId);
      if (job) job.preparedTransferred = true;
    }

    try {
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
    } catch (error) {
      if (preparedTransferred && prepared?.reclaimFromWorker) {
        try {
          prepared.reclaimFromWorker();
        } catch {
          // best effort
        }
      }
      _engineWorkerJobs.delete(requestId);
      emitEngineWorkerStatus({
        state: ENGINE_WORKER_STATES.IDLE,
        running: false,
        engineId: null,
        requestId: null,
        requestCount: 0,
        startedAt: null,
        lastError: error?.message ?? null,
      });
      reject(error);
      return;
    }
  });
}

async function runEngineInWorkerPool(
  selectedEngine,
  startId,
  endId,
  prepared,
  { forceSerialRouting = false, parallelPolicy = null, engineWorkerPoolSize = null } = {}
) {
  const pool = await getEngineWorkerPool(engineWorkerPoolSize);
  if (!pool)
    throw makeEngineError(
      'engine worker pool is unavailable',
      EngineErrorCode.ENGINE_WORKER_UNAVAILABLE
    );

  const requestId = `request-${++_engineWorkerRequestId}`;
  const preparedId = getEngineWorkerPreparedId(prepared);
  const poolCanReusePrepared =
    _engineWorkerPoolSize <= 1 && _poolPreparedIds.has(preparedId);

  let response;
  if (poolCanReusePrepared) {
    response = await pool.postMessage(
      {
        type: 'run',
        requestId,
        engineId: selectedEngine,
        startId,
        endId,
        preparedId,
        forceSerialRouting,
        parallelPolicy,
      },
      undefined,
      { awaitResponse: true, zeroCopy: true }
    );
  } else {
    const serializedPrepared = clonePreparedForEngineWorker(prepared);
    const transferables = getPreparedWorkerTransferables(serializedPrepared);
    response = await pool.postMessage(
      {
        type: 'prepareAndRun',
        requestId,
        engineId: selectedEngine,
        startId,
        endId,
        prepared: serializedPrepared,
        forceSerialRouting,
        parallelPolicy,
      },
      transferables,
      { awaitResponse: true, zeroCopy: true }
    );
    if (_engineWorkerPoolSize <= 1) {
      _poolPreparedIds.add(preparedId);
    }
  }

  if (!response || response.ok !== true) {
    throw makeEngineError(
      `engine worker pool failed: ${response?.error?.message ?? 'unknown error'}`,
      EngineErrorCode.ENGINE_WORKER_FAILED
    );
  }

  return response.result;
}

export function getEngineWorkerStatus() {
  return { ..._engineWorkerStatus };
}

export function onEngineWorkerStatusChange(listener) {
  if (typeof listener !== 'function') return () => {};
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
  disposeEngineWorkerPool();
  rejectAllEngineJobs(
    makeEngineError(`routing cancelled: ${reason}`, EngineErrorCode.ENGINE_CANCELLED)
  );

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

function disposeEngineWorkerPool() {
  if (!_engineWorkerPool) return;
  try {
    _engineWorkerPool.shutdown();
  } finally {
    _engineWorkerPool = null;
    _engineWorkerPoolSize = 0;
    _poolPreparedIds.clear();
  }
}

export function shutdownEngineWorker(reason = 'shutdown') {
  if (_engineWorkerJobs.size > 0) {
    emitEngineWorkerStatus({
      state: ENGINE_WORKER_STATES.CANCELLING,
      running: true,
      lastError: reason,
      requestCount: _engineWorkerJobs.size,
    });

    rejectAllEngineJobs(
      makeEngineError(`engine shutdown: ${reason}`, EngineErrorCode.ENGINE_SHUTDOWN)
    );
  }

  terminateEngineWorker();
  disposeEngineWorkerPool();
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

function lookupEdgeCostInt(from, to, prepared) {
  const { adjPtr, adjTo, adjCost } = prepared;
  const start = adjPtr[from];
  const end = adjPtr[from + 1];
  const degree = end - start;
  if (degree === 0) return -1;
  if (degree === 1) {
    return adjTo[start] === to ? adjCost[start] : -1;
  }

  let map = prepared.adjCostMap?.[from];
  if (!map) {
    for (let k = start; k < end; k++) {
      if (adjTo[k] === to) return adjCost[k];
    }
    return -1;
  }

  if (Array.isArray(map)) {
    return map[0] === to ? map[1] : -1;
  }

  const cost = map.get(to);
  return cost === undefined ? -1 : cost;
}

function calculatePathCost(path, prepared) {
  if (!Array.isArray(path) || path.length === 0) return null;
  let totalCostInt = 0;
  const pathLen = path.length;

  for (let i = 1; i < pathLen; i++) {
    const edgeCostInt = lookupEdgeCostInt(path[i - 1], path[i], prepared);
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
  const _maxDE = edges.length * 2; // theoretical max directed edge count
  const edgeSrc = new Int32Array(_maxDE);
  const edgeTgt = new Int32Array(_maxDE);
  const edgeCostInt = new Int32Array(_maxDE);
  let eCount = 0;
  // Use Map<src, Set<tgt>> for deduplication
  const seen = new Map();

  const addEdge = (src, tgt, floatCost) => {
    if (!Number.isInteger(src) || src < 0 || !Number.isInteger(tgt) || tgt < 0) {
      throw new Error(`buildCH.addEdge: invalid node ids src=${src}, tgt=${tgt}`);
    }
    if (!Number.isFinite(floatCost) || floatCost < 0) {
      throw new Error(`buildCH.addEdge: invalid edge cost for ${src}->${tgt}: ${floatCost}`);
    }
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
  };

  for (const edge of edges) {
    const useTravelTime = isTravelTimeCostField(costField);
    const fwdFloat =
      edge.cost !== -1
        ? useTravelTime
          ? costField === 'optimal'
            ? getOptimalTravelTimeCost(edge, graph.mode)
            : edge.travelTime
          : edge.length
        : -1;
    const bwdFloat =
      edge.reverseCost !== -1
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
  const edgeSrcView = edgeSrc.subarray(0, E);
  const edgeTgtView = edgeTgt.subarray(0, E);
  const edgeCostIntView = edgeCostInt.subarray(0, E);

  // Free dedup state now that the preparatory CSR arrays exist.
  seen.clear();
  isIntersection = null;

  // ── Build CSR for forward adjacency (adj) ──────────────────────────────────
  const adjPtr = new Int32Array(N + 1); // adjPtr[u]..adjPtr[u+1]-1 = range in adjTo/adjCost
  const adjTo = new Int32Array(E);
  const adjCost = new Int32Array(E);

  // Pass 1: count out-degrees
  for (let i = 0; i < E; i++) {
    const src = edgeSrcView[i];
    if (src < 0 || src >= N) {
      throw new Error(`buildCH: invalid source node id ${src} in edgeSrcView`);
    }
    adjPtr[src + 1]++;
  }
  // Prefix-sum → offsets
  for (let u = 0; u < N; u++) adjPtr[u + 1] += adjPtr[u];
  // Pass 2: fill (cursor tracks next write position per node)
  const adjCursor = adjPtr.slice(0, N); // copy of prefix sums as write cursors
  for (let i = 0; i < E; i++) {
    const src = edgeSrcView[i];
    const tgt = edgeTgtView[i];
    const cost = edgeCostIntView[i];
    const pos = adjCursor[src]++;
    adjTo[pos] = tgt;
    adjCost[pos] = cost;
  }

  // ── Build CSR for reverse adjacency (revAdj) ───────────────────────────────
  const revAdjPtr = new Int32Array(N + 1);
  const revAdjFrom = new Int32Array(E);
  const revAdjCost = new Int32Array(E);

  for (let i = 0; i < E; i++) {
    const tgt = edgeTgtView[i];
    if (tgt < 0 || tgt >= N) {
      throw new Error(`buildCH: invalid target node id ${tgt} in edgeTgtView`);
    }
    revAdjPtr[tgt + 1]++;
  }
  for (let u = 0; u < N; u++) revAdjPtr[u + 1] += revAdjPtr[u];
  const revCursor = revAdjPtr.slice(0, N);
  for (let i = 0; i < E; i++) {
    const tgt = edgeTgtView[i];
    const src = edgeSrcView[i];
    const cost = edgeCostIntView[i];
    const pos = revCursor[tgt]++;
    revAdjFrom[pos] = src;
    revAdjCost[pos] = cost;
  }

  // Flat coordinate array for fast heuristic lookups in A* (avoids Map.get per node).
  const coordsArr = new Array(N);
  for (let id = 0; id < N; id++) coordsArr[id] = nodes.get(id).coords;

  // Prepare CH edge lists. For pedestrian mode collapse opposite-directed
  // edges into a single undirected pair using the minimum cost between them.
  let chEdgeSrc = edgeSrcView;
  let chEdgeTgt = edgeTgtView;
  let chEdgeCostInt = edgeCostIntView;
  if (graph.mode === 'pedestrian') {
    const pairMap = new Map();
    const pairKeyStride = N + 1;
    for (let i = 0; i < edgeSrcView.length; i++) {
      const u = edgeSrcView[i];
      const v = edgeTgtView[i];
      const a = u < v ? u : v;
      const b = u < v ? v : u;
      const key = a * pairKeyStride + b;
      const cost = edgeCostIntView[i];
      const prev = pairMap.get(key);
      if (prev === undefined || cost < prev) pairMap.set(key, cost);
    }
    const M = pairMap.size;
    const srcArr = new Int32Array(M);
    const tgtArr = new Int32Array(M);
    const costArr = new Int32Array(M);
    let idx = 0;
    for (const [key, cost] of pairMap) {
      const a = Math.floor(key / pairKeyStride);
      const b = key % pairKeyStride;
      srcArr[idx] = a;
      tgtArr[idx] = b;
      costArr[idx] = cost;
      idx++;
    }
    chEdgeSrc = srcArr;
    chEdgeTgt = tgtArr;
    chEdgeCostInt = costArr;
  }

  const prepared = {
    adjPtr,
    adjTo,
    adjCost,
    adjCostMap: null,
    revAdjPtr,
    revAdjFrom,
    revAdjCost,
    N,
    E,
    coordsArr,
    costField,
    penalties: normalizedPenalties,
    penaltyKey: getPenaltyKey(costField, normalizedPenalties),
    distScale: DIST_SCALE,
    coordsAreGeographic: Boolean(graph.coordsAreGeographic === true),
  };

  if (graph.mode === 'pedestrian') {
    prepared.edgeSrc = chEdgeSrc;
    prepared.edgeTgt = chEdgeTgt;
    prepared.edgeCostInt = chEdgeCostInt;
  }

  return prepared;
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
export async function queryRoute(
  startId,
  endId,
  prepared,
  {
    forceEngine = null,
    engineId = 'auto',
    graphCategory: _graphCategory = '',
    costField: _costField = prepared.costField ?? 'distance',
    useCache = true,
    allowFallback = true,
    forceSerialRouting = false,
    useWorkerPool = false,
    useEngineWorker = true,
    engineWorkerPoolSize = null,
    engineWorkerFallbackToMainThread = true,
    _engineWorkerMaxPoolSize = null,
  } = {}
) {
  if (!Number.isInteger(startId) || startId < 0) {
    throw new Error('Invalid startId: expected a non-negative integer.');
  }
  if (!Number.isInteger(endId) || endId < 0) {
    throw new Error('Invalid endId: expected a non-negative integer.');
  }
  if (
    !prepared ||
    typeof prepared !== 'object' ||
    !Array.isArray(prepared.coordsArr) ||
    !ArrayBuffer.isView(prepared.adjPtr)
  ) {
    throw new Error('Invalid prepared graph object: expected result of buildCH().');
  }

  // ── Route cache ────────────────────────────────────────────────────────────
  // Benchmarks can disable cache to measure pure engine runtime.
  if (useCache && !prepared._routeCache) {
    prepared._routeCache = new PowerCache({
      maxEntries: ROUTE_CACHE_MAX,
      defaultTTL: ROUTE_CACHE_TTL,
    });
    prepared._routeCache.startCleanup?.({ interval: ROUTE_CACHE_TTL, maxCleanupPerTick: 64 });
  }

  // Intelligent engine selection
  const startNodeCoords = prepared.coordsArr[startId];
  const endNodeCoords = prepared.coordsArr[endId];
  const beelineM = haversine(startNodeCoords, endNodeCoords);
  const hasParallelRuntime = PARALLEL_ROUTING_RUNTIME_AVAILABLE;

  const selectedEngine = engineId === 'auto' ? selectBestEngine(prepared.metrics) : engineId;
  const normalizedSelectedEngine = normalizeEngineId(selectedEngine, 'bidirectional-astar');
  let resolvedForceSerialRouting = Boolean(forceSerialRouting);
  let parallelPolicy = null;

  if (!resolvedForceSerialRouting) {
    parallelPolicy = getParallelPolicyForEngine(normalizedSelectedEngine, hasParallelRuntime);
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
        `route cache stale/invalid (${cachedValidation.reason ?? 'unknown'}), recomputing (${cacheKey})`
      );
    }
  }

  if (forceEngine === 'gpu') {
    logger.warn('forceEngine="gpu" requested, but GPU routing has been removed; using CPU routing');
  }

  let result;
  let fallback = null;
  const engineWorkerEnabled = useEngineWorker && typeof Worker !== 'undefined';

  if (!engineWorkerEnabled) {
    result = await runEngineDirect(normalizedSelectedEngine, startId, endId, prepared, beelineM, {
      forceSerialRouting: resolvedForceSerialRouting,
      parallelPolicy,
    });
  } else if (!useWorkerPool) {
    try {
      result = await runEngineInWorker(normalizedSelectedEngine, startId, endId, prepared, {
        forceSerialRouting: resolvedForceSerialRouting,
        parallelPolicy,
      });
    } catch (error) {
      if (
        error?.code === EngineErrorCode.ENGINE_CANCELLED ||
        error?.code === EngineErrorCode.ENGINE_WORKER_BUSY
      ) {
        throw error;
      }
      if (!engineWorkerFallbackToMainThread) {
        throw error;
      }
      logger.warn(
        `engine worker unavailable (${error?.code ?? 'unknown_error'}), falling back to main thread execution`
      );
      result = await runEngineDirect(
        normalizedSelectedEngine,
        startId,
        endId,
        prepared,
        beelineM,
        {
          forceSerialRouting: resolvedForceSerialRouting,
          parallelPolicy,
        }
      );
    }
  } else {
    try {
      result = await runEngineInWorkerPool(normalizedSelectedEngine, startId, endId, prepared, {
        forceSerialRouting: resolvedForceSerialRouting,
        parallelPolicy,
        engineWorkerPoolSize,
      });
    } catch (error) {
      if (error?.code === EngineErrorCode.ENGINE_CANCELLED) {
        throw error;
      }
      if (!engineWorkerFallbackToMainThread) {
        throw error;
      }
      logger.warn(
        `engine worker pool unavailable (${error?.code ?? 'unknown_error'}), falling back to route worker singleton or main thread`
      );
      try {
        result = await runEngineInWorker(normalizedSelectedEngine, startId, endId, prepared, {
          forceSerialRouting: resolvedForceSerialRouting,
          parallelPolicy,
        });
      } catch (_fallbackError) {
        result = await runEngineDirect(
          normalizedSelectedEngine,
          startId,
          endId,
          prepared,
          beelineM,
          {
            forceSerialRouting: resolvedForceSerialRouting,
            parallelPolicy,
          }
        );
      }
    }
  }

  result = { ...result, engine: normalizeEngineId(result?.engine, selectedEngine) };

  let validation = validateRouteResult(result, prepared, { startId, endId });
  if (result?.found && !validation.valid && allowFallback) {
    logger.warn(
      `engine "${normalizedSelectedEngine}" returned an invalid route (${validation.reason}), retrying with bidirectional A*`
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
      `engine "${normalizedSelectedEngine}" returned no path, retrying with bidirectional A* for correctness`
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

/**
 * Snap endpoints onto a graph without running a route query.
 * Uses the same snapping rules as {@link computeRoute}.
 */
export function prepareRoutableGraph(
  graph,
  startCoords,
  endCoords,
  { snapDistancesM, maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M } = {}
) {
  const snap = resolveRouteEndpoints(graph, startCoords, endCoords, {
    snapDistancesM,
    maxAcceptableSnapDistanceM,
  });
  return {
    graph: snap.workingGraph,
    startId: snap.startId,
    endId: snap.endId,
    startSnapDistanceM: snap.startSnapDistanceM,
    endSnapDistanceM: snap.endSnapDistanceM,
    usedSnapDistanceM: snap.usedSnapDistance,
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
  if (!isRoutableGraph(graph)) {
    throw new Error('Invalid graph: expected object with routable nodes and edges array.');
  }

  const {
    costField = 'distance',
    penalties = {},
    snapDistancesM,
    graphCategory = '',
    maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M,
    engineId = 'auto',
    engineWorkerPoolSize = null,
    engineWorkerMaxPoolSize = null,
  } = options;
  const normalizedCostField = validateCostField(costField);
  const normalizedEngineId = validateEngineId(engineId);
  const normalizedPenalties = normalizePenalties(penalties);
  if (isTravelTimeCostField(normalizedCostField) && normalizedPenalties.turnPenaltySec > 0) {
    logger.warn('turn penalties are currently ignored; using standard engine routing');
  }

  logger.log(
    () => `computeRoute: graph has ${graph.nodes.size} nodes, ${graph.edges.length} edges`
  );

  const snap = resolveRouteEndpoints(graph, startCoords, endCoords, {
    snapDistancesM,
    maxAcceptableSnapDistanceM,
  });

  if (snap.reason === 'no_node') {
    if (snap.startId === -1 || snap.endId === -1) {
      logger.warn(
        () => `No node found within ${snap.usedSnapDistance} m of start or end coordinates`
      );
    }
    return {
      path: [],
      coordinates: [],
      cost: Infinity,
      costField: normalizedCostField,
      found: false,
      reason: RouteFailureReason.NO_NODE,
    };
  }

  if (snap.reason === 'poor_snap') {
    logger.warn(
      () =>
        `Poor snap quality: start=${snap.startSnapDistanceM.toFixed(0)} m, end=${snap.endSnapDistanceM.toFixed(0)} m`
    );
    return {
      path: [],
      coordinates: [],
      cost: Infinity,
      costField: normalizedCostField,
      found: false,
      reason: RouteFailureReason.POOR_SNAP,
      startSnapDistanceM: snap.startSnapDistanceM,
      endSnapDistanceM: snap.endSnapDistanceM,
    };
  }

  let {
    workingGraph,
    startId,
    endId,
    startSnapDistanceM,
    endSnapDistanceM,
    startSnapApplied,
    endSnapApplied,
    startSegmentSnap,
    endSegmentSnap,
    baseGraph,
    baseStartId,
    baseEndId,
    originalStartSnapDistanceM,
    originalEndSnapDistanceM,
  } = snap;

  if (startId === endId) {
    const coords = workingGraph.nodes.get(startId).coords;
    return {
      path: [startId],
      coordinates: [coords],
      cost: 0,
      costField: normalizedCostField,
      found: true,
      engine: DEFAULT_ENGINE_ID,
      startSnapDistanceM,
      endSnapDistanceM,
    };
  }

  const prepared = getPreparedGraph(
    workingGraph,
    normalizedCostField,
    normalizedPenalties,
    startId,
    endId
  );

  logger.log('dispatching route query...');
  const result = await queryRoute(startId, endId, prepared, {
    engineId: normalizedEngineId,
    graphCategory,
    costField: normalizedCostField,
    useWorkerPool: options.useWorkerPool,
    engineWorkerPoolSize: engineWorkerPoolSize ?? engineWorkerMaxPoolSize,
  });

  if (!result.found) {
    const canFallbackWithStartSnap =
      startSegmentSnap &&
      !startSnapApplied &&
      startSegmentSnap.distanceM <= maxAcceptableSnapDistanceM;
    const canFallbackWithEndSnap =
      endSegmentSnap && !endSnapApplied && endSegmentSnap.distanceM <= maxAcceptableSnapDistanceM;

    if (
      (result.reason === RouteFailureReason.NO_PATH ||
        result.reason === RouteFailureReason.INCOMPLETE_PATH) &&
      (canFallbackWithStartSnap || canFallbackWithEndSnap)
    ) {
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
        const fallbackPrepared = getPreparedGraph(
          fallbackGraph,
          normalizedCostField,
          normalizedPenalties,
          fallbackStartId,
          fallbackEndId
        );
        const fallbackResult = await queryRoute(fallbackStartId, fallbackEndId, fallbackPrepared, {
          graphCategory,
          costField: normalizedCostField,
        });
        if (fallbackResult.found) {
          const fallbackCoordinates = fallbackResult.path.map(
            (id) => fallbackGraph.nodes.get(id).coords
          );
          return {
            ...fallbackResult,
            coordinates: fallbackCoordinates,
            costField: normalizedCostField,
            engine: normalizeEngineId(fallbackResult.engine, DEFAULT_ENGINE_ID),
            startSnapDistanceM,
            endSnapDistanceM,
          };
        }
      }
    }

    if (
      (startSnapApplied || endSnapApplied) &&
      (result.reason === RouteFailureReason.NO_PATH ||
        result.reason === RouteFailureReason.INCOMPLETE_PATH)
    ) {
      const basePrepared = getPreparedGraph(
        baseGraph,
        normalizedCostField,
        normalizedPenalties,
        baseStartId,
        baseEndId
      );
      const baseResult = await queryRoute(baseStartId, baseEndId, basePrepared, {
        graphCategory,
        costField: normalizedCostField,
      });
      if (baseResult.found) {
        const baseCoordinates = baseResult.path.map((id) => baseGraph.nodes.get(id).coords);
        return {
          ...baseResult,
          coordinates: baseCoordinates,
          costField: normalizedCostField,
          engine: normalizeEngineId(baseResult.engine, DEFAULT_ENGINE_ID),
          startSnapDistanceM: originalStartSnapDistanceM,
          endSnapDistanceM: originalEndSnapDistanceM,
        };
      }
    }

    return {
      ...result,
      coordinates: [],
      costField: normalizedCostField,
      reason: RouteFailureReason.NO_PATH,
    };
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
        costField: normalizedCostField,
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
      costField: normalizedCostField,
      found: false,
      reason: RouteFailureReason.INCOMPLETE_PATH,
      startSnapDistanceM,
      endSnapDistanceM,
    };
  }

  const engine = normalizeEngineId(result.engine, DEFAULT_ENGINE_ID);
  return {
    ...result,
    coordinates,
    costField: normalizedCostField,
    engine,
    startSnapDistanceM,
    endSnapDistanceM,
  };
}

export function prepareGraph(
  graph,
  costField = 'distance',
  penalties = {},
  sourceId = -1,
  targetId = -1,
  opts = {}
) {
  const normalizedPenalties = normalizePenalties(penalties);
  return getPreparedGraph(graph, costField, normalizedPenalties, sourceId, targetId, opts);
}
