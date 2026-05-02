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
