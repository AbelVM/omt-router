import { describe, expect, it } from 'vitest';
import { buildGraph, parseTile } from '../src/graphs/graphBuilder.js';
import { nodeCentrality, getAllGraphMetrics, getDensityFeatures } from '../src/graphs/graphMetrics.js';
import { computeRoute, nearestNode, buildCH, selectBestEngine } from '../src/engines/router.js';
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

  it('snaps to a long segment when nearby nodes belong to a different edge', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.01, 0] }],
      [2, { id: 2, coords: [0.005, 0.002] }],
      [3, { id: 3, coords: [0.006, 0.002] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 1113,
        reverseCost: 1113,
        length: 1113,
        speed: 50,
        travelTime: 1113 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 2,
        target: 3,
        cost: 111,
        reverseCost: 111,
        length: 111,
        speed: 50,
        travelTime: 111 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0.005, 0.0005];
    const endCoords = [0, 0];

    const result = await computeRoute(startCoords, endCoords, graph, { costField: 'distance' });

    expect(result.found).toBe(true);
    expect(result.startSnapDistanceM).toBeGreaterThan(0);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(60);
    expect(result.cost).toBeGreaterThan(500);
    expect(result.cost).toBeLessThan(600);
    expect(result.coordinates[0]).toEqual(expect.any(Array));
    expect(result.path.length).toBeGreaterThan(1);
  });

  it('uses segment-projected start nodes even when a closer real node exists', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.0004, 0] }],
      [2, { id: 2, coords: [0.0004, 0.0002] }],
      [3, { id: 3, coords: [0.02, 0.02] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 44,
        reverseCost: 44,
        length: 44,
        speed: 50,
        travelTime: 44 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 1,
        target: 2,
        cost: 22,
        reverseCost: 22,
        length: 22,
        speed: 50,
        travelTime: 22 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 2,
        target: 3,
        cost: 2800,
        reverseCost: 2800,
        length: 2800,
        speed: 50,
        travelTime: 2800 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0.0001, 0.0001];
    const endCoords = [0.02, 0.02];

    const result = await computeRoute(startCoords, endCoords, graph, { costField: 'distance' });

    expect(result.found).toBe(true);
    expect(result.coordinates[0]).toEqual([0.0004, 0.0001]);
    expect(result.path[0]).toBe(4);
    expect(result.startSnapDistanceM).toBeGreaterThan(0);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(60);
  });

  it('prefers the closest street segment over a nearer wrong graph node', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0, 0.02] }],
      [2, { id: 2, coords: [0.0002, 0.009] }],
      [3, { id: 3, coords: [0.0002, 0.011] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 2226,
        reverseCost: 2226,
        length: 2226,
        speed: 50,
        travelTime: 2226 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 2,
        target: 3,
        cost: 222,
        reverseCost: 222,
        length: 222,
        speed: 50,
        travelTime: 222 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0, 0.01];
    const endCoords = [0, 0];

    const result = await computeRoute(startCoords, endCoords, graph, { costField: 'distance' });

    expect(result.found).toBe(true);
    expect(result.startSnapDistanceM).toBeLessThan(1);
    expect(result.coordinates[0]).toEqual([0, 0.01]);
    expect(result.path[0]).toBe(4);
    expect(result.cost).toBeGreaterThan(1100);
    expect(result.cost).toBeLessThan(2300);
  });

  it('retries with segment snap when a closer wrong node yields no_path', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.02, 0] }],
      [2, { id: 2, coords: [0.02, 0.02] }],
      [3, { id: 3, coords: [0.0001, 0.0002] }],
      [4, { id: 4, coords: [0.0001, 0.0003] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 2226,
        reverseCost: 2226,
        length: 2226,
        speed: 50,
        travelTime: 2226 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 1,
        target: 2,
        cost: 2226,
        reverseCost: 2226,
        length: 2226,
        speed: 50,
        travelTime: 2226 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 3,
        target: 4,
        cost: 111,
        reverseCost: 111,
        length: 111,
        speed: 50,
        travelTime: 111 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0.0002, 0.0004];
    const endCoords = [0.02, 0.02];

    const result = await computeRoute(startCoords, endCoords, graph, { costField: 'distance' });

    expect(result.found).toBe(true);
    expect(result.coordinates[0]).toEqual([0.0002, 0]);
    expect(result.startSnapDistanceM).toBeGreaterThan(0);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(60);
    expect(result.cost).toBeGreaterThan(4000);
    expect(result.cost).toBeLessThan(5000);
  });

  it('falls back to nearest-node routing when a reverse-only segment snap blocks the route', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.02, 0] }],
      [2, { id: 2, coords: [0.04, 0] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: -1,
        reverseCost: 200,
        length: 200,
        speed: 50,
        travelTime: 200 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 1,
        target: 2,
        cost: 200,
        reverseCost: 200,
        length: 200,
        speed: 50,
        travelTime: 200 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0.018, 0];
    const endCoords = [0.04, 0];

    const result = await computeRoute(startCoords, endCoords, graph, { costField: 'distance' });

    expect(result.found).toBe(true);
    expect(result.coordinates[0]).toEqual([0.02, 0]);
    expect(result.path[0]).toBe(1);
    expect(result.cost).toBeGreaterThan(0);
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
