import { describe, expect, it } from 'vitest';
import {
  countNodes,
  countEdges,
  beelinePerNode,
  nodeDegree,
  averageNodeDegree,
  nodeCentrality,
  getDensityFeatures,
  getAllGraphMetrics,
} from '../src/graphs/graphMetrics.js';

describe('graphMetrics utilities', () => {
  it('counts nodes and edges correctly for prepared and raw graphs', () => {
    expect(countNodes({ N: 4 })).toBe(4);
    expect(countNodes({ nodes: new Map([[1, { id: 1 }]]) })).toBe(1);
    expect(countEdges({ E: 7 })).toBe(7);
    expect(countEdges({ edges: [{}, {}] })).toBe(2);
  });

  it('computes beeline per node and handles missing coordinates', () => {
    expect(beelinePerNode({ coordsArr: [[0, 0]] }, 0, 1)).toBe(0);
    expect(beelinePerNode({ coordsArr: [[0, 0], [0, 1]], N: 2 }, 0, 1)).toBeGreaterThan(0);
  });

  it('computes node degree and average node degree safely', () => {
    expect(nodeDegree({ N: 3, adjPtr: new Int32Array([0, 1, 1]) }, -1)).toBe(0);
    expect(nodeDegree({ N: 3, adjPtr: new Int32Array([0, 1, 3]) }, 1)).toBe(2);
    expect(averageNodeDegree({ E: 0, N: 0 })).toBe(0);
    expect(averageNodeDegree({ E: 10, N: 5 })).toBe(2);
  });

  it('computes node centrality across different graph representations', () => {
    expect(nodeCentrality({ adjPtr: new Int32Array([0, 2, 4]) }, 0)).toBe(2);
    expect(nodeCentrality({ edges: [{ source: 1 }, { source: 1 }, { source: 2 }], outDegree: [0, 2, 1] }, 1)).toBe(2);
    expect(nodeCentrality({ edges: [{ source: 0, fibonacciScore: 5 }, { source: 0 }] }, 0, 'car')).toBe(6);
    expect(nodeCentrality({ edges: [{ source: 0 }, { source: 1 }] }, 0)).toBe(1);
    expect(nodeCentrality({ edges: [], outCarCentrality: [3, 2] }, 1, 'car')).toBe(2);
  });

  it('returns density features for prepared graphs and reuses the sampler cache', () => {
    const preparedGraph = {
      N: 2,
      coordsArr: [[0, 0], [1, 1]],
    };

    const firstResult = getDensityFeatures(preparedGraph, [0, 0], [1, 1], { maxRes: 32 });
    expect(firstResult).toHaveProperty('emptyRatio');
    expect(firstResult.globalCoverage).toBeGreaterThanOrEqual(0);
    expect(firstResult.relativeDensity).toBeGreaterThanOrEqual(0);

    const secondResult = getDensityFeatures(preparedGraph, [0, 0], [1, 1], { maxRes: 32 });
    expect(secondResult).toEqual(firstResult);
  });

  it('computes all graph metrics and executes centrality logic for car mode', () => {
    const preparedGraph = {
      N: 2,
      E: 2,
      adjPtr: new Int32Array([0, 1, 2]),
      coordsArr: [[0, 0], [0, 1]],
    };
    const rawGraph = {
      edges: [{ source: 0, fibonacciScore: 3 }, { source: 1, fibonacciScore: 4 }],
      outCarCentrality: [5, 6],
    };

    const metrics = getAllGraphMetrics(preparedGraph, rawGraph, 0, 1, { mode: 'car', densityOpts: { maxRes: 32 } });
    expect(metrics.nodeCount).toBe(2);
    expect(metrics.edgeCount).toBe(2);
    expect(metrics.nodeDegreeSource).toBe(1);
    expect(metrics.nodeCentralityTarget).toBe(6);
    expect(metrics.globalCoverage).toBeGreaterThanOrEqual(0);
  });
});
