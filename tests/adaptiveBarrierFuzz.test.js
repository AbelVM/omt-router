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

function validatePathCost(prepared, path) {
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    let found = false;
    for (let k = prepared.adjPtr[from]; k < prepared.adjPtr[from + 1]; k++) {
      if (prepared.adjTo[k] === to) {
        cost += prepared.adjCost[k];
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return cost;
}

async function runCheck(prepared, startId, endId) {
  const [abResult, biResult] = await Promise.all([
    adaptiveBarrierSSPRouter(startId, endId, prepared, { forceSerialRouting: true }),
    Promise.resolve(bidirectionalAStar(startId, endId, prepared)),
  ]);
  return { abResult, biResult };
}

describe('adaptive barrier serial fuzzing', () => {
  it('produces the same results as bidirectional A* for many random graphs', async () => {
    const N = 40;
    const E = 200;
    const graphs = 20;
    for (let g = 0; g < graphs; g++) {
      const graph = makeRandomGraph(N, E, 20, g + 1);
      const prepared = buildCH(graph, 'distance');
      for (let trial = 0; trial < 10; trial++) {
        const startId = Math.floor(Math.random() * N);
        let endId = Math.floor(Math.random() * N);
        if (endId === startId) endId = (endId + 1) % N;
        const { abResult, biResult } = await runCheck(prepared, startId, endId);

        expect(abResult.found).toBe(biResult.found);
        if (abResult.found) {
          expect(abResult.cost).toBeCloseTo(biResult.cost, 6);
          const abCostInt = Math.round(abResult.cost * 10);
          const pathCost = validatePathCost(prepared, abResult.path);
          expect(pathCost).not.toBeNull();
          expect(abCostInt).toBe(pathCost);
        }
      }
    }
  }, 120_000);
});
