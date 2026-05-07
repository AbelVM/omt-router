import { ROUTER_TUNING_ML_MODEL } from './model.js';

const ML_MIN_CONFIDENCE_FLOOR = 0.36;
const ML_MIN_MARGIN_FLOOR = 0.04;

const PARALLEL_ENGINE_DEFAULTS = Object.freeze({
  'adaptive-barrier': Object.freeze({
    fallbackUseParallel: false,
    policy: Object.freeze({
      minNodesForParallel: 13000,
      minFrontierForParallel: 256,
    }),
  }),
  'delta-stepping': Object.freeze({
    fallbackUseParallel: true,
    policy: Object.freeze({
      minFrontierForParallel: 256,
    }),
  }),
});

export const ROUTER_TUNING = Object.freeze({
  parallelization: PARALLEL_ENGINE_DEFAULTS,
});

const IS_BROWSER_RUNTIME = typeof window !== 'undefined' && typeof navigator !== 'undefined';
const HAS_PARALLEL_ROUTING_RUNTIME = IS_BROWSER_RUNTIME &&
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof Worker !== 'undefined' &&
  typeof crossOriginIsolated === 'boolean' &&
  crossOriginIsolated;

const safeNumber = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const safeScale = (value) => (Number.isFinite(value) && Math.abs(value) > 1e-12 ? value : 1);

const RUNTIME_MODEL_PROFILE_CACHE = (() => {
  const profiles = ROUTER_TUNING_ML_MODEL?.profiles ?? {};
  const featureOrder = Array.isArray(ROUTER_TUNING_ML_MODEL?.featureOrder)
    ? ROUTER_TUNING_ML_MODEL.featureOrder
    : [];

  const cache = {};
  for (const profileKey in profiles) {
    const model = profiles[profileKey];
    if (!model || typeof model !== 'object') continue;

    const runtimeFeatureOrder = Array.isArray(model.runtimeFeatureOrder)
      ? model.runtimeFeatureOrder
      : featureOrder;
    const means = Array.isArray(model.runtimeScalerMean)
      ? model.runtimeScalerMean
      : Array.isArray(model.scaler_mean)
      ? model.scaler_mean
      : null;
    const scales = Array.isArray(model.runtimeScalerScale)
      ? model.runtimeScalerScale
      : Array.isArray(model.scaler_scale)
      ? model.scaler_scale
      : null;
    const classes = Array.isArray(model.classes) ? model.classes : null;
    const regressors = model.runtimeRegressors || model.regressors;
    const fallbackEngine = typeof model.fallbackEngine === 'string' ? model.fallbackEngine : null;
    const isRuntimeLinear = model.modelType === 'runtime-linear';
    const hasValidScaler =
      Array.isArray(means) &&
      Array.isArray(scales) &&
      Array.isArray(classes) &&
      classes.length > 0 &&
      runtimeFeatureOrder.length === means.length &&
      runtimeFeatureOrder.length === scales.length;
    const hasValidRegressors =
      isRuntimeLinear &&
      hasValidScaler &&
      regressors &&
      typeof regressors === 'object' &&
      classes.every((engine) => {
        const reg = regressors[engine];
        return (
          reg &&
          Array.isArray(reg.coefficients) &&
          reg.coefficients.length === runtimeFeatureOrder.length
        );
      });

    cache[profileKey] = Object.freeze({
      runtimeFeatureOrder,
      means,
      scales,
      classes,
      fallbackEngine,
      regressors,
      isRuntimeLinear,
      hasValidScaler,
      hasValidRegressors,
      minConfidence: Math.max(
        ML_MIN_CONFIDENCE_FLOOR,
        Number.isFinite(model.minConfidence) ? model.minConfidence : 0,
      ),
      minMargin: Math.max(
        ML_MIN_MARGIN_FLOOR,
        Number.isFinite(model.minMargin) ? model.minMargin : 0,
      ),
    });
  }

  return Object.freeze(cache);
})();

