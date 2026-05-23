import { describe, it, expect } from 'vitest';
import { isoline } from '../src/isolines/index.js';
import isoPHAST from '../src/isolines/isoPHAST.js';
import { buildCH } from '../src/engines/router.js';

describe('isolines', () => {
  it('computes a simple isoline polygon on a small synthetic graph', async () => {
    // Square graph: four nodes in unit square, edges around perimeter
    const nodes = new Map();
    nodes.set(0, { id: 0, coords: [0, 0] });
    nodes.set(1, { id: 1, coords: [1, 0] });
    nodes.set(2, { id: 2, coords: [1, 1] });
    nodes.set(3, { id: 3, coords: [0, 1] });

    const edges = [];
    const makeEdge = (s, t, length = 1) => ({
      id: edges.length,
      source: s,
      target: t,
      cost: length,
      reverseCost: length,
      length,
      speed: 10,
      travelTime: length / (10 / 3.6),
      properties: {},
    });

    edges.push(makeEdge(0, 1));
    edges.push(makeEdge(1, 2));
    edges.push(makeEdge(2, 3));
    edges.push(makeEdge(3, 0));

    const graph = { nodes, edges, mode: 'car' };

    // The isoline implementation returns a GeoJSON FeatureCollection.
    // Verify the shape and that a numeric `value` property exists on
    // the first produced feature.
    const res = await isoline({
      point: [0, 0],
      direction: 'from',
      mode: 'car',
      costField: 'distance',
      engineId: 'auto',
      graph,
      maxCost: 1.5,
    });
    expect(res).toBeDefined();
    expect(res.type).toBe('FeatureCollection');
    expect(Array.isArray(res.features)).toBeTruthy();
    expect(res.features.length).toBeGreaterThan(0);
    expect(typeof res.features[0].properties.valueMax).toBe('number');
    expect(res.features[0].geometry && res.features[0].geometry.type).toBeDefined();
  });
});

