import { describe, it, expect } from 'vitest';
import { adaptiveBarrierSSPRouter } from '../src/engines/AdaptiveBarrierSSSP/index.js';

describe('AdaptiveBarrierSSSP wrapper', () => {
  it('finds a path on a simple chain graph', async () => {
    const prepared = {
      // Node 0 -> 1 -> 2
      adjPtr: [0, 1, 2, 2],
      adjTo: [1, 2],
      // costs expressed as integer-scaled values (DIST_SCALE=10 in router)
      adjCost: [100, 200],
      // reverse adjacency for path reconstruction
      revAdjPtr: [0, 0, 1, 2],
      revAdjFrom: [0, 1],
      revAdjCost: [100, 200],
      N: 3,
    };

    const res = await adaptiveBarrierSSPRouter(0, 2, prepared, { forceSerialRouting: true });
    expect(res.found).toBe(true);
    expect(res.path).toEqual([0, 1, 2]);
    // cost = (100 + 200) / DIST_SCALE(10) = 30
    expect(res.cost).toBeCloseTo(30);
    expect(res.engine).toBe('adaptiveBarrier');
  });

  it('returns not found when destination unreachable', async () => {
    const prepared = {
      adjPtr: [0, 0, 0, 0],
      adjTo: [],
      adjCost: [],
      revAdjPtr: [0, 0, 0, 0],
      revAdjFrom: [],
      revAdjCost: [],
      N: 3,
    };

    const res = await adaptiveBarrierSSPRouter(0, 2, prepared, { forceSerialRouting: true });
    expect(res.found).toBe(false);
    expect(res.path).toEqual([]);
    expect(res.cost).toBe(Infinity);
  });

  it('reconstructs a valid path even when reverse adjacency contains a zero-cost cycle', async () => {
    const prepared = {
      adjPtr: [0, 1, 2, 4, 4],
      adjTo: [1, 2, 1, 3],
      adjCost: [10, 0, 0, 10],
      revAdjPtr: [0, 0, 2, 3, 4],
      revAdjFrom: [0, 2, 1, 2],
      revAdjCost: [10, 0, 0, 10],
      N: 4,
    };

    const res = await adaptiveBarrierSSPRouter(0, 3, prepared, { forceSerialRouting: true });
    expect(res.found).toBe(true);
    expect(res.path).toEqual([0, 1, 2, 3]);
    expect(res.cost).toBeCloseTo(2);
  });
});
