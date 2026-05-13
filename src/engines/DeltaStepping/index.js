/**
 * @module src/engines/DeltaStepping/index
 * @description Parallel delta-stepping point-to-point routing.
 */
import { PowerPool } from 'performance-helpers/powerPool';
import deltaWorker from './delta-worker.js?worker&inline';

const INF_DISTANCE = 0x3fffffff;
const STATE_NEXT_SIZE = 0;
const MAX_PARALLEL_WORKERS = 8;
let sharedPool = null;
let sharedPoolWorkers = 0;

function getSharedPool(workerCount) {
  if (!sharedPool || sharedPoolWorkers !== workerCount) {
    sharedPool?.terminate();
    sharedPool = new PowerPool(deltaWorker, {
      size: 2,
      maxSize: workerCount,
      lazy: true,
      idleTimeout: 60_000,
      autoScale: {
        // Delta-Stepping frontiers can spike suddenly; grow in larger steps but downscale slowly.
        intervalMs: 300,
        targetMs: 60,
        alpha: 0.22,
        cooldownMs: 1_800,
        hysteresis: 0.25,
        stepUp: 2,
        stepDown: 1,
        backoffFactor: 2,
        backoffMaxMultiplier: 8,
        backoffResetMs: 10_000,
      },
    });
    sharedPoolWorkers = workerCount;
  }
  return sharedPool;
}

/**
 * DeltaSteppingSSSP implements the delta-stepping single-source shortest path
 * algorithm with optional shared-memory worker parallelism.
 */
class DeltaSteppingSSSP {
  constructor(n, m, delta = 200, {
    forceSerialRouting = false,
    minFrontierForParallel,
  } = {}) {
    this.n = n;
    this.m = m;
    this.delta = Math.max(1, delta | 0);

    this.hasParallelSupport = !forceSerialRouting && typeof SharedArrayBuffer !== 'undefined';
    this.hasWorkerSupport = typeof Worker !== 'undefined';
    const BufferType = this.hasParallelSupport ? SharedArrayBuffer : ArrayBuffer;

    const align4 = (offset) => (offset + 3) & ~3;
    let off = 0;
    this.distOff = off; off += n * 4;
    this.prevOff = off; off += n * 4;
    this.headOff = off; off += n * 4;
    this.nextOff = off; off += m * 4;
    this.targetsOff = off; off += m * 4;
    this.weightsOff = off; off += m * 4;
    this.qCurrOff = off; off += n * 4;
    this.qNextOff = off; off += n * 4;
    this.inQueueOff = off; off += n;
    this.stateOff = align4(off);
    const size = this.stateOff + 64;

    this.buffer = new BufferType(size);

    this.dist = new Int32Array(this.buffer, this.distOff, n);
    this.prev = new Int32Array(this.buffer, this.prevOff, n);
    this.head = new Int32Array(this.buffer, this.headOff, n);
    this.next = new Int32Array(this.buffer, this.nextOff, m);
    this.targets = new Int32Array(this.buffer, this.targetsOff, m);
    this.weights = new Int32Array(this.buffer, this.weightsOff, m);
    this.qCurr = new Int32Array(this.buffer, this.qCurrOff, n);
    this.qNext = new Int32Array(this.buffer, this.qNextOff, n);
    this.inQueue = new Uint8Array(this.buffer, this.inQueueOff, n);
    this.state = new Int32Array(this.buffer, this.stateOff, 8);

    const _hwConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
    const maxWorkersBelowHw = Math.max(1, _hwConcurrency - 1);
    const workerCount = Math.max(1, Math.min(MAX_PARALLEL_WORKERS, maxWorkersBelowHw));
    this.workerCount = workerCount;
    const defaultMinFrontierForParallel = 128;
    this.MIN_FRONTIER_FOR_PARALLEL = Number.isFinite(minFrontierForParallel)
      ? Math.max(1, Math.floor(minFrontierForParallel))
      : defaultMinFrontierForParallel;
    this.pool = (this.hasParallelSupport && this.hasWorkerSupport && workerCount > 1)
      ? getSharedPool(workerCount)
      : null;

    this.buckets = new Map();
    this.head.fill(-1);
    this.edgeIdx = 0;
    this.lastParallelUsed = false;
  }

