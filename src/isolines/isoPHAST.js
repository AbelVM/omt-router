import { Graph } from 'contraction-hierarchy-js';
import { haversineDistance as haversine } from '../utils/misc.js';
import { attachArrangeShim } from './chShim.js';

/**
 * Compute many-to-all distances up to a threshold using Contraction Hierarchies (CH).
 *
 * Implementation notes / internals
 * - `prepared` should be the object produced by `buildCH()` (see
 *   `../engines/router.js`). It may contain either an explicit edge list
 *   (`edgeSrc`, `edgeTgt`, `edgeCostInt`) or CSR arrays (`adjPtr`,
 *   `adjTo`, `adjCost`). `isoPHAST` prefers explicit edge lists when
 *   available because they may already reflect pedestrian pair-min
 *   collapsing.
 * - CH construction & caching:
 *   - A `contraction-hierarchy-js` `Graph` is constructed and contracted
 *     on first use and cached on `prepared._chGraph`.
 *   - A pathfinder instance is cached as `prepared._chFinder`.
 *   - The CH is rebuilt when `mode` (undirected handling),
 *     `prepared.costField`, or `prepared.penaltyKey` differ from the
 *     values recorded when the CH was created. Keys saved on `prepared`:
 *     `_chGraphMode`, `_chGraphIsUndirected`, `_chGraphCostField`,
 *     `_chGraphPenaltyKey`.
 * - Scaling:
 *   - `buildCH()` converts float costs to integer `edgeCostInt` using
 *     `distScale` (exposed on `prepared.distScale`). `isoPHAST` reads
 *     `prepared.distScale` (fallback 10) and converts integer costs back
 *     to floats when adding edges to the CH.
 *   - When `opts.outputUnscaled === true` `isoPHAST` returns distances
 *     in original float units (meters/seconds). Otherwise it returns
 *     integer-scaled distances consistent with `distScale` (rounded).
 * - Beeline (spatial) pruning:
 *   - If `prepared.coordsAreGeographic === true`, `prepared.costField === 'distance'`,
 *     and `opts.outputUnscaled === true`, a fast haversine check skips CH
 *     queries for nodes whose straight-line distance from `startId` exceeds
 *     the threshold. Only enable this when coordinates are genuine
 *     geographic lon/lat.
 * - CH query semantics and edge cases:
 *   - Some `contraction-hierarchy-js` query results report `total_cost === 0`
 *     when no path is found. `isoPHAST` treats `total_cost === 0` as
 *     "no path" for nodes where `v !== startId` to avoid false zero-costs.
 * - Direction semantics:
 *   - `direction === 'from'` queries the CH from `startId` → `v`.
 *   - `direction === 'to'` inverts queries by asking `v` → `startId`, so
 *     callers don't need a reversed prepared graph.
 *
 * @param {object} prepared - prepared adjacency object (see above)
 * @param {number} startId - graph node id to start from
 * @param {number} threshold - numeric cutoff (same units as returned distances)
 * @param {object} [opts]
 * @param {'from'|'to'} [opts.direction='from'] - direction semantics for the isoline
 * @param {string} [opts.mode='car'] - routing mode; when 'pedestrian' the graph is treated as undirected
 * @param {boolean} [opts.outputUnscaled=false] - if true, return distances in original units (float)
 * @returns {{ distances: Float64Array, reachable: number[] }}
 */
