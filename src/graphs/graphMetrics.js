/**
 * @module graphs/graphMetrics
 *
 * Graph analysis helpers for route metrics, density features, and prepared
 * graph summaries. This module supports both raw graph objects produced by
 * graphBuilder and prepared graphs used by the routing engine.
 */
import { haversineDistance } from '../utils/misc.js';

/**
 * @typedef {{
 *   id: number,
 *   coords: [number, number]
 * }} RawNode
 */

/**
 * @typedef {{
 *   source: number,
 *   target: number,
 *   fibonacciScore?: number,
 *   [key: string]: unknown
 * }} RawEdge
 */

/**
 * @typedef {{
 *   nodes: Map<number, RawNode>,
 *   edges: RawEdge[],
 *   nodeIndex: Map<string, number>,
 * } & RawGraphExtras} RawGraph
 */

/**
 * @typedef {{
 *   N: number,
 *   E: number,
 *   adjPtr: Int32Array,
 *   coordsArr: Array<[number, number]>,
 *   coordsFloat32?: Float32Array,
 *   _densitySampler?: UniversalGraphSampler,
 *   [key: string]: unknown
 * }} PreparedGraph
 */

/**
 * @typedef {{
 *   outDegree?: Int32Array,
 *   outCarCentrality?: Int32Array,
 *   [key: string]: unknown
 * }} RawGraphExtras
 */

/**
 * @typedef {{
 *   nodeCount: number, -- Total number of nodes in the graph.
 *   edgeCount: number, -- Total number of directed edges in the graph.
 *   averageNodeDegree: number, -- Average outgoing degree per node (edgeCount / nodeCount).
 *   beelinePerNode: number, -- Haversine distance between source and target divided by node count, as a measure of graph "directness".
 *   nodeDegreeSource: number, -- Outgoing degree of the source node.
 *   nodeDegreeTarget: number, -- Outgoing degree of the target node.
 *   nodeCentralitySource: number, -- Centrality of the source node.
 *   nodeCentralityTarget: number, -- Centrality of the target node.
 *   safeN?: number, -- Total number of nodes in the graph.
 *   safeE?: number, -- Total number of directed edges in the graph.
 *   safeBeelineKm?: number, -- Straight-line distance between source and target in kilometers.
 *   avgOutDegree?: number, -- Average outgoing degree per node.
 *   graphDensity?: number, -- Relative density normalized by expected coverage.
 *   emptyRatio?: number,   -- Ratio of empty nodes in the graph.
 *   globalCoverage?: number, -- Global coverage metric of the graph.
 *   relativeDensity?: number,  -- Relative density of the graph.
 *   haversineDistance: number, -- Haversine distance between source and target nodes.
 * }} GraphMetrics
 */

/**
 * Returns a set of graph metrics using both prepared and raw graph inputs.
 * This is designed to be called from the router after buildCH to gather all relevant metrics in one pass.
 * The raw graph is only needed for mode-specific centrality metrics that rely on edge weights (e.g. car mode with fibonacciScore).
 * @param {PreparedGraph} preparedGraph - Prepared graph object from buildCH.
 * @param {RawGraph} [rawGraph] - Raw graph from buildGraph(), used for node centrality when mode-specific edge weights are required.
 * @param {number} sourceId
 * @param {number} targetId
 * @param {object} [opts]
 * @param {'car'|'pedestrian'|'bicycle'|string} [opts.mode]
 * @param {object} [opts.densityOpts]
 * @returns {GraphMetrics}
 */
