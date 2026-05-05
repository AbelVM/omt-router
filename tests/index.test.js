import { describe, expect, it } from 'vitest';
import { buildGraph, parseTile } from '../src/graphs/graphBuilder.js';
import { nodeCentrality, getAllGraphMetrics, getDensityFeatures } from '../src/graphs/graphMetrics.js';
import { nearestNode, buildCH, selectBestEngine } from '../src/engines/router.js';
import { getTilesAlongLine } from '../src/tiles/tilesManager.js';
import { interpolate, haversineDistance } from '../src/utils/misc.js';
import { hasParallelRoutingRuntime } from '../src/tuning/tuning.js';

describe('interpolate', () => {
  it('replaces {z}, {x}, {y} placeholders', () => {
    expect(interpolate('/{z}/{x}/{y}.pbf', { z: 14, x: 8200, y: 5600 })).toBe('/14/8200/5600.pbf');
  });

  it('handles multiple occurrences of the same placeholder', () => {
    const result = interpolate('{z}/{z}', { z: 5, x: 0, y: 0 });
    expect(result).toBe('5/5');
  });
});

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance([0, 0], [0, 0])).toBe(0);
  });

  it('returns a positive distance for distinct points', () => {
    const d = haversineDistance([-3.7038, 40.4168], [-3.6895, 40.4234]);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(5000); // Madrid area, ~1.4 km
  });
});

describe('getTilesAlongLine', () => {
  it('returns at least the start and end tiles', () => {
    const tiles = getTilesAlongLine([-3.7038, 40.4168], [-3.6895, 40.4234], 14);
    expect(tiles.length).toBeGreaterThanOrEqual(1);
    expect(tiles[0]).toMatchObject({ z: 14 });
  });

  it('returns more tiles with radius > 0', () => {
    const noRadius = getTilesAlongLine([-3.7038, 40.4168], [-3.6895, 40.4234], 14, 0);
    const withRadius = getTilesAlongLine([-3.7038, 40.4168], [-3.6895, 40.4234], 14, 1);
    expect(withRadius.length).toBeGreaterThanOrEqual(noRadius.length);
  });
});

describe('buildGraph', () => {
  it('throws for unknown transport mode', () => {
    expect(() => buildGraph([], 'skateboard')).toThrow(/Unknown transport mode/);
  });

  it('returns an empty graph for empty tile list', () => {
    const g = buildGraph([], 'car');
    expect(g.nodes.size).toBe(0);
    expect(g.edges.length).toBe(0);
  });
});

describe('graphMetrics', () => {
  it('computes weighted centrality for a raw car graph using fibonacciScore', () => {
    const rawGraph = {
      nodes: new Map([
        [0, { id: 0, coords: [0, 0] }],
        [1, { id: 1, coords: [1, 1] }],
      ]),
      edges: [
        { source: 0, target: 1, fibonacciScore: 2 },
        { source: 0, target: 1, fibonacciScore: 3 },
        { source: 1, target: 0, fibonacciScore: 5 },
      ],
    };

    expect(nodeCentrality(rawGraph, 0, 'car')).toBe(5);
    expect(nodeCentrality(rawGraph, 1, 'car')).toBe(5);

    const preparedGraph = {
      N: 2,
      E: 3,
      adjPtr: new Int32Array([0, 2, 3]),
      coordsArr: [[0, 0], [1, 1]],
    };
    const metrics = getAllGraphMetrics(preparedGraph, rawGraph, 0, 1, { mode: 'car' });
    expect(metrics.nodeCentralitySource).toBe(5);
    expect(metrics.nodeCentralityTarget).toBe(5);
  });

  it('reuses density sampler for repeated maxRes calls', () => {
    const preparedGraph = {
      N: 2,
      E: 1,
      adjPtr: new Int32Array([0, 1, 1]),
      coordsArr: [[0, 0], [1, 1]],
    };
    const first = getDensityFeatures(preparedGraph, [0, 0], [1, 1], { maxRes: 16 });
    const second = getDensityFeatures(preparedGraph, [0, 0], [1, 1], { maxRes: 16 });

    expect(first).toEqual(second);
    expect(preparedGraph._densitySamplerByRes).toBeInstanceOf(Map);
    expect(preparedGraph._densitySamplerByRes.get(16)).toBe(preparedGraph._densitySampler);
  });
});

describe('nearestNode', () => {
  it('returns -1 when the graph is empty', () => {
    const g = buildGraph([], 'car');
    expect(nearestNode([0, 0], g)).toBe(-1);
  });

  it('finds the nearest node by haversine distance', () => {
    // Manually construct a tiny graph with two known nodes.
    const nodes = new Map([
      [0, { id: 0, coords: [-3.7038, 40.4168] }],  // Madrid
      [1, { id: 1, coords: [-3.6895, 40.4234] }],  // ~1.4 km away
    ]);
    const g = { nodes, edges: [] };
    // Query from a point very close to node 0
    const result = nearestNode([-3.7040, 40.4170], g, 1000);
    expect(result).toBe(0);
  });

  it('returns -1 when the nearest node is beyond maxDistM', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [-3.7038, 40.4168] }],
    ]);
    const g = { nodes, edges: [] };
    // Query 10 km away with a 500 m limit
    const result = nearestNode([-3.6038, 40.4168], g, 500);
    expect(result).toBe(-1);
  });
});

describe('selector runtime behavior', () => {
  it('uses serial branch in node/non-browser runtime', () => {
    expect(hasParallelRoutingRuntime()).toBe(false);

    const selected = selectBestEngine(420_000, 220_000, 40_000, '', 'distance');
    expect(selected).toBe('adaptive-barrier');
  });

  it('stays serial in node even if worker-like globals are mocked', () => {
    const originalSharedArrayBuffer = globalThis.SharedArrayBuffer;
    const originalWorker = globalThis.Worker;
    const originalCrossOriginIsolated = globalThis.crossOriginIsolated;

    try {
      if (typeof originalSharedArrayBuffer === 'undefined') {
        globalThis.SharedArrayBuffer = class MockSharedArrayBuffer {};
      }
      globalThis.Worker = class MockWorker {};
      Object.defineProperty(globalThis, 'crossOriginIsolated', {
        configurable: true,
        value: true,
      });

      expect(hasParallelRoutingRuntime()).toBe(false);
      const selected = selectBestEngine(28_215, 20_324, 135, '', 'distance');
      expect(selected).toBe('adaptive-barrier');
    } finally {
      if (originalSharedArrayBuffer === undefined) {
        delete globalThis.SharedArrayBuffer;
      } else {
        globalThis.SharedArrayBuffer = originalSharedArrayBuffer;
      }

      if (originalWorker === undefined) {
        delete globalThis.Worker;
      } else {
        globalThis.Worker = originalWorker;
      }

      if (originalCrossOriginIsolated === undefined) {
        delete globalThis.crossOriginIsolated;
      } else {
        Object.defineProperty(globalThis, 'crossOriginIsolated', {
          configurable: true,
          value: originalCrossOriginIsolated,
        });
      }
    }
  });
});
