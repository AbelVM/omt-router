import { describe, expect, it } from 'vitest';
import {
  prepareRing,
  pointInPreparedRing,
  buildRingIndex,
  ringsContainingPoint,
  pointInRing,
  findInteriorPoint,
} from '../src/utils/fastPointInRing.js';

describe('fastPointInRing', () => {
  it('prepares a closed ring and computes its bbox', () => {
    const ring = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    const prepared = prepareRing(ring);

    expect(prepared.n).toBe(4);
    expect(prepared.bbox).toEqual([0, 0, 2, 2]);
    expect(prepared.coords).toHaveLength(8);
  });

  it('detects points inside, outside, and on the boundary based on inclusive option', () => {
    const ring = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    const prepared = prepareRing(ring);

    expect(pointInPreparedRing(1, 1, prepared)).toBe(true);
    expect(pointInPreparedRing(3, 3, prepared)).toBe(false);
    expect(pointInPreparedRing(0, 0, prepared, { inclusive: false })).toBe(false);
    expect(pointInPreparedRing(0, 0, prepared, { inclusive: true })).toBe(true);
  });

  it('searches a ring index with or without a prebuilt tree', () => {
    const ringA = prepareRing([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
    const ringB = prepareRing([
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ]);
    const tree = buildRingIndex([ringA, ringB]);

    expect(ringsContainingPoint(0.5, 0.5, [ringA, ringB], tree)).toEqual([0]);
    expect(ringsContainingPoint(10.5, 10.5, [ringA, ringB], null)).toEqual([1]);
  });

  it('finds an interior point for a concave polygon and rejects invalid rings', () => {
    const concave = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 1],
      [0, 4],
      [0, 0],
    ];
    const interior = findInteriorPoint(concave);

    expect(interior).toBeInstanceOf(Array);
    expect(interior).toHaveLength(2);
    expect(pointInRing(interior, concave)).toBe(true);
    expect(
      pointInRing(
        [0, 0],
        [
          [0, 0],
          [1, 0],
        ]
      )
    ).toBe(false);
  });
});