function softmax(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return [];

  let maxScore = Number.NEGATIVE_INFINITY;
  const n = scores.length;
  for (let i = 0; i < n; i += 1) {
    const value = scores[i];
    if (value > maxScore) maxScore = value;
  }

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const value = Math.exp(scores[i] - maxScore);
    scores[i] = value;
    sum += value;
  }

  if (!Number.isFinite(sum) || sum <= 0) {
    for (let i = 0; i < n; i += 1) {
      scores[i] = 0;
    }
    return scores;
  }

  for (let i = 0; i < n; i += 1) {
    scores[i] /= sum;
  }

  return scores;
}

export function findTopTwoIndices(probs) {
  if (!Array.isArray(probs) || probs.length === 0) {
    return { bestIndex: -1, secondIndex: -1 };
  }

  if (probs.length === 1) {
    return { bestIndex: 0, secondIndex: 0 };
  }

  let bestIndex = 0;
  let secondIndex = 1;
  if (probs[1] > probs[0]) {
    bestIndex = 1;
    secondIndex = 0;
  }

  for (let i = 2; i < probs.length; i += 1) {
    const probability = probs[i];
    if (probability > probs[bestIndex]) {
      secondIndex = bestIndex;
      bestIndex = i;
    } else if (probability > probs[secondIndex]) {
      secondIndex = i;
    }
  }

  return { bestIndex, secondIndex };
}

