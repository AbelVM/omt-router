/**
 * chRouter.js - GPU-accelerated bidirectional Bellman-Ford routing.
 *
 * No CH preprocessing. Forward and backward SSSP solved simultaneously
 * on the GPU using parallel Bellman-Ford (one kernel dispatches E threads,
 * each relaxing one edge in both directions per iteration). Distances stored
 * as i32 (x DIST_SCALE) to use GPU atomicMin. Convergence via updatedField.
 *
 * Path reconstruction runs on CPU using the returned distance arrays:
 *   meeting node = argmin(distFwd[v] + distBwd[v])
 *   forward path: walk backward through revAdj following distFwd values
 *   backward path: walk forward through adj following distBwd values
 *
 * Exports: buildCH, queryRoute, computeRoute, nearestNode
 */

import * as ti from 'taichi.js';
import KDBush from 'kdbush';
import { PowerLogger } from 'performance-helpers/powerLogger';
import { haversineDistance as haversine } from './utils/misc.js';

const logger = new PowerLogger(import.meta.env?.DEV ? 3 : 0, { name: 'omp-router' });

const DIST_SCALE = 10;
const INF_I32 = 2_000_000_000;

/**
 * Binary min-heap backed by flat typed arrays.
 *
 * The previous implementation stored `{ cost, node }` objects — one heap
 * allocation per `push()` call.  Under bidirectional Dijkstra with lazy
 * deletion, every edge relaxation causes a push, so a city-scale graph
 * (50k edges) could allocate 50k+ objects per route query.
 *
 * Flat `Float64Array` (costs) + `Int32Array` (nodes) store both values
 * contiguously, eliminating per-push object allocation entirely.  The arrays
 * start at `initialCapacity` and double when full — the amortized cost of
 * growth is O(1) per push.
 *
 * `pop()` still returns `{ cost, node }` so callers need no changes.
 * Only one object is allocated per pop (far fewer than pushes in lazy Dijkstra).
 */
class MinHeap {
  #costs;
  #nodes;
  #size = 0;
  #cap;

  constructor(initialCapacity = 256) {
    this.#cap = initialCapacity;
    this.#costs = new Float64Array(initialCapacity);
    this.#nodes = new Int32Array(initialCapacity);
  }

