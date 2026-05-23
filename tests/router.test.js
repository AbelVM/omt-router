import { describe, expect, it } from 'vitest';
import {
  buildCH,
  validateRouteResult,
  prepareGraph,
  computeRoute,
  RouteFailureReason,
  ensureAdjCostMap,
} from '../src/engines/router.js';

function createSimpleGraph() {
  const nodes = new Map([
    [0, { coords: [0, 0] }],
    [1, { coords: [1, 0] }],
  ]);
  const edges = [{ source: 0, target: 1, cost: 1, length: 10, travelTime: 5, reverseCost: -1 }];
  return { nodes, edges, mode: 'car' };
}

function createGraphWithDuplicateEdges() {
  const nodes = new Map([
    [0, { coords: [0, 0] }],
    [1, { coords: [1, 0] }],
  ]);
  const edges = [
    { source: 0, target: 1, cost: 1, length: 10, travelTime: 5, reverseCost: -1 },
    { source: 0, target: 1, cost: 1, length: 10, travelTime: 5, reverseCost: -1 },
  ];
  return { nodes, edges, mode: 'car' };
}

describe('router utilities', () => {
  it('builds a prepared graph with adjacency and cost map', () => {
    const graph = createSimpleGraph();
    const prepared = buildCH(graph, 'distance');

    expect(prepared.N).toBe(2);
    expect(prepared.E).toBe(1);
    expect(Array.from(prepared.adjTo)).toEqual([1]);
    expect(Array.from(prepared.adjCost)).toEqual([100]);
    expect(ensureAdjCostMap(prepared)[0]).toEqual([1, 100]);
  });

  it('validates missing route results and invalid cost paths', () => {
    const graph = createSimpleGraph();
    const prepared = buildCH(graph, 'distance');

    const missingResult = validateRouteResult(null, prepared);
    expect(missingResult.valid).toBe(false);
    expect(missingResult.reason).toBe(RouteFailureReason.MISSING_RESULT);

    const wrongPath = validateRouteResult({ found: true, path: [0, 0, 1], cost: 1 }, prepared, {
      startId: 0,
      endId: 1,
    });
    expect(wrongPath.valid).toBe(false);
    expect(wrongPath.reason).toBe(RouteFailureReason.INVALID_PATH);
  });

  it('detects endpoint mismatches and cost mismatches', () => {
    const graph = createSimpleGraph();
    const prepared = buildCH(graph, 'distance');

    const mismatch = validateRouteResult({ found: true, path: [1, 0], cost: 1 }, prepared, {
      startId: 0,
      endId: 1,
    });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.reason).toBe(RouteFailureReason.ENDPOINT_MISMATCH);

    const costMismatch = validateRouteResult({ found: true, path: [0, 1], cost: 100 }, prepared, {
      startId: 0,
      endId: 1,
    });
    expect(costMismatch.valid).toBe(false);
    expect(costMismatch.reason).toBe(RouteFailureReason.COST_MISMATCH);
  });

  it('prepares graph with a penalty key and returns expected fields', () => {
    const graph = createSimpleGraph();
    const prepared = prepareGraph(graph, 'distance');

    expect(prepared.penaltyKey).toBe('none');
    expect(prepared.N).toBe(2);
    expect(prepared.adjPtr.length).toBe(3);
  });

  it('deduplicates repeated edges when building the prepared graph', () => {
    const graph = createGraphWithDuplicateEdges();
    const prepared = buildCH(graph, 'distance');

    expect(prepared.E).toBe(1);
    expect(Array.from(prepared.adjTo)).toEqual([1]);
    expect(Array.from(prepared.adjCost)).toEqual([100]);
    expect(prepared.adjPtr[0]).toBe(0);
    expect(prepared.adjPtr[1]).toBe(1);
  });

  it('throws when computeRoute receives an invalid graph object', async () => {
    await expect(computeRoute([0, 0], [1, 1], null)).rejects.toThrow(
      'Invalid graph: expected object with nodes Map and edges array.'
    );
  });

  it('returns a valid route when origin and destination snap to the same node', async () => {
    const graph = createSimpleGraph();
    const result = await computeRoute([0, 0], [0, 0], graph);

    expect(result.found).toBe(true);
    expect(result.path).toEqual([0]);
    expect(result.cost).toBe(0);
    expect(result.engine).toBe('bidirectional-astar');
  });
});
