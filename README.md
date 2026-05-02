# OpenMapTiles Router Engine

GPU-accelerated routing library for [OpenMapTiles](https://openmaptiles.org/) vector tiles. Computes optimal routes for pedestrian, car, and bicycle travel entirely client-side — no routing backend or third-party service required.

[![npm](https://img.shields.io/npm/v/omp-router)](https://www.npmjs.com/package/omp-router)
[![license](https://img.shields.io/npm/l/omp-router)](./LICENSE)

---

## Features

- **Zero backend** — builds the routing graph on-the-fly from raw MVT tiles
- **WebGPU-accelerated** bidirectional [Bellman-Ford](https://en.wikipedia.org/wiki/Bellman%E2%80%93Ford_algorithm) via [taichi.js](https://github.com/AmesingFlank/taichi.js); falls back to CPU bidirectional [Dijkstra](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm) when WebGPU is unavailable
- **Three transport modes** — `car`, `pedestrian`, `bicycle`; respects OpenMapTiles access tags and road class hierarchy
- **Seamless tile stitching** — [Liang-Barsky](https://en.wikipedia.org/wiki/Liang%E2%80%93Barsky_algorithm) clipping ensures road segments share bit-identical boundary nodes across neighbouring tiles with no proximity snapping
- **Worker pool + tile cache** — parallel tile parsing via [PowerPool](https://abelvm.github.io/performance-helpers/#/powerpool); parsed tiles are cached with [PowerCache](https://abelvm.github.io/performance-helpers/#/lru-cache-with-ttl-and-memoizer#powercache) so repeated queries never re-fetch or re-parse a tile

---

## Caveats

The quality of the routing results relies on the quality of the data beneath. So the better [Open Street Map](https://www.openstreetmap.org/), the better this routing engine will work. If you find some inaccuracy, consider [contributing](https://wiki.openstreetmap.org/wiki/How_to_contribute) to improve OSM data quality.

There is a distance threshold further than it won't find a node to start/finish the route. So, you need to choose wisely the origin/destination points. Do not start a car route in the middle of a pedestrian-only area, or a walking route in a highway.

For bidirectional streets, the side of the road you pick might change the proposed route considerably.

---

## Installation

```bash
npm install omp-router
```

---

## Quick start

```js
import { route } from 'omp-router';

const urlTemplate =
  'https://api.maptiler.com/tiles/v3-openmaptiles/{z}/{x}/{y}.pbf?key=YOUR_KEY';

const result = await route(
  [-3.7038, 40.4168],   // origin  [lng, lat]
  [-3.6937, 40.4101],   // destination
  'car',                // 'car' | 'pedestrian' | 'bicycle'
  urlTemplate
);

console.log(result.found);        // true
console.log(result.coordinates);  // [[lng, lat], ...]  — draw on a map
console.log(result.cost);         // total distance in metres
```

The returned object:

| Field | Type | Description |
|---|---|---|
| `found` | `boolean` | Whether a path was found |
| `path` | `number[]` | Sequence of internal node IDs |
| `coordinates` | `[number, number][]` | `[lng, lat]` pairs ready for GeoJSON |
| `cost` | `number` | Total route cost (metres by default) |

---

## API

### `route(start, end, mode, urlTemplate, options?)`

High-level convenience function. Fetches the necessary tiles, builds the graph, and returns the route.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `start` | `[lng, lat]` | — | Origin coordinate |
| `end` | `[lng, lat]` | — | Destination coordinate |
| `mode` | `string` | — | `'car'`, `'pedestrian'`, or `'bicycle'` |
| `urlTemplate` | `string` | — | MVT tile URL with `{z}`, `{x}`, `{y}` placeholders |
| `options.zoom` | `number` | `14` | Tile zoom level |
| `options.schema` | `string` | `'zxy'` | Tile schema: `'zxy'` or `'tms'` |
| `options.radius` | `number` | `2` | Extra tile radius around the route corridor |

### `computeRoute(startCoords, endCoords, graph, options?)`

Runs the routing algorithm on a pre-built graph. Useful when you manage tile loading yourself.

### `buildCH(graph, costField?)`

Flattens the graph produced by `buildGraphAsync` into typed arrays and adjacency lists ready for the GPU/CPU solvers. `costField` can be `'distance'` (metres, default) or `'travelTime'` (seconds).

### `queryRoute(startId, endId, prepared)`

Runs the GPU bidirectional Bellman-Ford on a `buildCH`-prepared graph. Falls back to CPU if WebGPU is not available.

### `nearestNode(coords, graph, maxDistM?)`

Returns the ID of the graph node closest to `coords` within `maxDistM` metres (default 500 m).

---

## Architecture

```
route()
  │
  ├─ tilesManager  →  Bresenham tile corridor  →  tile list
  │
  ├─ graphBuilder
  │    ├─ PowerPool workers  →  fetch + parseTile (Pbf decode, Liang-Barsky clip)
  │    ├─ PowerCache         →  avoid re-parsing the same tile
  │    └─ mergeSegments      →  deduplicate nodes/edges, compute haversine costs
  │
  └─ chRouter
       ├─ buildCH            →  CSR/flat arrays for GPU upload
       ├─ queryRoute         →  GPU bidirectional Bellman-Ford  (taichi.js / WebGPU)
       │    └─ fallback      →  CPU bidirectional Dijkstra + MinHeap
       └─ reconstructPath    →  meet-node scan → path extraction
```

### 1. Tile corridor — `tilesManager.js`

`getTilesAlongLine` uses a [**Bresenham line-rasterisation**](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm) algorithm to enumerate only the slippy-map tiles that the straight-line corridor between origin and destination passes through, extended by an optional `radius` of neighbouring tiles. This minimises network requests while guaranteeing the graph contains all roads near the route.

Both `zxy` (XYZ) and `tms` (TMS, Y-flipped) schemas are supported.

### 2. Graph construction — `graphBuilder.js`

Each tile is parsed independently inside a **`PowerPool` worker thread**, so all tiles are decoded in parallel up to the hardware concurrency limit. Parsed results are stored in a **`PowerCache`** keyed by tile URL; a second query covering the same area skips all network and decode work.

**Tile parsing (`parseTile`):**

1. Decodes the MVT `transportation` layer using `@mapbox/vector-tile` + `pbf`.
2. Filters features by transport mode using the [OpenMapTiles transportation schema](https://openmaptiles.org/schema/#transportation) — road class, subclass, and access tags (`access`, `foot`, `bicycle`, `oneway`).
3. Clips every road segment to the exact tile boundary using **Liang-Barsky parametric line clipping**. Because the clip interpolation uses the same floating-point arithmetic in both adjacent tiles, the boundary coordinate is bit-identical — no proximity snapping is needed to stitch the graph at tile seams.
4. Projects tile pixel coordinates to `[lng, lat]` using precomputed per-tile scale constants (avoids repeated `Math.pow` / trig per vertex).

**Graph merge (`mergeSegments`):**

Segments from all tile workers are merged on the main thread. Node deduplication is done via a `coordKey` hash (coordinates rounded to 6 decimal places ≈ 0.1 m). Each unique node gets a sequential integer ID. For every segment an edge is added with:
- `cost` — forward traversal cost (haversine metres, or −1 if `oneway = -1`)
- `reverseCost` — backward traversal cost (haversine metres, or −1 if `oneway = 1`)
- `travelTime` — `length / speed` in seconds, where speed comes from per-class defaults

### 3. Routing — `chRouter.js`

#### Graph flattening (`buildCH`)

Converts the edge list into three parallel `Int32` arrays (`edgeSrc`, `edgeTgt`, `edgeCostInt`) for GPU upload, plus forward and reverse adjacency lists (`adj`, `revAdj`) for CPU path reconstruction. Distances are stored as integers scaled by `DIST_SCALE = 10` (0.1 m resolution) to satisfy `atomicMin`'s `i32` requirement. Duplicate directed edges are de-duplicated via a `Set`.

#### GPU bidirectional Bellman-Ford (`queryRoute`)

Uses **[taichi.js](https://github.com/AmesingFlank/taichi.js)** to dispatch WebGPU compute kernels:

- **Static topology** (`srcField`, `tgtField`, `wField`) is uploaded once per graph and cached on the `prepared._gpu` object. Repeated queries on the same graph skip ~900 KB of re-upload and kernel recompilation.
- **Per-query** distance arrays (`distFwdField`, `distBwdField`) are reset each call (N × 8 bytes).
- Each iteration dispatches **E GPU threads** — one per directed edge. Thread `i` relaxes edge `u→v` in the **forward** direction and edge `v→u` in the **backward** direction simultaneously, halving the iteration count versus two separate passes.
- Convergence is detected via `updatedField[0]` (an `atomicAdd` counter): if no distance improved in an iteration, the loop exits early (up to 200 iterations maximum).

> **Note on minification:** taichi.js parses kernel closures as source text and resolves field identifiers by name at compile time. The Vite build is therefore configured with `minify: false` — any variable renaming by esbuild or Terser would break kernel compilation.

#### CPU fallback — bidirectional Dijkstra

When WebGPU is unavailable, or when GPU BF finds no path, a **bidirectional Dijkstra** runs on the CPU using a binary **MinHeap**. It maintains separate forward and backward priority queues and terminates as soon as the two search frontiers meet.

#### Path reconstruction

1. Scan all nodes for the **meeting node**: `argmin(distFwd[v] + distBwd[v])`.
2. Walk the **reverse adjacency list** backward from the meeting node toward the origin to recover the forward half-path.
3. Walk the **forward adjacency list** forward from the meeting node toward the destination for the backward half-path.
4. Concatenate and map node IDs → `[lng, lat]` coordinates.

---

## Transport modes and road classes

Road filtering follows the [OpenMapTiles transportation schema](https://openmaptiles.org/schema/#transportation):

| Mode | Allowed classes | Excluded |
|---|---|---|
| `car` | motorway, trunk, primary, secondary, tertiary, minor, service, track | pedestrian subclasses, footways, cycleways |
| `pedestrian` | path, minor, service, living_street | motorway, trunk |
| `bicycle` | path, minor, service, tertiary, secondary, track | motorway, motorway_link |

Per-class default speeds (km/h) are used to compute `travelTime` edges (motorway 120 → path/pedestrian 5).

---

## Development

```bash
npm install        # install dependencies
npm run dev        # Vite dev server (serves example/)
npm run build      # build library to dist/
npm run test       # run Vitest test suite
npm run lint       # ESLint
npm run format     # Prettier
```

The `example/` directory contains a full MapLibre GL JS demo with a routing panel control. Serve it via `npm run dev` and open `http://localhost:5173/example/`.

---

## License

[AGPL-3.0-only](./LICENSE) © Abel Vázquez Montoro

