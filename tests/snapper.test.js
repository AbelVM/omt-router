import { describe, expect, it } from 'vitest';
import { findClosestSegmentProjection } from '../src/graphs/snapper.js';

describe('snapper helpers', () => {
  it('finds a projection on a long segment when nearby nodes are outside the node radius', () => {
    const graph = {
      nodes: new Map([
        [0, { id: 0, coords: [0, 0] }],
        [1, { id: 1, coords: [1, 0] }],
      ]),
      edges: [{ source: 0, target: 1, cost: 1, reverseCost: 1 }],
    };

    const snap = findClosestSegmentProjection([0.5, 0.0001], graph, 60);

    expect(snap).not.toBeNull();
    expect(snap.edgeIndex).toBe(0);
    expect(snap.source).toBe(0);
    expect(snap.target).toBe(1);
    expect(snap.distanceM).toBeLessThan(60);
  });
});
