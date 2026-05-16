/**
 * RBush-backed fast point-in-ring utilities.
 *
 * Purpose
 * - Prepare GeoJSON-style linear rings for fast repeated point-in-polygon
 *   queries (flat Float64Array + bbox).
 * - Build an `rbush` R-tree of ring bboxes to cheaply filter candidates
 *   before running an exact ray-cast + on-segment test.
 *
 * Complexity
 * - Preparing a ring: O(m) where m = number of vertices.
 * - Query: expected O(log n + k) for `rbush` bbox query + O(m') for exact
 *   PIP on each candidate ring (m' = vertices in the ring candidate).
 *
 * API (exports)
 * - `prepareRing(ring, eps)` -> prepared ring object
 * - `pointInPreparedRing(px, py, prepared, { inclusive })` -> boolean
 * - `buildRingIndex(preparedRings)` -> rbush tree
 * - `ringsContainingPoint(px, py, preparedRings, tree, { inclusive })` -> [indices]
 * - `pointInRing(px, py, ring, options)` -> boolean (one-off convenience)
 *
 * Usage example
 * ```js
 * import { prepareRing, buildRingIndex, ringsContainingPoint } from './src/utils/fastPointInRing.js';
 * const rings = [outerRing, holeRing];
 * const prepared = rings.map(r => prepareRing(r));
 * const tree = buildRingIndex(prepared);
 * const hits = ringsContainingPoint(lon, lat, prepared, tree);
 * ```
 * @module src/utils/fastPointInRing
 */
import RBush from 'rbush';

/**
 * Prepare a linear ring for fast PIP.
 *
 * - Accepts a GeoJSON linear ring (array of [x,y], closed or not).
 * - Returns an object { coords: Float64Array, n, bbox: [minX,minY,maxX,maxY], eps }
 * - If the ring has fewer than 3 distinct vertices, returns n=0.
 *
 * @param {Array<Array<number>>} ring
 * @param {number} [eps=1e-12]
 * @returns {{coords:Float64Array,n:number,bbox:[number,number,number,number],eps:number}}
 */
function prepareRing(ring, eps = 1e-12) {
  const n0 = Array.isArray(ring) ? ring.length : 0;
  if (n0 === 0) return { coords: new Float64Array(0), n: 0, bbox: [0, 0, 0, 0], eps };
  const closed =
    n0 > 1 &&
    Math.abs(ring[0][0] - ring[n0 - 1][0]) <= eps &&
    Math.abs(ring[0][1] - ring[n0 - 1][1]) <= eps;
  const n = closed ? n0 - 1 : n0;
  if (n < 3) return { coords: new Float64Array(0), n: 0, bbox: [0, 0, 0, 0], eps };
  const coords = new Float64Array(2 * n);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = +ring[i][0];
    const y = +ring[i][1];
    coords[2 * i] = x;
    coords[2 * i + 1] = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { coords, n, bbox: [minX, minY, maxX, maxY], eps };
}

/**
 * Test if point (x,y) lies on segment [A(ax,ay)-B(bx,by)] within eps.
 * Returns true for collinear + within bounding box of segment.
 */
function _pointOnSegment(ax, ay, bx, by, x, y, eps) {
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  if (Math.abs(cross) > eps) return false;
  if (x < Math.min(ax, bx) - eps || x > Math.max(ax, bx) + eps) return false;
  if (y < Math.min(ay, by) - eps || y > Math.max(ay, by) + eps) return false;
  return true;
}

/**
 * Test if point (px,py) is inside a prepared ring using ray-cast.
 * - `inclusive=true` treats boundary as inside (returns true on edge).
 *
 * @param {number} px
 * @param {number} py
 * @param {object} prepared
 * @param {{inclusive?:boolean}} [opts]
 * @returns {boolean}
 */
