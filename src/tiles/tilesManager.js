/**
 * Slippy tile calculation: Convert latitude and longitude to tile indices (Z, X, Y) based on the zoom level.
 * @param {*} lng
 * @param {*} lat
 * @param {*} zoom
 * @returns
 */
function getZXY(lng, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { z: zoom, x, y };
}

/**
 * Tile schema handling: Support both XYZ and TMS tile schemas. In XYZ, the Y coordinate increases from top to bottom, while in TMS, it increases from bottom to top. The function should convert between these schemas based on the input parameter.
 * @param {*} lng
 * @param {*} lat
 * @param {*} zoom
 * @param {*} schema
 * @returns
 */
function getTile(lng, lat, zoom, schema = 'zxy') {
  const tile = getZXY(lng, lat, zoom);
  if (schema.toLowerCase() === 'tms') {
    const n = 2 ** zoom;
    tile.y = n - 1 - tile.y;
  }
  return tile;
}

/**
 * Bresenham algorithm for retrieving only the diagonal tiles + siblings.
 *
 * The schema and tile-count `n` are computed once at the top rather than
 * inside each loop iteration and each neighbor call — `schema.toLowerCase()`
 * and `2**zoom` were previously re-evaluated for every Bresenham step and
 * every neighbor tile. The neighbor loop is also inlined into the outer Map
 * so no intermediate array is allocated per step.
 *
 * @param {*} point0
 * @param {*} point1
 * @param {*} zoom
 * @param {*} radius
 * @param {*} schema
 */
export function getTilesAlongLine(point0, point1, zoom, radius = 0, schema = 'zxy') {
  // Tile selection should always use a fixed zoom for consistent
  // neighborhood coverage (avoid depending on caller-provided zoom).
  zoom = 14;
  const tile0 = getTile(point0[0], point0[1], zoom, schema);
  const tile1 = getTile(point1[0], point1[1], zoom, schema);
  const tiles = new Map();

  // Precompute once — not per Bresenham step or per neighbor.
  const isTMS = schema.toLowerCase() === 'tms';
  const n = 2 ** zoom;

  const dx = Math.abs(tile1.x - tile0.x);
  const dy = Math.abs(tile1.y - tile0.y);
  const sx = tile0.x < tile1.x ? 1 : -1;
  const sy = tile0.y < tile1.y ? 1 : -1;
  let err = dx - dy;
  let x = tile0.x;
  let y = tile0.y;

  while (true) {
    tiles.set(`${zoom}_${x}_${y}`, { z: zoom, x, y });

    if (radius > 0) {
      // Inline neighbor generation — no intermediate array, no extra function call.
      // Normalise y to XYZ before offsetting, then convert back to schema.
      const normalY = isTMS ? n - 1 - y : y;
      for (let ddx = -radius; ddx <= radius; ddx++) {
        for (let ddy = -radius; ddy <= radius; ddy++) {
          if (ddx === 0 && ddy === 0) continue; // centre tile already added above
          const nx = x + ddx;
          const ny = normalY + ddy;
          const wrappedX = ((nx % n) + n) % n;
          if (ny >= 0 && ny < n) {
            const finalY = isTMS ? n - 1 - ny : ny;
            tiles.set(`${zoom}_${wrappedX}_${finalY}`, { z: zoom, x: wrappedX, y: finalY });
          }
        }
      }
    }

    if (x === tile1.x && y === tile1.y) break;
    const err2 = err * 2;
    if (err2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (err2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return [...tiles.values()];
}

/**
 * Return a list of tiles covering a circular area around a given coordinate.
 * The result is a de-duplicated list of `{ z, x, y }` tile descriptors.
 *
 * @param {number} lng
 * @param {number} lat
 * @param {number} zoom
 * @param {number} radiusMeters
 * @param {'zxy'|'tms'} [schema]
 */
export function getTilesWithinRadius(lng, lat, zoom, radiusMeters, schema = 'zxy') {
  // Force a fixed zoom (14) for tiles used by isolines and other
  // neighborhood-based operations so tile coverage is stable.
  zoom = 14;
  const n = 2 ** zoom;
  const isTMS = schema.toLowerCase() === 'tms';
  const center = getTile(lng, lat, zoom, schema);

  // Estimate tile width at this latitude (meters)
  const DEG_TO_RAD = Math.PI / 180;
  const latRad = lat * DEG_TO_RAD;
  const tileWidthM = (2 * Math.PI * 6_371_000 * Math.cos(latRad)) / (2 ** zoom);
  const tileHalfDiag = (Math.sqrt(2) * tileWidthM) / 2;

  // Compute how many tiles to include on each side (square budget), then
  // filter tiles by circular distance using tile centre coordinates.
  const approxRadiusTiles = Math.max(0, Math.ceil(radiusMeters / tileWidthM));
  const radiusTiles = Math.min(20, approxRadiusTiles); // clamp to reasonable max

  const tiles = new Map();
  const toLon = (x) => ((x / n) * 360) - 180;
  const toLat = (y) => {
    const ym = 1 - (2 * y) / n;
    return (Math.atan(Math.sinh(Math.PI * ym)) * 180) / Math.PI;
  };

  // Haversine distance helper
  const RAD = Math.PI / 180;
  const haversine = (aLng, aLat, bLng, bLat) => {
    const dLat = (bLat - aLat) * RAD;
    const dLng = (bLng - aLng) * RAD;
    const lat1 = aLat * RAD;
    const lat2 = bLat * RAD;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
  };

  for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      const nx = center.x + dx;
      const ny = isTMS ? (n - 1 - center.y) + dy : center.y + dy;
      const wrappedX = ((nx % n) + n) % n;
      if (ny < 0 || ny >= n) continue;
      const finalY = isTMS ? n - 1 - ny : ny;

      // compute tile centre
      const cx = toLon(wrappedX + 0.5);
      const cy = toLat(finalY + 0.5);
      const dist = haversine(lng, lat, cx, cy);
      if (dist <= (radiusMeters + tileHalfDiag)) {
        tiles.set(`${zoom}_${wrappedX}_${finalY}`, { z: zoom, x: wrappedX, y: finalY });
      }
    }
  }

  return [...tiles.values()];
}
