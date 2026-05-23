import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/graphs/graphBuilder.js', async () => {
  const actual = await vi.importActual('../src/graphs/graphBuilder.js');
  return {
    ...actual,
    buildGraphAsync: vi.fn(async () => ({ nodes: new Map(), edges: [] })),
  };
});

import { buildGraph, isAccessible } from '../src/graphs/graphBuilder.js';
import {
  nodeCentrality,
  getAllGraphMetrics,
  getDensityFeatures,
} from '../src/graphs/graphMetrics.js';
import {
  computeRoute,
  prepareGraph,
  prepareRoutableGraph,
  nearestNode,
  selectBestEngine,
  validateRouteResult,
  buildCH,
  ensureAdjCostMap,
} from '../src/engines/router.js';
import { getTilesAlongLine } from '../src/tiles/tilesManager.js';
import { interpolate, haversineDistance, isWithinDistanceMeters } from '../src/utils/misc.js';
import { MapLibreRoutingControl, parseCoords } from '../src/ui/MapLibreRoutingControl.js';
import {
  findTopTwoIndices,
  hasParallelRoutingRuntime,
  resolveMlFeatureValues,
} from '../src/tuning/tuning.js';
import { buildTileURL, dispose, shutdown } from '../src/index.js';

describe('interpolate', () => {
  it('replaces {z}, {x}, {y} placeholders', () => {
    expect(interpolate('/{z}/{x}/{y}.pbf', { z: 14, x: 8200, y: 5600 })).toBe('/14/8200/5600.pbf');
  });

  it('handles multiple occurrences of the same placeholder', () => {
    const result = interpolate('{z}/{z}', { z: 5, x: 0, y: 0 });
    expect(result).toBe('5/5');
  });

  it('supports {url} proxy templates', () => {
    expect(
      interpolate('https://proxy/?u={url}', { url: 'https%3A%2F%2Fexample.com%2Ftile.pbf' })
    ).toBe('https://proxy/?u=https%3A%2F%2Fexample.com%2Ftile.pbf');
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

describe('isWithinDistanceMeters', () => {
  it('returns true for points within the threshold', () => {
    expect(isWithinDistanceMeters([0, 0], [0.0001, 0], 15)).toBe(true);
  });

  it('returns false for points beyond the threshold', () => {
    expect(isWithinDistanceMeters([0, 0], [0.001, 0], 15)).toBe(false);
  });
});

describe('public dispose/shutdown lifecycle', () => {
  it('exports dispose and shutdown aliases', () => {
    expect(dispose).toBeTypeOf('function');
    expect(shutdown).toBe(dispose);
  });

  it('can be called repeatedly without throwing', () => {
    expect(() => {
      dispose();
      shutdown();
    }).not.toThrow();
  });
});

describe('MapLibreRoutingControl input parsing', () => {
  it('parses user-provided lat, lng coordinate strings into [lng, lat]', () => {
    expect(parseCoords('38.357820, -0.420041')).toEqual([-0.420041, 38.35782]);
    expect(parseCoords('38.362699,-0.423743')).toEqual([-0.423743, 38.362699]);
  });

  it('returns null for invalid coordinate input', () => {
    expect(parseCoords('invalid coordinates')).toBeNull();
    expect(parseCoords('91, 0')).toBeNull();
    expect(parseCoords('0, 181')).toBeNull();
  });

  it('accepts a custom locale_override object and merges missing values with defaults', () => {
    const ctrl = new MapLibreRoutingControl({
      maplibre: { Marker: () => {} },
      locale: 'en',
      locale_override: { title: 'My custom planner', stats: { distance: 'Distanza' } },
    });

    expect(ctrl._text.title).toBe('My custom planner');
    expect(ctrl._text.stats.distance).toBe('Distanza');
    expect(ctrl._text.stats.estTime).toBe('Est. time');
  });

  it('still supports legacy locale object syntax as a locale override', () => {
    const ctrl = new MapLibreRoutingControl({
      maplibre: { Marker: () => {} },
      locale: {
        title: 'Custom planner',
        stats: 'invalid',
        status: { poorSnap: 'Point snapped poorly', extraKey: 'ignored' },
        unknownKey: 'should be ignored',
      },
    });

    expect(ctrl._text.title).toBe('Custom planner');
    expect(ctrl._text.stats.distance).toBe('Distance');
    expect(ctrl._text.stats.estTime).toBe('Est. time');
    expect(ctrl._text.status.poorSnap).toBe('Point snapped poorly');
    expect(ctrl._text.status.noPath).toBe(
      'No route found because the loaded graph is disconnected or the corridor is too narrow for the requested path.'
    );
    expect(ctrl._text.unknownKey).toBeUndefined();
    expect(ctrl._text.status.extraKey).toBeUndefined();
  });

  it('ignores unsupported locale shape and preserves default text structure', () => {
    const ctrl = new MapLibreRoutingControl({
      maplibre: { Marker: () => {} },
      locale: 'en',
      locale_override: {
        title: 'Custom planner',
        stats: 'invalid',
        status: { poorSnap: 'Point snapped poorly', extraKey: 'ignored' },
        unknownKey: 'should be ignored',
      },
    });

    expect(ctrl._text.title).toBe('Custom planner');
    expect(ctrl._text.stats.distance).toBe('Distance');
    expect(ctrl._text.stats.estTime).toBe('Est. time');
    expect(ctrl._text.status.poorSnap).toBe('Point snapped poorly');
    expect(ctrl._text.status.noPath).toBe(
      'No route found because the loaded graph is disconnected or the corridor is too narrow for the requested path.'
    );
    expect(ctrl._text.unknownKey).toBeUndefined();
    expect(ctrl._text.status.extraKey).toBeUndefined();
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

describe('route URL templating', () => {
  it('throws when tileUrlTransform returns a non-string value', () => {
    expect(() =>
      buildTileURL(
        'https://example.com/{z}/{x}/{y}.pbf',
        { z: 14, x: 8200, y: 5600 },
        { tileUrlTransform: () => null }
      )
    ).toThrow(/Invalid tileUrlTransform/);
  });
});

describe('isAccessible', () => {
  it('allows car roads with a valid class and undefined subclass', () => {
    expect(isAccessible({ class: 'residential', subclass: undefined }, 'car')).toBe(true);
  });

  it('rejects car roads with an excluded subclass', () => {
    expect(isAccessible({ class: 'residential', subclass: 'footway' }, 'car')).toBe(false);
  });
});

describe('prepareGraph', () => {
  it('recomputes endpoint-dependent metrics when reusing a cached prepared graph', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0, 0.1] }],
      [2, { id: 2, coords: [1, 0] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 11130,
        reverseCost: 11130,
        length: 11130,
        speed: 50,
        travelTime: 11130 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 0,
        target: 2,
        cost: 111300,
        reverseCost: 111300,
        length: 111300,
        speed: 50,
        travelTime: 111300 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };

    const preparedA = prepareGraph(graph, 'distance', {}, 0, 1);
    const firstDistance = preparedA.metrics.haversineDistance;
    const preparedB = prepareGraph(graph, 'distance', {}, 0, 2);
    const secondDistance = preparedB.metrics.haversineDistance;

    expect(preparedA).toBe(preparedB);
    expect(firstDistance).not.toBe(secondDistance);
    expect(secondDistance).toBeGreaterThan(firstDistance);
  });

  it('buildCH creates a direct edge lookup for route validation', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0, 0] }],
      [2, { id: 2, coords: [0, 0] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 100,
        reverseCost: -1,
        length: 100,
        speed: 1,
        travelTime: 100,
        properties: {},
        fibonacciScore: 1,
      },
      {
        source: 1,
        target: 2,
        cost: 200,
        reverseCost: -1,
        length: 200,
        speed: 1,
        travelTime: 200,
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const prepared = buildCH({ nodes, edges }, 'distance');
    const adjCostMap = ensureAdjCostMap(prepared);

    expect(adjCostMap).toBeInstanceOf(Array);
    expect(adjCostMap[0]).toBeInstanceOf(Array);
    expect(adjCostMap[0][0]).toBe(1);
    expect(adjCostMap[0][1]).toBe(100 * 10);
    expect(adjCostMap[1]).toBeInstanceOf(Array);
    expect(adjCostMap[1][0]).toBe(2);
    expect(adjCostMap[1][1]).toBe(200 * 10);

    const validation = validateRouteResult({ found: true, path: [0, 1, 2], cost: 300 }, prepared);
    expect(validation).toEqual({ valid: true, actualCost: 300, reason: null });
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
      coordsArr: [
        [0, 0],
        [1, 1],
      ],
    };
    const metrics = getAllGraphMetrics(preparedGraph, rawGraph, 0, 1, { mode: 'car' });
    expect(metrics.nodeCentralitySource).toBe(5);
    expect(metrics.nodeCentralityTarget).toBe(5);
  });

  it('maps legacy graph metrics into ML runtime feature names', () => {
    const metrics = resolveMlFeatureValues({
      nodeCount: 1000,
      edgeCount: 4000,
      averageNodeDegree: 4,
      haversineDistance: 2000,
      beelinePerNode: 2,
      nodeDegreeSource: 5,
      nodeDegreeTarget: 3,
      nodeCentralitySource: 10,
      nodeCentralityTarget: 8,
      relativeDensity: 0.5,
      globalCoverage: 0.2,
      emptyRatio: 0.3,
    });

    expect(metrics.safeN).toBe(1000);
    expect(metrics.safeE).toBe(4000);
    expect(metrics.safeBeelineKm).toBe(2);
    expect(metrics.avgOutDegree).toBe(4);
    expect(metrics.sourceDegree).toBe(5);
    expect(metrics.targetDegree).toBe(3);
    expect(metrics.sourceCentrality).toBe(10);
    expect(metrics.targetCentrality).toBe(8);
    expect(metrics.sourceTargetDegreeRatio).toBeCloseTo(5 / 3);
    expect(metrics.sourceTargetCentralityRatio).toBeCloseTo(10 / 8);
    expect(metrics.edgesPerKm).toBeCloseTo(4000 / 2);
  });

  it('finds distinct best and second-best indices when best class is index 0', () => {
    const { bestIndex, secondIndex } = findTopTwoIndices([0.75, 0.4, 0.6]);
    expect(bestIndex).toBe(0);
    expect(secondIndex).toBe(2);
  });

  it('reuses density sampler for repeated maxRes calls', () => {
    const preparedGraph = {
      N: 2,
      E: 1,
      adjPtr: new Int32Array([0, 1, 1]),
      coordsArr: [
        [0, 0],
        [1, 1],
      ],
    };
    const first = getDensityFeatures(preparedGraph, [0, 0], [1, 1], { maxRes: 16 });
    const second = getDensityFeatures(preparedGraph, [0, 0], [1, 1], { maxRes: 16 });

    expect(first).toEqual(second);
    expect(preparedGraph._densitySampler).toBeUndefined();
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
      [0, { id: 0, coords: [-3.7038, 40.4168] }], // Madrid
      [1, { id: 1, coords: [-3.6895, 40.4234] }], // ~1.4 km away
    ]);
    const g = { nodes, edges: [] };
    // Query from a point very close to node 0
    const result = nearestNode([-3.704, 40.417], g, 1000);
    expect(result).toBe(0);
  });

  it('returns -1 when the nearest node is beyond maxDistM', () => {
    const nodes = new Map([[0, { id: 0, coords: [-3.7038, 40.4168] }]]);
    const g = { nodes, edges: [] };
    // Query 10 km away with a 500 m limit
    const result = nearestNode([-3.6038, 40.4168], g, 500);
    expect(result).toBe(-1);
  });

  it('prepares a routable graph by snapping endpoints before route query', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.01, 0] }],
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
    ];
    const graph = { nodes, edges };
    const startCoords = [0.005, 0.0008];
    const endCoords = [0.01, 0];

    const result = prepareRoutableGraph(graph, startCoords, endCoords, {
      maxAcceptableSnapDistanceM: 120,
    });

    expect(result.startId).toBe(2);
    expect(result.endId).toBe(1);
    expect(result.graph.nodes.size).toBe(3);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(120);
    expect(result.endSnapDistanceM).toBe(0);
  });

  it('handles sparse node IDs when augmenting the graph for a snap', () => {
    const nodes = new Map([
      [10, { id: 10, coords: [0, 0] }],
      [20, { id: 20, coords: [0.01, 0] }],
    ]);
    const edges = [
      {
        source: 10,
        target: 20,
        cost: 1113,
        reverseCost: 1113,
        length: 1113,
        speed: 50,
        travelTime: 1113 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0.005, 0.0008];
    const endCoords = [0.01, 0];

    const result = prepareRoutableGraph(graph, startCoords, endCoords, {
      maxAcceptableSnapDistanceM: 120,
    });

    expect(result.startId).toBe(21);
    expect(result.graph.nodes.has(21)).toBe(true);
    expect(result.graph._lastAddedNodeId).toBe(21);
    expect(result.graph.nodes.size).toBe(3);
  });

  it('does not segment-snap when only one endpoint has been defined', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.01, 0] }],
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
    ];
    const graph = { nodes, edges };
    const startCoords = undefined;
    const endCoords = [0.01, 0];

    const result = prepareRoutableGraph(graph, startCoords, endCoords, {
      maxAcceptableSnapDistanceM: 120,
    });

    expect(result.startId).toBe(-1);
    expect(result.endId).toBe(-1);
    expect(result.graph.nodes.size).toBe(2);
    expect(result.startSnapDistanceM).toBe(Infinity);
    expect(result.endSnapDistanceM).toBe(Infinity);
  });

  it('returns no route when computeRoute is called with only one endpoint defined', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.01, 0] }],
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
    ];
    const graph = { nodes, edges };
    const result = await computeRoute(undefined, [0.01, 0], graph, { costField: 'distance' });

    expect(result.found).toBe(false);
    expect(result.reason).toBe('no_node');
  });

  it('prefers a closer segment projection over a farther nearest node', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.02, 0] }],
      [2, { id: 2, coords: [0.01, 0.0003] }],
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
    ];
    const graph = { nodes, edges };
    const startCoords = [0.01, 0.00009];
    const endCoords = [0.02, 0];

    const result = prepareRoutableGraph(graph, startCoords, endCoords, {
      maxAcceptableSnapDistanceM: 120,
    });

    expect(result.startId).toBe(3);
    expect(result.graph.nodes.size).toBe(4);
    expect(result.startSnapDistanceM).toBeLessThan(15);
    expect(result.endId).toBe(1);
  });

  it('uses segment-projected end nodes even when a closer real node exists for the start location', () => {
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
    const startCoords = [0.02, 0.02];
    const endCoords = [0.0001, 0.0001];

    const result = prepareRoutableGraph(graph, startCoords, endCoords);

    expect(result.endId).toBe(4);
    expect(result.graph.nodes.size).toBe(5);
    expect(result.endSnapDistanceM).toBeGreaterThan(0);
    expect(result.endSnapDistanceM).toBeLessThanOrEqual(60);
    expect(result.startId).toBe(3);
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
    expect(result.coordinates[0]).toEqual([0.0001, 0]);
    expect(result.path[0]).toBe(4);
    expect(result.startSnapDistanceM).toBeGreaterThan(0);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(60);
  });

  it('uses segment-projected start nodes even when the start point is near a different nearby node', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.02, 0] }],
      [2, { id: 2, coords: [0, 0.00018] }],
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
    ];
    const graph = { nodes, edges };
    const startCoords = [0.00005, 0.00018];
    const endCoords = [0.02, 0];

    const result = await computeRoute(startCoords, endCoords, graph, { costField: 'distance' });

    expect(result.found).toBe(true);
    expect(result.coordinates[0]).toEqual([0.00005, 0]);
    expect(result.startSnapDistanceM).toBeGreaterThan(0);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(60);
    expect(result.path[0]).toBe(3);
  });

  it('supports segment snapping on both start and end coordinates with sequential edge augmentation', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.02, 0] }],
      [2, { id: 2, coords: [0.04, 0] }],
      [3, { id: 3, coords: [0, 0.02] }],
      [4, { id: 4, coords: [0.02, 0.02] }],
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
        cost: 1111,
        reverseCost: 1111,
        length: 1111,
        speed: 50,
        travelTime: 1111 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0.007, 0.0002];
    const endCoords = [0.033, 0.0002];

    const result = await computeRoute(startCoords, endCoords, graph, { costField: 'distance' });

    expect(result.found).toBe(true);
    expect(result.path[0]).toBe(5);
    expect(result.path[result.path.length - 1]).toBe(6);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(60);
    expect(result.endSnapDistanceM).toBeLessThanOrEqual(60);
  });

  it('supports reversing a successfully snapped route using its snapped endpoints', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.02, 0] }],
      [2, { id: 2, coords: [0.04, 0] }],
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
        source: 1,
        target: 2,
        cost: 1113,
        reverseCost: 1113,
        length: 1113,
        speed: 50,
        travelTime: 1113 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const forwardStart = [0.005, 0.0002];
    const forwardEnd = [0.035, 0.0002];

    const forward = await computeRoute(forwardStart, forwardEnd, graph, { costField: 'distance' });
    expect(forward.found).toBe(true);
    expect(forward.coordinates[0]).toEqual([0.005, 0]);
    expect(forward.coordinates[forward.coordinates.length - 1]).toEqual([0.035, 0]);

    const reversed = await computeRoute(
      forward.coordinates[forward.coordinates.length - 1],
      forward.coordinates[0],
      graph,
      { costField: 'distance' }
    );

    expect(reversed.found).toBe(true);
    expect(reversed.coordinates[0]).toEqual([0.035, 0]);
    expect(reversed.coordinates[reversed.coordinates.length - 1]).toEqual([0.005, 0]);
  });

  it('re-evaluates the second endpoint using the full search radius after a start segment snap', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.01, 0] }],
      [2, { id: 2, coords: [0.02, 0] }],
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
        source: 1,
        target: 2,
        cost: 1113,
        reverseCost: 1113,
        length: 1113,
        speed: 50,
        travelTime: 1113 / (50 / 3.6),
        properties: {},
        fibonacciScore: 1,
      },
    ];
    const graph = { nodes, edges };
    const startCoords = [0.005, 0.0002];
    const endCoords = [0.021, 0.0001];

    const result = await computeRoute(startCoords, endCoords, graph, {
      costField: 'distance',
      maxAcceptableSnapDistanceM: 120,
    });

    expect(result.found).toBe(true);
    expect(result.coordinates[0]).toEqual([0.005, 0]);
    expect(result.coordinates[result.coordinates.length - 1]).toEqual([0.02, 0]);
  });

  it('keeps augmented graph edges as a true array after segment snapping', async () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.01, 0] }],
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
    ];
    const graph = { nodes, edges };
    const startCoords = [0.005, 0.0008];
    const endCoords = [0.01, 0];

    const result = prepareRoutableGraph(graph, startCoords, endCoords, {
      maxAcceptableSnapDistanceM: 120,
    });

    expect(Array.isArray(result.graph.edges)).toBe(true);
    expect(result.graph.edges.length).toBe(edges.length + 1);
    expect(result.graph.edges.slice).toBeDefined();
    expect(result.graph.edges.map((edge) => edge.source)).toEqual([0, 2]);
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

  it('uses an existing node when the closest projection lands exactly at a segment endpoint', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [0.01, 0] }],
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
    ];
    const graph = { nodes, edges };
    const startCoords = [0.0102, 0.00005];
    const endCoords = [0, 0];

    const result = prepareRoutableGraph(graph, startCoords, endCoords, {
      maxAcceptableSnapDistanceM: 120,
    });

    expect(result.startId).toBe(1);
    expect(result.graph.nodes.size).toBe(2);
    expect(result.startSnapDistanceM).toBeGreaterThan(0);
    expect(result.startSnapDistanceM).toBeLessThanOrEqual(120);
    expect(result.endId).toBe(0);
  });

  it('returns no path when the closest segment snap lies on a disconnected edge', async () => {
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

    expect(result.found).toBe(false);
    expect(result.reason).toBe('no_path');
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
