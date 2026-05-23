/** @module src/engines/constants */

export const ENGINE_ID_ALIASES = Object.freeze({
  cpu: 'bidirectional-astar',
  bidirectionalAStar: 'bidirectional-astar',
  adaptiveBarrier: 'adaptive-barrier',
  deltaStepping: 'delta-stepping',
  ultraDijkstra: 'ultra-dijkstra',
});

export const CANONICAL_ENGINE_IDS = Object.freeze([
  'bidirectional-astar',
  'adaptive-barrier',
  'delta-stepping',
  'ultra-dijkstra',
]);

export const DEFAULT_ENGINE_ID = 'bidirectional-astar';

/**
 * @param {string|null|undefined} engineId
 * @param {string} [fallback='bidirectional-astar']
 * @returns {string}
 */
export function normalizeEngineId(engineId, fallback = DEFAULT_ENGINE_ID) {
  if (typeof engineId !== 'string' || !engineId) return fallback;
  return ENGINE_ID_ALIASES[engineId] ?? engineId;
}

/**
 * @param {string|null|undefined} engineId
 * @returns {boolean}
 */
export function isKnownEngineId(engineId) {
  if (engineId === 'auto' || engineId === 'gpu') return true;
  if (typeof engineId !== 'string' || !engineId.trim()) return false;
  const trimmed = engineId.trim();
  if (Object.prototype.hasOwnProperty.call(ENGINE_ID_ALIASES, trimmed)) return true;
  return CANONICAL_ENGINE_IDS.includes(trimmed);
}
