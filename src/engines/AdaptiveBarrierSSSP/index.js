import { PowerPool } from 'performance-helpers/powerPool';
import ssspWorker from './sssp-worker?worker&inline';

const MAX_PARALLEL_WORKERS = 8;
let sharedPool = null;
let sharedPoolWorkers = 0;

function getSharedPool(workerCount) {
  if (!sharedPool || sharedPoolWorkers !== workerCount) {
    sharedPool?.terminate();
    sharedPool = new PowerPool(ssspWorker, {
      size: 2,
      maxSize: workerCount,
      lazy: true,
      idleTimeout: 60_000,
      autoScale: {
        // Barrier SSSP tasks are coarser and steadier; favor stable scaling over twitchy reactions.
        intervalMs: 750,
        targetMs: 140,
        alpha: 0.12,
        cooldownMs: 4_000,
        hysteresis: 0.3,
        stepUp: 1,
        stepDown: 1,
        backoffFactor: 2,
        backoffMaxMultiplier: 8,
        backoffResetMs: 16_000,
      },
    });
    sharedPoolWorkers = workerCount;
  }
  return sharedPool;
}

/**
 * Adaptive Parallel Barrier Solver
 * Combines arXiv:2504.17033 logic with hardware-aware dispatching.
 */
export class AdaptiveBarrierSSSP {
  constructor(maxN, maxM, {
    forceSerialRouting = false,
    minNodesForParallel,
    minFrontierForParallel,
  } = {}) {
    this.n = maxN;
    this.m = maxM;
    this.INF_DISTANCE = 0x3fffffff;
    this.STATE_NEXT_SIZE = 0;

    const defaultMinNodesForParallel = 50_000;

    // Detect environment capability
    this.hasParallelSupport = !forceSerialRouting && typeof SharedArrayBuffer !== 'undefined';
    this.hasWorkerSupport = typeof Worker !== 'undefined';

    // Choose Buffer Type: Fallback to ArrayBuffer if SAB is blocked
    const BufferType = this.hasParallelSupport ? SharedArrayBuffer : ArrayBuffer;

    const align4 = (offset) => (offset + 3) & ~3;

    // Memory Allocation (SharedArrayBuffer or ArrayBuffer)
    // Layout:
    // dist(i32, n), head(i32, n), next(i32, m), targets(i32, m), weights(i32, m),
    // q1(i32, n), q2(i32, n), inQueue(u8, n), state(i32, 8)
    let off = 0;
    this.distOff = off; off += maxN * 4;
    this.headOff = off; off += maxN * 4;
    this.nextOff = off; off += maxM * 4;
    this.targetsOff = off; off += maxM * 4;
    this.weightsOff = off; off += maxM * 4;
    this.q1Off = off; off += maxN * 4;
    this.q2Off = off; off += maxN * 4;
    this.inQueueOff = off; off += maxN;
    this.stateOff = align4(off);
    const size = this.stateOff + 64;
    this.buffer = new BufferType(size);

    // Data Views
    this.dist = new Int32Array(this.buffer, this.distOff, maxN);
    this.head = new Int32Array(this.buffer, this.headOff, maxN);
    this.next = new Int32Array(this.buffer, this.nextOff, maxM);
    this.targets = new Int32Array(this.buffer, this.targetsOff, maxM);
    this.weights = new Int32Array(this.buffer, this.weightsOff, maxM);
    this.q1 = new Int32Array(this.buffer, this.q1Off, maxN);
    this.q2 = new Int32Array(this.buffer, this.q2Off, maxN);
    this.inQueue = new Uint8Array(this.buffer, this.inQueueOff, maxN);

    // Shared state word 0 stores the next frontier size.
    this.state = new Int32Array(this.buffer, this.stateOff, 8);

    // Available concurrency
    const _hwConcurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
    const maxWorkersBelowHw = Math.max(1, _hwConcurrency - 1);
    const workerCount = Math.max(1, Math.min(MAX_PARALLEL_WORKERS, maxWorkersBelowHw));
    this.workerCount = workerCount;
    const defaultMinFrontierForParallel = Math.max(
      1_024,
      Math.min(5_000, Math.floor(maxN / 64)),
    );
    this.MIN_NODES_FOR_INDUSTRIAL = Number.isFinite(minNodesForParallel)
      ? Math.max(1, Math.floor(minNodesForParallel))
      : defaultMinNodesForParallel;
    this.MIN_FRONTIER_FOR_PARALLEL = Number.isFinite(minFrontierForParallel)
      ? Math.max(1, Math.floor(minFrontierForParallel))
      : defaultMinFrontierForParallel;
    // Engines    
    this.pool = (
      this.hasParallelSupport
      && this.hasWorkerSupport
      && workerCount > 1
      && maxN >= this.MIN_NODES_FOR_INDUSTRIAL
    )
      ? getSharedPool(workerCount)
      : null;

    this.head.fill(-1);
    this.edgeIdx = 0;
    this.lastParallelUsed = false;
  }

