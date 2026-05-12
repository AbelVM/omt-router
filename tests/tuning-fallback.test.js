import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  findTopTwoIndices,
  resolveMlFeatureValues,
  hasParallelRoutingRuntime,
  shouldUseParallelForEngine,
  getParallelPolicyForEngine,
} from '../src/tuning/tuning.js';

async function loadTuningWithMock(modelMock) {
  vi.resetModules();
  vi.doMock('../src/tuning/model.js', () => ({
    __esModule: true,
    ROUTER_TUNING_ML_MODEL: modelMock,
  }));

  return import('../src/tuning/tuning.js');
}

describe('tuning fallback helpers', () => {
  it('returns -1 indices for an empty probability array', () => {
    expect(findTopTwoIndices([])).toEqual({ bestIndex: -1, secondIndex: -1 });
  });

  it('returns the same index for a single probability value', () => {
    expect(findTopTwoIndices([0.42])).toEqual({ bestIndex: 0, secondIndex: 0 });
  });

  it('uses fallback defaults when feature values are missing or invalid', () => {
    const result = resolveMlFeatureValues({
      nodeCount: NaN,
      edgeCount: Infinity,
      averageNodeDegree: NaN,
      haversineDistance: NaN,
      globalCoverage: undefined,
      sourceDegree: NaN,
      targetDegree: NaN,
      sourceCentrality: NaN,
      targetCentrality: NaN,
    });

    expect(result.safeN).toBe(1);
    expect(result.safeE).toBe(1);
    expect(result.safeBeelineKm).toBeCloseTo(0.25);
    expect(result.sourceTargetDegreeRatio).toBe(0);
    expect(result.sourceTargetCentralityRatio).toBe(0);
    expect(result.edgesPerKm).toBeCloseTo(4);
    expect(result.logE).toBe(Math.log1p(1));
  });

  it('computes a full feature normalization path for valid values', () => {
    const result = resolveMlFeatureValues({
      safeN: 10,
      safeE: 20,
      safeBeelineKm: 5,
      beelinePerNode: 0.5,
      edgesPerKm: 10,
      nodesPerKm: 2,
      sizeRatioEN: 2,
      globalCoverage: 0.8,
      emptyRatio: 0.1,
      avgBranchFactor: 3,
      relativeDensity: 1.2,
      sourceDegree: 4,
      targetDegree: 5,
      sourceCentrality: 2,
      targetCentrality: 3,
      sourceTargetDegreeRatio: 0.8,
      sourceTargetCentralityRatio: 0.67,
      nodeCount: 10,
      edgeCount: 20,
      averageNodeDegree: 2,
      haversineDistance: 1000,
    });

    expect(result.safeN).toBe(10);
    expect(result.safeE).toBe(20);
    expect(result.edgesPerKm).toBeCloseTo(10);
    expect(result.logSourceDegree).toBeCloseTo(Math.log1p(4));
    expect(result.logGlobalCoverage).toBeCloseTo(Math.log1p(0.8));
  });

  it('returns no parallel runtime by default on Node and selects fallback engines', async () => {
    expect(hasParallelRoutingRuntime()).toBe(false);

    const { selectDistanceEngineNoParallel, selectDistanceEngineParallel, selectBestEngine } =
      await loadTuningWithMock({ featureOrder: [], profiles: {} });

    expect(selectDistanceEngineNoParallel({})).toBe('adaptive-barrier');
    expect(selectDistanceEngineParallel({})).toBe('ultra-dijkstra');
    expect(selectBestEngine({})).toBe('adaptive-barrier');
  });

  it('uses parallel policy only when the engine supports it', () => {
    expect(shouldUseParallelForEngine('delta-stepping', true)).toBe(true);
    expect(getParallelPolicyForEngine('delta-stepping', true)).toEqual({
      minFrontierForParallel: 256,
    });
    expect(shouldUseParallelForEngine('adaptive-barrier', true)).toBe(false);
    expect(getParallelPolicyForEngine('adaptive-barrier', true)).toBeNull();
  });

  it('finds top two indices when the highest probability is later in the array', () => {
    expect(findTopTwoIndices([0.1, 0.6, 0.5, 0.2])).toEqual({
      bestIndex: 1,
      secondIndex: 2,
    });
  });

  it('falls back to haversine distance when safeBeelineKm is invalid', () => {
    const result = resolveMlFeatureValues({
      safeN: 6,
      edgeCount: 12,
      safeBeelineKm: NaN,
      haversineDistance: 3000,
      averageNodeDegree: 2,
      globalCoverage: 0.5,
      sourceDegree: 1,
      targetDegree: 2,
      sourceCentrality: 1,
      targetCentrality: 2,
    });

    expect(result.safeBeelineKm).toBeCloseTo(3);
    expect(result.edgesPerKm).toBeCloseTo(4);
    expect(result.nodesPerKm).toBeCloseTo(2);
  });

  it('falls back to the default distance engine when ML confidence is too low in browser runtime', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('SharedArrayBuffer', SharedArrayBuffer);
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('crossOriginIsolated', true);

    const { selectDistanceEngineNoParallel } = await loadTuningWithMock({
      featureOrder: ['f1'],
      profiles: {
        sabOff: {
          modelType: 'runtime-linear',
          runtimeFeatureOrder: ['f1'],
          runtimeScalerMean: [0],
          runtimeScalerScale: [1],
          classes: ['adaptive-barrier', 'ultra-dijkstra'],
          regressors: {
            'adaptive-barrier': { intercept: 0, coefficients: [-1] },
            'ultra-dijkstra': { intercept: 0, coefficients: [1] },
          },
          fallbackEngine: 'adaptive-barrier',
          minConfidence: 0.99,
          minMargin: 0.2,
        },
      },
    });

    expect(selectDistanceEngineNoParallel({ f1: 2 })).toBe('adaptive-barrier');
  });

  it('selects a predicted engine in browser runtime when ML probabilities are strong', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('SharedArrayBuffer', SharedArrayBuffer);
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('crossOriginIsolated', true);

    const { selectDistanceEngineParallel } = await loadTuningWithMock({
      featureOrder: ['f1'],
      profiles: {
        sabOn: {
          modelType: 'runtime-linear',
          runtimeFeatureOrder: ['f1'],
          runtimeScalerMean: [0],
          runtimeScalerScale: [1],
          classes: ['adaptive-barrier', 'ultra-dijkstra'],
          regressors: {
            'adaptive-barrier': { intercept: 0, coefficients: [1] },
            'ultra-dijkstra': { intercept: 0, coefficients: [-1] },
          },
          fallbackEngine: 'ultra-dijkstra',
          minConfidence: 0,
          minMargin: 0,
        },
      },
    });

    expect(selectDistanceEngineParallel({ f1: 2 })).toBe('ultra-dijkstra');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });
});