  addEdge(u, v, wInt) {
    const idx = this.edgeIdx++;
    this.targets[idx] = v;
    this.weights[idx] = wInt;
    this.next[idx] = this.head[u];
    this.head[u] = idx;
  }

  loadGraph(sources, targets, weights) {
    if (typeof sources === 'number') {
      this.addEdge(sources, targets, weights);
      return;
    }

    for (let i = 0; i < sources.length; i++) {
      this.addEdge(sources[i], targets[i], weights[i]);
    }
  }

  getState(index) {
    return this.hasParallelSupport ? Atomics.load(this.state, index) : this.state[index];
  }

  setState(index, value) {
    if (this.hasParallelSupport) {
      Atomics.store(this.state, index, value);
      return;
    }
    this.state[index] = value;
  }

  addState(index, value) {
    if (this.hasParallelSupport) {
      return Atomics.add(this.state, index, value);
    }
    const current = this.state[index];
    this.state[index] += value;
    return current;
  }

  takeSmallestBucketIndex() {
    let minIdx = Infinity;
    for (const idx of this.buckets.keys()) {
      if (idx < minIdx) minIdx = idx;
    }
    return minIdx;
  }

  async solve(source) {
    this.dist.fill(INF_DISTANCE);
    this.prev.fill(-1);
    this.inQueue.fill(0);
    this.buckets.clear();

    this.dist[source] = 0;
    this.prev[source] = source;
    this.lastParallelUsed = false;

    this.addToBucket(0, source);

    while (this.buckets.size > 0) {
      const b = this.takeSmallestBucketIndex();
      if (!Number.isFinite(b)) break;

      let S = Array.from(this.buckets.get(b));
      this.buckets.delete(b);
      const settledInBucket = [];

      while (S.length > 0) {
        settledInBucket.push(...S);
        const next = await this.relaxFrontier(S, 'light');

        S = [];
        for (let i = 0; i < next.length; i++) {
          const v = next[i];
          const vBucket = Math.floor(this.dist[v] / this.delta);
          if (vBucket === b) S.push(v);
          else this.addToBucket(vBucket, v);
        }
      }

      const heavyUpdates = await this.relaxFrontier(settledInBucket, 'heavy');
      for (let i = 0; i < heavyUpdates.length; i++) {
        const v = heavyUpdates[i];
        const vBucket = Math.floor(this.dist[v] / this.delta);
        this.addToBucket(vBucket, v);
      }
    }

    return this.dist;
  }

  async relaxFrontier(nodes, mode) {
    if (nodes.length === 0) return [];

    this.setState(STATE_NEXT_SIZE, 0);
    this.qCurr.set(nodes, 0);
    this.inQueue.fill(0);

    if (this.pool && nodes.length >= this.MIN_FRONTIER_FOR_PARALLEL) {
      try {
        this.lastParallelUsed = true;
        await this.dispatchParallel(nodes.length, mode);
      } catch {
        this.dispatchSerial(nodes.length, mode);
      }
    } else {
      this.dispatchSerial(nodes.length, mode);
    }

    const nextSize = this.getState(STATE_NEXT_SIZE);
    const nextNodes = Array.from(this.qNext.subarray(0, nextSize));
    for (let i = 0; i < nextNodes.length; i++) this.inQueue[nextNodes[i]] = 0;
    return nextNodes;
  }