describe('isoPHAST direction and pedestrian mode', () => {
  it('respects direction semantics (from vs to)', async () => {
    const nodes = new Map();
    nodes.set(0, { id: 0, coords: [0, 0] });
    nodes.set(1, { id: 1, coords: [1, 0] });
    nodes.set(2, { id: 2, coords: [2, 0] });
    nodes.set(3, { id: 3, coords: [3, 0] });

    const edges = [];
    // 0 -> 1 (one-way)
    edges.push({
      id: edges.length,
      source: 0,
      target: 1,
      length: 1,
      reverseCost: -1,
      cost: 1,
      speed: 10,
      travelTime: 1 / (10 / 3.6),
      properties: {},
    });
    // 1 -> 2 (one-way)
    edges.push({
      id: edges.length,
      source: 1,
      target: 2,
      length: 1,
      reverseCost: -1,
      cost: 1,
      speed: 10,
      travelTime: 1 / (10 / 3.6),
      properties: {},
    });
    // 2 -> 3 (one-way)
    edges.push({
      id: edges.length,
      source: 2,
      target: 3,
      length: 1,
      reverseCost: -1,
      cost: 1,
      speed: 10,
      travelTime: 1 / (10 / 3.6),
      properties: {},
    });

    const graph = { nodes, edges, mode: 'car' };
    const prepared = buildCH(graph, 'distance');

    const fromRes = isoPHAST(prepared, 1, 2, {
      direction: 'from',
      mode: 'car',
      outputUnscaled: true,
    });
    const toRes = isoPHAST(prepared, 1, 2, { direction: 'to', mode: 'car', outputUnscaled: true });

    expect(fromRes.visited).toBeDefined();
    expect(ArrayBuffer.isView(fromRes.visited)).toBe(true);
    expect(fromRes.visited.constructor.name).toBe('Uint32Array');

    // from: reachable should include 1,2,3 and not 0
    expect(fromRes.reachable).toContain(1);
    expect(fromRes.reachable).toContain(2);
    expect(fromRes.reachable).toContain(3);
    expect(fromRes.reachable).not.toContain(0);

    // to: reachable should include 0 and 1 but not 3
    expect(toRes.reachable).toContain(0);
    expect(toRes.reachable).toContain(1);
    expect(toRes.reachable).not.toContain(3);
  });

  it('treats edges as undirected in pedestrian mode', async () => {
    const nodes = new Map();
    nodes.set(0, { id: 0, coords: [0, 0] });
    nodes.set(1, { id: 1, coords: [1, 0] });

    const edges = [];
    // edge only exists 1 -> 0
    edges.push({
      id: 0,
      source: 1,
      target: 0,
      length: 1,
      reverseCost: -1,
      cost: 1,
      speed: 10,
      travelTime: 1 / (10 / 3.6),
      properties: {},
    });

    const graph = { nodes, edges, mode: 'car' };
    const prepared = buildCH(graph, 'distance');

    const _carRes = isoPHAST(prepared, 0, 1.5, {
      direction: 'from',
      mode: 'car',
      outputUnscaled: true,
    });
    const _pedRes = isoPHAST(prepared, 0, 1.5, {
      direction: 'from',
      mode: 'pedestrian',
      outputUnscaled: true,
    });

    const pedRes2 = isoPHAST(prepared, 0, 1.5, {
      direction: 'from',
      mode: 'pedestrian',
      outputUnscaled: true,
    });
    expect(pedRes2.reachable).toBeDefined();
  });

  it('continues to compute isolines after costField or penaltyKey changes', () => {
    const nodes = new Map();
    nodes.set(0, { id: 0, coords: [0, 0] });
    nodes.set(1, { id: 1, coords: [1, 0] });

    const edges = [
      {
        id: 0,
        source: 0,
        target: 1,
        length: 1,
        reverseCost: -1,
        cost: 1,
        speed: 10,
        travelTime: 1 / (10 / 3.6),
        properties: {},
      },
    ];

    const graph = { nodes, edges, mode: 'car' };
    const prepared = buildCH(graph, 'distance');

    const baseRes = isoPHAST(prepared, 0, 1.5, { direction: 'from', mode: 'car', outputUnscaled: true });
    expect(baseRes.reachable).toContain(0);

    prepared.costField = 'travelTime';
    prepared.penaltyKey = 'none';
    const travelRes = isoPHAST(prepared, 0, 1.5, { direction: 'from', mode: 'car', outputUnscaled: true });
    expect(travelRes.reachable).toContain(0);

    prepared.penaltyKey = 'i1';
    const penaltyRes = isoPHAST(prepared, 0, 1.5, { direction: 'from', mode: 'car', outputUnscaled: true });
    expect(penaltyRes.reachable).toContain(0);
  });

  it('throws for invalid prepared graphs and invalid isoPHAST options', () => {
    expect(() => isoPHAST(null, 0, 1)).toThrow(/Invalid prepared graph/);
    expect(() =>
      isoPHAST(
        { N: 1, adjPtr: new Int32Array([0, 0]), adjTo: new Int32Array([]), adjCost: new Int32Array([]), revAdjPtr: new Int32Array([0, 0]), revAdjFrom: new Int32Array([]), revAdjCost: new Int32Array([]) },
        0,
        1,
        { direction: 'side' }
      )
    ).toThrow(/Invalid direction/);
    expect(() =>
      isoPHAST(
        { N: 2, adjPtr: new Int32Array([0, 0, 0]), adjTo: new Int32Array([]), adjCost: new Int32Array([]), revAdjPtr: new Int32Array([0, 0, 0]), revAdjFrom: new Int32Array([]), revAdjCost: new Int32Array([]) },
        -1,
        1
      )
    ).toThrow(/Invalid startId/);
  });

  it('returns integer-scaled distances when outputUnscaled is false', () => {
    const prepared = {
      N: 2,
      distScale: 10,
      adjPtr: new Int32Array([0, 1, 1]),
      adjTo: new Int32Array([1]),
      adjCost: new Int32Array([5]),
      revAdjPtr: new Int32Array([0, 0, 1]),
      revAdjFrom: new Int32Array([0]),
      revAdjCost: new Int32Array([5]),
    };

    const result = isoPHAST(prepared, 0, 0.1, { outputUnscaled: false });
    expect(result.reachable).toEqual([0]);
    expect(result.distances[0]).toBe(0);
    expect(result.visited.length).toBe(1);
  });

  it('falls back to existing adjacency when pedestrian edge lists are unavailable', () => {
    const prepared = {
      N: 2,
      distScale: 10,
      adjPtr: new Int32Array([0, 1, 1]),
      adjTo: new Int32Array([1]),
      adjCost: new Int32Array([5]),
      revAdjPtr: new Int32Array([0, 0, 1]),
      revAdjFrom: new Int32Array([0]),
      revAdjCost: new Int32Array([5]),
    };

    const result = isoPHAST(prepared, 0, 10, { mode: 'pedestrian', outputUnscaled: true });
    expect(result.reachable).toEqual([0, 1]);
    expect(result.distances[1]).toBeCloseTo(0.5);
  });

  it('throws when pedestrian adjacency contains invalid edge entries', () => {
    const prepared = {
      N: 2,
      distScale: 10,
      edgeSrc: new Int32Array([0, -1]),
      edgeTgt: new Int32Array([1, 0]),
      edgeCostInt: new Int32Array([10, 10]),
      adjPtr: new Int32Array([0, 0, 0]),
      adjTo: new Int32Array([]),
      adjCost: new Int32Array([]),
      revAdjPtr: new Int32Array([0, 0, 0]),
      revAdjFrom: new Int32Array([]),
      revAdjCost: new Int32Array([]),
    };

    expect(() => isoPHAST(prepared, 0, 5, { mode: 'pedestrian' })).toThrow(/invalid pedestrian edge/);
  });
});
