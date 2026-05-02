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
 */
export const CLASS_SPEEDS_KMH = {
  motorway: 120,
  motorway_link: 100,
  trunk: 100,
  trunk_link: 80,
  primary: 80,
  primary_link: 60,
  secondary: 60,
  secondary_link: 50,
  tertiary: 40,
  tertiary_link: 30,
  minor: 30,
  service: 20,
  track: 15,
  living_street: 10,
  path: 5,
  pedestrian: 5,
};
