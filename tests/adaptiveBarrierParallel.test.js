import { describe, expect, it } from 'vitest';
import { adaptiveBarrierSSPRouter } from '../src/engines/AdaptiveBarrierSSSP/index.js';
import { bidirectionalAStar } from '../src/engines/BidirectionalAStar/index.js';
import { buildCH } from '../src/engines/router.js';

function makeRandomGraph(N, E, maxWeight = 15, seed = 1) {
  let state = seed;
  const rand = () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };

  const nodes = new Map();
  const edges = [];
  for (let i = 0; i < N; i++) {
    nodes.set(i, { id: i, coords: [0, 0] });
  }
  for (let i = 0; i < E; i++) {
    const u = Math.floor(rand() * N);
    const v = Math.floor(rand() * N);
    if (u === v) continue;
    const weight = Math.floor(rand() * maxWeight) + 1;
    edges.push({ source: u, target: v, length: weight, travelTime: weight, cost: weight, reverseCost: -1 });
  }
  return { nodes, edges };
}

describe('adaptive barrier parallel execution', () => {
  it('uses parallel workers and matches bidirectional A*', async () => {
    if (typeof SharedArrayBuffer === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    const originalNavigator = globalThis.navigator;
    globalThis.navigator = { hardwareConcurrency: 8 };
    try {
      const N = 70;
      const E = 260;
      const graph = makeRandomGraph(N, E, 20, 42);
      const prepared = buildCH(graph, 'distance');
      const startId = 0;
      const endId = N - 1;

      const result = await adaptiveBarrierSSPRouter(startId, endId, prepared, {
        minNodesForParallel: 1,
        minFrontierForParallel: 1,
      });

      expect(result.parallelUsed).toBe(true);
      const expected = await bidirectionalAStar(startId, endId, prepared);
      expect(result.found).toBe(expected.found);
      if (result.found) {
        expect(result.cost).toBeCloseTo(expected.cost, 6);
      }
    } finally {
      globalThis.navigator = originalNavigator;
    }
  }, 120_000);
});
