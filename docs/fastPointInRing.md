# fastPointInRing (rbush-backed)

Purpose
- Prepare GeoJSON linear rings for fast, repeated point-in-polygon checks.
- Use an R-tree (rbush) to filter ring candidates by bbox before exact PIP.

API

- `prepareRing(ring, eps = 1e-12)`
  - Input: `ring` is an array of `[x,y]` coordinates (closed or not).
  - Returns: `{ coords: Float64Array, n, bbox: [minX,minY,maxX,maxY], eps }`.

- `pointInPreparedRing(px, py, prepared, { inclusive = true })`
  - Exact PIP test on a prepared ring. `inclusive=true` treats boundary as inside.

- `buildRingIndex(preparedRings)`
  - Builds and returns an `rbush` index for the prepared rings. Items include `id` pointing
    to the index in the `preparedRings` array.

- `ringsContainingPoint(px, py, preparedRings, tree, { inclusive = true })`
  - Returns an array of indices into `preparedRings` that contain the point.
  - `tree` may be a prebuilt `rbush` tree; if omitted the tree is built on the fly.

- `pointInRing(px, py, ring, options)`
  - Convenience one-off PIP test (prepares the ring internally).

Usage example

```js
import { prepareRing, buildRingIndex, ringsContainingPoint } from './src/utils/fastPointInRing.js';

const rings = [outerRing, holeRing];
const prepared = rings.map(r => prepareRing(r));
const tree = buildRingIndex(prepared);

const lon = -0.42, lat = 38.36;
const hitIndices = ringsContainingPoint(lon, lat, prepared, tree);
console.log('rings containing point', hitIndices);
```

Performance notes

- `rbush` is optimal for bbox filtering of variable-size rings; it reduces the number
  of expensive per-ring ray-cast tests.
- For many repeated queries: prepare rings once, build the index once, reuse for all points.
- For single-shot checks, use `pointInRing()` convenience function.

Dependency

- `rbush` (already added to the project). Install with:

```bash
npm install rbush
```


Edge cases and recommendations

- Rings with less than 3 distinct vertices are treated as empty and will not match.
- Use `inclusive=false` if you want the boundary to be considered outside.
- For large numbers of rings, consider grouping rings by spatial tiles or building
  a multi-level index to reduce memory and query overhead.
