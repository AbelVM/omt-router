import { describe, expect, it } from 'vitest';
import {
  buildCH,
  validateRouteResult,
  queryRoute,
  ensureAdjCostMap,
} from '../src/engines/router.js';

describe('router utilities', () => {
  it('buildCH computes optimal travel time costs and builds a map lookup for multi-edge nodes', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [1, 0] }],
      [2, { id: 2, coords: [2, 0] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 100,
        reverseCost: 100,
        length: 100,
        travelTime: 50,
        properties: { class: 'primary' },
        fibonacciScore: 1,
      },
      {
        source: 0,
        target: 1,
        cost: 100,
        reverseCost: 100,
        length: 100,
        travelTime: 60,
        properties: { class: 'secondary' },
        fibonacciScore: 2,
      },
      {
        source: 1,
        target: 2,
        cost: 200,
        reverseCost: -1,
        length: 200,
        travelTime: 100,
        properties: { class: 'motorway' },
        fibonacciScore: 3,
      },
    ];

    const prepared = buildCH({ nodes, edges, mode: 'car' }, 'optimal');

    expect(prepared.N).toBe(3);
    expect(prepared.E).toBeGreaterThan(0);
    const adjCostMap = ensureAdjCostMap(prepared);
    expect(Array.isArray(adjCostMap[0])).toBe(true);
    expect(adjCostMap[1]).toBeInstanceOf(Map);
    expect(adjCostMap[1].get(0)).toBeGreaterThan(0);
  });

  it('validates route results and returns endpoint mismatch when endpoints are wrong', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [1, 0] }],
    ]);
    const prepared = buildCH(
      {
        nodes,
        edges: [
          {
            source: 0,
            target: 1,
            cost: 100,
            reverseCost: -1,
            length: 100,
            travelTime: 100,
            properties: {},
            fibonacciScore: 1,
          },
        ],
      },
      'distance'
    );

    const result = validateRouteResult({ found: true, path: [1, 0], cost: 10 }, prepared, {
      startId: 0,
      endId: 1,
    });
    expect(result).toEqual({ valid: false, actualCost: null, reason: 'endpoint_mismatch' });
  });

  it('returns invalid path and cost mismatch for malformed or incorrect path costs', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [1, 0] }],
    ]);
    const prepared = buildCH(
      {
        nodes,
        edges: [
          {
            source: 0,
            target: 1,
            cost: 100,
            reverseCost: -1,
            length: 100,
            travelTime: 100,
            properties: {},
            fibonacciScore: 1,
          },
        ],
      },
      'distance'
    );

    const invalidResult = validateRouteResult({ found: true, path: [0, 2], cost: 100 }, prepared);
    expect(invalidResult.reason).toBe('invalid_path');

    const mismatchResult = validateRouteResult({ found: true, path: [0, 1], cost: 5 }, prepared);
    expect(mismatchResult.valid).toBe(false);
    expect(mismatchResult.reason).toBe('cost_mismatch');
  });

  it('detects cost mismatch via CSR edge scan when reported cost is wrong', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [1, 0] }],
      [2, { id: 2, coords: [2, 0] }],
    ]);
    const edges = [
      {
        source: 0,
        target: 1,
        cost: 100,
        reverseCost: -1,
        length: 100,
        travelTime: 100,
        properties: { class: 'secondary' },
        fibonacciScore: 1,
      },
      {
        source: 1,
        target: 2,
        cost: 200,
        reverseCost: -1,
        length: 200,
        travelTime: 200,
        properties: { class: 'primary' },
        fibonacciScore: 1,
      },
      {
        source: 1,
        target: 0,
        cost: 150,
        reverseCost: -1,
        length: 150,
        travelTime: 150,
        properties: { class: 'primary' },
        fibonacciScore: 1,
      },
    ];

    const prepared = buildCH({ nodes, edges, mode: 'car' }, 'optimal');
    const resultCost = validateRouteResult({ found: true, path: [0, 1, 2], cost: 3 }, prepared);
    expect(resultCost.valid).toBe(false);
    expect(resultCost.reason).toBe('cost_mismatch');
  });

  it('validates a successful route result when path and cost match', () => {
    const nodes = new Map([
      [0, { id: 0, coords: [0, 0] }],
      [1, { id: 1, coords: [1, 0] }],
      [2, { id: 2, coords: [2, 0] }],
    ]);
    const prepared = buildCH(
      {
        nodes,
        edges: [
          {
            source: 0,
            target: 1,
            cost: 100,
            reverseCost: -1,
            length: 100,
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
            travelTime: 200,
            properties: {},
            fibonacciScore: 1,
          },
        ],
      },
      'distance'
    );

    const validResult = validateRouteResult({ found: true, path: [0, 1, 2], cost: 300 }, prepared);
    expect(validResult.valid).toBe(true);
    expect(validResult.actualCost).toBe(300);
  });

  it('throws for invalid queryRoute arguments before engine selection', async () => {
    const nodes = new Map([[0, { id: 0, coords: [0, 0] }]]);
    const prepared = buildCH({ nodes, edges: [] }, 'distance');

    await expect(queryRoute(-1, 0, prepared)).rejects.toThrow('Invalid startId');
    await expect(queryRoute(0, -1, prepared)).rejects.toThrow('Invalid endId');
    await expect(queryRoute(0, 0, {})).rejects.toThrow('Invalid prepared graph object');
  });
});
