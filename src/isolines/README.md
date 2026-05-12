# Isolines (isoPHAST)

This folder implements isoline (isoPHAST) functionality: compute many-to-all
cost distances (up to a threshold) over a prepared graph and polygonise the
result into GeoJSON isoline polygons.

Key files
- `index.js` — public wrapper `isoline()` that snaps a point, prepares the
  graph via `buildCH()` and returns a GeoJSON polygon.
- `isophast.js` — CH-based many-to-all scanner (`isoPHAST`) that runs CH
  queries and returns distances + reachable nodes.
- `contour.js` — contour/contour-to-polygon builder that interpolates
  edge-crossings and emits closed rings.

Overview / execution flow
1. Snap input coordinate to the graph (segment projection) and create an
   augmented graph containing the projected node.
2. Prepare the graph via `buildCH(graph, costField, penalties)` (see
   `../engines/router.js`). This flattens the graph into CSR arrays and
   returns metadata used by `isoPHAST`.
3. Call `isoPHAST(prepared, startId, threshold, opts)` to compute node
   distances (many-to-all) up to `threshold`.
4. Polygonise distances with `buildContours(prepared, workingGraph, distances, threshold)`.
5. Return a GeoJSON `Feature` (Polygon or MultiPolygon).

Public API

`isoline(options)` — wrapper used by UI and external callers (see
`src/isolines/index.js`):
- `point`: [lng, lat]
- `direction`: `'from'|'to'` (default `'from'`)
- `mode`: `'car'|'pedestrian'|'bicycle'` (default `'car'`)
- `costField`: `'distance'|'travelTime'|'optimal'` (default `'distance'`)
- `engineId`: engine hint (default `'auto'`)
- `graph`: required graph object (Map `nodes`, Array `edges`)
- `maxCost`: numeric threshold (meters or seconds; default `1000`)
- `snapMaxDistM`: max snap distance for projection (default used by caller)
- `penalties`: optional penalties object

Returns: GeoJSON `Feature` with `geometry.type` = `Polygon` or
`MultiPolygon`. Properties include `costField`, `engineId`, `maxCost`, and
`nodeCount`.

Lower-level API

`isoPHAST(prepared, startId, threshold, opts)` — core many-to-all CH scanner
- `prepared`: result of `buildCH()` (see "Prepared graph expectations")
- `startId`: numeric node id (in prepared graph)
- `threshold`: numeric cutoff in same units as `costField` (meters/seconds)
- `opts.direction`: `'from'|'to'` (default `'from'`) — controls query
  semantics. `'from'` computes distances originating at `startId`. `'to'`
  computes distances towards `startId` (implementation inverts queries).
- `opts.mode`: routing mode (affects undirected handling)
- `opts.outputUnscaled`: when `true` returns distances in original units
  (float). When `false` returns integer-scaled distances consistent with
  `prepared.distScale` (rounded integers as floats).

Returns: `{ distances: Float64Array, reachable: number[] }`.

Prepared graph expectations

`buildCH(graph, costField, penalties)` returns an object with the
following important fields (types are approximate):

- `N` (number): node count
- `adjPtr` (Int32Array): CSR pointer array for forward adjacency
- `adjTo` (Int32Array): CSR destination indices
- `adjCost` (Int32Array): CSR edge costs (scaled integers)
- `edgeSrc`, `edgeTgt`, `edgeCostInt` (Int32Array | optional): explicit
  edge lists (typed arrays) produced by `buildCH()` — preferred by
  `isoPHAST` when present
- `coordsArr` (Array<[lng, lat]>): per-node coordinates (used for beeline pruning)
- `costField` (string): the cost field used to compute edge costs
- `penaltyKey` (string): fingerprint of penalties used
- `distScale` (number): integer scale factor used to convert floats → ints
  in `buildCH()` (default historically `10`). `edgeCostInt` values equal
  `Math.round(floatCost * distScale)`.
- `coordsAreGeographic` (boolean): when `true`, `isoPHAST` may use
  haversine/beeline pruning for distance thresholds.

Notes about `coordsAreGeographic`: `buildCH()` will set
`prepared.coordsAreGeographic` only when the source graph explicitly sets
`graph.coordsAreGeographic === true`. This avoids accidental pruning in
synthetic tests. If your data are geographic lat/lon (WGS84), set
`graph.coordsAreGeographic = true` before calling `buildCH()`.

CH caching and rebuild conditions

`isoPHAST` builds and caches a contracted CH graph on `prepared` as
`prepared._chGraph` and a pathfinder as `prepared._chFinder`. The CH is
rebuilt when any of these change:
- `mode` (e.g., undirected vs directed handling)
- `prepared.costField`
- `prepared.penaltyKey`