  async dispatchParallel(size, mode) {
    const workers = this.workerCount;
    const chunkSize = Math.ceil(size / workers);
    const tasks = [];

    for (let w = 0; w < workers; w++) {
      const start = w * chunkSize;
      if (start >= size) break;
      tasks.push({
        sab: this.buffer,
        start,
        end: Math.min(start + chunkSize, size),
        currQOff: this.qCurrOff,
        nextQOff: this.qNextOff,
        distOff: this.distOff,
        prevOff: this.prevOff,
        headOff: this.headOff,
        nextOff: this.nextOff,
        targetsOff: this.targetsOff,
        weightsOff: this.weightsOff,
        inQueueOff: this.inQueueOff,
        stateOff: this.stateOff,
        n: this.n,
        m: this.m,
        delta: this.delta,
        mode,
      });
    }

    await this.pool.executeBatch(tasks);
  }

  dispatchSerial(size, mode) {
    const relaxLight = mode === 'light';

    for (let i = 0; i < size; i++) {
      const u = this.qCurr[i];
      const d_u = this.dist[u];
      if (d_u >= INF_DISTANCE) continue;

      for (let e = this.head[u]; e !== -1; e = this.next[e]) {
        const w = this.weights[e];
        if (relaxLight ? w > this.delta : w <= this.delta) continue;

        const v = this.targets[e];
        const rawDist = d_u + w;
        const newDist = rawDist > INF_DISTANCE ? INF_DISTANCE : rawDist;

        if (newDist < this.dist[v]) {
          this.dist[v] = newDist;
          this.prev[v] = u;
          if (this.inQueue[v] === 0) {
            this.inQueue[v] = 1;
            const pos = this.addState(STATE_NEXT_SIZE, 1);
            this.qNext[pos] = v;
          }
        }
      }
    }
  }

  addToBucket(idx, node) {
    if (!Number.isFinite(idx)) return;
    if (!this.buckets.has(idx)) this.buckets.set(idx, new Set());
    this.buckets.get(idx).add(node);
  }

  terminate() {
    this.pool = null;
  }
}

/**
 * Wrapper export: Delta Stepping SSSP with point-to-point routing.
 * Reconstructs path from distances and reports whether worker parallelism ran.
 * 
 * @param {number} startId
 * @param {number} endId
 * @param {object} prepared result of buildCH()
 * @returns {Promise<{ path: number[], cost: number, found: boolean, engine: string, parallelUsed: boolean }>}
 */
export async function deltaSteppingRouter(startId, endId, prepared, {
  forceSerialRouting = false,
  minFrontierForParallel,
} = {}) {
  const { adjPtr, adjTo, adjCost, N } = prepared;
  const DIST_SCALE = 10;

  // Tune bucket width in scaled integer cost units.
  const delta = prepared.costField === 'travelTime' ? 300 : 200;
  const solver = new DeltaSteppingSSSP(N, adjCost.length, delta, {
    forceSerialRouting,
    minFrontierForParallel,
  });

  for (let u = 0; u < N; u++) {
    for (let k = adjPtr[u]; k < adjPtr[u + 1]; k++) {
      solver.addEdge(u, adjTo[k], adjCost[k]);
    }
  }

  try {
    await solver.solve(startId);
    const endDistInt = solver.dist[endId];
    const parallelUsed = solver.lastParallelUsed;

    if (endDistInt >= INF_DISTANCE) {
      return { path: [], cost: Infinity, found: false, engine: 'deltaStepping', parallelUsed };
    }

    // Reconstruct path backward from endId to startId using predecessors.
    const path = [endId];
    let cur = endId;
    let safety = N;

    while (cur !== startId && safety-- > 0) {
      const parent = solver.prev[cur];
      if (parent === -1) break;
      path.push(parent);
      cur = parent;
    }

    if (cur !== startId) {
      return { path: [], cost: Infinity, found: false, engine: 'deltaStepping', parallelUsed };
    }

    path.reverse();
    return {
      path,
      cost: endDistInt / DIST_SCALE,
      found: true,
      engine: 'deltaStepping',
      parallelUsed,
    };
  } finally {
    solver.terminate();
  }
}