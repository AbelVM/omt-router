/**
 * @module src/engines/BidirectionalAStar/index
 * @description CPU bidirectional A* routing with heuristic search.
 */
import { haversineDistance as haversine } from '../../utils/misc.js';

const DIST_SCALE = 10;
const INF_I32 = 2_000_000_000;
const MAX_HEAP_BUFFER_BYTES = 1 << 30; // 1 GiB total for heap arrays (costs + nodes)
const MAX_HEAP_ELEMENTS = MAX_HEAP_BUFFER_BYTES / (Int32Array.BYTES_PER_ELEMENT * 2);
const RESIZABLE_ARRAY_BUFFER_SUPPORTED = (() => {
  if (typeof ArrayBuffer === 'undefined' || typeof ArrayBuffer.prototype.resize !== 'function') {
    return false;
  }
  try {
    new ArrayBuffer(0, { maxByteLength: 0 });
    return true;
  } catch {
    return false;
  }
})();

const WORKSPACE = Symbol('BidirectionalAStarWorkspace');
const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;

function heuristicMeters(a, b) {
  const lat1 = a[1] * DEG_TO_RAD;
  const lat2 = b[1] * DEG_TO_RAD;
  const dLat = lat2 - lat1;
  const dLng = (b[0] - a[0]) * DEG_TO_RAD;
  const meanLat = (lat1 + lat2) * 0.5;
  const x = dLng * Math.cos(meanLat);
  const y = dLat;
  return Math.hypot(x, y) * EARTH_RADIUS_M;
}

/**
 * Drop bidirectional A* scratch buffers held on a prepared graph.
 * @param {object} prepared
 */
export function releasePreparedWorkspace(prepared) {
  if (prepared?.[WORKSPACE]) {
    prepared[WORKSPACE] = undefined;
  }
}

function ensureWorkspace(prepared, N) {
  let ws = prepared[WORKSPACE];
  if (!ws || ws.N !== N) {
    ws = {
      N,
      distFwd: new Int32Array(N).fill(INF_I32),
      distBwd: new Int32Array(N).fill(INF_I32),
      prevFwd: new Int32Array(N).fill(-1),
      nextBwd: new Int32Array(N).fill(-1),
      settled: new Uint8Array(N),
      heapFwd: new MinHeap(),
      heapBwd: new MinHeap(),
    };
    prepared[WORKSPACE] = ws;
    return ws;
  }

  ws.distFwd.fill(INF_I32);
  ws.distBwd.fill(INF_I32);
  ws.prevFwd.fill(-1);
  ws.nextBwd.fill(-1);
  ws.settled.fill(0);
  ws.heapFwd.clear();
  ws.heapBwd.clear();
  return ws;
}

/**
 * Binary min-heap backed by flat typed arrays.
 *
 * Flat Int32Array (costs) + Int32Array (nodes) store both values
 * contiguously, avoiding per-push object allocation.
 */
class MinHeap {
  #costBuffer;
  #nodeBuffer;
  #costs;
  #nodes;
  #size = 0;
  #cap;

