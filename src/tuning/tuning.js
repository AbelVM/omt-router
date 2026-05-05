import { ROUTER_TUNING_ML_MODEL } from './model.js';

const ML_MIN_CONFIDENCE_FLOOR = 0.78;
const ML_MIN_MARGIN_FLOOR = 0.22;

const SELECTOR_BANDS = Object.freeze({
  sizeNodeThresholds: [
    8000,
    24000,
    64000
  ],
  sizeEdgeThresholds: [
    25000,
    75000,
    220000
  ],
  beelineMeterThresholds: [
    200,
    1800,
    6000,
    18000,
    52000
  ],
  densityEdgesPerKmThresholds: [
    5000,
    9000,
    16000
  ],
  densityRelativeThresholds: [
    0.18,
    0.45,
    0.75
  ],
  globalCoverageThresholds: [
    0.15,
    0.40,
    0.70
  ],
  emptyRatioThresholds: [
    0.4,
    0.7,
    0.9
  ],
  branchFactorThresholds: [
    1.4,
    2.0
  ]
});

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
  selectorBands: SELECTOR_BANDS,
  parallelization: PARALLEL_ENGINE_DEFAULTS,
});

function softmax(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return [];
  const maxScore = Math.max(...scores);
  const exps = scores.map((v) => Math.exp(v - maxScore));
  const sum = exps.reduce((acc, v) => acc + v, 0);
  if (!Number.isFinite(sum) || sum <= 0) return scores.map(() => 0);
  return exps.map((v) => v / sum);
}

function relu(x) {
  return Math.max(0, x);
}

function matmul(input, weights, bias) {
  // input: [n_in], weights: [n_in, n_out], bias: [n_out]
  // returns: [n_out]
  if (!Array.isArray(weights) || weights.length === 0) return [];
  const nOut = weights[0].length;
  const output = new Array(nOut).fill(0);
  
  for (let j = 0; j < nOut; j += 1) {
    let sum = Number.isFinite(bias[j]) ? bias[j] : 0;
    for (let i = 0; i < input.length; i += 1) {
      const w = Array.isArray(weights[i]) ? weights[i][j] : 0;
      sum += input[i] * w;
    }
    output[j] = sum;
  }
  return output;
}

