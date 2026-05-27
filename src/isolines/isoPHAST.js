/**
 * @module src/isolines/isoPHAST
 * @description Low-level isoline distance engine using a bounded Dijkstra search.
 */

import QuadHeap from '../engines/UltraDijkstra/heap.js';

function buildPedestrianAdjacency(prepared) {
  if (prepared._isoAdjPedestrian) return prepared._isoAdjPedestrian;
  const { N, edgeSrc, edgeTgt, edgeCostInt } = prepared;
  if (!edgeSrc || !edgeTgt || !edgeCostInt) return null;

  const M = edgeSrc.length;
  const degree = new Int32Array(N);
  for (let i = 0; i < M; i++) {
    const u = edgeSrc[i];
    const v = edgeTgt[i];
    if (!Number.isInteger(u) || u < 0 || u >= N || !Number.isInteger(v) || v < 0 || v >= N) {
      throw new Error(`isoPHAST: invalid pedestrian edge ${u}->${v}`);
    }
    degree[u]++;
    degree[v]++;
  }

  const adjPtr = new Int32Array(N + 1);
  for (let u = 0; u < N; u++) adjPtr[u + 1] = adjPtr[u] + degree[u];

  const adjTo = new Int32Array(M * 2);
  const adjCost = new Int32Array(M * 2);
  const cursor = adjPtr.slice(0, N);

  for (let i = 0; i < M; i++) {
    const u = edgeSrc[i];
    const v = edgeTgt[i];
    const cost = edgeCostInt[i];
    let pos = cursor[u]++;
    adjTo[pos] = v;
    adjCost[pos] = cost;
    pos = cursor[v]++;
    adjTo[pos] = u;
    adjCost[pos] = cost;
  }

  const result = {
    adjPtr,
    adjTo,
    adjCost,
    revAdjPtr: adjPtr,
    revAdjFrom: adjTo,
    revAdjCost: adjCost,
  };
  prepared._isoAdjPedestrian = result;
  return result;
}

function getIsoAdjacency(prepared, mode) {
  if (mode === 'pedestrian') {
    return (
      buildPedestrianAdjacency(prepared) || {
        adjPtr: prepared.adjPtr,
        adjTo: prepared.adjTo,
        adjCost: prepared.adjCost,
        revAdjPtr: prepared.revAdjPtr,
        revAdjFrom: prepared.revAdjFrom,
        revAdjCost: prepared.revAdjCost,
      }
    );
  }

  return {
    adjPtr: prepared.adjPtr,
    adjTo: prepared.adjTo,
    adjCost: prepared.adjCost,
    revAdjPtr: prepared.revAdjPtr,
    revAdjFrom: prepared.revAdjFrom,
    revAdjCost: prepared.revAdjCost,
  };
}

function toSearchCost(value, scale, outputUnscaled) {
  if (!Number.isFinite(value)) return Infinity;
  return outputUnscaled ? Math.round(value * scale) : Math.round(value);
}

