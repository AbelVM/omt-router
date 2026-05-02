/**
 *  Interpolate a URL string "myserver/{z}/{x}/{y}.pbf" with variables using template literals.
 * @param {string} template
 * @param {Object} tile
 * @returns {string}
 */
export const interpolate = (template, tile) => {
  const { z, x, y } = tile;
  // Single regex pass avoids creating two intermediate strings from chained .replace() calls.
  return template.replace(/\{([xyz])\}/g, (_, k) => k === 'z' ? z : k === 'x' ? x : y);
};

/**
 * Haversine distance between two [lng, lat] coordinate pairs, in meters.
 * @param {[number, number]} c1
 * @param {[number, number]} c2
 * @returns {number}
 */
export function haversineDistance([lng1, lat1], [lng2, lat2]) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
