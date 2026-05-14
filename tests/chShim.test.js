import { describe, expect, it } from 'vitest';
import attachArrangeShim from '../src/shims/chShim.js';

describe('attachArrangeShim', () => {
  it('restores the original method after restoring the shim', () => {
    class Graph {
      _arrangeContractedPaths() {
        return 'original';
      }
    }

    const original = Graph.prototype._arrangeContractedPaths;
    const restore = attachArrangeShim(Graph);

    expect(Graph.prototype._arrangeContractedPaths).not.toBe(original);
    restore();
    expect(Graph.prototype._arrangeContractedPaths).toBe(original);
  });

  it('uses a greedy fallback ordering when no contiguous path can be found', () => {
    class Graph {}
    const restore = attachArrangeShim(Graph);
    const graph = new Graph();

    graph._maxUncontractedEdgeIndex = 0;
    graph._edgeProperties = {
      10: { _id: [1, 2], _ordered: null },
      1: { _start_index: 0, _end_index: 1 },
      2: { _start_index: 0, _end_index: 2 },
    };

    graph._arrangeContractedPaths([[{ attrs: 10 }]]);

    expect(graph._edgeProperties[10]._ordered).toEqual([1, 2]);
    restore();
  });
});
