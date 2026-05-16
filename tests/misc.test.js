import { describe, it, expect } from 'vitest';
import {
  interpolate,
  haversineDistance,
  haversineDistanceCoords,
  isWithinDistanceMeters,
} from '../src/utils/misc.js';

describe('utils/misc', () => {
  it('interpolate replaces known keys and preserves unknown placeholders', () => {
    const tpl = 'https://tiles.example/{z}/{x}/{y}.pbf?cache={cache}';
    const out = interpolate(tpl, { z: 1, x: 2, y: 3 });
    expect(out).toContain('1/2/3');
    // unknown key remains as placeholder
    expect(out).toContain('{cache}');
  });

  it('haversineDistance and haversineDistanceCoords agree and are symmetric', () => {
    const a = [-0.1276, 51.5074];
    const b = [-0.1276, 51.5075];
    const d1 = haversineDistance(a, b);
    const d2 = haversineDistanceCoords(a[0], a[1], b[0], b[1]);
    expect(d1).toBeCloseTo(d2, 6);
    // symmetry
    expect(haversineDistance(b, a)).toBeCloseTo(d1, 6);
    // same point distance is ~0
    expect(haversineDistance(a, a)).toBeCloseTo(0, 6);
  });

  it('isWithinDistanceMeters returns true/false correctly', () => {
    const a = [-0.1276, 51.5074];
    const b = [-0.1276, 51.5084]; // ~111m north
    expect(isWithinDistanceMeters(a, b, 200)).toBe(true);
    expect(isWithinDistanceMeters(a, b, 50)).toBe(false);
  });
});