export function resolveMlFeatureValues(features = {}) {
  const {
    safeN: safeNRaw,
    safeE: safeERaw,
    safeBeelineKm: safeBeelineKmRaw,
    beelinePerNode: beelinePerNodeRaw,
    edgesPerKm: edgesPerKmRaw,
    nodesPerKm: nodesPerKmRaw,
    sizeRatioEN: sizeRatioENRaw,
    globalCoverage: globalCoverageRaw,
    emptyRatio: emptyRatioRaw,
    avgBranchFactor: avgBranchFactorRaw,
    avgOutDegree: avgOutDegreeRaw,
    relativeDensity: relativeDensityRaw,
    graphDensity: graphDensityRaw,
    sourceDegree: sourceDegreeRaw,
    targetDegree: targetDegreeRaw,
    sourceCentrality: sourceCentralityRaw,
    targetCentrality: targetCentralityRaw,
    sourceTargetDegreeRatio: sourceTargetDegreeRatioRaw,
    sourceTargetCentralityRatio: sourceTargetCentralityRatioRaw,
    nodeDegreeSource: nodeDegreeSourceRaw,
    nodeDegreeTarget: nodeDegreeTargetRaw,
    nodeCentralitySource: nodeCentralitySourceRaw,
    nodeCentralityTarget: nodeCentralityTargetRaw,
    nodeCount: nodeCountRaw,
    edgeCount: edgeCountRaw,
    averageNodeDegree: averageNodeDegreeRaw,
    haversineDistance: haversineDistanceRaw,
  } = features;

  const safeN = safeNumber(safeNRaw, safeNumber(nodeCountRaw, 1));
  const safeE = safeNumber(safeERaw, safeNumber(edgeCountRaw, safeN));
  const safeBeelineKm = safeNumber(
    safeBeelineKmRaw,
    Math.max(0.25, safeNumber(haversineDistanceRaw, 0) / 1000),
  );
  const beelinePerNode = safeNumber(beelinePerNodeRaw, safeBeelineKm / safeN);
  const edgesPerKm = safeNumber(edgesPerKmRaw, safeE / safeBeelineKm);
  const nodesPerKm = safeNumber(nodesPerKmRaw, safeN / safeBeelineKm);
  const sizeRatioEN = safeNumber(sizeRatioENRaw, safeE / safeN);
  const globalCoverage = safeNumber(globalCoverageRaw, 0);
  const emptyRatio = safeNumber(emptyRatioRaw, 1);
  const avgBranchFactor = safeNumber(
    avgBranchFactorRaw,
    safeNumber(avgOutDegreeRaw, safeNumber(averageNodeDegreeRaw, safeE / safeN)),
  );
  const relativeDensity = safeNumber(relativeDensityRaw, safeNumber(graphDensityRaw, 0));
  const sourceDegree = safeNumber(sourceDegreeRaw, safeNumber(nodeDegreeSourceRaw, 0));
  const targetDegree = safeNumber(targetDegreeRaw, safeNumber(nodeDegreeTargetRaw, 0));
  const sourceCentrality = safeNumber(sourceCentralityRaw, safeNumber(nodeCentralitySourceRaw, 0));
  const targetCentrality = safeNumber(targetCentralityRaw, safeNumber(nodeCentralityTargetRaw, 0));
  const sourceTargetDegreeRatio = safeNumber(
    sourceTargetDegreeRatioRaw,
    targetDegree > 0 ? sourceDegree / targetDegree : 0,
  );
  const sourceTargetCentralityRatio = safeNumber(
    sourceTargetCentralityRatioRaw,
    targetCentrality > 0 ? sourceCentrality / targetCentrality : 0,
  );

  const logN = Math.log1p(safeN);
  const logE = Math.log1p(safeE);
  const logBeelineKm = Math.log1p(safeBeelineKm);
  const logEdgesPerKm = Math.log1p(edgesPerKm);
  const logNodesPerKm = Math.log1p(nodesPerKm);
  const logEoverN = Math.log1p(sizeRatioEN);
  const logBeelinePerNode = Math.log1p(beelinePerNode);
  const logAvgOutDegree = Math.log1p(avgBranchFactor);
  const logEmptyRatio = Math.log1p(emptyRatio);
  const logGlobalCoverage = Math.log1p(globalCoverage);
  const logRelativeDensity = Math.log1p(relativeDensity);
  const logGraphDensity = logRelativeDensity;
  const logAvgBranchFactor = logAvgOutDegree;
  const densityBySize = relativeDensity * safeN;
  const coverageDensity = globalCoverage * relativeDensity;
  const degreeProduct = sourceDegree * targetDegree;
  const centralityProduct = sourceCentrality * targetCentrality;
  const coverageEmptyContrast = globalCoverage * Math.max(0, 1 - emptyRatio);
  const logDensityBySize = Math.log1p(Math.max(0, densityBySize));
  const logCoverageDensity = Math.log1p(Math.max(0, coverageDensity));
  const logDegreeProduct = Math.log1p(Math.max(0, degreeProduct));
  const logCentralityProduct = Math.log1p(Math.max(0, centralityProduct));
  const logCoverageEmptyContrast = Math.log1p(Math.max(0, coverageEmptyContrast));
  const logSourceDegree = Math.log1p(Math.max(0, sourceDegree));
  const logTargetDegree = Math.log1p(Math.max(0, targetDegree));
  const logSourceCentrality = Math.log1p(Math.max(0, sourceCentrality));
  const logTargetCentrality = Math.log1p(Math.max(0, targetCentrality));
  const logSourceTargetDegreeRatio = Math.log1p(Math.max(0, sourceTargetDegreeRatio));
  const logSourceTargetCentralityRatio = Math.log1p(Math.max(0, sourceTargetCentralityRatio));

  return {
    safeN,
    safeE,
    safeBeelineKm,
    beelinePerNode,
    edgesPerKm,
    nodesPerKm,
    sizeRatioEN,
    globalCoverage,
    emptyRatio,
    avgBranchFactor,
    relativeDensity,
    sourceDegree,
    targetDegree,
    sourceCentrality,
    targetCentrality,
    sourceTargetDegreeRatio,
    sourceTargetCentralityRatio,
    logN,
    logE,
    logBeelineKm,
    logEdgesPerKm,
    logNodesPerKm,
    logEoverN,
    logBeelinePerNode,
    logAvgOutDegree,
    logEmptyRatio,
    logGlobalCoverage,
    logRelativeDensity,
    logGraphDensity,
    logAvgBranchFactor,
    densityBySize,
    coverageDensity,
    degreeProduct,
    centralityProduct,
    coverageEmptyContrast,
    logDensityBySize,
    logCoverageDensity,
    logDegreeProduct,
    logCentralityProduct,
    logCoverageEmptyContrast,
    logSourceDegree,
    logTargetDegree,
    logSourceCentrality,
    logTargetCentrality,
    logSourceTargetDegreeRatio,
    logSourceTargetCentralityRatio,
    avgOutDegree: avgBranchFactor,
    graphDensity: relativeDensity,
  };
}

