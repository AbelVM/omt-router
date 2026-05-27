/**
 * Default transportation way classifications and speed heuristics.
 * This module provides mode-specific acceptance rules and default priority
 * values used by the routing graph builder and engine.
 * @module src/utils/ways_defaults
 */

/**
 * Classification of ways for different transportation modes
 * from https://openmaptiles.org/schema/#transportation
 * using mapconfig filters from https://github.com/pgrouting/osm2pgrouting
 */
export const ways = {
  car: {
    class: new Set([
      'motorway',
      'motorway_link',
      'motorway_junction',
      'trunk',
      'trunk_link',
      'primary',
      'primary_link',
      'secondary',
      'secondary_link',
      'tertiary',
      'tertiary_link',
      'residential',
      'living_street',
      'service',
      'unclassified',
      'road',
      'minor',
    ]),
    exclude_subclass: new Set([
      'pedestrian',
      'footway',
      'steps',
      'cycleway',
      'bridleway',
      'corridor',
    ]),
  },
  pedestrian: {
    class: new Set([
      'road',
      'primary',
      'primary_link',
      'secondary',
      'secondary_link',
      'tertiary',
      'tertiary_link',
      'residential',
      'living_street',
      'service',
      'track',
      'pedestrian',
      'path',
      'cycleway',
      'footway',
      'bridleway',
      'byway',
      'steps',
      'unclassified',
      'minor',
    ]),
    subclass: new Set(['pedestrian', 'footway', 'steps', 'path', 'corridor', 'platform']),
    foot: new Set(['yes', 'designated', 'permissive', 'use_sidepath']),
  },
  bicycle: {
    class: new Set([
      'road',
      'primary',
      'primary_link',
      'secondary',
      'secondary_link',
      'tertiary',
      'tertiary_link',
      'residential',
      'living_street',
      'service',
      'track',
      'unclassified',
      'path',
      'cycleway',
      'footway',
      'pedestrian',
      'bridleway',
      'minor',
    ]),
    subclass: new Set(['cycleway', 'path']),
    exclude_classes: new Set([
      'motorway',
      'motorway_link',
      'motorway_junction',
      'trunk',
      'trunk_link',
    ]),
    bicycle: new Set(['yes', 'designated', 'permissive', 'use_sidepath', 'optional_sidepath']),
  },
};

export const WAY_PRIORITIES = {
  car: {
    motorway: 1.0,
    motorway_link: 1.0,
    motorway_junction: 1.0,
    trunk: 1.05,
    trunk_link: 1.05,
    primary: 1.15,
    primary_link: 1.15,
    secondary: 1.5,
    secondary_link: 1.5,
    tertiary: 1.75,
    tertiary_link: 1.75,
    residential: 2.5,
    service: 2.5,
    unclassified: 3,
    living_street: 3,
    road: 5,
    minor: 5,
  },
  bicycle: {
    cycleway: 1.0,
    path: 1.1,
    pedestrian: 1.1,
    footway: 1.1,
    bridleway: 1.3,
    track: 2.0,
    living_street: 2.0,
    service: 2.0,
    residential: 2.2,
    unclassified: 2.3,
    tertiary_link: 2.5,
    tertiary: 2.5,
    secondary_link: 3.0,
    secondary: 3.0,
    primary_link: 3.5,
    primary: 3.5,
    road: 4.0,
  },
  pedestrian: {
    road: 1.0,
    primary: 1.0,
    primary_link: 1.0,
    secondary: 1.0,
    secondary_link: 1.0,
    tertiary: 1.0,
    tertiary_link: 1.0,
    residential: 1.0,
    living_street: 1.0,
    service: 1.0,
    track: 1.0,
    pedestrian: 1.0,
    path: 1.0,
    cycleway: 1.0,
    footway: 1.0,
    bridleway: 1.0,
    byway: 1.0,
    steps: 1.0,
    unclassified: 1.0,
    minor: 1.0,
  },
};

/**
 * Default road speeds (km/h) by OpenMapTiles transportation class.
 * Used to compute travel-time cost in addition to distance cost.
 * These defaults are aligned with pgRouting's car maxspeed defaults when
 * explicit speed metadata is unavailable.
 */
export const CLASS_SPEEDS_KMH = {
  motorway: 130,
  motorway_link: 130,
  motorway_junction: 130,
  trunk: 110,
  trunk_link: 110,
  primary: 90,
  primary_link: 90,
  secondary: 90,
  secondary_link: 90,
  tertiary: 90,
  tertiary_link: 90,
  residential: 50,
  living_street: 20,
  service: 50,
  unclassified: 50,
  road: 50,
  minor: 50,
  track: 20,
  path: 5,
  pedestrian: 5,
};

export const MODE_BASE_SPEEDS_KMH = {
  pedestrian: 5,
  bicycle: 15,
};

/**
 * Parse an OSM maxspeed tag into kilometers per hour.
 * Supports values like `50`, `50 km/h`, and `50 mph`.
 * Returns null for unknown or non-numeric tags such as `none`, `walk`, or `signals`.
 *
 * @param {string|number|null|undefined} maxspeed
 * @returns {number|null}
 */
export function parseMaxspeedKmh(maxspeed) {
  if (maxspeed == null) return null;
  if (typeof maxspeed === 'number') {
    return Number.isFinite(maxspeed) && maxspeed > 0 ? maxspeed : null;
  }
  if (typeof maxspeed !== 'string') return null;

  const value = maxspeed.trim().toLowerCase();
  if (!value || value === 'none') return null;

  const mphMatch = value.match(/^(\d+(?:\.\d+)?)\s*mph$/);
  if (mphMatch) {
    return Number(mphMatch[1]) * 1.609344;
  }

  const kmhMatch = value.match(/^(\d+(?:\.\d+)?)\s*(?:km\/h|kph)$/);
  if (kmhMatch) {
    return Number(kmhMatch[1]);
  }

  const numericMatch = value.match(/^(\d+(?:\.\d+)?)/);
  if (numericMatch) {
    const numericValue = Number(numericMatch[1]);
    return numericValue > 0 ? numericValue : null;
  }

  return null;
}

/**
 * Default speed profile by transport mode.
 * Car uses per-class legal-driving defaults while bicycle and pedestrian
 * use conservative mode-wide averages when explicit road speeds are absent.
 *
 * @param {'car'|'pedestrian'|'bicycle'} mode
 * @param {string} roadClass
 * @param {string|number|null|undefined} [maxspeed]
 * @returns {number}
 */
/**
 * Get the default speed in km/h for a given transport mode and road class.
 * @param {'car'|'pedestrian'|'bicycle'} mode Transport mode.
 * @param {string} roadClass OpenMapTiles road class.
 * @param {string|number|null|undefined} [maxspeed] Optional explicit maxspeed tag.
 * @returns {number} Default speed in kilometers per hour.
 */
export function getDefaultSpeedKmh(mode, roadClass, maxspeed) {
  if (mode === 'car') {
    return parseMaxspeedKmh(maxspeed) ?? CLASS_SPEEDS_KMH[roadClass] ?? 50;
  }

  if (mode === 'bicycle' || mode === 'pedestrian') {
    return MODE_BASE_SPEEDS_KMH[mode];
  }

  throw new Error(`Unknown transport mode: ${mode}`);
}
