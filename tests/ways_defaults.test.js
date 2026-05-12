import { describe, it, expect } from 'vitest';
import { getDefaultSpeedKmh } from '../src/utils/ways_defaults.js';

describe('utils/ways_defaults', () => {
  it('returns class speed for car and default for unknown class', () => {
    expect(getDefaultSpeedKmh('car', 'motorway')).toBe(130);
    // unknown class falls back to 50
    expect(getDefaultSpeedKmh('car', 'nonexistent_class')).toBe(50);
  });

  it('returns mode base speeds for pedestrian and bicycle', () => {
    expect(getDefaultSpeedKmh('pedestrian', 'any')).toBe(5);
    expect(getDefaultSpeedKmh('bicycle', 'any')).toBe(15);
  });

  it('throws for unknown mode', () => {
    expect(() => getDefaultSpeedKmh('scooter', 'road')).toThrow();
  });
});