function inferDistanceEngineWithRuntimeLinear(regressors, normalized, classes) {
  if (!regressors || typeof regressors !== 'object' || !Array.isArray(classes)) {
    return null;
  }

  const classCount = classes.length;
  const featureCount = normalized.length;
  const scores = new Array(classCount);

  for (let i = 0; i < classCount; i += 1) {
    const reg = regressors[classes[i]];
    const intercept = Number.isFinite(reg.intercept) ? reg.intercept : 0;
    const coeffs = reg.coefficients;
    let value = intercept;
    for (let j = 0; j < featureCount; j += 1) {
      value += normalized[j] * coeffs[j];
    }
    scores[i] = value;
  }

  for (let i = 0; i < classCount; i += 1) {
    const score = scores[i];
    scores[i] = Number.isFinite(score) ? -score : score;
  }
  return softmax(scores);
}

function inferDistanceEngineWithMl(features, profileKey) {
  if (!IS_BROWSER_RUNTIME) return null;

  const cached = RUNTIME_MODEL_PROFILE_CACHE[profileKey];
  if (!cached) return null;
  if (!cached.isRuntimeLinear) return cached.fallbackEngine;
  if (!cached.hasValidScaler) return cached.fallbackEngine;

  const {
    runtimeFeatureOrder,
    means,
    scales,
    classes,
    fallbackEngine,
    regressors,
    minConfidence,
    minMargin,
    hasValidRegressors,
  } = cached;

  if (!hasValidRegressors) return fallbackEngine;
  const normalized = new Array(runtimeFeatureOrder.length);
  const featureValues = resolveMlFeatureValues(features || {});
  const featureCount = runtimeFeatureOrder.length;

  for (let i = 0; i < featureCount; i += 1) {
    const name = runtimeFeatureOrder[i];
    const raw = safeNumber(featureValues[name], 0);
    normalized[i] = (raw - safeNumber(means[i], 0)) / safeScale(scales[i]);
  }

  const probs = inferDistanceEngineWithRuntimeLinear(regressors, normalized, classes);
  if (!probs || !probs.length) return fallbackEngine;

  const { bestIndex, secondIndex } = findTopTwoIndices(probs);
  const confidence = probs[bestIndex];
  const margin = probs[bestIndex] - probs[secondIndex];
  if (confidence < minConfidence || margin < minMargin) {
    return fallbackEngine;
  }

  const predictedEngine = classes[bestIndex];
  return typeof predictedEngine === 'string' ? predictedEngine : fallbackEngine;
}

function normalizeDistanceEngine(engineId, fallbackEngine) {
  if (engineId === 'adaptive-barrier' || engineId === 'ultra-dijkstra') {
    return engineId;
  }
  return fallbackEngine;
}

export function hasParallelRoutingRuntime() {
  return HAS_PARALLEL_ROUTING_RUNTIME;
}

export function selectDistanceEngineNoParallel(metrics) {
  const modelEngine = inferDistanceEngineWithMl(metrics, 'sabOff');
  return normalizeDistanceEngine(modelEngine, 'adaptive-barrier');
}

export function selectDistanceEngineParallel(metrics) {
  const modelEngine = inferDistanceEngineWithMl(metrics, 'sabOn');
  return normalizeDistanceEngine(modelEngine, 'ultra-dijkstra');
}

export function shouldUseParallelForEngine(engineId, hasParallelRuntime) {
  if (!hasParallelRuntime) return false;

  const engineTuning = ROUTER_TUNING.parallelization[engineId];
  if (!engineTuning) return false;

  return Boolean(engineTuning.fallbackUseParallel);
}

export function getParallelPolicyForEngine(engineId, hasParallelRuntime) {
  if (!shouldUseParallelForEngine(engineId, hasParallelRuntime)) return null;

  const engineTuning = ROUTER_TUNING.parallelization[engineId];
  return engineTuning?.policy ?? null;
}

export function selectBestEngine(metrics) {
  const parallelRuntime = hasParallelRoutingRuntime();
  return parallelRuntime
    ? selectDistanceEngineParallel(metrics)
    : selectDistanceEngineNoParallel(metrics);
}
