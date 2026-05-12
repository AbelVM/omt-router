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


/**
 * Generates "pretty" breaks for any order of magnitude, including billions.
 * 
 * @param {number} min - Minimum value of the data.
 * @param {number} max - Maximum value of the data.
 * @param {number} n - Target number of intervals (approximate).
 * @returns {number[]} Array of pretty break points.
 */
export function prettyBreaks(min, max, n = 5) {
    if (min === max) return [min];
    
    // 1. Ensure order and calculate range
    const reverse = min > max;
    const startVal = reverse ? max : min;
    const endVal = reverse ? min : max;
    const range = endVal - startVal;
    
    // 2. Calculate the raw step size
    const rawStep = range / n;

    // 3. Magnitude (e.g., if rawStep is 2,000,000,000, magnitude is 1,000,000,000)
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));

    // 4. Normalize the step to a value between 1 and 10
    const residual = rawStep / magnitude;

    // 5. Choose the "nicest" step (1, 2, 5, or 10)
    let prettyStep;
    if (residual < 1.5) prettyStep = 1;
    else if (residual < 3) prettyStep = 2;
    else if (residual < 7) prettyStep = 5;
    else prettyStep = 10;

    const finalStep = prettyStep * magnitude;

    // 6. Anchor the start and end values to the finalStep
    const start = Math.floor(startVal / finalStep) * finalStep;
    const end = Math.ceil(endVal / finalStep) * finalStep;

    const breaks = [];
    let current = start;
    
    // 7. Handle decimal precision vs. large integer scales
    // For billions, precision will be 0 or negative, so we use Math.max(0, ...)
    const precision = Math.max(0, -Math.floor(Math.log10(finalStep)));

    // Small epsilon to prevent floating point "almost there" errors
    const epsilon = finalStep / 1e9;

    while (current <= end + epsilon) {
        // toFixed handles clean string conversion; Number() converts it back
        // This approach handles scientific notation for extremely large values automatically.
        breaks.push(Number(current.toFixed(precision)));
        current += finalStep;
    }

    return reverse ? breaks.reverse() : breaks;
}

