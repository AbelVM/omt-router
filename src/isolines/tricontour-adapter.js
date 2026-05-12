import { tricontour } from 'd3-tricontour';

const PRECISION = 9;

function ringKey(ring) {
    // Canonicalize ring by choosing the lexicographically minimal
    // rotation among the ring and its reversal. Optimized using
    // Booth's algorithm to get O(n) behavior instead of O(n^2).
    if (!Array.isArray(ring) || ring.length === 0) return '';
    // drop duplicate closing point if present
    let r = ring;
    const n = r.length;
    if (n > 1) {
        const a0 = r[0], an = r[n - 1];
        if (Math.abs(a0[0] - an[0]) < 1e-12 && Math.abs(a0[1] - an[1]) < 1e-12) r = r.slice(0, n - 1);
    }
    const formatted = new Array(r.length);
    for (let i = 0; i < r.length; i++) {
        const xy = r[i];
        formatted[i] = `${xy[0].toFixed(PRECISION)}:${xy[1].toFixed(PRECISION)}`;
    }
    const m = formatted.length;
    if (m === 0) return '';
    if (m === 1) return formatted[0];

    // Booth's algorithm for minimal rotation index on an array
    function minimalRotationIndex(arr) {
        const len = arr.length;
        let i = 0, j = 1, k = 0;
        while (i < len && j < len && k < len) {
            const a = arr[(i + k) % len];
            const b = arr[(j + k) % len];
            if (a === b) {
                k++;
                continue;
            }
            if (a > b) {
                i = i + k + 1;
                if (i <= j) i = j + 1;
            } else {
                j = j + k + 1;
                if (j <= i) j = i + 1;
            }
            k = 0;
        }
        return Math.min(i, j);
    }

    const startF = minimalRotationIndex(formatted);
    const rev = formatted.slice().reverse();
    const startR = minimalRotationIndex(rev);

    // Compare the two candidate rotations lexicographically without
    // materializing all intermediate rotated strings.
    for (let t = 0; t < m; t++) {
        const a = formatted[(startF + t) % m];
        const b = rev[(startR + t) % m];
        if (a === b) continue;
        if (a < b) {
            // forward is lexicographically smaller
            if (startF === 0) return formatted.join('|');
            return formatted.slice(startF).concat(formatted.slice(0, startF)).join('|');
        }
        // reversed is smaller
        if (startR === 0) return rev.join('|');
        return rev.slice(startR).concat(rev.slice(0, startR)).join('|');
    }

    // identical sequences
    if (startF === 0) return formatted.join('|');
    return formatted.slice(startF).concat(formatted.slice(0, startF)).join('|');
}

// d3-tricontour sorts rings via `ringsort`: outer rings have positive
// signed area and are placed as the first ring in each polygon returned
// (holes follow). Rely on that invariant rather than re-computing
// containment relationships here.

/**
 * Convert d3-tricontour isobands output into GeoJSON FeatureCollection.
 * Ensures that any "island" outer ring in band N uses the exact geometry
 * of the corresponding hole ring in band N-1 (if present) by matching
 * canonical ring keys.
 */
export default function isobandsToFeatures(points, breaks = []) {
    const tri = tricontour();
    let maxCost = 0;
    if (breaks.length > 0) {
        tri.thresholds(breaks);
        maxCost = breaks.at(-1);
    }

    const triOut = Array.from(tri.isobands(points));

    // For each band > 0, map previous band's holes by canonical key so we can
    // replace matching outer rings (islands) with the hole geometry.
    // `triOut` polygons are already sorted by tricontour.ringsort, so each
    // polygon is an array with the outer ring at index 0 and holes following.
    for (let b = 1; b < triOut.length; b++) {
        const prev = triOut[b - 1];
        const prevHoles = new Map();
        if (Array.isArray(prev.coordinates)) {
            const prevCoords = prev.coordinates;
            for (let pi = 0; pi < prevCoords.length; pi++) {
                const poly = prevCoords[pi];
                if (!Array.isArray(poly)) continue;
                for (let i = 1, L = poly.length; i < L; i++) {
                    const hole = poly[i];
                    const key = ringKey(hole);
                    if (key && !prevHoles.has(key)) prevHoles.set(key, hole);
                }
            }
        }
        if (prevHoles.size === 0) continue;

        const curr = triOut[b];
        if (!Array.isArray(curr.coordinates)) continue;
        const currCoords = curr.coordinates;
        for (let pi = 0; pi < currCoords.length; pi++) {
            const poly = currCoords[pi];
            if (!Array.isArray(poly) || poly.length === 0) continue;
            const outer = poly[0];
            const key = ringKey(outer);
            if (prevHoles.has(key)) {
                poly[0] = prevHoles.get(key).slice();
            }
        }
    }
    const features = new Array(triOut.length);
    for (let i = 0; i < triOut.length; i++) {
        const g = triOut[i];
        if (g.valueMax > maxCost) continue;
        const props = { valueMin: g.value, valueMax: g.valueMax, bandIndex: i };
        let geometry;
        if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) geometry = { type: g.type, coordinates: g.coordinates };
        else if (g.coordinates.length === 1) geometry = { type: 'Polygon', coordinates: g.coordinates[0] };
        else geometry = { type: 'MultiPolygon', coordinates: g.coordinates };
        features[i] = { type: 'Feature', geometry, properties: props };
    }

    return { type: 'FeatureCollection', features };
}