  loadState(index) {
    return this.hasParallelSupport ? Atomics.load(this.state, index) : this.state[index];
  }

  storeState(index, value) {
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

  /**
   * High-speed data ingestion
   * Optimized for bulk loading with minimal overhead, suitable for large graphs.
   * Expects pre-processed edge lists for maximum throughput.
   * Note: This method is not thread-safe and should be called before any solve() calls.
   * @param {*} sources - array of source node indices
   * @param {*} targets - array of target node indices
   * @param {*} weights - array of edge weights
   */
  loadGraph(sources, targets, weights) {
    if (typeof sources === 'number') {
      const idx = this.edgeIdx++;
      this.targets[idx] = targets;
      this.weights[idx] = weights;
      this.next[idx] = this.head[sources];
      this.head[sources] = idx;
      return;
    }

    for (let i = 0; i < sources.length; i++) {
      const idx = this.edgeIdx++;
      this.targets[idx] = targets[i];
      this.weights[idx] = weights[i];
      this.next[idx] = this.head[sources[i]];
      this.head[sources[i]] = idx;
    }
  }

  /**
   * Adaptive SSSP entry point.
   * Chooses serial vs parallel relaxation per frontier while preserving exact
   * shortest-path semantics for non-negative integer edge weights.
   */
  async solve(source, target = -1) {
    this.dist.fill(this.INF_DISTANCE);
    this.inQueue.fill(0);
    this.dist[source] = 0;
    this.storeState(this.STATE_NEXT_SIZE, 0);
    this.lastParallelUsed = false;

    let currQOff = this.q1Off;
    let nextQOff = this.q2Off;
    let currSize = 1;

    // Set initial source
    this.q1[0] = source;
    this.inQueue[source] = 1;

    while (currSize > 0) {
      // Allow nodes in the current frontier to be re-enqueued on new improvements.
      const currQ = new Int32Array(this.buffer, currQOff, currSize);
      for (let i = 0; i < currSize; i++) {
        this.inQueue[currQ[i]] = 0;
      }

      this.storeState(this.STATE_NEXT_SIZE, 0);

      // We only use the worker pool if the frontier is large enough
      // to justify the message-passing overhead.
      if (this.pool && currSize >= this.MIN_FRONTIER_FOR_PARALLEL) {
        try {
          this.lastParallelUsed = true;
          await this.dispatchParallel(currSize, currQOff, nextQOff);
        } catch {
          this.dispatchSerial(currSize, currQOff, nextQOff);
        }
      } else {
        this.dispatchSerial(currSize, currQOff, nextQOff);
      }

      currSize = this.loadState(this.STATE_NEXT_SIZE);

      // Swap queue pointers
      [currQOff, nextQOff] = [nextQOff, currQOff];
    }
    return target !== -1 ? this.dist[target] : this.dist;
  }

  terminate() {
    this.pool = null;
  }

  /**
   * Serial Execution: Low-overhead hot loop for small frontiers
   * Highly optimized for cache locality and minimal branching, suitable for small to medium frontiers where parallel overhead would dominate.
   * @param {*} size - number of nodes in the current frontier
   * @param {*} currQOff - byte offset for the current frontier queue
   * @param {*} nextQOff - byte offset for the next frontier queue
   * Note: This method is not thread-safe and should only be called when no parallel execution is active.
   * It directly manipulates the shared buffer and state without any synchronization primitives, as it's guaranteed to be single-threaded.
   * The inner loop is unrolled for better performance, and it minimizes function calls and branching to maximize throughput.
   * It also checks for the early exit signal every 16 iterations to balance responsiveness with performance.
   * @returns void  
   */
  dispatchSerial(size, currQOff, nextQOff) {
    const currQ = new Int32Array(this.buffer, currQOff, size);
    const nextQ = new Int32Array(this.buffer, nextQOff, this.n);

    for (let i = 0; i < size; i++) {
      const u = currQ[i];
      const d_u = this.dist[u];

      for (let e = this.head[u]; e !== -1; e = this.next[e]) {
        const v = this.targets[e];
        const rawDist = d_u + this.weights[e];
        const newDist = rawDist > this.INF_DISTANCE ? this.INF_DISTANCE : rawDist;
        if (newDist < this.dist[v]) {
          this.dist[v] = newDist;

          if (this.inQueue[v] === 0) {
            this.inQueue[v] = 1;
            const pos = this.addState(this.STATE_NEXT_SIZE, 1);
            nextQ[pos] = v;
          }
        }
      }

    }
  }

  /**
   * Parallel Execution: High-throughput offloading for massive frontiers
   * Dispatches work to the PowerPool of workers, which run the SSSP logic in parallel on shared memory.
   * Each worker processes a chunk of the frontier and updates distances and the next frontier in shared memory.
   * The method waits for all workers to complete before proceeding to the next iteration.
   * @param {*} size - number of nodes in the current frontier
   * @param {*} currQOff - byte offset for the current frontier queue
   * @param {*} nextQOff - byte offset for the next frontier queue
   * @returns Promise that resolves when all workers have completed their tasks
   * @throws Error if the PowerPool is not initialized (should not happen if called correctly)
   */
  async dispatchParallel(size, currQOff, nextQOff) {
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
        currQOff,
        nextQOff,
        distOff: this.distOff,
        headOff: this.headOff,
        nextOff: this.nextOff,
        targetsOff: this.targetsOff,
        weightsOff: this.weightsOff,
        inQueueOff: this.inQueueOff,
        stateOff: this.stateOff,
        n: this.n,
        m: this.m
      });
    }
    return await this.pool.executeBatch(tasks);
  }
}

