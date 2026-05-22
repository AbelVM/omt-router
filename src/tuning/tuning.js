/**
 * @module src/tuning/tuning
 * @description Engine-selection tuning helpers for router runtime behavior.
 *   Handles browser runtime detection, ML feature normalization, profile caching,
 *   and selecting optimal routing engine choices for parallel and non-parallel modes.
 */

import { ROUTER_TUNING_ML_MODEL } from './model.js';

/** Minimum confidence floor for ML-based engine selection. */
const ML_MIN_CONFIDENCE_FLOOR = 0.36;

/** Minimum probability margin floor between top ML predictions. */
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
const HAS_PARALLEL_ROUTING_RUNTIME =
  IS_BROWSER_RUNTIME &&
  typeof SharedArrayBuffer !== 'undefined' &&
  typeof Worker !== 'undefined' &&
  typeof crossOriginIsolated === 'boolean' &&
  crossOriginIsolated;

/**
 * Return a finite number or a fallback when the value is invalid.
 * @param {number} value Candidate numeric value.
 * @param {number} fallback Fallback value for invalid input.
 * @returns {number} The original finite value or the fallback.
 */
const safeNumber = (value, fallback) => (Number.isFinite(value) ? value : fallback);

/**
 * Return a valid scale value for normalization, avoiding near-zero or invalid values.
 * @param {number} value Candidate scale value.
 * @returns {number} The input value when finite and nonzero, otherwise 1.
 */
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
        Number.isFinite(model.minConfidence) ? model.minConfidence : 0
      ),
      minMargin: Math.max(
        ML_MIN_MARGIN_FLOOR,
        Number.isFinite(model.minMargin) ? model.minMargin : 0
      ),
    });
  }

  return Object.freeze(cache);
})();

/**
 * Convert raw scores into normalized probabilities using the softmax function.
 * @param {number[]} scores Raw score values to normalize.
 * @returns {number[]} Probability values that sum to 1, or an empty array for invalid input.
 */
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

/**
 * Find the top two probability indices in an array.
 * @param {number[]} probs Probability values.
 * @returns {{bestIndex:number, secondIndex:number}} Indices of the highest and second-highest values.
 */
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

/**
 * Resolve ML feature values from graph metrics, supplying safe defaults when needed.
 * @param {object} [features={}] Graph feature inputs used for model scoring.
 * @returns {object} A normalized map of ML feature values for runtime engine inference.
 */