function resolveMlFeatureValue(featureName, features) {
  const safeN = Number.isFinite(features?.safeN) ? features.safeN : 1;
  const safeE = Number.isFinite(features?.safeE) ? features.safeE : safeN;
  const safeBeelineKm = Number.isFinite(features?.safeBeelineKm) ? features.safeBeelineKm : 0.25;
  const beelinePerNode = Number.isFinite(features?.beelinePerNode)
    ? features.beelinePerNode
    : safeBeelineKm / safeN;
  const edgesPerKm = Number.isFinite(features?.edgesPerKm)
    ? features.edgesPerKm
    : safeE / safeBeelineKm;
  const nodesPerKm = Number.isFinite(features?.nodesPerKm)
    ? features.nodesPerKm
    : safeN / safeBeelineKm;
  const sizeRatioEN = Number.isFinite(features?.sizeRatioEN)
    ? features.sizeRatioEN
    : safeE / safeN;
  const avgBranchFactor = Number.isFinite(features?.avgBranchFactor)
    ? features.avgBranchFactor
    : Number.isFinite(features?.avgOutDegree)
    ? features.avgOutDegree
    : safeE / safeN;
  const relativeDensity = Number.isFinite(features?.relativeDensity)
    ? features.relativeDensity
    : Number.isFinite(features?.graphDensity)
    ? features.graphDensity
    : 0;
  const sourceDegree = Number.isFinite(features?.sourceDegree)
    ? features.sourceDegree
    : Number.isFinite(features?.nodeDegreeSource)
    ? features.nodeDegreeSource
    : 0;
  const targetDegree = Number.isFinite(features?.targetDegree)
    ? features.targetDegree
    : Number.isFinite(features?.nodeDegreeTarget)
    ? features.nodeDegreeTarget
    : 0;
  const sourceCentrality = Number.isFinite(features?.sourceCentrality)
    ? features.sourceCentrality
    : Number.isFinite(features?.nodeCentralitySource)
    ? features.nodeCentralitySource
    : 0;
  const targetCentrality = Number.isFinite(features?.targetCentrality)
    ? features.targetCentrality
    : Number.isFinite(features?.nodeCentralityTarget)
    ? features.nodeCentralityTarget
    : 0;
  const sourceTargetDegreeRatio = Number.isFinite(features?.sourceTargetDegreeRatio)
    ? features.sourceTargetDegreeRatio
    : targetDegree > 0
    ? sourceDegree / targetDegree
    : 0;
  const sourceTargetCentralityRatio = Number.isFinite(features?.sourceTargetCentralityRatio)
    ? features.sourceTargetCentralityRatio
    : targetCentrality > 0
    ? sourceCentrality / targetCentrality
    : 0;

  if (featureName === 'logN') return Math.log1p(Math.max(0, safeN));
  if (featureName === 'logE') return Math.log1p(Math.max(0, safeE));
  if (featureName === 'logBeelineKm') return Math.log1p(Math.max(0, safeBeelineKm));
  if (featureName === 'logEdgesPerKm') return Math.log1p(Math.max(0, edgesPerKm));
  if (featureName === 'logNodesPerKm') return Math.log1p(Math.max(0, nodesPerKm));
  if (featureName === 'logEoverN') return Math.log1p(Math.max(0, sizeRatioEN));
  if (featureName === 'logBeelinePerNode') return Math.log1p(Math.max(0, beelinePerNode));
  if (featureName === 'nodesPerKm') return nodesPerKm;
  if (featureName === 'edgesPerKm') return edgesPerKm;
  if (featureName === 'sizeRatioEN') return sizeRatioEN;
  if (featureName === 'beelinePerNode') return beelinePerNode;
  if (featureName === 'avgBranchFactor') return avgBranchFactor;
  if (featureName === 'graphDensity') return relativeDensity;
  if (featureName === 'relativeDensity') return relativeDensity;
  if (featureName === 'sourceDegree') return sourceDegree;
  if (featureName === 'targetDegree') return targetDegree;
  if (featureName === 'sourceCentrality') return sourceCentrality;
  if (featureName === 'targetCentrality') return targetCentrality;
  if (featureName === 'sourceTargetDegreeRatio') return sourceTargetDegreeRatio;
  if (featureName === 'sourceTargetCentralityRatio') return sourceTargetCentralityRatio;

  const value = features?.[featureName];
  return Number.isFinite(value) ? value : 0;
}

function inferDistanceEngineWithMlp(model, normalized, classes) {
  // 2-layer MLP inference: input -> hidden1 (ReLU) -> hidden2 (ReLU) -> output (softmax)
  const coefs = model.coefs;
  const intercepts = model.intercepts;
  
  if (!Array.isArray(coefs) || coefs.length < 3 || !Array.isArray(intercepts) || intercepts.length < 3) {
    return null;
  }

  // Forward pass through layers
  let layer = normalized;
  
  // Hidden layer 1: input -> hidden (ReLU)
  layer = matmul(layer, coefs[0], intercepts[0]);
  layer = layer.map(relu);
  
  // Hidden layer 2: hidden -> hidden (ReLU)
  layer = matmul(layer, coefs[1], intercepts[1]);
  layer = layer.map(relu);
  
  // Output layer: hidden -> output (no activation, softmax applied in caller)
  const logits = matmul(layer, coefs[2], intercepts[2]);
  
  return softmax(logits);
}

function inferDistanceEngineWithXgboost(model, normalized) {
  if (typeof model.score !== 'function') {
    return null;
  }

  const probs = model.score(normalized);
  if (!Array.isArray(probs) || !probs.length) {
    return null;
  }

  return probs;
}

function inferDistanceEngineWithLogisticRegression(model, normalized, classes) {
  // Legacy Logistic Regression inference
  const coefficients = model.coefficients;
  const intercepts = model.intercepts;
  
  if (!Array.isArray(coefficients) || !Array.isArray(intercepts)) {
    return null;
  }

  const scores = coefficients.map((weights, classIndex) => {
    if (!Array.isArray(weights) || weights.length !== normalized.length) {
      return Number.NEGATIVE_INFINITY;
    }

    let score = Number.isFinite(intercepts[classIndex]) ? intercepts[classIndex] : 0;
    for (let i = 0; i < normalized.length; i += 1) {
      score += weights[i] * normalized[i];
    }
    return score;
  });

  return softmax(scores);
}

