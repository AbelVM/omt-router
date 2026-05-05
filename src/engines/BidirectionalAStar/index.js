import { haversineDistance as haversine } from '../../utils/misc.js';

const DIST_SCALE = 10;
const INF_I32 = 2_000_000_000;

/**
 * Binary min-heap backed by flat typed arrays.
 *
 * Flat Float64Array (costs) + Int32Array (nodes) store both values
 * contiguously, avoiding per-push object allocation.
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
        const l = 2 * i + 1;
        const r = 2 * i + 2;
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
  const { adjPtr, adjTo, adjCost, revAdjPtr, revAdjFrom, revAdjCost, N, coordsArr, costField } = prepared;
  const startCoords = coordsArr[startId];
  const endCoords = coordsArr[endId];

  const useHeuristic = costField !== 'travelTime';
  const hFwd = useHeuristic
    ? (id) => Math.round(haversine(coordsArr[id], endCoords) * DIST_SCALE)
    : () => 0;
  const hBwd = useHeuristic
    ? (id) => Math.round(haversine(coordsArr[id], startCoords) * DIST_SCALE)
    : () => 0;

  const distFwd = new Int32Array(N).fill(INF_I32);
  const distBwd = new Int32Array(N).fill(INF_I32);
  // Parent pointers for deterministic full-path reconstruction.
  // prevFwd[v] = predecessor of v on the best known path from start to v.
  // nextBwd[v] = next node after v on the best known path from v to end.
  const prevFwd = new Int32Array(N).fill(-1);
  const nextBwd = new Int32Array(N).fill(-1);

  distFwd[startId] = 0;
  distBwd[endId] = 0;

  const pqFwd = new MinHeap();
  const pqBwd = new MinHeap();

  pqFwd.push(hFwd(startId), startId);
  pqBwd.push(hBwd(endId), endId);

  // settled[v] bit 0 = settled by forward, bit 1 = settled by backward.
  const settled = new Uint8Array(N);
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
    return { path: [], cost: Infinity, found: false, engine: 'cpu' };
  }

  const fwdHalf = [meetNode];
  let cur = meetNode;
  let safety = N;
  while (cur !== startId && safety-- > 0) {
    const parent = prevFwd[cur];
    if (parent === -1) return { path: [], cost: Infinity, found: false, engine: 'cpu' };
    fwdHalf.push(parent);
    cur = parent;
  }
  if (cur !== startId) return { path: [], cost: Infinity, found: false, engine: 'cpu' };
  fwdHalf.reverse();

  const bwdHalf = [];
  cur = meetNode;
  safety = N;
  while (cur !== endId && safety-- > 0) {
    const next = nextBwd[cur];
    if (next === -1) return { path: [], cost: Infinity, found: false, engine: 'cpu' };
    bwdHalf.push(next);
    cur = next;
  }
  if (cur !== endId) return { path: [], cost: Infinity, found: false, engine: 'cpu' };

  const path = [...fwdHalf, ...bwdHalf];
  return { path, cost: bestCost / DIST_SCALE, found: true, engine: 'cpu' };
}