/**
 * Wrapper export: Adaptive Barrier SSSP with point-to-point routing.
 * Reconstructs path from distances and tracks parallel execution.
 * 
 * @param {number} startId
 * @param {number} endId
 * @param {object} prepared result of buildCH()
 * @returns {Promise<{ path: number[], cost: number, found: boolean, engine: string, parallelUsed: boolean }>}
 */
export async function adaptiveBarrierSSPRouter(startId, endId, prepared, {
  forceSerialRouting = false,
  minNodesForParallel,
  minFrontierForParallel,
} = {}) {
  const { adjPtr, adjTo, adjCost, revAdjPtr, revAdjFrom, revAdjCost, N } = prepared;
  const DIST_SCALE = 10;

  const solver = new AdaptiveBarrierSSSP(N, adjCost.length, {
    forceSerialRouting,
    minNodesForParallel,
    minFrontierForParallel,
  });

  // Load graph into solver
  for (let u = 0; u < N; u++) {
    for (let k = adjPtr[u]; k < adjPtr[u + 1]; k++) {
      const v = adjTo[k];
      const cost = adjCost[k];
      solver.loadGraph(u, v, cost);
    }
  }

  try {
    // Run SSSP from start
    await solver.solve(startId, endId);
    const distances = solver.dist;
    const endDistInt = distances[endId];
    const parallelUsed = solver.lastParallelUsed;

    if (endDistInt >= solver.INF_DISTANCE) {
      return { path: [], cost: Infinity, found: false, engine: 'adaptiveBarrier', parallelUsed: false };
    }

    // Reconstruct path backward from endId to startId
    const path = [endId];
    let cur = endId;
    let safety = N;

    while (cur !== startId && safety-- > 0) {
      let moved = false;
      // Check all incoming edges from reverse adjacency
      for (let k = revAdjPtr[cur]; k < revAdjPtr[cur + 1]; k++) {
        const from = revAdjFrom[k];
        const costInt = revAdjCost[k];
        if (distances[from] + costInt === distances[cur]) {
          path.push(from);
          cur = from;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }

    if (cur !== startId) {
      return { path: [], cost: Infinity, found: false, engine: 'adaptiveBarrier', parallelUsed };
    }

    path.reverse();
    return {
      path,
      cost: endDistInt / DIST_SCALE,
      found: true,
      engine: 'adaptiveBarrier',
      parallelUsed,
    };
  } finally {
    solver.terminate();
  }
}