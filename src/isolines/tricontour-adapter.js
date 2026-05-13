import { tricontour } from 'd3-tricontour';
import { signedArea } from '../utils/misc';
import { pointInRing, findInteriorPoint } from '../utils/fastPointInRing';

function computeBBox(points) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        const x = p[0];
        const y = p[1];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
}

function bboxOverlapRatio(a, b) {
    const ix = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
    const iy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
    const intersection = ix * iy;
    const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
    const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
    const union = areaA + areaB - intersection;
    return union === 0 ? 0 : intersection / union;
}

// helper: accept only already-closed rings; drop unclosed rings
// Note: we intentionally DO NOT auto-close rings produced upstream
// (d3-tricontour sometimes yields open rings). Unclosed rings are
// considered invalid polygons and will be discarded.
function closeRing(r) {
  if (!Array.isArray(r) || r.length === 0) return null;
  const first = r[0];
  const last = r[r.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return r.slice();
  return null;
}

// monotone chain convex hull; returns closed hull ring or [].
function convexHull(points) {
  const uniq = Array.from(
    new Map(points.map(p => [`${p[0]},${p[1]}`, p])).values()
  );
  if (uniq.length <= 1) return uniq;
  uniq.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  const hull = lower.concat(upper);
  if (hull.length === 0) return [];
  hull.push(hull[0]);
  return hull;
}

function ringAreaAbs(r) {
  return Math.abs(signedArea(r));
}

function ringMatchesHull(ring, hull, eps = 1e-6) {
  if (!hull || hull.length < 3) return false;
  const r = closeRing(ring);
  if (!r || r.length < 4) return false; // need closed ring (min 4 points including closing)
  const h = closeRing(hull);
  if (!h || h.length < 4) return false;

  // quick bail when hull area is zero
  const aH = ringAreaAbs(h);
  if (aH === 0) return false;

  // if lengths match, try robust coordinate comparison (with rotation/reverse)
  if (r.length === h.length) {
    const n = r.length - 1; // exclude duplicated closing point
    const approxEqual = (a, b) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

    // try direct alignment with any offset
    for (let offset = 0; offset < n; offset++) {
      let ok = true;
      for (let i = 0; i < n; i++) {
        if (!approxEqual(r[(i + offset) % n], h[i])) { ok = false; break; }
      }
      if (ok) return true;
    }

    // try reversed hull
    const hr = h.slice(0, -1).slice().reverse();
    for (let offset = 0; offset < n; offset++) {
      let ok = true;
      for (let i = 0; i < n; i++) {
        if (!approxEqual(r[(i + offset) % n], hr[i])) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  // fallback: compare area and bbox overlap for approximate match
  const aR = ringAreaAbs(r);
  if (Math.abs(aR - aH) / aH > 0.02) return false; // 2% area tolerance
  const bbR = computeBBox(r);
  const bbH = computeBBox(h);
  if (bboxOverlapRatio(bbR, bbH) < 0.985) return false; // very high overlap required
  return true;
}

// promote largest ring to outer and fix winding: outer CCW (signedArea > 0), holes CW (signedArea < 0)
function normalizePolygonRings(polygon) {
  // Preserve ringsort grouping when possible. Only adjust winding and
  // ensure outer ring is first. Avoid promoting largest ring blindly
  // (that can reassign holes to wrong outer and create overlaps).
  const rings = polygon.map(closeRing).filter(r => r && r.length >= 4);
  if (rings.length === 0) return [];

  // deduplicate exact/reversed rings while preserving original order
  function canonicalRingKey(ring, digits = 9) {
    const n0 = ring.length;
    const closed = ring[0][0] === ring[n0 - 1][0] && ring[0][1] === ring[n0 - 1][1];
    const n = closed ? n0 - 1 : n0;
    const coords = ring.slice(0, n);
    const toStr = (p) => `${p[0].toFixed(digits)},${p[1].toFixed(digits)}`;
    // produce a rotation/reversal invariant key by taking minimal rotation
    let best = null;
    for (let start = 0; start < n; start++) {
      const seq = new Array(n);
      for (let i = 0; i < n; i++) seq[i] = toStr(coords[(start + i) % n]);
      const key = seq.join(';');
      if (best === null || key < best) best = key;
    }
    const rev = coords.slice().reverse();
    for (let start = 0; start < n; start++) {
      const seq = new Array(n);
      for (let i = 0; i < n; i++) seq[i] = toStr(rev[(start + i) % n]);
      const key = seq.join(';');
      if (key < best) best = key;
    }
    return best;
  }
  const seen = new Set();
  const uniq = [];
  for (const r of rings) {
    const key = canonicalRingKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
  }

  // if outer (first) is not CCW, try to find a ring with positive area
  // and move it to front. This preserves ringsort grouping when present.
  if (signedArea(uniq[0]) <= 0) {
    const posIdx = uniq.findIndex(r => signedArea(r) > 0);
    if (posIdx > 0) {
      const [outer] = uniq.splice(posIdx, 1);
      uniq.unshift(outer);
    } else {
      // fallback: no positively oriented ring found; pick largest by abs area
      const absAreas = uniq.map(r => Math.abs(signedArea(r)));
      let maxIdx = 0;
      for (let i = 1; i < uniq.length; i++) if (absAreas[i] > absAreas[maxIdx]) maxIdx = i;
      if (maxIdx !== 0) {
        const [largest] = uniq.splice(maxIdx, 1);
        uniq.unshift(largest);
      }
    }
  }

  // enforce winding: outer CCW (>0), holes CW (<0)
  if (signedArea(uniq[0]) < 0) uniq[0] = uniq[0].slice().reverse();
  for (let i = 1; i < uniq.length; i++) {
    if (signedArea(uniq[i]) > 0) uniq[i] = uniq[i].slice().reverse();
  }
  return uniq;
}


/**
 * Convert d3-tricontour isobands output into GeoJSON FeatureCollection.
 * Ensures that any "island" outer ring in band N uses the exact geometry
 * of the corresponding hole ring in band N-1 (if present) by matching
 * canonical ring keys.
 * @param {Array} points - Array of points with {x, y, value} for d3-tricontour input.
 * @param {Array} breaks - Array of threshold values for d3-tricontour isobands output.
 * @returns {Object} GeoJSON FeatureCollection with Polygon/MultiPolygon features.
 */
export default function isobandsToFeatures(points, breaks = []) {
    const tri = tricontour();
    let maxCost = 0;
    if (breaks.length > 0) {
        tri.thresholds(breaks);
        maxCost = breaks.at(-1);
    }
    const triOut = Array.from(tri.isobands(points));
    // Filter out bands with no coordinates or that exceed maxCost (if specified)
    const bands = triOut.filter(band => Array.isArray(band.coordinates) && band.coordinates.length > 0 && (maxCost > 0 ? band.valueMax <= maxCost : true));

    // no debug logging here

    // compute domain hull from the input points once (map to [x,y])
    const hull = convexHull(points.map(p => [p[0], p[1]]));

    // If tricontour produced no polygon geometry for any band, fall back
    // to a simple polygon built from the domain hull or reachable points.
    if (!bands || bands.length === 0) {
      const coords2 = points.map(p => [p[0], p[1]]);
      let ring = null;
      if (Array.isArray(hull) && hull.length >= 4) {
        ring = hull.slice();
      } else if (coords2.length >= 2) {
        const a = coords2[0];
        const b = coords2[1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const norm = Math.hypot(dx, dy) || 1;
        const eps = 1e-6;
        const px = -(dy / norm) * eps;
        const py = (dx / norm) * eps;
        const c = [(a[0] + b[0]) / 2 + px, (a[1] + b[1]) / 2 + py];
        ring = [a, b, c, a];
      } else if (coords2.length === 1) {
        const a = coords2[0];
        const eps = 1e-6;
        ring = [[a[0] - eps, a[1] - eps], [a[0] + eps, a[1] - eps], [a[0] + eps, a[1] + eps], [a[0] - eps, a[1] + eps], [a[0] - eps, a[1] - eps]];
      }

      const maxVal = (breaks && breaks.length) ? breaks[breaks.length - 1] : 0;
      const feature = {
        type: 'Feature',
        properties: { value: 0, valueMin: 0, valueMax: maxVal, bandIndex: 0 },
        geometry: { type: 'Polygon', coordinates: ring ? [ring] : [] }
      };
      return { type: 'FeatureCollection', features: [feature] };
    }

    // Convert each band to a GeoJSON Feature with cleaned geometry.
    // Strategy:
    // 1) Flatten all rings emitted for the band (all polygons -> rings)
    // 2) Remove hull artifacts (rings approximating the domain hull)
    // 3) Rebuild containment topology (parent-child) by area + PIP
    // 4) Emit polygons with outer shells and holes (respecting winding)
    const features = bands.map((band, bandIndex) => {
      // 1) flatten rings
      const rings = [];
      for (const poly of band.coordinates) {
        if (!Array.isArray(poly)) continue;
        for (const r of poly) {
          const cr = closeRing(r);
          if (cr && cr.length >= 4) rings.push(cr);
        }
      }
      if (rings.length === 0) {
        return {
          type: 'Feature',
          properties: {
            value: band.value,
            valueMin: band.value,
            valueMax: band.valueMax,
            bandIndex
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates: []
          }
        };
      }

      // 2) remove hull artifacts (rings that match domain hull)
      const goodRings = rings.filter(r => !ringMatchesHull(r, hull));
      if (goodRings.length === 0) {
        return {
          type: 'Feature',
          properties: {
            value: band.value,
            valueMin: band.value,
            valueMax: band.valueMax,
            bandIndex
          },
          geometry: {
            type: 'MultiPolygon',
            coordinates: []
          }
        };
      }

      // 3) build nodes and containment tree
      const nodes = goodRings.map(r => ({
        ring: r,
        area: Math.abs(signedArea(r)),
        bbox: computeBBox(r),
        parent: null,
        children: []
      }));

      // sort by descending area
      nodes.sort((a, b) => b.area - a.area);

      // helper bboxContains
      function bboxContains(a, b) {
        return a.minX <= b.minX && a.minY <= b.minY && a.maxX >= b.maxX && a.maxY >= b.maxY;
      }

      for (let i = 0; i < nodes.length; i++) {
        const child = nodes[i];
        const testPoint = findInteriorPoint(child.ring) || child.ring[0];
        let bestParent = null;
        let bestArea = Infinity;
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const parent = nodes[j];
          if (parent.area <= child.area) continue;
          if (!bboxContains(parent.bbox, child.bbox)) continue;
          if (!pointInRing(testPoint, parent.ring)) continue;
          if (parent.area < bestArea) {
            bestArea = parent.area;
            bestParent = parent;
          }
        }
        child.parent = bestParent;
        if (bestParent) bestParent.children.push(child);
      }

      // 4) parity topology -> build polygons (outer shells with holes)
      function nodeDepth(node) {
        let depth = 0; let p = node.parent;
        while (p) { depth++; p = p.parent; }
        return depth;
      }

      function ensureCCW(ring) { return signedArea(ring) > 0 ? ring : ring.slice().reverse(); }
      function ensureCW(ring) { return signedArea(ring) < 0 ? ring : ring.slice().reverse(); }

      const polygons = [];
      for (const node of nodes) {
        const depth = nodeDepth(node);
        // even depth => shell
        if ((depth & 1) === 0) {
          const poly = [ ensureCCW(node.ring) ];
          for (const child of node.children) {
            const childDepth = nodeDepth(child);
            if ((childDepth & 1) === 1) {
              poly.push(ensureCW(child.ring));
            }
          }
          polygons.push(poly);
        }
      }

      return {
        type: 'Feature',
        properties: {
          value: band.value,
          valueMin: band.value,
          valueMax: band.valueMax,
          bandIndex
        },
        geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons }
      };
    });
    // return final FeatureCollection
    return { type: 'FeatureCollection', features };
}