export function getAllGraphMetrics(preparedGraph, rawGraph, sourceId, targetId, opts = {}) {
  const { mode = 'distance', densityOpts = {} } = opts;
  const nodeCount = preparedGraph.N ?? preparedGraph.coordsArr?.length ?? 0;
  const edgeCount = preparedGraph.E ?? preparedGraph.edges?.length ?? 0;
  const src = preparedGraph.coordsArr?.[sourceId];
  const tgt = preparedGraph.coordsArr?.[targetId];
  const beelineM = src && tgt ? haversineDistance(src, tgt) : 0;
  const centralityGraph = mode === 'car' && rawGraph?.edges ? rawGraph : preparedGraph;
  const { sourceCentrality, targetCentrality } = nodeCentralityForPair(
    centralityGraph,
    sourceId,
    targetId,
    mode
  );
  const averageOutDegree = nodeCount ? edgeCount / nodeCount : 0;
  const adjPtr = preparedGraph.adjPtr;
  const nodeDegreeSource =
    adjPtr && sourceId >= 0 && sourceId + 1 < adjPtr.length
      ? adjPtr[sourceId + 1] - adjPtr[sourceId]
      : nodeDegree(preparedGraph, sourceId);
  const nodeDegreeTarget =
    adjPtr && targetId >= 0 && targetId + 1 < adjPtr.length
      ? adjPtr[targetId + 1] - adjPtr[targetId]
      : nodeDegree(preparedGraph, targetId);
  let emptyRatio = 0;
  let globalCoverage = 0;
  let relativeDensity = 0;
  if (beelineM) {
    const density = getDensityFeatures(preparedGraph, src, tgt, densityOpts);
    emptyRatio = density.emptyRatio;
    globalCoverage = density.globalCoverage;
    relativeDensity = density.relativeDensity;
  }

  return {
    nodeCount,
    edgeCount,
    safeN: nodeCount,
    safeE: edgeCount,
    safeBeelineKm: beelineM / 1000,
    averageNodeDegree: averageOutDegree,
    avgOutDegree: averageOutDegree,
    graphDensity: relativeDensity,
    beelinePerNode: beelineM ? beelineM / (nodeCount || 1) : 0,
    nodeDegreeSource,
    nodeDegreeTarget,
    nodeCentralitySource: sourceCentrality,
    nodeCentralityTarget: targetCentrality,
    emptyRatio,
    globalCoverage,
    relativeDensity,
    haversineDistance: beelineM,
  };
}

// --- Basic Graph Metrics ---
/**
 * Returns the number of nodes in a graph.
 * Supports both prepared graphs from buildCH and raw graphs from buildGraph.
 * @param {PreparedGraph|RawGraph} graph
 * @returns {number}
 */
export function countNodes(graph) {
  return graph.N ?? graph.nodes?.size ?? 0;
}

/**
 * Returns the number of directed edges in a graph.
 * Supports both prepared graphs from buildCH and raw graphs from buildGraph.
 * @param {PreparedGraph|RawGraph} graph
 * @returns {number}
 */
export function countEdges(graph) {
  return graph.E ?? graph.edges?.length ?? 0;
}

/**
 * Returns the beeline distance between two nodes divided by node count.
 * @param {{coordsArr: Array<[number,number]>, N:number}} preparedGraph - Prepared graph from buildCH.
 * @param {number} sourceId
 * @param {number} targetId
 */
export function beelinePerNode(preparedGraph, sourceId, targetId) {
  const src = preparedGraph.coordsArr?.[sourceId];
  const tgt = preparedGraph.coordsArr?.[targetId];
  if (!src || !tgt) return 0;
  return haversineDistance(src, tgt) / (countNodes(preparedGraph) || 1);
}

/**
 * Returns the number of outgoing edges for a node in a prepared graph.
 * @param {PreparedGraph} preparedGraph - Prepared graph from buildCH.
 * @param {number} nodeId
 * @returns {number}
 */
export function nodeDegree(preparedGraph, nodeId) {
  if (!preparedGraph.adjPtr || nodeId < 0 || nodeId >= countNodes(preparedGraph)) return 0;
  return preparedGraph.adjPtr[nodeId + 1] - preparedGraph.adjPtr[nodeId];
}

/**
 * Returns the average outgoing degree per node.
 * @param {{E:number, N:number}} preparedGraph - Prepared graph from buildCH.
 * @returns {number}
 */
export function averageNodeDegree(preparedGraph) {
  const n = countNodes(preparedGraph);
  if (!n) return 0;
  return (countEdges(preparedGraph) || 0) / n;
}

function nodeCentralityForPair(graph, sourceId, targetId, mode = '') {
  if (graph.adjPtr) {
    const adjPtr = graph.adjPtr;
    return {
      sourceCentrality:
        sourceId >= 0 && sourceId + 1 < adjPtr.length ? adjPtr[sourceId + 1] - adjPtr[sourceId] : 0,
      targetCentrality:
        targetId >= 0 && targetId + 1 < adjPtr.length ? adjPtr[targetId + 1] - adjPtr[targetId] : 0,
    };
  }

  if (!graph.edges) {
    return { sourceCentrality: 0, targetCentrality: 0 };
  }

  if (mode === 'car' && graph.outCarCentrality) {
    return {
      sourceCentrality: graph.outCarCentrality[sourceId] ?? 0,
      targetCentrality: graph.outCarCentrality[targetId] ?? 0,
    };
  }

  if (graph.outDegree) {
    return {
      sourceCentrality: graph.outDegree[sourceId] ?? 0,
      targetCentrality: graph.outDegree[targetId] ?? 0,
    };
  }

  let sourceCentrality = 0;
  let targetCentrality = 0;
  const weighted = mode === 'car';
  const edges = graph.edges;

  if (sourceId === targetId) {
    for (const edge of edges) {
      if (edge.source === sourceId) {
        sourceCentrality += weighted ? (edge.fibonacciScore ?? 1) : 1;
      }
    }
    return { sourceCentrality, targetCentrality: sourceCentrality };
  }

  for (const edge of edges) {
    if (edge.source === sourceId) {
      sourceCentrality += weighted ? (edge.fibonacciScore ?? 1) : 1;
    } else if (edge.source === targetId) {
      targetCentrality += weighted ? (edge.fibonacciScore ?? 1) : 1;
    }
  }

  return { sourceCentrality, targetCentrality };
}