function inferDistanceEngineWithRuntimeLinear(model, normalized, classes) {
  if (!model || typeof model !== 'object' || !Array.isArray(classes)) {
    return null;
  }

  const regressors = model.regressors;
  if (!regressors || typeof regressors !== 'object') {
    return null;
  }

  const scores = classes.map((engine) => {
    const reg = regressors[engine];
    if (!reg || !Array.isArray(reg.coefficients) || reg.coefficients.length !== normalized.length) {
      return Number.POSITIVE_INFINITY;
    }

    let value = Number.isFinite(reg.intercept) ? reg.intercept : 0;
    for (let i = 0; i < normalized.length; i += 1) {
      value += normalized[i] * reg.coefficients[i];
    }

    return value;
  });

  const negScores = scores.map((score) => Number.isFinite(score) ? -score : score);
  return softmax(negScores);
}

function inferDistanceEngineWithMl(features, profileKey) {
  const isBrowserRuntime = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  if (!isBrowserRuntime) return null;

  const model = ROUTER_TUNING_ML_MODEL?.profiles?.[profileKey];
  const featureOrder = ROUTER_TUNING_ML_MODEL?.featureOrder;
  if (!model || !Array.isArray(featureOrder) || featureOrder.length === 0) return null;

  const means = model.scaler_mean;
  const scales = model.scaler_scale;
  const classes = model.classes;

  if (
    !Array.isArray(means) ||
    !Array.isArray(scales) ||
    !Array.isArray(classes) ||
    means.length !== featureOrder.length ||
    scales.length !== featureOrder.length
  ) {
    return null;
  }

  const normalized = featureOrder.map((name, i) => {
    const raw = resolveMlFeatureValue(name, features);
    const scale = Number.isFinite(scales[i]) && Math.abs(scales[i]) > 1e-12 ? scales[i] : 1;
    const mean = Number.isFinite(means[i]) ? means[i] : 0;
    return (raw - mean) / scale;
  });

  // Dispatch to appropriate inference function based on model type
  let probs;
  if (model.modelType === 'mlp') {
    probs = inferDistanceEngineWithMlp(model, normalized, classes);
  } else if (model.modelType === 'xgboost') {
    probs = inferDistanceEngineWithXgboost(model, normalized);
  } else if (model.modelType === 'runtime-linear') {
    probs = inferDistanceEngineWithRuntimeLinear(model, normalized, classes);
  } else {
    probs = inferDistanceEngineWithLogisticRegression(model, normalized, classes);
  }

  if (!probs || !probs.length) return null;

  let bestIndex = 0;
  let secondIndex = 0;
  for (let i = 1; i < probs.length; i += 1) {
    if (probs[i] > probs[bestIndex]) {
      secondIndex = bestIndex;
      bestIndex = i;
    } else if (i !== bestIndex && probs[i] > probs[secondIndex]) {
      secondIndex = i;
    }
  }

  const confidence = probs[bestIndex];
  const margin = probs[bestIndex] - probs[secondIndex];
  const minConfidence = Math.max(
    ML_MIN_CONFIDENCE_FLOOR,
    Number.isFinite(model.minConfidence) ? model.minConfidence : 0,
  );
  const minMargin = Math.max(
    ML_MIN_MARGIN_FLOOR,
    Number.isFinite(model.minMargin) ? model.minMargin : 0,
  );

  if (confidence < minConfidence || margin < minMargin) {
    return null;
  }

  const predictedEngine = classes[bestIndex];
  return typeof predictedEngine === 'string' ? predictedEngine : null;
}

function normalizeDistanceEngine(engineId, fallbackEngine) {
  if (engineId === 'adaptive-barrier' || engineId === 'ultra-dijkstra') {
    return engineId;
  }
  return fallbackEngine;
}

