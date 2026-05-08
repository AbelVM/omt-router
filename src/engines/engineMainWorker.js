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

async function runEngine(engineId, startId, endId, prepared, {
  forceSerialRouting = false,
  parallelPolicy = null,
} = {}) {
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
    if (!prepared || typeof prepared.N !== 'number' || !Number.isFinite(prepared.N) || prepared.N <= 0) {
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
  if (!prepared || typeof prepared.N !== 'number' || !Number.isFinite(prepared.N) || prepared.N <= 0) {
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
  if (!Number.isFinite(startId) || !Number.isFinite(endId) ||
      startId < 0 || endId < 0 ||
      startId >= prepared.N || endId >= prepared.N) {
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
    self.postMessage({ type: 'result', requestId, ok: true, result });
    self.postMessage({ type: 'status', requestId, state: 'idle', engineId: null });
  } catch (error) {
    self.postMessage({
      type: 'result',
      requestId,
      ok: false,
      error: {
        name: error?.name ?? 'Error',
        message: error?.message ?? String(error),
      },
    });
    self.postMessage({
      type: 'status',
      requestId,
      state: 'error',
      engineId: null,
      error: error?.message ?? String(error),
    });
  }
};
