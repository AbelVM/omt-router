
/**
 * @module src/isolines/index
 * @description Public isoline API that computes GeoJSON isolines from a prepared graph.
 *   Uses CH preprocessing, point snapping, and d3-tricontour band generation.
 */

import isoPHAST from './isoPHAST.js';
import { buildCH } from '../engines/router.js';
import { findEndpointCandidate, createAugmentedGraph } from '../graphs/snapper.js';
import isobandsToFeatures from './tricontour-adapter.js';
import { prettyBreaks } from '../utils/misc.js';

/**
 * Compute an isoline polygon for a point over a prepared graph.
 *
 * @param {Object} options
 * @param {[number,number]} options.point - [lng, lat] coordinate to snap and use as the origin/target.
 * @param {'from'|'to'} [options.direction='from'] - 'from' computes distances originating at the point; 'to' computes distances toward the point.
 * @param {string} [options.mode='car'] - routing mode: 'car'|'pedestrian'|'bicycle'. When 'pedestrian' the algorithm treats edges as undirected (pair-min collapsing is performed by `buildCH()`).
 * @param {'distance'|'travelTime'|'optimal'} [options.costField='distance'] - cost metric (units: meters or seconds).
 * @param {string} [options.engineId='auto'] - engine hint included in returned properties.
 * @param {Object} options.graph - graph object with `nodes` (Map) and `edges` (Array). To enable geographic beeline pruning set `graph.coordsAreGeographic = true`.
 * @param {number} [options.maxCost=1000] - threshold in same units as `costField` (meters or seconds).
 * @param {number} [options.snapMaxDistM=800] - maximum snapping distance (meters) for projecting the point onto the graph.
 * @param {Object} [options.penalties={}] - optional penalties forwarded to `buildCH()`.
 *
 * @returns {Promise<Object>} GeoJSON `Feature` with `geometry.type` 'Polygon' or 'MultiPolygon'.
 *
 * @throws {Error} when `graph` or `point` are invalid or the point cannot be snapped.
 *
 * Example:
 * ```js
 * const feature = await isoline({
 *   point: [-0.1276, 51.5074],
 *   direction: 'from',
 *   mode: 'pedestrian',
 *   costField: 'distance',
 *   graph,
 *   maxCost: 1000,
 * });
 * // feature => GeoJSON Feature (Polygon or MultiPolygon)
 * ```
 *
 * Notes:
 * - `isoline()` snaps the provided coordinate to the nearest segment and creates
 *   an augmented graph with a new node for the projected point.
 * - The prepared graph returned by `buildCH()` exposes `distScale` and
 *   `coordsAreGeographic` that `isoPHAST()` uses (see `src/isolines/README.md`).
 */
export async function isoline({
	point,
	direction = 'from',
	mode = 'car',
	costField = 'distance',
	graph,
	maxCost = 1000,
	snapMaxDistM = 800,
	penalties = {},
} = {}) {
	if (!graph || !(graph.nodes instanceof Map) || !Array.isArray(graph.edges)) {
		throw new Error('Invalid graph: expected object with nodes Map and edges array.');
	}
	if (!Array.isArray(point) || point.length !== 2) {
		throw new Error('Invalid point: expected [lng, lat]');
	}

	// Always project the point onto the nearest segment and create an
	// augmented graph with a new node at the projected coordinates. Do not
	// fall back to nearest-node lookup — isolines must originate from the
	// projected point so the augmented graph is used consistently.
	let workingGraph;
	let startId;
	// Use the provided snapMaxDistM both as the search radius and as the
	// maximum acceptable projection distance so callers control snapping
	// sensitivity via a single parameter.
	const candidate = findEndpointCandidate(point, graph, [snapMaxDistM], snapMaxDistM);
	if (!candidate || !candidate.segmentSnap) {
		throw new Error('Point did not project to any graph segment within snapMaxDistM');
	}
	// Create augmented graph from the segment snap (this yields a new node id)
	workingGraph = createAugmentedGraph(graph, candidate.segmentSnap);
	// Ensure the working graph carries the requested travel `mode` so
	// `buildCH()` can use it when computing 'optimal' travelTime costs.
	workingGraph.mode = mode;
	startId = workingGraph._lastAddedNodeId ?? workingGraph.nodes.size - 1;

	// Build prepared graph (CSR) using same builder as routing
	const prepared = buildCH(workingGraph, costField, penalties);

	// Pass full prepared graph and let isoPHAST handle direction and mode.
	const { distances, reachable } = isoPHAST(prepared, startId, maxCost, { outputUnscaled: true, direction, mode });

    const DEBUG_ISOLINES = typeof process !== 'undefined'
      ? process.env?.DEBUG_ISOLINES
      : typeof import.meta !== 'undefined'
        ? import.meta.env?.DEBUG_ISOLINES
        : false;

    if (DEBUG_ISOLINES) {
      console.error('DEBUG_ISOLINES reachable', reachable, Array.from(distances).map((d,i)=>[i,d]));
    }


	// Use d3-tricontour to build contour geometries. Build a simple
	// points array as `[x, y, value]` entries which tricontour expects.
	const coordsArr = prepared.coordsArr || [];
	const points = [];
	// Exclude values strictly greater than the threshold + epsilon so tricontour
	// only receives points within the requested isoband range.
	const factor = 1.5; // 50% epsilon to prevent floating point "almost there" issues
	let breaks = prettyBreaks(0, maxCost, 7).filter(k => k < maxCost);
	breaks.push(maxCost);
	breaks.sort((a, b) => a - b);
	for (let i = 0; i < distances.length; i++) {
		const v = distances[i];
		if (!Number.isFinite(v)) continue;
		if (v > maxCost * factor) continue;
		const coord = coordsArr[i];
		if (!coord || coord.length < 2) continue;
		points.push([coord[0], coord[1], v]);
	}

  if (DEBUG_ISOLINES) {
    console.error('DEBUG_ISOLINES isoline points', points.length, points);
    console.error('DEBUG_ISOLINES breaks', breaks);
  }

	// Compute isobands via d3-tricontour adapter and return GeoJSON.
	if (points.length === 0) return { type: 'FeatureCollection', features: [] };
	return isobandsToFeatures(points, breaks);
}

export default isoline;

