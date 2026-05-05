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

function normalizeEngineId(engineId, fallback = 'bidirectional-astar') {
  if (typeof engineId !== 'string' || !engineId) return fallback;
  return ENGINE_ID_ALIASES[engineId] ?? engineId;
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
  if (message.type !== 'run') return;

  const {
    requestId,
    engineId,
    startId,
    endId,
    prepared,
    forceSerialRouting = false,
    parallelPolicy = null,
  } = message;
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
