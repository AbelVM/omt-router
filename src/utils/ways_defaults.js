/**
 * Classification of ways for different transportation modes
 * from https://openmaptiles.org/schema/#transportation
 */
export const ways = {
  car: {
    class: new Set([
      'motorway',
      'motorway_link',
      'trunk',
      'trunk_link',
      'primary',
      'primary_link',
      'secondary',
      'secondary_link',
      'tertiary',
      'tertiary_link',
      'minor',
      'service',
      'track',
      'residential',
      'unclassified',
      'living_street',
    ]),
    exclude_subclass: new Set(['pedestrian', 'footway', 'steps', 'cycleway', 'bridleway', 'corridor']),
  },
  pedestrian: {
    class: new Set(['path', 'minor', 'service', 'track']),
    subclass: new Set(['pedestrian', 'footway', 'steps', 'path', 'corridor', 'platform']),
    foot: new Set(['yes', 'designated', 'permissive', 'use_sidepath']),
  },
  bicycle: {
    class: new Set(['path', 'minor', 'service', 'tertiary', 'secondary', 'track']),
    subclass: new Set(['cycleway', 'path',]),
    exclude_classes: new Set(['motorway', 'motorway_link']),
    bicycle: new Set(['yes', 'designated', 'permissive', 'use_sidepath', 'optional_sidepath']),
  },
};

/**
 * Default road speeds (km/h) by OpenMapTiles transportation class.
 * Used to compute travel-time cost in addition to distance cost.
 * These defaults represent max-legal style assumptions when explicit speed
 * metadata is not available in vector tiles.
 */
export const CLASS_SPEEDS_KMH = {
  motorway: 120,
  motorway_link: 60,
  trunk: 90,
  trunk_link: 50,
  primary: 80,
  primary_link: 50,
  secondary: 70,
  secondary_link: 45,
  tertiary: 50,
  tertiary_link: 35,
  minor: 35,
  service: 30,
  track: 20,
  living_street: 10,
  residential: 30,
  unclassified: 35,
  path: 5,
  pedestrian: 5,
};

export const MODE_BASE_SPEEDS_KMH = {
  pedestrian: 5,
  bicycle: 15,
};

/**
 * Default speed profile by transport mode.
 * Car uses per-class urban averages, while bicycle and pedestrian keep a
 * conservative mode-wide default unless a more detailed profile is added.
 *
 * @param {'car'|'pedestrian'|'bicycle'} mode
 * @param {string} roadClass
 * @returns {number}
 */
export function getDefaultSpeedKmh(mode, roadClass) {
  if (mode === 'car') {
    return CLASS_SPEEDS_KMH[roadClass] ?? 50;
  }

  if (mode === 'bicycle' || mode === 'pedestrian') {
    return MODE_BASE_SPEEDS_KMH[mode];
  }

  throw new Error(`Unknown transport mode: ${mode}`);
}
