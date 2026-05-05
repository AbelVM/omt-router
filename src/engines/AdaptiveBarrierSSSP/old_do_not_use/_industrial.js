import { PowerPool } from 'performance-helpers/powerPool';
import ssspWorker from './sssp-worker?worker&inline';

/**
 * Production-Ready SSSP Solver (arXiv:2504.17033)
 * Optimized with SharedArrayBuffer, Atomics, and Early Exit.
 */
export class IndustrialBarrierSSSP {
  constructor(maxN, maxM) {
    this.n = maxN;
    this.m = maxM;
    
    // Memory segments: dist, head, next, targets, weights, q1, q2, state
    const size = (maxN * 24) + (maxM * 24) + 256;
    this.sab = new SharedArrayBuffer(size);
    
    this.dist = new Float64Array(this.sab, 0, maxN);
    this.head = new Int32Array(this.sab, maxN * 8, maxN);
    this.next = new Int32Array(this.sab, maxN * 12, maxM);
    this.targets = new Int32Array(this.sab, (maxN * 12) + (maxM * 4), maxM);
    this.weights = new Float64Array(this.sab, (maxN * 12) + (maxM * 8), maxM);
    
    // Worklists (Frontiers)
    this.q1 = new Int32Array(this.sab, (maxN * 12) + (maxM * 16), maxN);
    this.q2 = new Int32Array(this.sab, (maxN * 16) + (maxM * 16), maxN);
    
    // Global Atomic State [0: target, 1: exitSignal, 2: qSizeCounter, 3: currentBucketMax]
    this.state = new Int32Array(this.sab, size - 128, 4);
    
    // Initialize the pool with a min/max range for autoscaling
    const _hwConcurrency =
      typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
    this.pool= new PowerPool(ssspWorker, {
      size: _hwConcurrency,       // match CPU core count
      maxSize: _hwConcurrency * 2, // allow burst up to 2× cores
      lazy: false,                // prewarm workers at import time
      autoScale: {
        intervalMs: 500,
        targetMs: 80,             // target ≤80 ms per chunk
        alpha: 0.3,
        cooldownMs: 3_000,
        hysteresis: 0.2,
      },
      idleTimeout: 300_000,       // keep workers alive 5 min between calls
    });

    this.head.fill(-1);
    this.edgeIdx = 0;
  }

  loadGraph(sources, targets, weights) {
    for (let i = 0; i < sources.length; i++) {
      const idx = this.edgeIdx++;
      this.targets[idx] = targets[i];
      this.weights[idx] = weights[i];
      this.next[idx] = this.head[sources[i]];
      this.head[sources[i]] = idx;
    }
  }

  async solve(source, target = -1) {
    // Initialization
    this.dist.fill(Infinity);
    this.dist[source] = 0;
    Atomics.store(this.state, 0, target);
    Atomics.store(this.state, 1, 0); 
    Atomics.store(this.state, 2, 0);
    
    let currQOff = (this.n * 12) + (this.m * 16);
    let nextQOff = (this.n * 16) + (this.m * 16);
    let currSize = 1;
    
    // Manually push source to q1
    new Int32Array(this.sab, currQOff, 1)[0] = source;

    // k factor: The "Sorting Barrier" constant O(log^2/3 n)
    const k = Math.max(2, Math.pow(Math.log2(this.n), 0.66) | 0);

    while (currSize > 0) {
      // 1. Check for Early Exit
      if (target !== -1 && Atomics.load(this.state, 1) === 1) break;

      // 2. Parallel Relaxation via PowerPool
      // We chunk the current frontier across all active workers
      const workers = this.pool.activeWorkers || navigator.hardwareConcurrency;
      const chunkSize = Math.ceil(currSize / workers);
      const tasks = [];

      for (let w = 0; w < workers; w++) {
        const start = w * chunkSize;
        if (start >= currSize) break;
        tasks.push({
          sab: this.sab,
          start: start,
          end: Math.min(start + chunkSize, currSize),
          currQOff,
          nextQOff,
          n: this.n,
          m: this.m
        });
      }

      await this.pool.executeBatch(tasks);

      // 3. Post-Relaxation: Frontier Reduction
      currSize = Atomics.load(this.state, 2);
      Atomics.store(this.state, 2, 0); // Reset atomic counter

      // Use the paper's Pivot Selection if frontier is too large
      if (currSize > this.n / k) {
        currSize = this.pivotPruning(nextQOff, currSize);
      }

      // Swap Queue Offsets
      [currQOff, nextQOff] = [nextQOff, currQOff];
    }

    return target !== -1 ? this.dist[target] : this.dist;
  }

  pivotPruning(offset, size) {
    const queue = new Int32Array(this.sab, offset, size);
    let sum = 0;
    let count = 0;
    
    // Linear pass to find average distance in current frontier
    for (let i = 0; i < size; i++) {
      if (this.dist[queue[i]] !== Infinity) {
        sum += this.dist[queue[i]];
        count++;
      }
    }
    const avg = sum / (count || 1);
    
    // Pruning: Keep only those better than average (Pivots)
    let ptr = 0;
    for (let i = 0; i < size; i++) {
      if (this.dist[queue[i]] <= avg) {
        queue[ptr++] = queue[i];
      }
    }
    return ptr;
  }
}