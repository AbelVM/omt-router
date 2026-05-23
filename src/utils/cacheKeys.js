/** @module src/utils/cacheKeys */

const GRAPH_CACHE_KEY_VERSION = 'v4';
const FULL_TILE_LIST_THRESHOLD = 32;

/**
 * FNV-1a 32-bit hash rendered as hex.
 * @param {string[]} tileIds
 * @returns {string}
 */
export function fnv1aHash(tileIds) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < tileIds.length; i++) {
    const str = tileIds[i];
    for (let j = 0; j < str.length; j++) {
      hash ^= str.charCodeAt(j);
      hash = (hash * 0x01000193) >>> 0;
    }
  }
  return hash.toString(16);
}

/**
 * 64-bit-style digest from two independent FNV-1a passes.
 * @param {string[]} tileIds
 * @returns {string}
 */
export function fnv1aDigest(tileIds) {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;
  for (let i = 0; i < tileIds.length; i++) {
    const str = tileIds[i];
    for (let j = 0; j < str.length; j++) {
      const code = str.charCodeAt(j);
      hashA ^= code;
      hashA = (hashA * 0x01000193) >>> 0;
      hashB ^= code ^ (i + 1);
      hashB = (hashB * 0x01000193) >>> 0;
    }
  }
  return `${hashA.toString(16)}-${hashB.toString(16)}`;
}

/**
 * Build a graph cache key. Small tile sets use the full sorted list to avoid collisions.
 * @param {object} params
 * @param {string} params.mode
 * @param {number} params.zoom
 * @param {string} params.schema
 * @param {string} params.urlTemplate
 * @param {string} [params.tileProxyTemplate]
 * @param {string[]} params.tileIds sorted tile ids
 * @returns {string}
 */
export function buildGraphCacheKey({
  mode,
  zoom,
  schema,
  urlTemplate,
  tileProxyTemplate = '',
  tileIds,
}) {
  const prefix = `${GRAPH_CACHE_KEY_VERSION}:${mode}:${zoom}:${schema}:${urlTemplate}:${tileProxyTemplate}:`;
  if (tileIds.length <= FULL_TILE_LIST_THRESHOLD) {
    return `${prefix}${tileIds.join('|')}`;
  }
  return `${prefix}${fnv1aDigest(tileIds)}`;
}
