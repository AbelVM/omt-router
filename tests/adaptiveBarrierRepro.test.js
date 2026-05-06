import { describe, expect, it } from 'vitest';
import { adaptiveBarrierSSPRouter } from '../src/engines/AdaptiveBarrierSSSP/index.js';
import { bidirectionalAStar } from '../src/engines/BidirectionalAStar/index.js';
import { buildCH } from '../src/engines/router.js';
import { buildGraph } from '../src/graphs/graphBuilder.js';

function makeRandomGraph(N, E, maxWeight = 15) {
  const nodes = new Map();
  const edges = [];
  for (let i = 0; i < N; i++) {
    nodes.set(i, { id: i, coords: [0, 0] });
  }
  for (let i = 0; i < E; i++) {
    const u = Math.floor(Math.random() * N);
    const v = Math.floor(Math.random() * N);
    if (u === v) continue;
    const weight = Math.floor(Math.random() * maxWeight) + 1;
    edges.push({ source: u, target: v, length: weight, travelTime: weight, cost: weight, reverseCost: -1 });
  }
  return { nodes, edges };
}

async function solveOne(prepared, startId, endId) {
  return adaptiveBarrierSSPRouter(startId, endId, prepared, { forceSerialRouting: true });
}

function dijkstraCost(prepared, startId, endId) {
  return bidirectionalAStar(startId, endId, prepared);
}


describe('adaptive barrier serial regression', () => {
  it('matches bidirectional A* on random graphs', async () => {
    const N = 40;
    const E = 140;
    const graph = makeRandomGraph(N, E);
    const prepared = buildCH(graph, 'distance');
    const startId = 0;
    const endId = N - 1;

    const [abResult, biResult] = await Promise.all([
      solveOne(prepared, startId, endId),
      Promise.resolve(dijkstraCost(prepared, startId, endId)),
    ]);

    expect(abResult.found).toBe(biResult.found);
    if (abResult.found) {
      expect(abResult.cost).toBeCloseTo(biResult.cost, 6);
    }
  });
});