export default function isoPHAST(prepared, startId, threshold, opts = {}) {
    if (!prepared || typeof prepared !== 'object') {
        throw new Error('Invalid prepared graph for isoPHAST');
    }

    const { N } = prepared;
    if (!Number.isInteger(N)) throw new Error('Prepared graph missing node count `N`.');

    const { direction = 'from', mode = 'car', outputUnscaled = false } = opts;
    if (direction !== 'from' && direction !== 'to') throw new Error('Invalid direction: expected "from" or "to".');

    // Validate startId early
    if (!Number.isInteger(startId) || startId < 0 || startId >= N) {
        throw new Error(`Invalid startId ${startId}: expected integer in range 0..${N - 1}`);
    }

    // Distances in float units (meters or seconds)
    const distances = new Float64Array(N).fill(Infinity);

    // Build and cache a contraction-hierarchy-js Graph on the prepared object.
    // Rebuild when mode (undirected handling), costField, or penaltyKey differs.
    const isUndirected = mode === 'pedestrian';
    // prefer an explicit scale reported by the prepared graph; fall back to 10
    const scale = (prepared.distScale && Number.isFinite(prepared.distScale)) ? prepared.distScale : 10;
    if (!prepared._chGraph ||
        prepared._chGraphMode !== mode ||
        prepared._chGraphIsUndirected !== isUndirected ||
        prepared._chGraphCostField !== prepared.costField ||
        prepared._chGraphPenaltyKey !== prepared.penaltyKey) {

        const g = new Graph();
        let edgeId = 0;

        // Prefer explicit edge list when available (returned by buildCH()).
        const edgeSrc = prepared.edgeSrc || null;
        const edgeTgt = prepared.edgeTgt || null;
        const edgeCostInt = prepared.edgeCostInt || null;

        if (edgeSrc && edgeTgt && edgeCostInt) {
            // Use prepared explicit edge lists directly. When buildCH() has
            // already collapsed opposite-directed pairs for pedestrian mode
            // the lists will reflect that; pass `isUndirected` through to
            // Graph.addEdge so the CH builder knows how to treat each edge.
            for (let i = 0; i < edgeSrc.length; i++) {
                const u = edgeSrc[i];
                const v = edgeTgt[i];
                const cost = edgeCostInt[i] / scale; // convert integer cost -> float
                g.addEdge(String(u), String(v), { _id: edgeId++, _cost: cost }, null, isUndirected);
            }
        } else {
            // Fallback: build from CSR adjacency arrays if explicit edge lists are missing.
            const { adjPtr, adjTo, adjCost } = prepared;
            for (let u = 0; u < N; u++) {
                for (let k = adjPtr[u]; k < adjPtr[u + 1]; k++) {
                    const v = adjTo[k];
                    const cost = adjCost[k] / scale;
                    g.addEdge(String(u), String(v), { _id: edgeId++, _cost: cost }, null, isUndirected);
                }
            }
        }

        // Use a small helper module to attach a safe `_arrangeContractedPaths` shim
        // for the duration of contraction. The helper returns a restore function.
        const restoreArrange = attachArrangeShim(Graph);

        try {
            g.contractGraph();
        } finally {
            restoreArrange();
        }

        prepared._chGraph = g;
        prepared._chGraphMode = mode;
        prepared._chGraphIsUndirected = isUndirected;
        // track which cost/penalty settings were used to build this CH so callers
        // that change costField/penalties will force a rebuild
        prepared._chGraphCostField = prepared.costField;
        prepared._chGraphPenaltyKey = prepared.penaltyKey;
        // Create a fresh pathfinder bound to the newly contracted graph
        prepared._chFinder = prepared._chGraph.createPathfinder({});
    }

    const finder = prepared._chFinder || prepared._chGraph.createPathfinder({});
    prepared._chFinder = finder;

      // Compute many-to-all distances using CH queries. For 'to' direction we
      // invert query ordering (query v -> startId) so callers need not provide
      // a reversed prepared graph.
      // Beeline pruning: when costs represent distance (meters) and caller
      // requested unscaled output, skip expensive CH queries for nodes whose
      // straight-line distance exceeds the threshold.
    const canUseBeeline = outputUnscaled && prepared.coordsArr && prepared.coordsArr[startId] && prepared.costField === 'distance' && prepared.coordsAreGeographic === true;
    const coordsStart = canUseBeeline ? prepared.coordsArr[startId] : null;
    if (direction === 'from') {
        for (let v = 0; v < N; v++) {
            if (v === startId) {
                distances[v] = 0;
                continue;
            }
              if (canUseBeeline) {
                  const coordsV = prepared.coordsArr[v];
                  if (!coordsV) { distances[v] = Infinity; continue; }
                  const beeline = haversine(coordsStart, coordsV);
                  if (beeline > threshold) { distances[v] = Infinity; continue; }
              }
            try {
                const res = finder.queryContractionHierarchy(String(startId), String(v));
                // contraction-hierarchy-js returns total_cost = 0 when no path is found.
                // Treat 0 as 'no path' for distinct nodes (v !== startId).
                if (res && Number.isFinite(res.total_cost)) {
                    distances[v] = (res.total_cost === 0 && v !== startId) ? Infinity : res.total_cost;
                } else {
                    distances[v] = Infinity;
                }
            } catch (_err) {
                distances[v] = Infinity;
            }
        }
    } else {
        for (let v = 0; v < N; v++) {
            if (v === startId) {
                distances[v] = 0;
                continue;
            }
              if (canUseBeeline) {
                  const coordsV = prepared.coordsArr[v];
                  if (!coordsV) { distances[v] = Infinity; continue; }
                  const beeline = haversine(coordsStart, coordsV);
                  if (beeline > threshold) { distances[v] = Infinity; continue; }
              }
            try {
                const res = finder.queryContractionHierarchy(String(v), String(startId));
                if (res && Number.isFinite(res.total_cost)) {
                    distances[v] = (res.total_cost === 0 && v !== startId) ? Infinity : res.total_cost;
                } else {
                    distances[v] = Infinity;
                }
            } catch (_err) {
                distances[v] = Infinity;
            }
        }
    }

    // Collect reachable nodes within threshold
    const reachable = [];
    for (let i = 0; i < N; i++) {
        const d = distances[i];
        if (Number.isFinite(d) && d <= threshold) reachable.push(i);
    }

    // Output scaling semantics:
    // - If `outputUnscaled` === true, return floating distances in original units
    //   (same units as `threshold`, e.g. meters).
    // - Otherwise return integer-scaled distances consistent with `buildCH()`'s
    //   internal integer cost representation (DIST_SCALE = 10).
    if (!outputUnscaled) {
        const scaled = new Float64Array(N);
        for (let i = 0; i < N; i++) {
            const d = distances[i];
            scaled[i] = Number.isFinite(d) ? Math.round(d * scale) : Infinity;
        }
        return { distances: scaled, reachable };
    }

    return { distances, reachable };
}