`isoPHAST` tracks the keys used to build the CH as
`_chGraphMode`, `_chGraphIsUndirected`, `_chGraphCostField`,
`_chGraphPenaltyKey`.

Scaling and `outputUnscaled`

- `buildCH()` converts float costs → integers using `distScale`.
- `isoPHAST` converts `edgeCostInt / distScale` back to floats when
  constructing the CH for queries.
- When `opts.outputUnscaled === true`, `isoPHAST` returns distances as
  floats in original units (meters/seconds).
- When `opts.outputUnscaled === false`, `isoPHAST` returns rounded
  integer-scaled distances matching `buildCH()`'s internal representation
  (useful for internal consistency with stored integer costs).

Beeline / spatial pruning

`isoPHAST` includes an optimization that skips CH queries for nodes whose
straight-line (haversine) distance from `startId` exceeds `threshold`. To
use this pruning the following must hold:
- `outputUnscaled === true` (we have distances in meters)
- `prepared.costField === 'distance'`
- `prepared.coordsAreGeographic === true`

If any of these are false the beeline pruning is disabled and full CH
queries are performed.

Pedestrian (undirected) semantics

`buildCH()` centralizes undirected handling for `graph.mode === 'pedestrian'`:
it collapses opposite-directed edge pairs into a single undirected pair
(using the minimum cost of the two directions). `isoPHAST` respects this
by passing `isUndirected=true` to the CH graph builder so CH queries treat
those edges appropriately.

Polygonisation (`contour.js`)

`buildContours(prepared, workingGraph, distances, threshold)` returns an
array of rings; each ring is an array of `[lng, lat]` coordinates tracing a
closed polygon. The `isoline()` wrapper converts a single ring into a
GeoJSON `Polygon` feature or multiple rings into a `MultiPolygon`.

Examples

Simple wrapper usage (recommended):

```js
import { isoline } from './src/isolines/index.js';

const feature = await isoline({
  point: [-0.12, 51.5],
  direction: 'from',
  mode: 'pedestrian',
  costField: 'distance',
  graph, // your graph object
  maxCost: 1000,
});
// `feature` is a GeoJSON Feature (Polygon or MultiPolygon)
```

Using `isoPHAST` directly:

```js
import isoPHAST from './src/isolines/isophast.js';
import { buildCH } from './src/engines/router.js';

const prepared = buildCH(graph, 'distance');
const startId = /* node id for your augmented point */;
const { distances, reachable } = isoPHAST(prepared, startId, 1000, {
  direction: 'from', mode: 'car', outputUnscaled: true,
});
```

Testing

Tests for isolines live in `tests/isolines.test.js`. Run the full test
suite with:

```bash
npm run test
```

Quick Try — minimal script
-------------------------
The following small Node ESM script demonstrates end-to-end usage. It uses
the public `isoline()` wrapper and a minimal synthetic graph. This is a
convenience example — real graphs from your tile/graph builder are expected
to be more complex.

```js
import { isoline } from './src/isolines/index.js';
import { buildCH } from './src/engines/router.js';

// Minimal synthetic graph example (for demonstration only)
const nodes = new Map();
nodes.set(0, { id: 0 });
nodes.set(1, { id: 1 });
nodes.set(2, { id: 2 });

const edges = [
  { id: 0, source: 0, target: 1, distance: 100 },
  { id: 1, source: 1, target: 2, distance: 120 },
];

const graph = {
  nodes,
  edges,
  // If your coordinates are WGS84 lat/lon set this to true before buildCH()
  coordsAreGeographic: true,
  mode: 'pedestrian',
};

// buildCH will produce `prepared` metadata used by isoPHAST/isoline
const prepared = buildCH(graph, 'distance');

const feature = await isoline({
  point: [-0.1276, 51.5074],
  graph,
  mode: 'pedestrian',
  costField: 'distance',
  maxCost: 200,
});

console.log(JSON.stringify(feature, null, 2));
```

Contributing / notes for maintainers
- Keep `prepared.distScale` and `prepared.coordsAreGeographic` documented
  and forwarded from `buildCH()` when changing scaling or coordinate
  assumptions.
- Pedestrian undupe is performed in `buildCH()`; avoid re-implementing
  pair-min dedupe in `isophast.js`.
- Be conservative with beeline pruning: only enable when coordinates are
  explicitly geographic.

Contact / further help
If you want more detailed internals (e.g. CH cache layout, finder
behaviour, or contour edge-interpolation rules) I can expand this README
or add inline JSDoc comments to the implementation files.