/**
 * Compute many-to-all distances up to a threshold using a bounded
 * Dijkstra search over the prepared adjacency representation.
 *
 * Implementation notes / internals
 * - `prepared` should be the object produced by `buildCH()` (see
 *   `../engines/router.js`). It may contain either an explicit edge list
 *   (`edgeSrc`, `edgeTgt`, `edgeCostInt`) or CSR arrays (`adjPtr`,
 *   `adjTo`, `adjCost`). `isoPHAST` prefers explicit edge lists when
 *   available because they may already reflect pedestrian pair-min
 *   collapsing.
 * - Scaling:
 *   - `buildCH()` converts float costs to integer `edgeCostInt` using
 *     `distScale` (exposed on `prepared.distScale`). `isoPHAST` reads
 *     `prepared.distScale` (fallback 10) and treats costs as integer
 *     distances for search.
 *   - When `opts.outputUnscaled === true` `isoPHAST` returns distances
 *     in original float units (meters/seconds). Otherwise it returns
 *     integer-scaled distances consistent with `distScale` (rounded).
 * - Search threshold semantics:
 *   - `threshold` remains the reachable cutoff.
 *   - `opts.searchThreshold` can be larger when callers need extra
 *     distance data for contour generation without expanding the reachable set.
 * - Direction semantics:
 *   - `direction === 'from'` computes distances from `startId`.
 *   - `direction === 'to'` computes distances to `startId` by exploring the
 *     reversed adjacency representation.
 *
 * @param {object} prepared - prepared adjacency object (see above)
 * @param {number} startId - graph node id to start from
 * @param {number} threshold - numeric cutoff (same units as returned distances)
 * @param {object} [opts]
 * @param {'from'|'to'} [opts.direction='from'] - direction semantics for the isoline
 * @param {string} [opts.mode='car'] - routing mode; when 'pedestrian' the graph is treated as undirected
 * @param {boolean} [opts.outputUnscaled=false] - if true, return distances in original units (float)
 * @param {number} [opts.searchThreshold] - optional search radius for contour point sampling
 * @returns {{ distances: Float64Array, reachable: number[], visited: number[] }}
 */
export default function isoPHAST(prepared, startId, threshold, opts = {}) {
  if (!prepared || typeof prepared !== 'object') {
    throw new Error('Invalid prepared graph for isoPHAST');
  }

  const { N } = prepared;
  if (!Number.isInteger(N)) throw new Error('Prepared graph missing node count `N`.');

  const {
    direction = 'from',
    mode = 'car',
    outputUnscaled = false,
    searchThreshold = threshold,
  } = opts;

  if (direction !== 'from' && direction !== 'to') {
    throw new Error('Invalid direction: expected "from" or "to".');
  }

  if (!Number.isInteger(startId) || startId < 0 || startId >= N) {
    throw new Error(`Invalid startId ${startId}: expected integer in range 0..${N - 1}`);
  }

  const distances = new Float64Array(N).fill(Infinity);
  const visited = new Uint32Array(N);
  let visitedLen = 0;
  const scale = prepared.distScale && Number.isFinite(prepared.distScale) ? prepared.distScale : 10;
  const searchCostThreshold = toSearchCost(searchThreshold, scale, outputUnscaled);
  const reachableCostThreshold = toSearchCost(threshold, scale, outputUnscaled);
  const adjacency = getIsoAdjacency(prepared, mode);
  const useReverse = direction === 'to';
  const adjPtr = useReverse ? adjacency.revAdjPtr : adjacency.adjPtr;
  const adjTo = useReverse ? adjacency.revAdjFrom : adjacency.adjTo;
  const adjCost = useReverse ? adjacency.revAdjCost : adjacency.adjCost;
  const heap = new QuadHeap(N);

  distances[startId] = 0;
  heap.pushOrReduce(startId, 0);
  visited[visitedLen++] = startId;

  while (!heap.isEmpty()) {
    const u = heap.pop();
    const du = distances[u];
    if (du > searchCostThreshold) break;

    const start = adjPtr[u];
    const end = adjPtr[u + 1];
    for (let k = start; k < end; k++) {
      const v = adjTo[k];
      const candidate = du + adjCost[k];
      if (candidate > searchCostThreshold || candidate >= distances[v]) continue;
      if (!Number.isFinite(distances[v])) visited[visitedLen++] = v;
      distances[v] = candidate;
      heap.pushOrReduce(v, candidate);
    }
  }

  const reachable = [];
  for (let i = 0; i < visitedLen; i++) {
    const node = visited[i];
    if (Number.isFinite(distances[node]) && distances[node] <= reachableCostThreshold) {
      reachable.push(node);
    }
  }

  if (outputUnscaled) {
    for (let i = 0; i < visitedLen; i++) {
      const node = visited[i];
      distances[node] = distances[node] / scale;
    }
  }

  return { distances, reachable, visited: visited.subarray(0, visitedLen) };
}