function pointInPreparedRing(px, py, prepared, { inclusive = true } = {}) {
  if (!prepared || prepared.n === 0) return false;
  const [minX, minY, maxX, maxY] = prepared.bbox;
  if (px < minX || px > maxX || py < minY || py > maxY) return false;
  const coords = prepared.coords;
  const n = prepared.n;
  const eps = prepared.eps || 1e-12;
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const xi = coords[2 * i],
      yi = coords[2 * i + 1];
    const xj = coords[2 * j],
      yj = coords[2 * j + 1];
    // on-segment check (boundary)
    if (_pointOnSegment(xi, yi, xj, yj, px, py, eps)) return !!inclusive;
    // ray-cast intersection
    const intersect = yi > py !== yj > py && px < xi + ((py - yi) * (xj - xi)) / (yj - yi);
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

/**
 * Build an `rbush` spatial index for an array of prepared rings.
 * Returns the loaded rbush tree. Stored item format: {minX,minY,maxX,maxY,id}.
 *
 * @param {Array<object>} preparedRings
 * @returns {import('rbush')}
 */
function buildRingIndex(preparedRings) {
  const tree = new RBush();
  const items = preparedRings.map((p, i) => {
    const [minX, minY, maxX, maxY] = p.bbox;
    return { minX, minY, maxX, maxY, id: i };
  });
  tree.load(items);
  return tree;
}

/**
 * Return indices of `preparedRings` that contain the point (px,py).
 * - `tree` may be a prebuilt rbush; if omitted it's built on the fly.
 * - The returned indices refer to positions in the `preparedRings` array.
 *
 * @param {number} px
 * @param {number} py
 * @param {Array<object>} preparedRings
 * @param {import('rbush')} [tree]
 * @param {{inclusive?:boolean}} [opts]
 * @returns {Array<number>}
 */
function ringsContainingPoint(px, py, preparedRings, tree, { inclusive = true } = {}) {
  if (!tree) tree = buildRingIndex(preparedRings);
  const hits = tree.search({ minX: px, minY: py, maxX: px, maxY: py });
  const result = [];
  for (const h of hits) {
    const id = h.id;
    const p = preparedRings[id];
    if (!p) continue;
    const [minX, minY, maxX, maxY] = p.bbox;
    if (px < minX || px > maxX || py < minY || py > maxY) continue;
    if (pointInPreparedRing(px, py, p, { inclusive })) result.push(id);
  }
  return result;
}

/**
 * Convenience one-off test: prepare the ring then test the point.
 * Use `prepareRing` + `buildRingIndex` for many queries for better perf.
 *
 * @param {number} px
 * @param {number} py
 * @param {Array<Array<number>>} ring
 * @param {{eps?:number,inclusive?:boolean}} [options]
 * @returns {boolean}
 */
function pointInRing(point, ring, options) {
  const p = prepareRing(ring, options && options.eps);
  return pointInPreparedRing(point[0], point[1], p, options);
}

/**
 * Find a point guaranteed to lie within the given ring (or on its boundary
 * when `inclusive=true`). The function is optimized for common cases and
 * performs cheap checks first (bbox center, average, polygon centroid), then
 * falls back to triangle-centroid tests and a small bbox grid sample.
 *
 * Input may be a raw ring (array of [x,y]) or a prepared ring (the object
 * returned by `prepareRing`). Returns an `[x, y]` pair or `null` if no point
 * was found.
 *
 * Options:
 * - `inclusive` (default `true`): treat boundary as inside.
 * - `gridSize` (default `3`): grid sampling resolution (gridSize^2 samples).
 * - `eps`: forwarded to `prepareRing` when input is not prepared.
 */
function findInteriorPoint(ringOrPrepared, { inclusive = true, gridSize = 3, eps } = {}) {
  const prepared =
    ringOrPrepared && ringOrPrepared.coords ? ringOrPrepared : prepareRing(ringOrPrepared, eps);
  if (!prepared || prepared.n === 0) return null;
  const coords = prepared.coords;
  const n = prepared.n;
  const [minX, minY, maxX, maxY] = prepared.bbox;

  const test = (x, y) => pointInPreparedRing(x, y, prepared, { inclusive });

  // 1) bbox center
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  if (test(cx, cy)) return [cx, cy];

  // 2) simple average of vertices
  let sx = 0,
    sy = 0;
  for (let i = 0; i < n; i++) {
    sx += coords[2 * i];
    sy += coords[2 * i + 1];
  }
  const avgx = sx / n,
    avgy = sy / n;
  if (test(avgx, avgy)) return [avgx, avgy];

  // 3) area-weighted polygon centroid (shoelace). Works for many concave
  // polygons but isn't guaranteed; cheap to compute.
  let area2 = 0,
    cX = 0,
    cY = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[2 * i],
      yi = coords[2 * i + 1];
    const xj = coords[2 * j],
      yj = coords[2 * j + 1];
    const cross = xi * yj - xj * yi;
    area2 += cross;
    cX += (xi + xj) * cross;
    cY += (yi + yj) * cross;
  }
  if (Math.abs(area2) > (prepared.eps || 1e-12)) {
    const polyCx = cX / (3 * area2);
    const polyCy = cY / (3 * area2);
    if (test(polyCx, polyCy)) return [polyCx, polyCy];
  }

  // 4) consecutive-triple triangle centroids (local convex triangles)
  for (let i = 0; i < n; i++) {
    const a = i;
    const b = (i + 1) % n;
    const c = (i + 2) % n;
    const ax = coords[2 * a],
      ay = coords[2 * a + 1];
    const bx = coords[2 * b],
      by = coords[2 * b + 1];
    const cx2 = coords[2 * c],
      cy2 = coords[2 * c + 1];
    const cross = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
    if (Math.abs(cross) <= (prepared.eps || 1e-12)) continue;
    const triCx = (ax + bx + cx2) / 3;
    const triCy = (ay + by + cy2) / 3;
    if (test(triCx, triCy)) return [triCx, triCy];
  }

  // 5) fan triangles from vertex 0
  for (let i = 1; i < n - 1; i++) {
    const ax = coords[0],
      ay = coords[1];
    const bx = coords[2 * i],
      by = coords[2 * i + 1];
    const cx2 = coords[2 * (i + 1)],
      cy2 = coords[2 * (i + 1) + 1];
    const cross = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
    if (Math.abs(cross) <= (prepared.eps || 1e-12)) continue;
    const triCx = (ax + bx + cx2) / 3;
    const triCy = (ay + by + cy2) / 3;
    if (test(triCx, triCy)) return [triCx, triCy];
  }

  // 6) small bbox grid sampling (avoid edges by using interior fractions)
  const gx = maxX - minX;
  const gy = maxY - minY;
  if (gx > 0 && gy > 0) {
    const denom = gridSize + 1;
    for (let yi = 1; yi <= gridSize; yi++) {
      const fy = yi / denom;
      const py = minY + fy * gy;
      for (let xi = 1; xi <= gridSize; xi++) {
        const fx = xi / denom;
        const px = minX + fx * gx;
        if (test(px, py)) return [px, py];
      }
    }
  }

  // If nothing found, return null. Caller can fall back to boundary points
  // or other heuristics if `inclusive` is acceptable.
  return null;
}

export {
  prepareRing,
  pointInPreparedRing,
  buildRingIndex,
  ringsContainingPoint,
  pointInRing,
  findInteriorPoint,
};
