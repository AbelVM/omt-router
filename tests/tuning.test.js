import { describe, expect, it, vi } from 'vitest';
import {
  findTopTwoIndices,
  resolveMlFeatureValues,
  shouldUseParallelForEngine,
  getParallelPolicyForEngine,
} from '../src/tuning/tuning.js';

describe('tuning utilities', () => {
  it('findTopTwoIndices returns safe defaults for empty and single-element arrays', () => {
    expect(findTopTwoIndices([])).toEqual({ bestIndex: -1, secondIndex: -1 });
    expect(findTopTwoIndices([0.5])).toEqual({ bestIndex: 0, secondIndex: 0 });
    expect(findTopTwoIndices([0.1, 0.9, 0.3])).toEqual({ bestIndex: 1, secondIndex: 2 });
  });

  it('resolves ML feature values with fallback logic and log features', () => {
    const values = resolveMlFeatureValues({
      safeN: 2,
      safeE: 5,
      haversineDistance: 2500,
      averageNodeDegree: 4,
      sourceDegree: 2,
      targetDegree: 4,
      sourceCentrality: 1,
      targetCentrality: 2,
    });

    expect(values.safeN).toBe(2);
    expect(values.safeBeelineKm).toBeCloseTo(2.5);
    expect(values.logBeelineKm).toBeCloseTo(Math.log1p(2.5));
    expect(values.sizeRatioEN).toBeCloseTo(2.5);
    expect(values.coverageEmptyContrast).toBe(0);
    expect(values.logSourceTargetDegreeRatio).toBeCloseTo(Math.log1p(0.5));
  });

  it('tolerates invalid feature input without throwing', () => {
    expect(() => resolveMlFeatureValues(null)).not.toThrow();
    const values = resolveMlFeatureValues(null);
    expect(values.safeN).toBe(1);
    expect(values.safeBeelineKm).toBeCloseTo(0.25);
  });

  it('returns correct parallel decisions for supported engines', () => {
    expect(shouldUseParallelForEngine('delta-stepping', true)).toBe(true);
    expect(shouldUseParallelForEngine('adaptive-barrier', true)).toBe(false);
    expect(shouldUseParallelForEngine('ultra-dijkstra', true)).toBe(false);
    expect(shouldUseParallelForEngine('delta-stepping', false)).toBe(false);
    expect(getParallelPolicyForEngine('delta-stepping', true)).toEqual({
      minFrontierForParallel: 256,
    });
    expect(getParallelPolicyForEngine('adaptive-barrier', true)).toBeNull();
  });

  it('loads a browser runtime and selects a best engine using the ML model cache', async () => {
    vi.resetModules();

    const browserGlobals = {
      window: {},
      navigator: {},
      SharedArrayBuffer,
      Worker: class {},
      crossOriginIsolated: true,
    };

    for (const [key, value] of Object.entries(browserGlobals)) {
      vi.stubGlobal(key, value);
    }

    const tuning = await import('../src/tuning/tuning.js');
    expect(tuning.hasParallelRoutingRuntime()).toBe(true);
    const engine = tuning.selectBestEngine({ safeN: 10, haversineDistance: 1000 });
    expect(typeof engine).toBe('string');

    vi.unstubAllGlobals();
  });
});
