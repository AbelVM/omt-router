/**
 * @module src/engines/engineMainWorker
 * @description Worker entrypoint for deferred routing execution.
 *
 * Receives serialized prepared graphs and route requests from the main thread,
 * restores typed coordinate arrays, and dispatches work to the selected CPU
 * routing engine implementation.
 */
//# sourceURL=engineMainWorker
import { bidirectionalAStar } from './BidirectionalAStar/index.js';
import { adaptiveBarrierSSPRouter } from './AdaptiveBarrierSSSP/index.js';
import { deltaSteppingRouter } from './DeltaStepping/index.js';
import { ultraDijkstraRouter } from './UltraDijkstra/index.js';

const ENGINE_ID_ALIASES = Object.freeze({
  cpu: 'bidirectional-astar',
  bidirectionalAStar: 'bidirectional-astar',
  adaptiveBarrier: 'adaptive-barrier',
  deltaStepping: 'delta-stepping',
  ultraDijkstra: 'ultra-dijkstra',
});

let _workerPrepared = null;
let _workerPreparedId = null;

function normalizeEngineId(engineId, fallback = 'bidirectional-astar') {
  if (typeof engineId !== 'string' || !engineId) return fallback;
  return ENGINE_ID_ALIASES[engineId] ?? engineId;
}

/**
 * Restore runtime-only graph data after transferring a prepared graph across
 * worker boundaries.
 * @param {Object} prepared - Serialized prepared graph object.
 * @returns {Object} Restored prepared graph with coordsArr available.
 */
function restorePreparedGraph(prepared) {
  if (!prepared || !prepared.N) return prepared;

  if (
    prepared.coordsX instanceof Float32Array &&
    prepared.coordsY instanceof Float32Array &&
    prepared.coordsX.length === prepared.coordsY.length
  ) {
    const coordsArr = new Array(prepared.coordsX.length);
    for (let i = 0; i < prepared.coordsX.length; i += 1) {
      coordsArr[i] = [prepared.coordsX[i], prepared.coordsY[i]];
    }
    prepared.coordsArr = coordsArr;
    delete prepared.coordsX;
    delete prepared.coordsY;
  }

  return prepared;
}

/**
 * Dispatch a route query to the selected engine implementation.
 * @param {string} engineId
 * @param {number} startId
 * @param {number} endId
 * @param {Object} prepared
 * @param {Object} [options]
 * @param {boolean} [options.forceSerialRouting]
 * @param {Object|null} [options.parallelPolicy]
 * @returns {Promise<Object>} Route result from the engine.
 */
async function runEngine(
  engineId,
  startId,
  endId,
  prepared,
  { forceSerialRouting = false, parallelPolicy = null } = {}
) {
  switch (normalizeEngineId(engineId, 'ultra-dijkstra')) {
    case 'bidirectional-astar':
      return bidirectionalAStar(startId, endId, prepared);
    case 'adaptive-barrier':
      return await adaptiveBarrierSSPRouter(startId, endId, prepared, {
        forceSerialRouting,
        minNodesForParallel: parallelPolicy?.minNodesForParallel,
        minFrontierForParallel: parallelPolicy?.minFrontierForParallel,
      });
    case 'delta-stepping':
      return await deltaSteppingRouter(startId, endId, prepared, {
        forceSerialRouting,
        minFrontierForParallel: parallelPolicy?.minFrontierForParallel,
      });
    case 'ultra-dijkstra':
      return await ultraDijkstraRouter(startId, endId, prepared);
    default:
      return await ultraDijkstraRouter(startId, endId, prepared);
  }
}