  constructor(initialCapacity = 256) {
    this.#cap = initialCapacity;
    if (RESIZABLE_ARRAY_BUFFER_SUPPORTED) {
      this.#costBuffer = new ArrayBuffer(initialCapacity * Int32Array.BYTES_PER_ELEMENT, {
        maxByteLength: MAX_HEAP_BUFFER_BYTES,
      });
      this.#nodeBuffer = new ArrayBuffer(initialCapacity * Int32Array.BYTES_PER_ELEMENT, {
        maxByteLength: MAX_HEAP_BUFFER_BYTES,
      });
      this.#costs = new Int32Array(this.#costBuffer);
      this.#nodes = new Int32Array(this.#nodeBuffer);
    } else {
      this.#costs = new Int32Array(initialCapacity);
      this.#nodes = new Int32Array(initialCapacity);
    }
  }

  #grow() {
    const nextCap = Math.min(this.#cap * 2, MAX_HEAP_ELEMENTS);
    if (nextCap <= this.#cap) {
      throw new Error('BidirectionalAStar heap capacity exceeded');
    }
    this.#cap = nextCap;
    if (RESIZABLE_ARRAY_BUFFER_SUPPORTED) {
      const newCostBytes = this.#cap * Int32Array.BYTES_PER_ELEMENT;
      const newNodeBytes = this.#cap * Int32Array.BYTES_PER_ELEMENT;
      this.#costBuffer.resize(newCostBytes);
      this.#nodeBuffer.resize(newNodeBytes);
      this.#costs = new Int32Array(this.#costBuffer);
      this.#nodes = new Int32Array(this.#nodeBuffer);
      return;
    }

    const c = new Int32Array(this.#cap);
    const n = new Int32Array(this.#cap);
    c.set(this.#costs);
    n.set(this.#nodes);
    this.#costs = c;
    this.#nodes = n;
  }

  clear() {
    this.#size = 0;
  }

  push(cost, node) {
    if (this.#size === this.#cap) this.#grow();
    let i = this.#size++;
    this.#costs[i] = cost;
    this.#nodes[i] = node;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.#costs[p] <= this.#costs[i]) break;
      const tc = this.#costs[p];
      this.#costs[p] = this.#costs[i];
      this.#costs[i] = tc;
      const tn = this.#nodes[p];
      this.#nodes[p] = this.#nodes[i];
      this.#nodes[i] = tn;
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
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < this.#size && this.#costs[l] < this.#costs[s]) s = l;
        if (r < this.#size && this.#costs[r] < this.#costs[s]) s = r;
        if (s === i) break;
        const tc = this.#costs[s];
        this.#costs[s] = this.#costs[i];
        this.#costs[i] = tc;
        const tn = this.#nodes[s];
        this.#nodes[s] = this.#nodes[i];
        this.#nodes[i] = tn;
        i = s;
      }
    }
    return { cost, node };
  }

  peek() {
    return this.#size > 0 ? this.#costs[0] : Infinity;
  }

  get size() {
    return this.#size;
  }
}

/**
 * CPU bidirectional A* — expands from both start (forward) and end (backward)
 * simultaneously, always choosing the frontier with the smaller heap top.
 *
 * @param {number} startId
 * @param {number} endId
 * @param {object} prepared result of buildCH()
 */
export function bidirectionalAStar(startId, endId, prepared) {
  const { adjPtr, adjTo, adjCost, revAdjPtr, revAdjFrom, revAdjCost, N, coordsArr, costField } =
    prepared;
  const startCoords = coordsArr[startId];
  const endCoords = coordsArr[endId];

  const useHeuristic = costField !== 'travelTime';
  const useFastHeuristic = prepared.coordsAreGeographic !== false;
  const distanceHeuristic = useFastHeuristic ? heuristicMeters : haversine;
  const hFwd = useHeuristic
    ? (id) => Math.round(distanceHeuristic(coordsArr[id], endCoords) * DIST_SCALE)
    : () => 0;
  const hBwd = useHeuristic
    ? (id) => Math.round(distanceHeuristic(coordsArr[id], startCoords) * DIST_SCALE)
    : () => 0;

  const { distFwd, distBwd, prevFwd, nextBwd, settled, heapFwd: pqFwd, heapBwd: pqBwd } =
    ensureWorkspace(prepared, N);

  distFwd[startId] = 0;
  distBwd[endId] = 0;

  pqFwd.push(hFwd(startId), startId);
  pqBwd.push(hBwd(endId), endId);

  // settled[v] bit 0 = settled by forward, bit 1 = settled by backward.
  let bestCost = INF_I32;
  let meetNode = -1;

  while (pqFwd.size > 0 || pqBwd.size > 0) {
    const fwdTop = pqFwd.size > 0 ? pqFwd.peek() : INF_I32;
    const bwdTop = pqBwd.size > 0 ? pqBwd.peek() : INF_I32;
    if (fwdTop >= bestCost && bwdTop >= bestCost) break;

    if (fwdTop <= bwdTop) {
      const { cost: f, node: u } = pqFwd.pop();
      const g = f - hFwd(u);
      if (g > distFwd[u]) continue;
      if (settled[u] & 1) continue;
      settled[u] |= 1;

      if (settled[u] & 2) {
        const total = distFwd[u] + distBwd[u];
        if (total < bestCost) {
          bestCost = total;
          meetNode = u;
        }
      }

      for (let k = adjPtr[u], end = adjPtr[u + 1]; k < end; k++) {
        const v = adjTo[k];
        const nd = distFwd[u] + adjCost[k];
        if (nd < distFwd[v]) {
          distFwd[v] = nd;
          prevFwd[v] = u;
          pqFwd.push(nd + hFwd(v), v);
          if (settled[v] & 2) {
            const total = nd + distBwd[v];
            if (total < bestCost) {
              bestCost = total;
              meetNode = v;
            }
          }
        }
      }
    } else {
      const { cost: f, node: u } = pqBwd.pop();
      const g = f - hBwd(u);
      if (g > distBwd[u]) continue;
      if (settled[u] & 2) continue;
      settled[u] |= 2;

      if (settled[u] & 1) {
        const total = distFwd[u] + distBwd[u];
        if (total < bestCost) {
          bestCost = total;
          meetNode = u;
        }
      }

      for (let k = revAdjPtr[u], end = revAdjPtr[u + 1]; k < end; k++) {
        const v = revAdjFrom[k];
        const nd = distBwd[u] + revAdjCost[k];
        if (nd < distBwd[v]) {
          distBwd[v] = nd;
          nextBwd[v] = u;
          pqBwd.push(nd + hBwd(v), v);
          if (settled[v] & 1) {
            const total = distFwd[v] + nd;
            if (total < bestCost) {
              bestCost = total;
              meetNode = v;
            }
          }
        }
      }
    }
  }

  if (meetNode === -1 || bestCost >= INF_I32) {
    return { path: [], cost: Infinity, found: false, engine: 'bidirectional-astar' };
  }

  const fwdHalf = [meetNode];
  let cur = meetNode;
  let safety = N;
  while (cur !== startId && safety-- > 0) {
    const parent = prevFwd[cur];
    if (parent === -1) {
      return { path: [], cost: Infinity, found: false, engine: 'bidirectional-astar' };
    }
    fwdHalf.push(parent);
    cur = parent;
  }
  if (cur !== startId) {
    return { path: [], cost: Infinity, found: false, engine: 'bidirectional-astar' };
  }
  fwdHalf.reverse();

  const bwdHalf = [];
  cur = meetNode;
  safety = N;
  while (cur !== endId && safety-- > 0) {
    const next = nextBwd[cur];
    if (next === -1) {
      return { path: [], cost: Infinity, found: false, engine: 'bidirectional-astar' };
    }
    bwdHalf.push(next);
    cur = next;
  }
  if (cur !== endId) {
    return { path: [], cost: Infinity, found: false, engine: 'bidirectional-astar' };
  }

  const path = [...fwdHalf, ...bwdHalf];
  return { path, cost: bestCost / DIST_SCALE, found: true, engine: 'bidirectional-astar' };
}
