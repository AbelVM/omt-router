import QuadHeap from './heap.js';

/**
 * 4-ary Dijkstra Solver
 * Designed for ultra-fast single-source shortest path queries on large, sparse graphs.
 * Uses a custom 4-ary heap for O(1) lookups and O(log4 N) updates, and an
 * adjacency list representation optimized for cache locality.
 * Suitable for routing on road networks with millions of nodes and edges.
 * Does not support negative edge weights (but that's not needed for road networks).
 * Returns either the distance to a target node or the full distance array.
 * Can be used for both point-to-point and point-to-all routing.
 * See heap.js for the QuadHeap implementation.
 * See index.js for how this solver is integrated into the overall routing logic.
 * The graph is represented as an adjacency list using three parallel arrays:
 *   - head[node] gives the index of the first outgoing edge for that node
 *   - next[edge] gives the index of the next edge from the same source node
 *   - to[edge] and weight[edge] give the target node and edge weight
 * This structure allows for efficient iteration over outgoing edges of a node. 
 */
class UltraDijkstra {
    /**
     * 
     * @param {*} n 
     * @param {*} m 
     */
    constructor(n, m) {
        this.n = n;
        this.head = new Int32Array(n).fill(-1);
        this.next = new Int32Array(m);
        this.to = new Int32Array(m);
        this.weight = new Float64Array(m);
        this.edgeCount = 0;
        
        this.dists = new Float64Array(n).fill(Infinity);
        this.prev = new Int32Array(n).fill(-1);
        this.heap = new QuadHeap(n);
    }

    addEdge(u, v, w) {
        const i = this.edgeCount++;
        this.to[i] = v;
        this.weight[i] = w;
        this.next[i] = this.head[u];
        this.head[u] = i;
    }

    solve(source, target = -1) {
        const dists = this.dists;
        const head = this.head;
        const next = this.next;
        const to = this.to;
        const weight = this.weight;
        const heap = this.heap;
        const prev = this.prev;

        dists.fill(Infinity);
        prev.fill(-1);
        dists[source] = 0;
        prev[source] = source;
        heap.pushOrReduce(source, 0);

        while (!heap.isEmpty()) {
            const u = heap.pop() | 0;
            const d_u = +dists[u];

            if (u === target) return d_u;

            // Manual relaxation loop for JIT optimization
            for (let i = head[u] | 0; i !== -1; i = next[i] | 0) {
                const v = to[i] | 0;
                const newDist = d_u + weight[i];

                if (newDist < dists[v]) {
                    dists[v] = newDist;
                  prev[v] = u;
                    heap.pushOrReduce(v, newDist);
                }
            }
        }
        return target === -1 ? dists : dists[target];
    }
}

export { UltraDijkstra };

/**
 * Wrapper export: Ultra Dijkstra with point-to-point routing.
 * Reconstructs path from distances using reverse adjacency.
 * 
 * @param {number} startId
 * @param {number} endId
 * @param {object} prepared result of buildCH()
 * @returns {Promise<{ path: number[], cost: number, found: boolean, engine: string }>}
 */
export async function ultraDijkstraRouter(startId, endId, prepared) {
  const { adjPtr, adjTo, adjCost, N } = prepared;
  const DIST_SCALE = 10;
  
  const solver = new UltraDijkstra(N, adjCost.length);
  
  // Load graph into solver: iterate through CSR format
  for (let u = 0; u < N; u++) {
    for (let k = adjPtr[u]; k < adjPtr[u + 1]; k++) {
      const v = adjTo[k];
      const cost = adjCost[k] / DIST_SCALE;
      solver.addEdge(u, v, cost);
    }
  }
  
  // Run Dijkstra from start
  solver.solve(startId);
  const distances = solver.dists;
  const prev = solver.prev;
  
  if (distances[endId] === Infinity) {
    return { path: [], cost: Infinity, found: false, engine: 'ultraDijkstra' };
  }
  
  // Reconstruct path backward from endId to startId using predecessors.
  const path = [endId];
  let cur = endId;
  let safety = N;

  while (cur !== startId && safety-- > 0) {
    const parent = prev[cur];
    if (parent === -1) break;
    path.push(parent);
    cur = parent;
  }

  if (cur !== startId) {
    return { path: [], cost: Infinity, found: false, engine: 'ultraDijkstra' };
  }
  
  path.reverse();
  return { 
    path, 
    cost: distances[endId], 
    found: true, 
    engine: 'ultraDijkstra',
  };
}