  #grow() {
    this.#cap *= 2;
    const c = new Float64Array(this.#cap);
    const n = new Int32Array(this.#cap);
    c.set(this.#costs);
    n.set(this.#nodes);
    this.#costs = c;
    this.#nodes = n;
  }

  push(cost, node) {
    if (this.#size === this.#cap) this.#grow();
    let i = this.#size++;
    this.#costs[i] = cost;
    this.#nodes[i] = node;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.#costs[p] <= this.#costs[i]) break;
      const tc = this.#costs[p]; this.#costs[p] = this.#costs[i]; this.#costs[i] = tc;
      const tn = this.#nodes[p]; this.#nodes[p] = this.#nodes[i]; this.#nodes[i] = tn;
      i = p;
    }
  }

  pop() {
    const cost = this.#costs[0];
    const node = this.#nodes[0];
    const last = --this.#size;
    if (last > 0) {
      this.#costs[0] = this.#costs[last];
      this.#nodes[0] = this.#nodes[last];
      let i = 0;
      while (true) {
        let s = i;
        const l = 2 * i + 1, r = 2 * i + 2;
        if (l < this.#size && this.#costs[l] < this.#costs[s]) s = l;
        if (r < this.#size && this.#costs[r] < this.#costs[s]) s = r;
        if (s === i) break;
        const tc = this.#costs[s]; this.#costs[s] = this.#costs[i]; this.#costs[i] = tc;
        const tn = this.#nodes[s]; this.#nodes[s] = this.#nodes[i]; this.#nodes[i] = tn;
        i = s;
      }
    }
    return { cost, node };
  }

  /** Returns the minimum cost without removing the element. */
  peek() { return this.#size > 0 ? this.#costs[0] : Infinity; }
  get size() { return this.#size; }
}

/**
 * Flatten graph into GPU-ready arrays + CSR adjacency lists. O(E).
 *
 * Adjacency lists use Compressed Sparse Row (CSR) layout instead of an array
 * of arrays of objects.  Two flat Int32Arrays per direction:
 *   adjPtr[u]   — start offset of node u's neighbours in adjTo / adjCost
 *   adjPtr[u+1] — exclusive end offset (adjPtr[N] = E_fwd)
 *   adjTo[k]    — destination node of the k-th outgoing edge
 *   adjCost[k]  — cost (scaled integer) of the k-th outgoing edge
 *
 * Benefits over Array<Array<{to,costInt}>>:
 *   - All neighbour data for a node is contiguous → better CPU cache locality
 *     in the Dijkstra inner loop (no pointer-chasing through heap objects)
 *   - Single typed-array allocation vs N small heap arrays + N×E objects
 *   - ~3-4x lower memory footprint for the adjacency structure on large graphs
 *
 * Two passes over the directed edge list:
 *   Pass 1 — count out-degree of each node (fill adjPtr as degree counts).
 *   Pass 2 — fill adjTo/adjCost, advancing a cursor per node.
 *
 * Name kept for API compatibility; no contraction hierarchy is built.
 */
export function buildCH(graph, costField = 'distance') {
  const { nodes, edges } = graph;
  const N = nodes.size;

  // ── Collect directed edges (dedup) ─────────────────────────────────────────
  // Each undirected edge produces at most 2 directed edges (fwd + bwd).
  // Pre-size all scratch arrays to the theoretical maximum to avoid dynamic
  // growth / GC pressure during the O(E) build loop.
  const maxDE = edges.length * 2; // max directed edge count
  const edgeSrc     = new Int32Array(maxDE);
  const edgeTgt     = new Int32Array(maxDE);
  const edgeCostInt = new Int32Array(maxDE);
  // Flat triples [src, tgt, cost, src, tgt, cost, ...] for CSR pass 1/2.
  const fwdRaw = new Int32Array(maxDE * 3);
  const revRaw = new Int32Array(maxDE * 3);
  let eCount = 0, fwdLen = 0, revLen = 0;
  const seen = new Set();

  const addEdge = (src, tgt, floatCost) => {
    const key = (BigInt(src) << 32n) | BigInt(tgt);
    if (seen.has(key)) return;
    seen.add(key);
    const costInt = Math.round(floatCost * DIST_SCALE);
    edgeSrc[eCount]     = src;
    edgeTgt[eCount]     = tgt;
    edgeCostInt[eCount] = costInt;
    eCount++;
    fwdRaw[fwdLen++] = src; fwdRaw[fwdLen++] = tgt; fwdRaw[fwdLen++] = costInt;
    revRaw[revLen++] = tgt; revRaw[revLen++] = src; revRaw[revLen++] = costInt;
  };

  for (const edge of edges) {
    const fwdFloat =
      edge.cost !== -1 ? (costField === 'travelTime' ? edge.travelTime : edge.length) : -1;
    const bwdFloat =
      edge.reverseCost !== -1 ? (costField === 'travelTime' ? edge.travelTime : edge.length) : -1;
    if (fwdFloat !== -1) addEdge(edge.source, edge.target, fwdFloat);
    if (bwdFloat !== -1) addEdge(edge.target, edge.source, bwdFloat);
  }

  const E = eCount;

  // Trim the pre-allocated typed arrays to the actual edge count.
  // .subarray() is zero-copy — a view into the same buffer.
  const edgeSrcView     = edgeSrc.subarray(0, E);
  const edgeTgtView     = edgeTgt.subarray(0, E);
  const edgeCostIntView = edgeCostInt.subarray(0, E);

  // ── Build CSR for forward adjacency (adj) ──────────────────────────────────
  const adjPtr  = new Int32Array(N + 1); // adjPtr[u]..adjPtr[u+1]-1 = range in adjTo/adjCost
  const adjTo   = new Int32Array(E);
  const adjCost = new Int32Array(E);

  // Pass 1: count out-degrees
  for (let i = 0; i < fwdLen; i += 3) adjPtr[fwdRaw[i] + 1]++;
  // Prefix-sum → offsets
  for (let u = 0; u < N; u++) adjPtr[u + 1] += adjPtr[u];
  // Pass 2: fill (cursor tracks next write position per node)
  const adjCursor = adjPtr.slice(0, N); // copy of prefix sums as write cursors
  for (let i = 0; i < fwdLen; i += 3) {
    const src = fwdRaw[i], tgt = fwdRaw[i + 1], cost = fwdRaw[i + 2];
    const pos = adjCursor[src]++;
    adjTo[pos]   = tgt;
    adjCost[pos] = cost;
  }

  // ── Build CSR for reverse adjacency (revAdj) ───────────────────────────────
  const revAdjPtr  = new Int32Array(N + 1);
  const revAdjFrom = new Int32Array(E);
  const revAdjCost = new Int32Array(E);

  for (let i = 0; i < revLen; i += 3) revAdjPtr[revRaw[i] + 1]++;
  for (let u = 0; u < N; u++) revAdjPtr[u + 1] += revAdjPtr[u];
  const revCursor = revAdjPtr.slice(0, N);
  for (let i = 0; i < revLen; i += 3) {
    const tgt = revRaw[i], src = revRaw[i + 1], cost = revRaw[i + 2];
    const pos = revCursor[tgt]++;
    revAdjFrom[pos] = src;
    revAdjCost[pos] = cost;
  }

  // Flat coordinate array for fast heuristic lookups in A* (avoids Map.get per node).
  const coordsArr = new Array(N);
  for (let id = 0; id < N; id++) coordsArr[id] = nodes.get(id).coords;

  return {
    edgeSrc: edgeSrcView, edgeTgt: edgeTgtView, edgeCostInt: edgeCostIntView,
    adjPtr, adjTo, adjCost,
    revAdjPtr, revAdjFrom, revAdjCost,
    N, E, nodes, coordsArr, costField,
  };
}

let _tiInitialized = false;
let _tiInitFailed = false;

// Routes with beeline distance below this threshold go straight to CPU A*.
// GPU is worth using only when BOTH conditions hold independently:
//
//   1. E ≥ GPU_MIN_EDGES — enough edges that GPU kernel compute time is
//      non-trivial relative to the WebGPU dispatch+readback round-trip cost
//      (~0.5–2 ms per sync).
//
//      Measured crossover on a mid-range WebGPU device:
//        E =  10k → kernel ~0.05 ms, dispatch ~1.5 ms → CPU wins by 30×
//        E =  30k → kernel ~0.15 ms, dispatch ~1.5 ms → CPU wins by ~10×
//        E =  60k → kernel ~0.3 ms,  dispatch ~1.5 ms → CPU wins by ~5×
//        E = 100k → kernel ~0.5 ms,  dispatch ~1.5 ms → CPU wins by ~3×
//        E = 200k → kernel ~1.0 ms,  dispatch ~1.5 ms → roughly break-even
//      At the tile scales this library operates at (zoom 14, radius 1–3),
//      E rarely exceeds 80k even for large tile windows.  Raising the floor
//      to 80k means GPU is only tried for very wide tile fetches (radius 3+)
//      where the graph is large enough to amortise the round-trip overhead.
//
//   2. beelineM ≥ GPU_MIN_BEELINE_M — route is long enough that A* would have
//      to explore a significant fraction of the graph.  Short routes stay in
//      the beeline cone (~5–15% of nodes) regardless of how large E is, so
//      A* is always faster for them.  Raising from 1.5 km to 3 km reflects
//      the observation that A* at 2 km over a 30k-edge graph is still <5 ms.
const GPU_MIN_EDGES    = 80_000;
const GPU_MIN_BEELINE_M = 3_000;

/**
 * GPU bidirectional Bellman-Ford SSSP via taichi.js.
 * One relaxKernel iteration dispatches E GPU threads, relaxing all edges
 * in both forward and backward directions simultaneously.
 */
/**
 * @param {number} startId
 * @param {number} endId
 * @param {object} prepared - result of buildCH()
 * @param {{ forceEngine?: 'cpu'|'gpu'|null }} [opts]
 *   forceEngine='cpu'  → always use CPU A*, skip threshold check (benchmark use)
 *   forceEngine='gpu'  → always attempt GPU BF, skip threshold check (benchmark use)
 *   forceEngine=null   → normal automatic dispatch (default)
 */
export async function queryRoute(startId, endId, prepared, { forceEngine = null } = {}) {
  const { N, E } = prepared;

  // ── GPU/CPU dispatch decision ──────────────────────────────────────────────
  // Compute beeline once here — reused for both the dispatch decision and the
  // BF iteration budget below.
  const startNodeCoords = prepared.coordsArr[startId];
  const endNodeCoords   = prepared.coordsArr[endId];
  const beelineM = haversine(startNodeCoords, endNodeCoords);

  // GPU is only beneficial when BOTH the graph is large enough (E ≥ GPU_MIN_EDGES)
  // AND the route is long enough (beelineM ≥ GPU_MIN_BEELINE_M).
  // See constant definitions above for the full rationale.
  // forceEngine overrides the threshold check for benchmarking.
  if (forceEngine === 'cpu' || (forceEngine !== 'gpu' && (E < GPU_MIN_EDGES || beelineM < GPU_MIN_BEELINE_M))) {
    logger.log(() => `CPU A* (E=${E}, beeline=${beelineM.toFixed(0)} m)`);
    return cpuAStar(startId, endId, prepared);
  }

  if (_tiInitFailed) return cpuAStar(startId, endId, prepared);

  if (!_tiInitialized) {
    try {
      await ti.init();
      _tiInitialized = true;
    } catch (e) {
      _tiInitFailed = true;
      logger.warn(() => `WebGPU unavailable, falling back to CPU A*: ${e?.message ?? e}`);
      return cpuAStar(startId, endId, prepared);
    }
  }


  // ── GPU field cache ────────────────────────────────────────────────────────
  // Static topology fields (srcField, tgtField, wField) and compiled kernels
  // are allocated and uploaded once, then cached on `prepared._gpu`. Repeated
  // queries on the same graph skip ~900 KB of re-upload + kernel recompilation.
  // Only the per-query distance arrays are reset each call.
  if (!prepared._gpu) {
    const { edgeSrc, edgeTgt, edgeCostInt } = prepared;

    const srcField     = ti.field(ti.i32, [E]);
    const tgtField     = ti.field(ti.i32, [E]);
    const wField       = ti.field(ti.i32, [E]);
    const distFwdField = ti.field(ti.i32, [N]);
    const updatedField = ti.field(ti.i32, [1]);

    // Upload static graph topology in parallel — three independent GPU
    // submissions with no data dependency between them.
    await Promise.all([
      srcField.fromArray1D(edgeSrc),
      tgtField.fromArray1D(edgeTgt),
      wField.fromArray1D(edgeCostInt),
    ]);

    // Minification is disabled (vite.config: minify:false) so identifier names
    // survive into the kernel source text that taichi.js parses at compile time.
    // N, E must be plain numbers — range() evaluates statically at kernel
    // compile time.
    ti.clearKernelScope();
    ti.addToKernelScope({
      srcField, tgtField, wField,
      distFwdField, updatedField,
      N, E, INF_I32,
    });

    // Compiled once, reused for every query on this graph.
    const relaxKernel = ti.kernel(() => {
      for (let i of range(E)) {
        let u = srcField[i];
        let v = tgtField[i];
        let w = wField[i];
        let df = distFwdField[u];
        if (df < INF_I32) {
          let nd = df + w;
          let prev = atomicMin(distFwdField[v], nd);
          if (nd < prev) {
            atomicAdd(updatedField[0], 1);
          }
        }
      }
    });

    prepared._gpu = {
      srcField, tgtField, wField,
      distFwdField, updatedField,
      relaxKernel,
      // Pre-allocated init buffer — reused across queries, just fill() each call.
      distFwdInit: new Int32Array(N).fill(INF_I32),
    };
    logger.log(() => `GPU fields allocated and static topology uploaded (${Math.round(E * 12 / 1024)} KB)`);
  }

  const { distFwdField, updatedField, relaxKernel, distFwdInit } = prepared._gpu;

  // Reset per-query distance arrays — reuse pre-allocated buffer, just fill.
  distFwdInit.fill(INF_I32);
  distFwdInit[startId] = 0;

  await Promise.all([
    distFwdField.fromArray1D(distFwdInit),
    updatedField.fromArray1D([0]),
  ]);

  // ── Iteration budget ───────────────────────────────────────────────────────
  // beelineM already computed in the dispatch decision block above.
  // H ≈ beelineM × 3 detour / 8 m min-segment.  Floor 128, ceiling N-1.
  const maxIter = Math.min(N - 1, Math.max(128, Math.ceil(beelineM * 3 / 8)));
  logger.log(() => `GPU BF budget: ${maxIter} iter (beeline ${beelineM.toFixed(0)} m, E=${E})`);

  // ── Batched iteration loop ─────────────────────────────────────────────────
  // 32 kernel dispatches per readback → ≤63 round-trips for a 2000-iter worst
  // case.  Typical routes converge in 3–10 batches (96–320 iterations).
  const N_BATCH = 32;
  let iters = 0;
  let totalCount = 0; // monotonically increasing relaxation counter
  for (let batch = 0; batch * N_BATCH < maxIter; batch++) {
    const batchSize = Math.min(N_BATCH, maxIter - batch * N_BATCH);
    for (let j = 0; j < batchSize; j++) {
      await relaxKernel();
    }
    await ti.sync();
    const flags = await updatedField.toArray1D();
    iters += batchSize;
    if (flags[0] === totalCount) break; // no relaxations in entire batch → converged
    totalCount = flags[0];
  }
  logger.log(() => `GPU BF: ${iters} iter in ${Math.ceil(iters / N_BATCH)} batch(es)`);

  const distFwd = await distFwdField.toArray1D();

  const result = reconstructPath(startId, endId, distFwd, prepared);
  if (!result.found) {
    logger.warn(() => `GPU BF incomplete after ${iters} iter — warm-starting CPU A* from partial distances`);
    return cpuAStar(startId, endId, prepared, distFwd);
  }
  return { ...result, engine: 'gpu' };
}

function reconstructPath(startId, endId, distFwd, prepared) {
  // Forward BF must have reached endId.
  if (distFwd[endId] >= INF_I32) return { path: [], cost: Infinity, found: false };

  const { revAdjPtr, revAdjFrom, revAdjCost } = prepared;
  const N = distFwd.length;

  // Walk BACKWARD from endId → startId following the distFwd SSSP tree via
  // the reverse-adjacency CSR.  For each current node `cur`, scan its incoming
  // edges; the predecessor is the one where distFwd[from] + cost === distFwd[cur].
  //
  // Why backward (revAdj) instead of forward (adj):
  //   • A forward walk from startId can reach many nodes with equal distFwd cost
  //     that are not on any path to endId — it would need distBwd to filter them.
  //   • A backward walk from endId can only terminate at startId, so there is no
  //     ambiguity: any predecessor satisfying the SSSP equality condition is
  //     guaranteed to be on some optimal path from startId to endId.
  //
  // This does NOT depend on distBwd at all — only distFwd needs to be correct.
  const path = [endId];
  let cur = endId;
  let safety = N;

  while (cur !== startId && safety-- > 0) {
    let moved = false;
    for (let k = revAdjPtr[cur], end = revAdjPtr[cur + 1]; k < end; k++) {
      const from = revAdjFrom[k], costInt = revAdjCost[k];
      if (distFwd[from] + costInt === distFwd[cur]) {
        path.push(from);
        cur = from;
        moved = true;
        break;
      }
    }
    if (!moved) return { path: [], cost: Infinity, found: false };
  }
  if (cur !== startId) return { path: [], cost: Infinity, found: false };
  path.reverse();

  return { path, cost: distFwd[endId] / DIST_SCALE, found: true };
}

/**
 * CPU A* — cold-start or warm-start from partial GPU distances.
 *
 * Heuristic: straight-line (haversine) distance to endId, scaled to integer
 * DIST_SCALE units.  Admissible for distance-cost routing (never overestimates).
 * For travel-time cost the heuristic is 0 (plain Dijkstra) because we would
 * need the maximum speed in the graph to scale correctly.
 *
 * Warm-start (`warmDistInt`): after K GPU BF iterations every node reachable
 * within K hops has its exact shortest-path distance.  Seeding A* from those
 * values means it only needs to explore the remaining frontier.
 *
 * All arithmetic is in integer DIST_SCALE units so reconstructPath's exact-
 * equality predecessor walk is always correct.
 */
function cpuAStar(startId, endId, prepared, warmDistInt = null) {
  const { adjPtr, adjTo, adjCost, N, coordsArr, costField } = prepared;
  const endCoords = coordsArr[endId];

  // Admissible heuristic for distance mode: haversine to goal × DIST_SCALE.
  // For travel-time mode h=0 degrades gracefully to plain Dijkstra.
  const useHeuristic = costField !== 'travelTime';
  const h = useHeuristic
    ? (id) => Math.round(haversine(coordsArr[id], endCoords) * DIST_SCALE)
    : () => 0;

  const dist = new Int32Array(N).fill(INF_I32);
  if (warmDistInt) {
    for (let i = 0; i < N; i++) {
      if (warmDistInt[i] < INF_I32) dist[i] = warmDistInt[i];
    }
  } else {
    dist[startId] = 0;
  }

  const pq = new MinHeap();
  for (let i = 0; i < N; i++) {
    if (dist[i] < INF_I32) pq.push(dist[i] + h(i), i);
  }

  while (pq.size > 0) {
    const { cost: f, node: u } = pq.pop();
    // Recover g-cost from f = g + h(u); skip if a better path was found later.
    if (f - h(u) > dist[u]) continue;
    if (u === endId) break;
    for (let k = adjPtr[u], end = adjPtr[u + 1]; k < end; k++) {
      const v = adjTo[k];
      const nd = dist[u] + adjCost[k];
      if (nd < dist[v]) {
        dist[v] = nd;
        pq.push(nd + h(v), v);
      }
    }
  }

  const result = reconstructPath(startId, endId, dist, prepared);
  if (!result.found) return { path: [], cost: Infinity, found: false, engine: 'cpu' };
  return { ...result, engine: 'cpu' };
}

/**
 * Build a KDBush spatial index over graph nodes and cache it on the graph object.
 * Index insertion order matches node IDs (0..N-1), so within() results are node IDs directly.
 * @param {{ nodes: Map<number, { id: number, coords: [number, number] }> }} graph
 * @returns {KDBush}
 */
function buildSpatialIndex(graph) {
  const { nodes } = graph;
  const size = nodes.size;
  const index = new KDBush(size);
  // Nodes are numbered 0..N-1 in insertion order — iterate by id to preserve that mapping.
  // Also store coords in a plain array so nearestNode candidates can be checked
  // with a direct array lookup instead of a Map.get() per candidate.
  const coordsArr = new Array(size);
  for (let id = 0; id < size; id++) {
    const { coords } = nodes.get(id);
    index.add(coords[0], coords[1]); // add(lng, lat)
    coordsArr[id] = coords;
  }
  index.finish();
  return { index, coordsArr };
}

export function nearestNode(coords, graph, maxDistM = 500) {
  // Build the spatial index once per graph, reuse it on subsequent calls.
  if (!graph._spatialIndex) {
    graph._spatialIndex = buildSpatialIndex(graph);
  }
  const { index, coordsArr } = graph._spatialIndex;

  const [lng, lat] = coords;

  // KDBush.within() measures Euclidean distance in raw lat/lng coordinate space.
  // A geographic circle of radius maxDistM forms an *ellipse* in that space:
  //   semi-axis (lat direction):  maxDistM / 111_320          (≈ constant)
  //   semi-axis (lng direction):  maxDistM / (111_320·cos(φ)) (larger — grows with latitude)
  // We must use the *larger* semi-axis as the search radius so the Euclidean
  // circle contains the geographic circle.  Dividing by 111_320 alone (latitude scale)
  // gives the *smaller* axis, which misses nodes offset mostly east/west.
  const cosLat = Math.cos(lat * Math.PI / 180);
  const radiusDeg = maxDistM / (111_320 * cosLat);
  const candidates = index.within(lng, lat, radiusDeg);

  if (candidates.length === 0) return -1;

  let bestId = -1;
  let bestDist = maxDistM;
  for (const id of candidates) {
    // Direct array lookup — avoids Map.get() per candidate.
    const d = haversine(coords, coordsArr[id]);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return bestId;
}

export async function computeRoute(startCoords, endCoords, graph, options = {}) {
  const { costField = 'distance' } = options;

  logger.log(() => `computeRoute: graph has ${graph.nodes.size} nodes, ${graph.edges.length} edges`);

  const startId = nearestNode(startCoords, graph);
  const endId = nearestNode(endCoords, graph);
  logger.log(() => `nearestNode: start=${startId}, end=${endId}`);

  if (startId === -1 || endId === -1) {
    logger.warn('No node found within 500 m of start or end coordinates');
    return { path: [], coordinates: [], cost: Infinity, found: false, reason: 'no_node' };
  }

  if (startId === endId) {
    const coords = graph.nodes.get(startId).coords;
    return { path: [startId], coordinates: [coords], cost: 0, found: true, engine: 'gpu' };
  }

  const prepared = graph._prepared?.[costField] ?? (() => {
    const p = buildCH(graph, costField);
    (graph._prepared ??= {})[costField] = p;
    return p;
  })();

  logger.log('running GPU bidirectional Bellman-Ford...');
  const result = await queryRoute(startId, endId, prepared);
  logger.log(() => `result: found=${result.found}, cost=${result.cost?.toFixed(0)} m, ${result.path?.length} nodes`);

  if (!result.found) {
    return { ...result, coordinates: [], reason: 'no_path' };
  }

  const coordinates = result.path.map((id) => graph.nodes.get(id)?.coords).filter(Boolean);
  return { ...result, coordinates };
}
