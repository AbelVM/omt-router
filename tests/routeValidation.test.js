import { describe, expect, it } from 'vitest';
import {
  validateRouteCoordinates,
  normalizeRouteMode,
  validateZoom,
  normalizeTileSchema,
  validateUrlTemplate,
  validateMaxAcceptableSnapDistance,
  validateRadius,
} from '../src/utils/routeValidation.js';

describe('route input validation', () => {
  it('accepts valid start/end coordinates', () => {
    expect(() => validateRouteCoordinates([-3.7038, 40.4168], 'start')).not.toThrow();
    expect(() => validateRouteCoordinates([0, 0], 'end')).not.toThrow();
  });

  it('rejects invalid start coordinates', () => {
    expect(() => validateRouteCoordinates([181, 0], 'start')).toThrow(/Invalid start/);
    expect(() => validateRouteCoordinates([-3.7, NaN], 'start')).toThrow(/Invalid start/);
  });

  it('rejects invalid end coordinates', () => {
    expect(() => validateRouteCoordinates([0, 91], 'end')).toThrow(/Invalid end/);
    expect(() => validateRouteCoordinates('invalid', 'end')).toThrow(/Invalid end/);
  });

  it('normalizes valid transport modes and rejects unknown ones', () => {
    expect(normalizeRouteMode('car')).toBe('car');
    expect(normalizeRouteMode('BICYCLE')).toBe('bicycle');
    expect(() => normalizeRouteMode('skateboard')).toThrow(/Unknown transport mode/);
  });

  it('validates tile zoom values', () => {
    expect(() => validateZoom(14)).not.toThrow();
    expect(() => validateZoom(-1)).toThrow(/Invalid zoom/);
    expect(() => validateZoom(14.5)).toThrow(/Invalid zoom/);
    expect(() => validateZoom(23)).toThrow(/Invalid zoom/);
  });

  it('normalizes tile schema values and rejects invalid schema', () => {
    expect(normalizeTileSchema('zxy')).toBe('zxy');
    expect(normalizeTileSchema('TMS')).toBe('tms');
    expect(() => normalizeTileSchema('foo')).toThrow(/Invalid tile schema/);
  });

  it('validates URL templates', () => {
    expect(() => validateUrlTemplate('https://example.com/{z}/{x}/{y}.pbf')).not.toThrow();
    expect(() => validateUrlTemplate('')).toThrow(/Invalid urlTemplate/);
  });

  it('validates acceptable snap distance', () => {
    expect(() => validateMaxAcceptableSnapDistance(50)).not.toThrow();
    expect(() => validateMaxAcceptableSnapDistance(-1)).toThrow(/Invalid maxAcceptableSnapDistanceM/);
    expect(() => validateMaxAcceptableSnapDistance(NaN)).toThrow(/Invalid maxAcceptableSnapDistanceM/);
  });

  it('validates radius values', () => {
    expect(validateRadius(2)).toBe(2);
    expect(() => validateRadius(0)).toThrow(/Invalid radius/);
    expect(() => validateRadius(1.5)).toThrow(/Invalid radius/);
  });
});