/**
 * Returns a simple degree centrality score for a node.
 * If the graph is a raw buildGraph result and the mode is `car`, this uses
 * `edge.fibonacciScore` weights for edge hierarchy-aware centrality.
 * @param {PreparedGraph|RawGraph} graph
 * @param {number} nodeId
 * @param {'car'|'pedestrian'|'bicycle'|string} [mode]
 * @returns {number}
 */
export function nodeCentrality(graph, nodeId, mode = '') {
  if (graph.adjPtr) {
    const adjPtr = graph.adjPtr;
    return nodeId >= 0 && nodeId + 1 < adjPtr.length ? adjPtr[nodeId + 1] - adjPtr[nodeId] : 0;
  }

  if (!graph.edges || nodeId < 0) return 0;

  if (mode === 'car' && graph.outCarCentrality) {
    return graph.outCarCentrality[nodeId] ?? 0;
  }
  if (graph.outDegree) {
    return graph.outDegree[nodeId] ?? 0;
  }

  let centrality = 0;
  const weighted = mode === 'car';
  const edges = graph.edges;
  for (const edge of edges) {
    if (edge.source === nodeId) {
      centrality += weighted ? (edge.fibonacciScore ?? 1) : 1;
    }
  }
  return centrality;
}

// --- Density Features ---
/** @type {WeakMap<object, { maxRes: number, sampler: UniversalGraphSampler }>} */
const _densitySamplerCache = new WeakMap();

/**
 * Returns density features using UniversalGraphSampler.
 * @param {{coordsArr: Array<[number,number]>, N:number}} preparedGraph - Prepared graph from buildCH.
 * @param {[number, number]} srcCoords
 * @param {[number, number]} tgtCoords
 * @param {object} [opts]
 * @returns {{ emptyRatio: number, globalCoverage: number, relativeDensity: number }}
 */
export function getDensityFeatures(preparedGraph, srcCoords, tgtCoords, opts = {}) {
  const maxRes = opts.maxRes || 256;
  const totalNodes = preparedGraph.N || 0;
  if (!totalNodes || !preparedGraph.coordsArr) {
    return { emptyRatio: 1, globalCoverage: 0, relativeDensity: 0 };
  }

  const expectedLength = totalNodes * 2;
  const coordsArr = preparedGraph.coordsArr;

  let cached = _densitySamplerCache.get(preparedGraph);
  if (!cached || cached.maxRes !== maxRes) {
    const coords = new Float32Array(expectedLength);
    for (let i = 0; i < totalNodes; i++) {
      const c = coordsArr[i];
      coords[i * 2] = c[0];
      coords[i * 2 + 1] = c[1];
    }
    cached = { maxRes, sampler: new UniversalGraphSampler(coords, maxRes) };
    _densitySamplerCache.set(preparedGraph, cached);
  }

  return cached.sampler.getDensityFeatures(srcCoords[0], srcCoords[1], tgtCoords[0], tgtCoords[1]);
}

// --- UniversalGraphSampler (existing, keep as is) ---
class UniversalGraphSampler {
  /**
   * @param {Float32Array} nodeCoords - [x1, y1, x2, y2, ...]
   * @param {number} maxRes - Resolución máxima del lado más largo (ej. 512)
   */
  constructor(nodeCoords, maxRes = 512) {
    this.maxRes = maxRes;

    // 1. Calcular AABB Global
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let i = 0; i < nodeCoords.length; i += 2) {
      const x = nodeCoords[i];
      const y = nodeCoords[i + 1];
      if (x < bounds.minX) bounds.minX = x;
      if (x > bounds.maxX) bounds.maxX = x;
      if (y < bounds.minY) bounds.minY = y;
      if (y > bounds.maxY) bounds.maxY = y;
    }
    this.bounds = bounds;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    // 2. Ajustar dimensiones del grid para grafos "gusano"
    // Mantenemos la resolución en el eje más largo para no perder detalle
    if (width >= height) {
      this.resX = maxRes;
      this.resY = Math.max(1, Math.floor(maxRes * (height / width)));
    } else {
      this.resY = maxRes;
      this.resX = Math.max(1, Math.floor(maxRes * (width / height)));
    }

