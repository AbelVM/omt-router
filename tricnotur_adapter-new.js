import { tricontour } from 'd3-tricontour';


/* ---------------------------------------------------------- */
/* MAIN                                                         */
/* ---------------------------------------------------------- */

export default function isobandsToGeoJSON(points, breaks = []) {

    const tri = tricontour();

    if (breaks.length > 0) {
        tri.thresholds(breaks);
    }

    const bands = Array.from(tri.isobands(points));

    const domainBBox = computeBBox(
        points.map(p => [p[0], p[1]])
    );

    return {
        type: 'FeatureCollection',

        features: bands.map((band, bandIndex) => {

            // flatten all rings globally
            let rings = flattenBandRings(
                band.coordinates
            );

            // remove tricontour hull artifacts
            rings = removeHullArtifacts(
                rings,
                domainBBox
            );

            // rebuild topology
            const polygons = buildPolygons(rings);

            return {
                type: 'Feature',

                properties: {
                    valueMin: band.value,
                    valueMax: band.valueMax,
                    bandIndex
                },

                geometry: polygons.length === 1
                    ? {
                        type: 'Polygon',
                        coordinates: polygons[0]
                    }
                    : {
                        type: 'MultiPolygon',
                        coordinates: polygons
                    }
            };
        })
    };
}


/* ---------------------------------------------------------- */
/* FLATTEN                                                       */
/* ---------------------------------------------------------- */

function flattenBandRings(coords) {

    const rings = [];

    for (const poly of coords) {
        for (const ring of poly) {
            rings.push(ring);
        }
    }

    return rings;
}


/* ---------------------------------------------------------- */
/* REMOVE HULL ARTIFACTS                                        */
/* ---------------------------------------------------------- */

/**
 * tricontour emits spurious rings approximating
 * the triangulation hull.
 *
 * We remove rings satisfying BOTH:
 *
 * 1. bbox ~= domain bbox
 * 2. area among largest rings
 */

function removeHullArtifacts(rings, domainBBox) {

    const areas = rings.map(r =>
        Math.abs(signedArea(r))
    );

    const maxArea = Math.max(...areas);

    const areaThreshold = maxArea * 0.99;

    return rings.filter((ring, i) => {

        const bbox = computeBBox(ring);

        const bboxMatch = bboxAlmostEquals(
            bbox,
            domainBBox,
            1e-9
        );

        const hugeArea =
            areas[i] >= areaThreshold;

        // remove ONLY rings satisfying BOTH
        return !(bboxMatch && hugeArea);
    });
}


/* ---------------------------------------------------------- */
/* TOPOLOGY RECONSTRUCTION                                      */
/* ---------------------------------------------------------- */

function buildPolygons(rings) {

    const nodes = rings.map(ring => ({
        ring,
        area: Math.abs(signedArea(ring)),
        bbox: computeBBox(ring),
        parent: null,
        children: []
    }));

    // larger first
    nodes.sort((a, b) => b.area - a.area);

    // containment tree
    for (let i = 0; i < nodes.length; i++) {

        const child = nodes[i];

        const p = child.ring[0];

        let bestParent = null;
        let bestArea = Infinity;

        for (let j = 0; j < nodes.length; j++) {

            if (i === j) continue;

            const parent = nodes[j];

            if (parent.area <= child.area) continue;

            if (
                !bboxContains(
                    parent.bbox,
                    child.bbox
                )
            ) {
                continue;
            }

            if (!pointInRing(p, parent.ring)) {
                continue;
            }

            if (parent.area < bestArea) {
                bestArea = parent.area;
                bestParent = parent;
            }
        }

        child.parent = bestParent;

        if (bestParent) {
            bestParent.children.push(child);
        }
    }

    // parity topology
    const polygons = [];

    for (const node of nodes) {

        const depth = nodeDepth(node);

        // even depth => shell
        if ((depth & 1) === 0) {

            const poly = [
                ensureCCW(node.ring)
            ];

            for (const child of node.children) {

                const childDepth =
                    nodeDepth(child);

                // odd depth => hole
                if ((childDepth & 1) === 1) {
                    poly.push(
                        ensureCW(child.ring)
                    );
                }
            }

            polygons.push(poly);
        }
    }

    return polygons;
}


/* ---------------------------------------------------------- */
/* GEOMETRY                                                      */
/* ---------------------------------------------------------- */

function signedArea(ring) {

    let sum = 0;

    for (let i = 0; i < ring.length - 1; i++) {

        const p1 = ring[i];
        const p2 = ring[i + 1];

        sum +=
            p1[0] * p2[1] -
            p2[0] * p1[1];
    }

    return sum * 0.5;
}


function ensureCCW(ring) {

    return signedArea(ring) > 0
        ? ring
        : [...ring].reverse();
}


function ensureCW(ring) {

    return signedArea(ring) < 0
        ? ring
        : [...ring].reverse();
}


/* ---------------------------------------------------------- */
/* BBOX                                                          */
/* ---------------------------------------------------------- */

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

    return {
        minX,
        minY,
        maxX,
        maxY
    };
}


function bboxContains(a, b) {

    return (
        a.minX <= b.minX &&
        a.minY <= b.minY &&
        a.maxX >= b.maxX &&
        a.maxY >= b.maxY
    );
}


function bboxAlmostEquals(a, b, eps) {

    return (
        Math.abs(a.minX - b.minX) < eps &&
        Math.abs(a.minY - b.minY) < eps &&
        Math.abs(a.maxX - b.maxX) < eps &&
        Math.abs(a.maxY - b.maxY) < eps
    );
}


/* ---------------------------------------------------------- */
/* POINT IN RING                                                 */
/* ---------------------------------------------------------- */

function pointInRing(point, ring) {

    const x = point[0];
    const y = point[1];

    let inside = false;

    for (
        let i = 0, j = ring.length - 1;
        i < ring.length;
        j = i++
    ) {

        const xi = ring[i][0];
        const yi = ring[i][1];

        const xj = ring[j][0];
        const yj = ring[j][1];

        const intersect =
            ((yi > y) !== (yj > y)) &&
            (
                x <
                ((xj - xi) * (y - yi)) /
                (yj - yi) +
                xi
            );

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}


/* ---------------------------------------------------------- */
/* DEPTH                                                         */
/* ---------------------------------------------------------- */

function nodeDepth(node) {

    let depth = 0;

    let p = node.parent;

    while (p) {
        depth++;
        p = p.parent;
    }

    return depth;
}