/**
 * High-Performance 4-ary Heap for Dijkstra
 * Optimized for O(1) lookups and O(log4 N) updates.
 * Designed for routing on large, sparse graphs like road networks.
 * Uses typed arrays for memory efficiency and cache locality.
 * The heap is a 4-ary min-heap, which reduces the height and thus the number of comparisons.
 * The pos array allows for O(1) access to any node's position in the heap for decrease-key operations.
 * The heap supports pushOrReduce (insert or decrease key) and pop (extract min).
 * The implementation is optimized for JavaScript engines, with unrolled loops for bubbling down.
 * This heap is used in the UltraDijkstra class for efficient shortest path computations.
 * See index.js for how this heap is integrated into the overall routing logic.
 * See index.js for how the graph is built and how routes are computed using this heap.
 * The graph is represented as an adjacency list using three parallel arrays:
 *   - head[node] gives the index of the first outgoing edge for that node
 *   - next[edge] gives the index of the next edge from the same source node
 *   - to[edge] and weight[edge] give the target node and edge weight
 * This structure allows for efficient iteration over outgoing edges of a node.
 */
class QuadHeap {
  constructor(maxNodes) {
    this.pos = new Int32Array(maxNodes).fill(-1); // Map: NodeIndex -> HeapIndex
    this.heap = new Int32Array(maxNodes); // Map: HeapIndex -> NodeIndex
    this.keys = new Float64Array(maxNodes); // Map: NodeIndex -> Distance
    this.size = 0;
  }

  isEmpty() {
    return this.size === 0;
  }

  pushOrReduce(nodeIdx, key) {
    const p = this.pos[nodeIdx];
    if (p === -1) {
      // Push new node
      let i = this.size++;
      this.heap[i] = nodeIdx;
      this.pos[nodeIdx] = i;
      this.keys[nodeIdx] = key;
      this._bubbleUp(i);
    } else if (key < this.keys[nodeIdx]) {
      // Decrease Key
      this.keys[nodeIdx] = key;
      this._bubbleUp(p);
    }
  }

  pop() {
    if (this.size === 0) return -1;
    const top = this.heap[0];
    this.pos[top] = -1;

    this.size--;
    if (this.size > 0) {
      const last = this.heap[this.size];
      this.heap[0] = last;
      this.pos[last] = 0;
      this._bubbleDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    const heap = this.heap;
    const pos = this.pos;
    const keys = this.keys;
    const nodeIdx = heap[i];
    const key = keys[nodeIdx];

    while (i > 0) {
      // Parent of i in 4-ary heap: (i - 1) / 4
      const parentIdx = (i - 1) >> 2;
      const parentNode = heap[parentIdx];

      if (key < keys[parentNode]) {
        heap[i] = parentNode;
        pos[parentNode] = i;
        i = parentIdx;
      } else break;
    }
    heap[i] = nodeIdx;
    pos[nodeIdx] = i;
  }

  _bubbleDown(i) {
    const heap = this.heap;
    const pos = this.pos;
    const keys = this.keys;
    const size = this.size;
    const nodeIdx = heap[i];
    const key = keys[nodeIdx];

    while (true) {
      // Children of i: 4i+1, 4i+2, 4i+3, 4i+4
      let firstChild = (i << 2) + 1;
      if (firstChild >= size) break;

      let bestChild = firstChild;
      let minKey = keys[heap[firstChild]];

      // Unrolled loop to find the smallest of 4 children
      // This is significantly faster in JS than a standard loop
      let c2 = firstChild + 1;
      if (c2 < size) {
        let k2 = keys[heap[c2]];
        if (k2 < minKey) {
          minKey = k2;
          bestChild = c2;
        }
      }
      let c3 = firstChild + 2;
      if (c3 < size) {
        let k3 = keys[heap[c3]];
        if (k3 < minKey) {
          minKey = k3;
          bestChild = c3;
        }
      }
      let c4 = firstChild + 3;
      if (c4 < size) {
        let k4 = keys[heap[c4]];
        if (k4 < minKey) {
          minKey = k4;
          bestChild = c4;
        }
      }

      if (minKey < key) {
        const bestNode = heap[bestChild];
        heap[i] = bestNode;
        pos[bestNode] = i;
        i = bestChild;
      } else break;
    }
    heap[i] = nodeIdx;
    pos[nodeIdx] = i;
  }
}

export default QuadHeap;