    this.scaleX = (this.resX - 1) / (width || 1);
    this.scaleY = (this.resY - 1) / (height || 1);
    this.totalCells = this.resX * this.resY;
    this.sat = new Uint32Array(this.totalCells);
    this._build(nodeCoords);
  }

  _build(coords) {
    const sat = this.sat;
    const { minX, minY } = this.bounds;
    const scaleX = this.scaleX;
    const scaleY = this.scaleY;
    const resX = this.resX;
    const resY = this.resY;
    const coordsLen = coords.length;

    sat.fill(0);
    for (let i = 0; i < coordsLen; i += 2) {
      const gx = Math.floor((coords[i] - minX) * scaleX);
      const gy = Math.floor((coords[i + 1] - minY) * scaleY);
      sat[gy * resX + gx] = 1;
    }

    // Construcción de la Summed-Area Table (SAT) in-place
    for (let y = 0; y < resY; y++) {
      let rowSum = 0;
      const rowOffset = y * resX;
      const aboveOffset = rowOffset - resX;
      for (let x = 0; x < resX; x++) {
        rowSum += sat[rowOffset + x];
        const above = y > 0 ? sat[aboveOffset + x] : 0;
        sat[rowOffset + x] = rowSum + above;
      }
    }

    // Guardamos la ocupación total para el índice global
    this.totalOccupiedCells = sat[this.totalCells - 1];
    this.invTotalOccupiedCells = 1 / (this.totalOccupiedCells || 1);
    this.globalAreaScale = this.totalCells * this.invTotalOccupiedCells;
  }

  /**
   * Devuelve las características de densidad para la inferencia
   */
  getDensityFeatures(x1, y1, x2, y2) {
    const { minX, minY } = this.bounds;
    const resX = this.resX;
    const resY = this.resY;
    const scaleX = this.scaleX;
    const scaleY = this.scaleY;
    const sat = this.sat;
    const invTotalOccupiedCells = this.invTotalOccupiedCells;
    const globalAreaScale = this.globalAreaScale;

    let gx1 = Math.floor((x1 - minX) * scaleX);
    let gy1 = Math.floor((y1 - minY) * scaleY);
    let gx2 = Math.floor((x2 - minX) * scaleX);
    let gy2 = Math.floor((y2 - minY) * scaleY);

    let xMin = gx1 < gx2 ? gx1 : gx2;
    let xMax = gx1 < gx2 ? gx2 : gx1;
    let yMin = gy1 < gy2 ? gy1 : gy2;
    let yMax = gy1 < gy2 ? gy2 : gy1;

    if (xMin < 0) xMin = 0;
    else if (xMin >= resX) xMin = resX - 1;
    if (xMax < 0) xMax = 0;
    else if (xMax >= resX) xMax = resX - 1;
    if (yMin < 0) yMin = 0;
    else if (yMin >= resY) yMin = resY - 1;
    if (yMax < 0) yMax = 0;
    else if (yMax >= resY) yMax = resY - 1;

    const base = yMax * resX;
    const D = sat[base + xMax];
    const B = yMin > 0 ? sat[(yMin - 1) * resX + xMax] : 0;
    const C = xMin > 0 ? sat[base + xMin - 1] : 0;
    const A = xMin > 0 && yMin > 0 ? sat[(yMin - 1) * resX + xMin - 1] : 0;

    const localOccupied = D - B - C + A;
    const localTotalCells = (xMax - xMin + 1) * (yMax - yMin + 1);
    const emptyRatio = 1.0 - localOccupied / localTotalCells;
    const globalCoverage = localOccupied * invTotalOccupiedCells;
    const relativeDensity = (localOccupied * globalAreaScale) / localTotalCells;

    return {
      emptyRatio,
      globalCoverage,
      relativeDensity,
    };
  }
}

// --- Export all metrics as a single object for convenience ---
export const graphMetrics = {
  countNodes,
  countEdges,
  beelinePerNode,
  nodeDegree,
  averageNodeDegree,
  nodeCentrality,
  getDensityFeatures,
  haversineDistance,
  getAllGraphMetrics,
};
