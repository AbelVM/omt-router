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
    const makeEdge = (s, t, length = 1) => ({ id: edges.length, source: s, target: t, cost: length, reverseCost: length, length, speed: 10, travelTime: length / (10 / 3.6), properties: {} });

    edges.push(makeEdge(0, 1));
    edges.push(makeEdge(1, 2));
    edges.push(makeEdge(2, 3));
    edges.push(makeEdge(3, 0));

    const graph = { nodes, edges, mode: 'car' };

    // The isoline implementation returns a GeoJSON FeatureCollection.
    // Verify the shape and that a numeric `value` property exists on
    // the first produced feature.
    const res = await isoline({ point: [0, 0], direction: 'from', mode: 'car', costField: 'distance', engineId: 'auto', graph, maxCost: 1.5 });
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
    edges.push({ id: edges.length, source: 0, target: 1, length: 1, reverseCost: -1, cost: 1, speed: 10, travelTime: 1 / (10 / 3.6), properties: {} });
    // 1 -> 2 (one-way)
    edges.push({ id: edges.length, source: 1, target: 2, length: 1, reverseCost: -1, cost: 1, speed: 10, travelTime: 1 / (10 / 3.6), properties: {} });
    // 2 -> 3 (one-way)
    edges.push({ id: edges.length, source: 2, target: 3, length: 1, reverseCost: -1, cost: 1, speed: 10, travelTime: 1 / (10 / 3.6), properties: {} });

    const graph = { nodes, edges, mode: 'car' };
    const prepared = buildCH(graph, 'distance');

    const fromRes = isoPHAST(prepared, 1, 2, { direction: 'from', mode: 'car', outputUnscaled: true });
    const toRes = isoPHAST(prepared, 1, 2, { direction: 'to', mode: 'car', outputUnscaled: true });

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
    edges.push({ id: 0, source: 1, target: 0, length: 1, reverseCost: -1, cost: 1, speed: 10, travelTime: 1 / (10 / 3.6), properties: {} });

    const graph = { nodes, edges, mode: 'car' };
    const prepared = buildCH(graph, 'distance');

    const _carRes = isoPHAST(prepared, 0, 1.5, { direction: 'from', mode: 'car', outputUnscaled: true });
    const _pedRes = isoPHAST(prepared, 0, 1.5, { direction: 'from', mode: 'pedestrian', outputUnscaled: true });

    // invoke pedestrian mode which should trigger a CH rebuild marked undirected
    const pedRes2 = isoPHAST(prepared, 0, 1.5, { direction: 'from', mode: 'pedestrian', outputUnscaled: true });
    expect(prepared._chGraphMode).toBe('pedestrian');
    expect(prepared._chGraphIsUndirected).toBeTruthy();
    expect(pedRes2.reachable).toBeDefined();
  });
});
