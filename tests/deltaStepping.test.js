import { describe, expect, it } from 'vitest';
import { deltaSteppingRouter } from '../src/engines/DeltaStepping/index.js';

describe('DeltaStepping routing', () => {
  it('finds a path with serial delta stepping when no workers are available', async () => {
    const prepared = {
      adjPtr: [0, 1, 2, 2],
      adjTo: [1, 2],
      adjCost: [20, 20],
      N: 3,
      costField: 'distance',
    };

    const result = await deltaSteppingRouter(0, 2, prepared, {
      forceSerialRouting: true,
      minFrontierForParallel: 1,
    });

    expect(result.found).toBe(true);
    expect(result.path).toEqual([0, 1, 2]);
    expect(result.cost).toBe(4);
    expect(result.engine).toBe('deltaStepping');
    expect(result.parallelUsed).toBe(false);
  });

  it('returns no path when the target is unreachable', async () => {
    const prepared = {
      adjPtr: [0, 0, 0, 0],
      adjTo: [],
      adjCost: [],
      N: 3,
      costField: 'distance',
    };

    const result = await deltaSteppingRouter(0, 2, prepared);

    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
    expect(result.cost).toBe(Infinity);
  });
});