export function hasParallelRoutingRuntime() {
  const isBrowserRuntime = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  if (!isBrowserRuntime) return false;

  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const hasWorker = typeof Worker !== 'undefined';
  const isCrossOriginIsolated = typeof crossOriginIsolated === 'boolean' && crossOriginIsolated;

  return hasSharedArrayBuffer && hasWorker && isCrossOriginIsolated;
}

/**
 *  Classifies graph features into bands and computes derived features for engine selection.
 * Designed to be robust against missing or invalid metric values by applying sensible defaults and fallbacks.
 * The resulting feature set includes both raw and derived metrics, as well as categorical bands for key dimensions like size, beeline distance, density, coverage, emptiness, and branching factor.
 * These features are used for both ML-based engine selection and heuristic rules in the router.  
 * @param {*} metrics 
 * @returns {object} An object containing classified features and bands for selector logic.
 */
export function classifySelectorFeatures(metrics = {}) {
  const safeN = Math.max(1, Number.isFinite(metrics.nodeCount) ? metrics.nodeCount : 1);
  const safeE = Math.max(1, Number.isFinite(metrics.edgeCount) ? metrics.edgeCount : safeN);
  const haversineDistance = Number.isFinite(metrics.haversineDistance) ? metrics.haversineDistance : 0;
  const safeBeelineKm = Math.max(0.25, haversineDistance / 1000);
  const avgOutDegree = Number.isFinite(metrics.averageNodeDegree)
    ? metrics.averageNodeDegree
    : safeE / safeN;
  const edgesPerKm = safeE / safeBeelineKm;
  const nodesPerKm = safeN / safeBeelineKm;
  const relativeDensity = Number.isFinite(metrics.relativeDensity) ? metrics.relativeDensity : 0;
  const globalCoverage = Number.isFinite(metrics.globalCoverage) ? metrics.globalCoverage : 0;
  const emptyRatio = Number.isFinite(metrics.emptyRatio) ? metrics.emptyRatio : 1;
  const sourceDegree = Number.isFinite(metrics.nodeDegreeSource) ? metrics.nodeDegreeSource : 0;
  const targetDegree = Number.isFinite(metrics.nodeDegreeTarget) ? metrics.nodeDegreeTarget : 0;
  const sourceCentrality = Number.isFinite(metrics.nodeCentralitySource) ? metrics.nodeCentralitySource : 0;
  const targetCentrality = Number.isFinite(metrics.nodeCentralityTarget) ? metrics.nodeCentralityTarget : 0;
  const beelinePerNode = Number.isFinite(metrics.beelinePerNode)
    ? metrics.beelinePerNode
    : safeBeelineKm / safeN;
  const sizeRatioEN = safeE / safeN;
  const safeSourceTargetDegreeRatio = targetDegree > 0 ? sourceDegree / targetDegree : sourceDegree;
  const safeSourceTargetCentralityRatio = targetCentrality > 0 ? sourceCentrality / targetCentrality : sourceCentrality;

  const logN = Math.log1p(safeN);
  const logE = Math.log1p(safeE);
  const logBeelineKm = Math.log1p(safeBeelineKm);
  const logEdgesPerKm = Math.log1p(edgesPerKm);
  const logNodesPerKm = Math.log1p(nodesPerKm);
  const logEoverN = Math.log1p(sizeRatioEN);
  const logBeelinePerNode = Math.log1p(beelinePerNode);

  let sizeBand = 'xlarge';
  if (safeE < SELECTOR_BANDS.sizeEdgeThresholds[0] || safeN < SELECTOR_BANDS.sizeNodeThresholds[0]) {
    sizeBand = 'small';
  } else if (safeE < SELECTOR_BANDS.sizeEdgeThresholds[1] || safeN < SELECTOR_BANDS.sizeNodeThresholds[1]) {
    sizeBand = 'medium';
  } else if (safeE < SELECTOR_BANDS.sizeEdgeThresholds[2] || safeN < SELECTOR_BANDS.sizeNodeThresholds[2]) {
    sizeBand = 'large';
  }

  let beelineBand = 'xxl';
  if (haversineDistance <= SELECTOR_BANDS.beelineMeterThresholds[0]) beelineBand = 'micro';
  else if (haversineDistance <= SELECTOR_BANDS.beelineMeterThresholds[1]) beelineBand = 'extra-short';
  else if (haversineDistance <= SELECTOR_BANDS.beelineMeterThresholds[2]) beelineBand = 'short';
  else if (haversineDistance <= SELECTOR_BANDS.beelineMeterThresholds[3]) beelineBand = 'medium';
  else if (haversineDistance <= SELECTOR_BANDS.beelineMeterThresholds[4]) beelineBand = 'long';

  let densityBand = 'crowded';
  if (relativeDensity <= SELECTOR_BANDS.densityRelativeThresholds[0]) densityBand = 'sparse';
  else if (relativeDensity <= SELECTOR_BANDS.densityRelativeThresholds[1]) densityBand = 'balanced';
  else if (relativeDensity <= SELECTOR_BANDS.densityRelativeThresholds[2]) densityBand = 'dense';

  let coverageBand = 'high-coverage';
  if (globalCoverage <= SELECTOR_BANDS.globalCoverageThresholds[0]) coverageBand = 'low-coverage';
  else if (globalCoverage <= SELECTOR_BANDS.globalCoverageThresholds[1]) coverageBand = 'moderate-coverage';
  else if (globalCoverage <= SELECTOR_BANDS.globalCoverageThresholds[2]) coverageBand = 'strong-coverage';

  let emptyBand = 'compact';
  if (emptyRatio >= SELECTOR_BANDS.emptyRatioThresholds[2]) emptyBand = 'open';
  else if (emptyRatio >= SELECTOR_BANDS.emptyRatioThresholds[1]) emptyBand = 'sparse';
  else if (emptyRatio >= SELECTOR_BANDS.emptyRatioThresholds[0]) emptyBand = 'light';

  let branchBand = 'high-branch';
  if (avgOutDegree <= SELECTOR_BANDS.branchFactorThresholds[0]) branchBand = 'low-branch';
  else if (avgOutDegree <= SELECTOR_BANDS.branchFactorThresholds[1]) branchBand = 'mid-branch';

  return {
    safeN,
    safeE,
    safeBeelineKm,
    avgOutDegree,
    edgesPerKm,
    nodesPerKm,
    sizeRatioEN,
    beelinePerNode,
    relativeDensity,
    globalCoverage,
    emptyRatio,
    sourceDegree,
    targetDegree,
    sourceCentrality,
    targetCentrality,
    sourceTargetDegreeRatio: safeSourceTargetDegreeRatio,
    sourceTargetCentralityRatio: safeSourceTargetCentralityRatio,
    graphDensity: relativeDensity,
    avgBranchFactor: avgOutDegree,
    logN,
    logE,
    logBeelineKm,
    logEdgesPerKm,
    logNodesPerKm,
    logEoverN,
    logBeelinePerNode,
    sizeBand,
    beelineBand,
    densityBand,
    coverageBand,
    emptyBand,
    branchBand,
    signature: `${sizeBand}|${beelineBand}|${densityBand}|${branchBand}`,
    signatureExpanded: `${sizeBand}|${beelineBand}|${densityBand}|${coverageBand}|${emptyBand}|${branchBand}`,
  };
}

export function getSelectorBins(metrics) {
  const features = classifySelectorFeatures(metrics);
  return {
    sizeBand: features.sizeBand,
    beelineBand: features.beelineBand,
    densityBand: features.densityBand,
    coverageBand: features.coverageBand,
    emptyBand: features.emptyBand,
    branchBand: features.branchBand,
    signature: features.signature,
    signatureExpanded: features.signatureExpanded,
  };
}

export function selectDistanceEngineNoParallel(features) {
  const modelEngine = inferDistanceEngineWithMl(features, 'sabOff');
  return normalizeDistanceEngine(modelEngine, 'adaptive-barrier');
}

export function selectDistanceEngineParallel(features) {
  const modelEngine = inferDistanceEngineWithMl(features, 'sabOn');
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
  return engineTuning?.policy ? { ...engineTuning.policy } : null;
}

export function selectBestEngine(metrics) {
  const features = classifySelectorFeatures(metrics);
  const parallelRuntime = hasParallelRoutingRuntime();
  return parallelRuntime
    ? selectDistanceEngineParallel(features)
    : selectDistanceEngineNoParallel(features);
}