self.onmessage = async (event) => {
  const message = event.data ?? {};
  if (message.type === 'prepare') {
    const prepared = restorePreparedGraph(message.prepared);
    // Defensive: prepared.N must be a positive integer
    if (
      !prepared ||
      typeof prepared.N !== 'number' ||
      !Number.isFinite(prepared.N) ||
      prepared.N <= 0
    ) {
      self.postMessage({
        type: 'status',
        state: 'error',
        error: 'Invalid prepared graph: missing or invalid N',
      });
      return;
    }
    if (prepared?.preparedId) {
      _workerPrepared = prepared;
      _workerPreparedId = prepared.preparedId;
    }
    self.postMessage({
      type: 'status',
      state: 'idle',
      preparedId: prepared?.preparedId ?? null,
    });
    return;
  }

  if (message.type === 'prepareAndRun') {
    const {
      requestId,
      engineId,
      startId,
      endId,
      prepared: messagePrepared,
      forceSerialRouting = false,
      parallelPolicy = null,
    } = message;
    const responseCorrelationId = message.correlationId ?? null;

    const prepared = restorePreparedGraph(messagePrepared);
    if (
      !prepared ||
      typeof prepared.N !== 'number' ||
      !Number.isFinite(prepared.N) ||
      prepared.N <= 0
    ) {
      const response = {
        type: 'result',
        requestId,
        ok: false,
        error: {
          name: 'Error',
          message: 'engine worker missing or invalid prepared graph',
        },
      };
      if (responseCorrelationId != null) response.correlationId = responseCorrelationId;
      self.postMessage(response);
      return;
    }

    if (prepared?.preparedId) {
      _workerPrepared = prepared;
      _workerPreparedId = prepared.preparedId;
    }

    try {
      const result = await runEngine(engineId, startId, endId, prepared, {
        forceSerialRouting,
        parallelPolicy,
      });
      const response = { type: 'result', requestId, ok: true, result };
      if (responseCorrelationId != null) response.correlationId = responseCorrelationId;
      self.postMessage(response);
    } catch (error) {
      const response = {
        type: 'result',
        requestId,
        ok: false,
        error: {
          name: error?.name ?? 'Error',
          message: error?.message ?? String(error),
        },
      };
      if (responseCorrelationId != null) response.correlationId = responseCorrelationId;
      self.postMessage(response);
    }
    return;
  }

  if (message.type !== 'run') return;

  const {
    requestId,
    engineId,
    startId,
    endId,
    prepared: messagePrepared,
    preparedId,
    forceSerialRouting = false,
    parallelPolicy = null,
  } = message;
  const responseCorrelationId = message.correlationId ?? null;

  // Defensive: requestId must be present
  if (typeof requestId !== 'string' && typeof requestId !== 'number') {
    self.postMessage({
      type: 'status',
      state: 'error',
      error: 'Missing or invalid requestId',
    });
    return;
  }

  let prepared = null;
  if (messagePrepared) {
    prepared = restorePreparedGraph(messagePrepared);
    if (prepared?.preparedId) {
      _workerPrepared = prepared;
      _workerPreparedId = prepared.preparedId;
    }
  } else if (preparedId && preparedId === _workerPreparedId) {
    prepared = _workerPrepared;
  }

  // Defensive: prepared must exist and have valid N
  if (
    !prepared ||
    typeof prepared.N !== 'number' ||
    !Number.isFinite(prepared.N) ||
    prepared.N <= 0
  ) {
    self.postMessage({
      type: 'result',
      requestId,
      ok: false,
      error: {
        name: 'Error',
        message: 'engine worker missing or invalid prepared graph',
      },
    });
    self.postMessage({
      type: 'status',
      requestId,
      state: 'error',
      engineId: null,
      error: 'engine worker missing or invalid prepared graph',
    });
    return;
  }

  // Defensive: startId and endId must be valid node indices
  if (
    !Number.isFinite(startId) ||
    !Number.isFinite(endId) ||
    startId < 0 ||
    endId < 0 ||
    startId >= prepared.N ||
    endId >= prepared.N
  ) {
    self.postMessage({
      type: 'result',
      requestId,
      ok: false,
      error: {
        name: 'Error',
        message: 'Invalid startId or endId',
      },
    });
    self.postMessage({
      type: 'status',
      requestId,
      state: 'error',
      engineId: null,
      error: 'Invalid startId or endId',
    });
    return;
  }

  self.postMessage({
    type: 'status',
    requestId,
    state: 'running',
    engineId: normalizeEngineId(engineId, null),
  });

  try {
    const result = await runEngine(engineId, startId, endId, prepared, {
      forceSerialRouting,
      parallelPolicy,
    });
    const response = { type: 'result', requestId, ok: true, result };
    if (responseCorrelationId != null) response.correlationId = responseCorrelationId;
    self.postMessage(response);
    self.postMessage({ type: 'status', requestId, state: 'idle', engineId: null });
  } catch (error) {
    const response = {
      type: 'result',
      requestId,
      ok: false,
      error: {
        name: error?.name ?? 'Error',
        message: error?.message ?? String(error),
      },
    };
    if (responseCorrelationId != null) response.correlationId = responseCorrelationId;
    self.postMessage(response);
    self.postMessage({
      type: 'status',
      requestId,
      state: 'error',
      engineId: null,
      error: error?.message ?? String(error),
    });
  }
};
