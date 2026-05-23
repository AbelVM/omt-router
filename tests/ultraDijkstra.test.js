import { describe, expect, it } from 'vitest';
import { ultraDijkstraRouter } from '../src/engines/UltraDijkstra/index.js';
import QuadHeap from '../src/engines/UltraDijkstra/heap.js';

describe('QuadHeap', () => {
  it('supports push, decrease-key, and pop order', () => {
    const heap = new QuadHeap(6);

    expect(heap.isEmpty()).toBe(true);
    heap.pushOrReduce(0, 10);
    heap.pushOrReduce(1, 20);
    heap.pushOrReduce(2, 15);
    heap.pushOrReduce(3, 5);
    heap.pushOrReduce(4, 12);
    heap.pushOrReduce(0, 2);

    expect(heap.pop()).toBe(0);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(4);
    expect(heap.pop()).toBe(2);
    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(-1);
    expect(heap.isEmpty()).toBe(true);
  });
});

describe('UltraDijkstra routing', () => {
  it('computes the shortest path and returns the reconstructed route', async () => {
    const prepared = {
      adjPtr: [0, 1, 2, 2],
      adjTo: [1, 2],
      adjCost: [20, 20],
      N: 3,
    };

    const result = await ultraDijkstraRouter(0, 2, prepared);

    expect(result.found).toBe(true);
    expect(result.path).toEqual([0, 1, 2]);
    expect(result.cost).toBe(4);
    expect(result.engine).toBe('ultra-dijkstra');
  });

  it('returns no path when the end node is unreachable', async () => {
    const prepared = {
      adjPtr: [0, 0, 0, 0],
      adjTo: [],
      adjCost: [],
      N: 3,
    };

    const result = await ultraDijkstraRouter(0, 2, prepared);

    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
  });
});
