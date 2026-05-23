import { describe, it, expect } from 'vitest';
import { getDefaultSpeedKmh, parseMaxspeedKmh } from '../src/utils/ways_defaults.js';

describe('utils/ways_defaults', () => {
  it('returns class speed for car and default for unknown class', () => {
    expect(getDefaultSpeedKmh('car', 'motorway')).toBe(130);
    // unknown class falls back to 50
    expect(getDefaultSpeedKmh('car', 'nonexistent_class')).toBe(50);
  });

  it('uses explicit maxspeed values for car when available', () => {
    expect(getDefaultSpeedKmh('car', 'residential', '80')).toBe(80);
    expect(getDefaultSpeedKmh('car', 'motorway', '50 mph')).toBeCloseTo(80.4672, 4);
    expect(getDefaultSpeedKmh('car', 'motorway', 65)).toBe(65);
    expect(getDefaultSpeedKmh('car', 'motorway', 'none')).toBe(130);
  });

  it('parses maxspeed tags and falls back to defaults for invalid values', () => {
    expect(parseMaxspeedKmh(undefined)).toBeNull();
    expect(parseMaxspeedKmh(null)).toBeNull();
    expect(parseMaxspeedKmh({})).toBeNull();
    expect(parseMaxspeedKmh('walk')).toBeNull();
    expect(parseMaxspeedKmh('0')).toBeNull();
    expect(parseMaxspeedKmh('-10')).toBeNull();
    expect(parseMaxspeedKmh('30 kph')).toBe(30);
    expect(getDefaultSpeedKmh('car', 'residential', 'unknown')).toBe(50);
  });

  it('returns mode base speeds for pedestrian and bicycle', () => {
    expect(getDefaultSpeedKmh('pedestrian', 'any')).toBe(5);
    expect(getDefaultSpeedKmh('bicycle', 'any')).toBe(15);
  });

  it('throws for unknown mode', () => {
    expect(() => getDefaultSpeedKmh('scooter', 'road')).toThrow();
  });
});
