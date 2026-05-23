import { describe, expect, it } from 'vitest';
import {
  interpolate,
  haversineDistance,
  haversineDistanceCoords,
  isWithinDistanceMeters,
  isWithinDistanceMetersCoords,
  prettyBreaks,
  signedArea,
} from '../src/utils/misc.js';

describe('utils/misc helpers', () => {
  it('interpolates templates and preserves unknown placeholders', () => {
    expect(interpolate('https://tiles/{z}/{x}/{y}.pbf', { z: 1, x: 2, y: 3 })).toBe(
      'https://tiles/1/2/3.pbf'
    );
    expect(interpolate('https://{host}/{z}/{x}/{y}', { z: 1, x: 2, y: 3 })).toBe(
      'https://{host}/1/2/3'
    );
  });

  it('computes haversine distances consistently for both helper variants', () => {
    const a = [0, 0];
    const b = [0.1, 0.1];
    expect(haversineDistance(a, b)).toBeGreaterThan(0);
    expect(haversineDistanceCoords(a[0], a[1], b[0], b[1])).toBeCloseTo(haversineDistance(a, b), 6);
  });

  it('detects whether two coordinates are within a given distance threshold', () => {
    expect(isWithinDistanceMeters([0, 0], [0, 0.001], 200)).toBe(true);
    expect(isWithinDistanceMeters([0, 0], [0, 1], 200)).toBe(false);
    expect(isWithinDistanceMetersCoords(0, 0, 0, 0.001, 200)).toBe(true);
  });

  it('handles exact distance thresholds correctly with coordinates and helper variants', () => {
    const threshold = haversineDistanceCoords(0, 0, 0, 0.001);
    expect(isWithinDistanceMetersCoords(0, 0, 0, 0.001, threshold)).toBe(true);
    expect(isWithinDistanceMetersCoords(0, 0, 0, 0.001, threshold - 1)).toBe(false);
  });

  it('returns a single break when min and max are equal and reverses breaks when min is larger', () => {
    expect(prettyBreaks(5, 5)).toEqual([5]);
    const breaks = prettyBreaks(100, 0, 4);
    expect(breaks[0]).toBe(100);
    expect(breaks[breaks.length - 1]).toBe(0);
  });

  it('generates well-rounded pretty breaks for small numeric ranges', () => {
    expect(prettyBreaks(0.1, 0.5, 4)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('calculates signed polygon area with orientation awareness', () => {
    const ccw = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const cw = [
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 0],
    ];
    expect(signedArea(ccw)).toBeGreaterThan(0);
    expect(signedArea(cw)).toBeLessThan(0);
  });
});