export function resolveMlFeatureValues(features = {}) {
  if (!features || typeof features !== 'object') {
    features = {};
  }

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
    Math.max(0.25, safeNumber(haversineDistanceRaw, 0) / 1000)
  );
  const beelinePerNode = safeNumber(beelinePerNodeRaw, safeBeelineKm / safeN);
  const edgesPerKm = safeNumber(edgesPerKmRaw, safeE / safeBeelineKm);
  const nodesPerKm = safeNumber(nodesPerKmRaw, safeN / safeBeelineKm);
  const sizeRatioEN = safeNumber(sizeRatioENRaw, safeE / safeN);
  const globalCoverage = safeNumber(globalCoverageRaw, 0);
  const emptyRatio = safeNumber(emptyRatioRaw, 1);
  const avgBranchFactor = safeNumber(
    avgBranchFactorRaw,
    safeNumber(avgOutDegreeRaw, safeNumber(averageNodeDegreeRaw, safeE / safeN))
  );
  const relativeDensity = safeNumber(relativeDensityRaw, safeNumber(graphDensityRaw, 0));
  const sourceDegree = safeNumber(sourceDegreeRaw, safeNumber(nodeDegreeSourceRaw, 0));
  const targetDegree = safeNumber(targetDegreeRaw, safeNumber(nodeDegreeTargetRaw, 0));
  const sourceCentrality = safeNumber(sourceCentralityRaw, safeNumber(nodeCentralitySourceRaw, 0));
  const targetCentrality = safeNumber(targetCentralityRaw, safeNumber(nodeCentralityTargetRaw, 0));
  const sourceTargetDegreeRatio = safeNumber(
    sourceTargetDegreeRatioRaw,
    targetDegree > 0 ? sourceDegree / targetDegree : 0
  );
  const sourceTargetCentralityRatio = safeNumber(
    sourceTargetCentralityRatioRaw,
    targetCentrality > 0 ? sourceCentrality / targetCentrality : 0
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

/**
 * Infer engine probabilities using a runtime-linear regression model.
 * @param {object} regressors Regression metadata keyed by engine class.
 * @param {number[]} normalized Feature values after scaling.
 * @param {string[]} classes Ordered engine class labels.
 * @returns {number[]|null} Probability vector for each class or null for invalid input.
 */
function inferDistanceEngineWithRuntimeLinear(regressors, featureValues, runtimeFeatureOrder, means, scales, classes) {
  if (
    !regressors ||
    typeof regressors !== 'object' ||
    !Array.isArray(runtimeFeatureOrder) ||
    !Array.isArray(means) ||
    !Array.isArray(scales) ||
    !Array.isArray(classes)
  ) {
    return null;
  }

  const featureCount = runtimeFeatureOrder.length;
  const classCount = classes.length;
  const scores = new Array(classCount);

  for (let i = 0; i < classCount; i += 1) {
    const reg = regressors[classes[i]];
    if (!reg || !Array.isArray(reg.coefficients) || reg.coefficients.length !== featureCount) {
      return null;
    }

    const coeffs = reg.coefficients;
    let value = Number.isFinite(reg.intercept) ? reg.intercept : 0;

    for (let j = 0; j < featureCount; j += 1) {
      const raw = safeNumber(featureValues[runtimeFeatureOrder[j]], 0);
      value += ((raw - safeNumber(means[j], 0)) / safeScale(scales[j])) * coeffs[j];
    }

    scores[i] = Number.isFinite(value) ? -value : value;
  }

  return softmax(scores);
}

/**
 * Infer the best distance engine using cached runtime model profiles.
 * @param {object} features Graph metrics used to compute ML features.
 * @param {string} profileKey Tuning profile key from the runtime model cache.
 * @returns {string|null} Best predicted engine identifier or fallback engine.
 */
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
  const featureValues = resolveMlFeatureValues(features);
  const probs = inferDistanceEngineWithRuntimeLinear(
    regressors,
    featureValues,
    runtimeFeatureOrder,
    means,
    scales,
    classes
  );
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

/**
 * Normalize engine selection to known valid identifiers.
 * @param {string} engineId Candidate engine identifier.
 * @param {string} fallbackEngine Fallback engine identifier.
 * @returns {string} A supported engine identifier.
 */
function normalizeDistanceEngine(engineId, fallbackEngine) {
  if (engineId === 'adaptive-barrier' || engineId === 'ultra-dijkstra') {
    return engineId;
  }
  return fallbackEngine;
}

/**
 * Check whether the current runtime supports browser parallel routing.
 * @returns {boolean} True when the browser environment can support SharedArrayBuffer and workers.
 */
export function hasParallelRoutingRuntime() {
  return HAS_PARALLEL_ROUTING_RUNTIME;
}

/**
 * Select a non-parallel routing engine based on runtime metrics.
 * @param {object} metrics Metrics used for ML inference.
 * @returns {string} Chosen engine identifier for non-parallel mode.
 */
export function selectDistanceEngineNoParallel(metrics) {
  const modelEngine = inferDistanceEngineWithMl(metrics, 'sabOff');
  return normalizeDistanceEngine(modelEngine, 'adaptive-barrier');
}

/**
 * Select the best parallel routing engine when parallel runtime is available.
 * @param {object} metrics Metrics used for ML inference.
 * @returns {string} Chosen engine identifier for parallel mode.
 */
export function selectDistanceEngineParallel(metrics) {
  const modelEngine = inferDistanceEngineWithMl(metrics, 'sabOn');
  return normalizeDistanceEngine(modelEngine, 'ultra-dijkstra');
}

/**
 * Determine whether the given engine should run in parallel.
 * @param {string} engineId Candidate engine identifier.
 * @param {boolean} hasParallelRuntime Whether the runtime supports parallel execution.
 * @returns {boolean} True when parallel execution is supported and enabled for the engine.
 */
export function shouldUseParallelForEngine(engineId, hasParallelRuntime) {
  if (!hasParallelRuntime) return false;

  const engineTuning = ROUTER_TUNING.parallelization[engineId];
  if (!engineTuning) return false;

  return Boolean(engineTuning.fallbackUseParallel);
}

/**
 * Get the parallelization policy for a supported engine.
 * @param {string} engineId Candidate engine identifier.
 * @param {boolean} hasParallelRuntime Whether the runtime supports parallel execution.
 * @returns {object|null} The policy object for the engine or null when unavailable.
 */
export function getParallelPolicyForEngine(engineId, hasParallelRuntime) {
  if (!shouldUseParallelForEngine(engineId, hasParallelRuntime)) return null;

  const engineTuning = ROUTER_TUNING.parallelization[engineId];
  return engineTuning?.policy ?? null;
}

/**
 * Select the best engine for the current runtime and metrics.
 * @param {object} metrics Metrics used for ML engine selection.
 * @returns {string} Selected engine identifier for the current runtime.
 */
export function selectBestEngine(metrics) {
  const parallelRuntime = hasParallelRoutingRuntime();
  return parallelRuntime
    ? selectDistanceEngineParallel(metrics)
    : selectDistanceEngineNoParallel(metrics);
}
