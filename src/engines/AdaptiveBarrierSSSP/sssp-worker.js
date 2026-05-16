//# sourceURL=ssspWorker

/**
 * Worker optimized for cache locality and atomic synchronization
 * Designed for the SSSP algorithm with a shared memory approach, this worker processes
 * a chunk of the frontier and updates distances and the next frontier in shared memory.
 * It uses Atomics for synchronization and early exit signaling, and is optimized for
 * performance with minimal branching and efficient memory access patterns.
 * The worker listens for messages containing the shared buffer and task parameters,
 * performs the relaxation step of the SSSP algorithm, and posts a completion message when done.
 */
self.onmessage = async ({ data }) => {
  /**
   * Data Structure Layout in Shared Array Buffer (SAB):
   * [0, 8n)       - dist: Float64Array for node distances
   * [8n, 12n)     - head: Int32Array for adjacency list heads
   * [12n, 12n+4m) - next: Int32Array for adjacency list next pointers
   * [12n+4m, 12n+8m) - targets: Int32Array for edge target nodes
   * [12n+8m, 12n+16m) - weights: Float64Array for edge weights
   * [12n+16m, 12n+16m+4n) - q1: Int32Array for current frontier queue
   * [12n+16m+4n, 12n+16m+8n) - q2: Int32Array for next frontier queue
   * [end-128, end-128+16) - state: Int32Array for synchronization and signaling
   *   state[0] - target node index for early exit
   *   state[1] - early exit signal (0 or 1)
   *   state[2] - atomic counter for next frontier size
   *   state[3] - reserved for future use
   * Note: All workers share the same SAB, and synchronization is achieved through Atomics on the state array.
   */
  const {
    sab,
    start,
    end,
    currQOff,
    nextQOff,
    distOff,
    headOff,
    nextOff,
    targetsOff,
    weightsOff,
    inQueueOff,
    stateOff,
    n,
    m,
  } = data;

  const dist = new Int32Array(sab, distOff, n);
  const head = new Int32Array(sab, headOff, n);
  const next = new Int32Array(sab, nextOff, m);
  const targets = new Int32Array(sab, targetsOff, m);
  const weights = new Int32Array(sab, weightsOff, m);

  const currQ = new Int32Array(sab, currQOff, n);
  const nextQ = new Int32Array(sab, nextQOff, n);
  const inQueue = new Uint8Array(sab, inQueueOff, n);
  const state = new Int32Array(sab, stateOff, 8);
  const INF_DISTANCE = 0x3fffffff;

  const atomicMin = (array, idx, candidate) => {
    let current = Atomics.load(array, idx);
    while (candidate < current) {
      const observed = Atomics.compareExchange(array, idx, current, candidate);
      if (observed === current) return true;
      current = observed;
    }
    return false;
  };

  for (let i = start; i < end; i++) {
    const u = currQ[i];
    const d_u = Atomics.load(dist, u);

    let e = head[u];
    while (e !== -1) {
      const v = targets[e];
      const weight = weights[e];
      const rawDist = d_u + weight;
      const newDist = rawDist > INF_DISTANCE ? INF_DISTANCE : rawDist;

      // Relax with atomic min to keep concurrent updates race-safe.
      if (atomicMin(dist, v, newDist)) {
        // Enqueue once per phase to keep the frontier bounded by n.
        if (Atomics.compareExchange(inQueue, v, 0, 1) === 0) {
          const pos = Atomics.add(state, 0, 1);
          nextQ[pos] = v;
        }
      }
      e = next[e];
    }
  }
  self.postMessage('done');
};
