/**
 *  Interpolate a URL template like "myserver/{z}/{x}/{y}.pbf" or a proxy template
 *  containing "{url}" using a simple placeholder replacement.
 * @param {string} template
 * @param {Object} values
 * @returns {string}
 */
export const interpolate = (template, values) => {
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : `{${key}}`;
  });
};

/**
 * Haversine distance between two [lng, lat] coordinate pairs, in meters.
 * @param {[number, number]} c1
 * @param {[number, number]} c2
 * @returns {number}
 */
const EARTH_RADIUS_M = 6_371_000;
const EARTH_RADIUS_M_SQUARED = EARTH_RADIUS_M * EARTH_RADIUS_M;
const DEG_TO_RAD = Math.PI / 180;

export function haversineDistance([lng1, lat1], [lng2, lat2]) {
  return haversineDistanceCoords(lng1, lat1, lng2, lat2);
}

export function haversineDistanceCoords(lng1, lat1, lng2, lat2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const sinHalfDistance = Math.hypot(
    sinHalfLat,
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinHalfLng,
  );
  return 2 * EARTH_RADIUS_M * Math.asin(sinHalfDistance);
}

export function isWithinDistanceMetersCoords(lng1, lat1, lng2, lat2, maxDistanceM) {
  const lat1Rad = lat1 * DEG_TO_RAD;
  const lat2Rad = lat2 * DEG_TO_RAD;
  const deltaLat = lat2Rad - lat1Rad;
  const deltaLng = (lng2 - lng1) * DEG_TO_RAD;
  const meanLat = (lat1Rad + lat2Rad) * 0.5;
  const x = deltaLng * Math.cos(meanLat);
  const y = deltaLat;
  return (x * x + y * y) * EARTH_RADIUS_M_SQUARED <= maxDistanceM * maxDistanceM;
}

export function isWithinDistanceMeters([lng1, lat1], [lng2, lat2], maxDistanceM) {
  return isWithinDistanceMetersCoords(lng1, lat1, lng2, lat2, maxDistanceM);
}
