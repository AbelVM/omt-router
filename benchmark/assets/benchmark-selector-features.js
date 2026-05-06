const SELECTOR_BANDS = Object.freeze({
  sizeNodeThresholds: [8000, 24000, 64000],
  sizeEdgeThresholds: [25000, 75000, 220000],
  beelineMeterThresholds: [200, 1800, 6000, 18000, 52000],
  densityEdgesPerKmThresholds: [5000, 9000, 16000],
  densityRelativeThresholds: [0.18, 0.45, 0.75],
  globalCoverageThresholds: [0.15, 0.40, 0.70],
  emptyRatioThresholds: [0.4, 0.7, 0.9],
  branchFactorThresholds: [1.4, 2.0],
});

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
  const sourceTargetDegreeRatio = Number.isFinite(metrics.sourceTargetDegreeRatio)
    ? metrics.sourceTargetDegreeRatio
    : targetDegree > 0
    ? sourceDegree / targetDegree
    : 0;
  const sourceTargetCentralityRatio = Number.isFinite(metrics.sourceTargetCentralityRatio)
    ? metrics.sourceTargetCentralityRatio
    : targetCentrality > 0
    ? sourceCentrality / targetCentrality
    : 0;
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
  const logEmptyRatio = Math.log1p(emptyRatio);
  const logGlobalCoverage = Math.log1p(globalCoverage);
  const logSourceDegree = Math.log1p(sourceDegree);
  const logTargetDegree = Math.log1p(targetDegree);
  const logSourceCentrality = Math.log1p(sourceCentrality);
  const logTargetCentrality = Math.log1p(targetCentrality);
  const avgBranchFactor = avgOutDegree;
  const logSourceTargetDegreeRatio = Math.log1p(sourceTargetDegreeRatio);
  const logSourceTargetCentralityRatio = Math.log1p(sourceTargetCentralityRatio);
  const logAvgOutDegree = Math.log1p(avgOutDegree);
  const logRelativeDensity = Math.log1p(relativeDensity);
  const logGraphDensity = Math.log1p(relativeDensity);
  const logAvgBranchFactor = Math.log1p(avgBranchFactor);

  const densityBySize = relativeDensity * safeN;
  const coverageDensity = globalCoverage * relativeDensity;
  const degreeProduct = sourceDegree * targetDegree;
  const centralityProduct = sourceCentrality * targetCentrality;
  const coverageEmptyContrast = globalCoverage * Math.max(0, 1 - emptyRatio);
  const safeBeelineKmOverSizeRatioEN = safeBeelineKm / Math.max(0.25, sizeRatioEN);
  const globalCoverageTimesEmptyRatio = globalCoverage * emptyRatio;
  const avgOutDegreeTimesLogRelativeDensity = avgBranchFactor * logRelativeDensity;
  const beelinePerNodeTimesSourceTargetDegreeRatio = beelinePerNode * sourceTargetDegreeRatio;
  const coverageEmptyContrastTimesLogAvgBranchFactor = coverageEmptyContrast * logAvgBranchFactor;
  const densityBySizeTimesSourceCentrality = densityBySize * sourceCentrality;

  const logDensityBySize = Math.log1p(Math.max(0, densityBySize));
  const logCoverageDensity = Math.log1p(Math.max(0, coverageDensity));
  const logDegreeProduct = Math.log1p(Math.max(0, degreeProduct));
  const logCentralityProduct = Math.log1p(Math.max(0, centralityProduct));
  const logCoverageEmptyContrast = Math.log1p(Math.max(0, coverageEmptyContrast));

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
    logGlobalCoverage,
    emptyRatio,
    logEmptyRatio,
    sourceDegree,
    logSourceDegree,
    targetDegree,
    logTargetDegree,
    sourceCentrality,
    logSourceCentrality,
    targetCentrality,
    logTargetCentrality,
    sourceTargetDegreeRatio: safeSourceTargetDegreeRatio,
    logSourceTargetDegreeRatio,
    sourceTargetCentralityRatio: safeSourceTargetCentralityRatio,
    logSourceTargetCentralityRatio,
    graphDensity: relativeDensity,
    logGraphDensity,
    avgBranchFactor: avgOutDegree,
    logAvgBranchFactor,
    logN,
    logE,
    logBeelineKm,
    logEdgesPerKm,
    logNodesPerKm,
    logEoverN,
    logBeelinePerNode,
    densityBySize,
    logDensityBySize,
    coverageDensity,
    logCoverageDensity,
    degreeProduct,
    logDegreeProduct,
    centralityProduct,
    logCentralityProduct,
    coverageEmptyContrast,
    logCoverageEmptyContrast,
    safeBeelineKmOverSizeRatioEN,
    globalCoverageTimesEmptyRatio,
    avgOutDegreeTimesLogRelativeDensity,
    beelinePerNodeTimesSourceTargetDegreeRatio,
    coverageEmptyContrastTimesLogAvgBranchFactor,
    densityBySizeTimesSourceCentrality,
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
