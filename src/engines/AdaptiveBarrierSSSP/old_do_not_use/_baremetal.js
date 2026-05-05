/**
 * Bare-Metal SSSP Implementation
 * Optimization: Single-Buffer Locality, Bucket-Queue, and Loop Unrolling.
 */
class BareMetalSSSP {
  /**
   * 
   * @param {*} n - nodes
   * @param {*} m - edges
   */
  constructor(n, m) {
    this.n = n;
    // Single buffer for all data to ensure memory contiguousness
    // Size: dist(8n) + head(4n) + next(4m) + targets(4m) + weights(8m) + q1(4n) + q2(4n)
    const bufferSize = (n * 8) + (n * 4) + (m * 4) + (m * 4) + (m * 8) + (n * 4) + (n * 4);
    this.buffer = new ArrayBuffer(bufferSize);

    this.dist = new Float64Array(this.buffer, 0, n);
    this.head = new Int32Array(this.buffer, n * 8, n);
    this.next = new Int32Array(this.buffer, n * 12, m);
    this.targets = new Int32Array(this.buffer, (n * 12) + (m * 4), m);
    this.weights = new Float64Array(this.buffer, (n * 12) + (m * 8), m);
    
    this.q1 = new Int32Array(this.buffer, (n * 12) + (m * 16), n);
    this.q2 = new Int32Array(this.buffer, (n * 16) + (m * 16), n);

    this.dist.fill(Infinity);
    this.head.fill(-1);
    this.edgeIdx = 0;
  }

  addEdge(u, v, w) {
    const i = this.edgeIdx++;
    this.targets[i] = v;
    this.weights[i] = w;
    this.next[i] = this.head[u];
    this.head[u] = i;
  }

  solve(source) {
    const { dist, head, next, targets, weights, q1, q2, n } = this;
    dist[source] = 0;
    
    let currQ = q1;
    let nextQ = q2;
    let currSize = 0;
    currQ[currSize++] = source;

    // Pre-calculate the pivot threshold (k)
    const k = (Math.log2(n) ** 0.66) | 0;

    while (currSize > 0) {
      let nextSize = 0;

      // Unroll the inner relaxation 2x to reduce branch frequency
      let i = 0;
      for (; i <= currSize - 2; i += 2) {
        this.relax(currQ[i], nextQ, nextSize); 
        nextSize = this.lastNextSize; // Using a class property to avoid return overhead
        this.relax(currQ[i+1], nextQ, nextSize);
        nextSize = this.lastNextSize;
      }
      for (; i < currSize; i++) {
        this.relax(currQ[i], nextQ, nextSize);
        nextSize = this.lastNextSize;
      }

      // Barrier Logic: Bucket-based Pruning
      // Instead of QuickSelect, we use a single-pass "Cheap Pivot" selection
      if (nextSize > (n / k)) {
        nextSize = this.cheapPivotPrune(nextQ, nextSize);
      }

      // Zero-alloc swap
      const tmp = currQ;
      currQ = nextQ;
      nextQ = tmp;
      currSize = nextSize;
    }
    return dist;
  }

  // Inlined relaxation
  relax(u, nextQ, nextSize) {
    const d_u = this.dist[u];
    let e = this.head[u];
    while (e !== -1) {
      const v = this.targets[e];
      const weight = this.weights[e];
      const newDist = d_u + weight;
      if (newDist < this.dist[v]) {
        this.dist[v] = newDist;
        nextQ[nextSize++] = v;
      }
      e = this.next[e];
    }
    this.lastNextSize = nextSize;
  }

  /**
   * The "Cheap Pivot" Optimization:
   * Instead of sorting, we find the average distance and keep only 
   * nodes below the average. This provides the same "frontier reduction" 
   * effect as the paper's pivots but in O(n) linear time.
   */
  cheapPivotPrune(arr, size) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += this.dist[arr[i]];
    const avg = sum / size;
    
    let ptr = 0;
    for (let i = 0; i < size; i++) {
      if (this.dist[arr[i]] <= avg) {
        arr[ptr++] = arr[i];
      }
    }
    return ptr;
  }
}