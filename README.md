# OpenMapTiles Router Engine

[![npm](https://img.shields.io/npm/v/omt-router)](https://www.npmjs.com/package/omt-router)
[![license](https://img.shields.io/npm/l/omt-router)](./LICENSE)

Client-side routing library for [OpenMapTiles](https://openmaptiles.org/) vector tiles. Computes optimal routes for pedestrian, car, and bicycle travel entirely client-side — no routing backend or third-party service required.

This project is provider-agnostic for OpenMapTiles-compatible vector tiles, so **the same tiles your map is using as basemap can be used for routing!**

Check the live example at [https://abelvm.github.io/omt-router/example](https://abelvm.github.io/omt-router/example)

![example screenshot](./example/twitter.jpg)

---

## Features

- **Zero backend, zero-provider** — No need for a routing backend or relying on a 3rd party API provider, `omt-router` builds the routing graph on-the-fly from **OpenMapTiles** formatted vector tiles
- **Multi-engine routing** — bidirectional A*, Adaptive Barrier SSSP, Delta-Stepping, and Ultra Dijkstra
- **Automatic best engine selection** — runtime engine chooser uses benchmark-derived models and a generated selector module in `src/tuning/tuning.js`
- **Three transport modes** — `car`, `pedestrian`, `bicycle`; respects OpenMapTiles access tags and road class hierarchy
- **Two optimization strategies** — route length or travel time
- **Endpoint snapping with quality guard** — nearest-node lookup plus segment-projection snap, with `maxAcceptableSnapDistanceM` limiting distant off-road snaps
- **Seamless tile stitching** — [Liang-Barsky](https://en.wikipedia.org/wiki/Liang%E2%80%93Barsky_algorithm) clipping ensures road segments share bit-identical boundary nodes across neighbouring tiles with no proximity snapping
- **Worker pool + tile cache** — Using [performance-helpers](https://abelvm.github.io/performance-helpers) to get the best performance always: parallel tile parsing and parallel engines execution via **PowerPool**, parsed tiles are cached with **PowerCache** so repeated queries can reuse tiles until TTL/LRU eviction

---

## Available routing engines

The library includes multiple engines and selects among them at runtime when `engineId: 'auto'` is used.

| Engine ID | Algorithm | Parallel ready | Best fit |
| --- | --- | :---: | --- |
| `bidirectional-astar` | [Bidirectional A* with geographic heuristic](https://en.wikipedia.org/wiki/Bidirectional_search) |  | Reliable baseline and fallback engine |
| `adaptive-barrier` | [Adaptive Barrier SSSP](https://doi.org/10.48550/arXiv.2504.17033) | ✓ | Dense and medium/large graphs, especially with parallel runtime available |
| `delta-stepping` | [Delta-Stepping SSSP](https://en.wikipedia.org/wiki/Parallel_single-source_shortest_path_algorithm#Delta_stepping_algorithm) | ✓ | Large frontiers and bursty relax phases |
| `ultra-dijkstra` | [Optimized Dijkstra with 4-ary heap](https://doi.org/10.48550/arXiv.1505.05033) |  | Stable performance on sparse or long-route cases |

Notes:

- `queryRoute()` can force a specific engine with `engineId`.
- When an engine returns an invalid/no-path result, the router can fall back to `bidirectional-astar` for correctness.

## ML-based engine selector

Engine selection is data-driven and can be regenerated from benchmark results. `src/tuning/tuning.js` is built from the benchmark pipeline, and `src/tuning/model.js` is the compact runtime model artifact produced by `benchmark/train_engine_selector_ml.py`.

At runtime, the selector evaluates route and graph features such as:

- edge count (`E`) and node count (`N`)
- beeline distance between endpoints
- derived density/branch indicators (`edgesPerKm`, average out-degree)
- discrete feature bands such as `sizeBand`, `beelineBand`, `densityBand`, and `branchBand`

Selector flow:

1. Build the route/graph feature vector from the corridor graph and query endpoints.
2. Detect runtime capability (`SharedArrayBuffer`, Worker, cross-origin isolation) to choose `sabOn` vs `sabOff` rules.
3. Evaluate the generated selector in `src/tuning/tuning.js`, which uses the compact `src/tuning/model.js` artifact when available.
4. Select the recommended engine and apply per-engine parallelization/correctness fallback logic.

Why this exists:

- No single engine is best for every route graph shape.
- The selector minimizes runtime regret using offline benchmark-trained models.
- The training workflow supports both serial (`sabOff`) and parallel (`sabOn`) profiles.
- The model pipeline includes `runtime-linear`, `xgboost`, and a compact 2-layer `mlp` option.

See [benchmark/README.md](benchmark/README.md) for the current benchmark and selector training workflow.

---

## OpenMapTiles data model and tile providers

The routing graph is built from the OpenMapTiles `transportation` layer and mode-specific access tags. In short:

- [OpenStreetMap](https://osm.org) is the source data.
- [OpenMapTiles](https://openmaptiles.org/) defines the vector-tile schema used for classes, subclasses, one-way flags, and mode access tags.
- This library parses those tiles in workers and builds a local routing graph on demand.

Schema reference used by this project:

- [OpenMapTiles transportation schema](https://openmaptiles.org/schema/#transportation)

You can use tiles providers, or download a tiles dataset ([OpenFreeMap](https://github.com/hyperknot/openfreemap#full-planet-downloads), [Maptiler](https://www.maptiler.com/on-prem-datasets/planet/), etc) and serve it yourself (I recommend [Maplibre Martin](https://martin.maplibre.org/) to do so)

### OpenFreeMap usage (used by this repository demo)

The demo in `example/` discovers tile URLs from OpenFreeMap metadata:

```js
const metadata = await fetch('https://tiles.openfreemap.org/planet').then((r) => r.json());
const urlTemplate = metadata.tiles[0];
```

OpenFreeMap links:

- Project: [https://openfreemap.org/](https://openfreemap.org/)
- Tile metadata endpoint used in demo: [https://tiles.openfreemap.org/planet](https://tiles.openfreemap.org/planet)

You can also use other OpenMapTiles-compatible providers (for example MapTiler) as long as URL template and CORS requirements are satisfied.

---

## Caveats

Route quality depends on source data quality. The better [OpenStreetMap](https://www.openstreetmap.org/) coverage and tagging are in your area, the better the result. If you find inaccuracies, consider [contributing](https://wiki.openstreetmap.org/wiki/How_to_contribute) to improve OSM data.

Endpoints must snap to routable graph edges. The routing code first looks for the nearest graph node, then it may use a segment-projection snap when that improves route validity. Snapping is guarded by `maxAcceptableSnapDistanceM` (default `60` m), so points that are too far from a usable road/path will fail with `no_node` or `poor_snap` rather than producing a misleading route.

For bidirectional streets, the side of the road you click can still affect the computed route, especially when one-way restrictions are present.

Tile requests are performed in-browser from a Worker. Your tile server must include CORS headers (for example `Access-Control-Allow-Origin`) for uncached cross-origin requests. If that is not possible, route tile URLs through a same-origin proxy (see `options.tileProxyTemplate`).

---

## Installation

```bash
npm install omt-router
```

---

## Quick start

```js
import { route } from 'omt-router';

const metadata = await fetch('https://tiles.openfreemap.org/planet').then((r) => r.json());
const urlTemplate = metadata.tiles[0];

const result = await route(
  [-3.7038, 40.4168],   // origin  [lng, lat]
  [-3.6937, 40.4101],   // destination
  'car',                // 'car' | 'pedestrian' | 'bicycle'
  urlTemplate,
  { costField: 'travelTime' } // 'distance' | 'travelTime'
);

console.log(result.found);        // true
console.log(result.coordinates);  // [[lng, lat], ...]  — draw on a map
console.log(result.cost);         // total route cost for the selected costField
```

MapTiler (or another provider) also works:

```js
const urlTemplate =
  'https://api.maptiler.com/tiles/v3-openmaptiles/{z}/{x}/{y}.pbf?key=YOUR_KEY';
```

The returned object:

| Field | Type | Description |
| --- | --- | --- |
| `found` | `boolean` | Whether a path was found |
| `path` | `number[]` | Sequence of internal node IDs |
| `coordinates` | `[number, number][]` | `[lng, lat]` pairs ready for GeoJSON |
| `cost` | `number` | Total route cost (`distance` in metres or `travelTime` in seconds) |
| `costField` | `string` | Cost field used to optimize the route |

---

## API

### `route(start, end, mode, urlTemplate, options?)`

High-level convenience function. Fetches the necessary tiles, builds the graph, and returns the route.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `start` | `[lng, lat]` | — | Origin coordinate |
| `end` | `[lng, lat]` | — | Destination coordinate |
| `mode` | `string` | — | `'car'`, `'pedestrian'`, or `'bicycle'` |
| `urlTemplate` | `string` | — | MVT tile URL with `{z}`, `{x}`, `{y}` placeholders |
| `options.zoom` | `number` | `14` | Tile zoom level |
| `options.schema` | `string` | `'zxy'` | Tile schema: `'zxy'` or `'tms'` |
| `options.radius` | `number` | auto-computed | Optional fixed tile radius around the route corridor |
| `options.maxAutoRadius` | `number` | `8` | Maximum radius used by adaptive retry loop |
| `options.costField` | `string` | `'distance'` | Route optimization target: `'distance'` or `'travelTime'` |
| `options.penalties` | `object` | `{ intersectionPenaltySec: 0, turnPenaltySec: 0, turnAngleThresholdDeg: 25 }` | Travel-time penalty controls (`turnPenaltySec` is currently accepted but not applied) |
| `options.maxAcceptableSnapDistanceM` | `number` | `60` | Maximum allowed snap distance from endpoint to graph node |
| `options.tileProxyTemplate` | `string` | — | Optional same-origin proxy template. Supports `{url}` (encoded), `{z}`, `{x}`, `{y}` |
| `options.tileUrlTransform` | `(rawUrl, tile) => string` | — | Optional per-tile URL rewrite hook (advanced) |

The route result also includes runtime metadata fields such as `engine`, optional `fallback`, `startSnapDistanceM`, `endSnapDistanceM`, and on failure a `reason` (for example `no_path`, `no_node`, `poor_snap`, `incomplete_path`, `tile_cors`).

### CORS and `MissingAllowOriginHeader`

If `route()` returns `reason: 'tile_cors'` with `code: 'MissingAllowOriginHeader'`, the browser blocked a cross-origin uncached tile request.

On some providers, auth/quota errors (for example HTTP 403 or 429) may also be returned without CORS headers, which appears as a CORS failure in browser logs. Verify your API key, quota, and origin allowlist first.

You can fix this in one of two ways:

1. Configure the tile server to include `Access-Control-Allow-Origin` for your app origin.
2. Use a same-origin proxy and set `tileProxyTemplate`.

For MapTiler specifically, ensure `http://localhost:5173` is allowed for your key during local development.

For the example app in this repository, provide your key using either:

1. `VITE_MAPTILER_KEY=YOUR_KEY npm run dev`
2. `http://localhost:5173/example/index.html?key=YOUR_KEY`

Example:

```js
const result = await route(start, end, 'car', urlTemplate, {
  tileProxyTemplate: '/api/tile-proxy?url={url}',
});
```

### `computeRoute(startCoords, endCoords, graph, options?)`

Runs the routing algorithm on a pre-built graph. Useful when you manage tile loading yourself.

Key options:

- `costField`: `'distance'` or `'travelTime'`
- `penalties`: same structure as `route()`
- `snapDistancesM`: snap search ladder (default `[250, 500, 800]`)
- `maxAcceptableSnapDistanceM`: snap-quality guard (default `60`)
- `graphCategory`: optional selector hint (`city-center`, `city-consolidated`, `suburban`, `countryside`)

### `buildCH(graph, costField?)`

Flattens a graph into typed arrays and forward/reverse CSR adjacency ready for engine execution. `costField` can be `'distance'` (metres, default) or `'travelTime'` (seconds).

### `queryRoute(startId, endId, prepared, options?)`

Runs route search on a `buildCH`-prepared graph using either an explicit engine or `engineId: 'auto'`.

Key options:

- `engineId`: `'auto'`, `'bidirectional-astar'`, `'adaptive-barrier'`, `'delta-stepping'`, `'ultra-dijkstra'`
- `graphCategory`: optional selector hint
- `costField`: `'distance'` or `'travelTime'`
- `useCache`: enable route-result cache (default `true`)
- `allowFallback`: retry with `bidirectional-astar` on invalid/no-path non-baseline results (default `true`)
- `forceSerialRouting`: disable parallel policy for this query (default `false`)

### `nearestNode(coords, graph, maxDistM?)`

Returns the ID of the graph node closest to `coords` within `maxDistM` metres (default 500 m).

---

## Architecture

```text
route()
  │
  ├─ tilesManager  →  corridor tiles (+ adaptive radius retries)
  │
  ├─ graphBuilder
  │    ├─ PowerPool workers  →  fetch + parse transportation layer
  │    ├─ PowerCache         →  per-tile parse cache
  │    └─ mergeSegments      →  graph nodes/edges with distance + travelTime
  │
  └─ chRouter
      ├─ buildCH            →  typed arrays + forward/reverse CSR
      ├─ nearestNode        →  endpoint snapping via KDBush
      └─ queryRoute         →  auto engine select, worker run, validate, fallback
```

### 1. Tile corridor — `tilesManager.js`

`getTilesAlongLine` uses a [**Bresenham line-rasterisation**](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm) algorithm to enumerate slippy-map tiles around the origin-to-destination corridor.

In `route()`, corridor radius can auto-expand when a pass fails with `no_path`, `no_node`, `poor_snap`, or `incomplete_path`. This keeps normal requests small while still handling larger real-world detours.

The tile retry loop also means route failure reasons are more informative: `no_node` means no nearby graph node was found, `poor_snap` means endpoint snapping quality exceeded `maxAcceptableSnapDistanceM`, and `incomplete_path` means the selected engine produced an invalid route that will be retried or surfaced to the caller.

Both `zxy` (XYZ) and `tms` (TMS, Y-flipped) schemas are supported.

### 2. Graph construction — `graphBuilder.js`

Each tile is parsed independently in a [**`PowerPool`**](https://abelvm.github.io/performance-helpers/#/powerpool) worker, so decode work scales with available CPU cores. Parsed tile outputs are stored in a [**`PowerCache`**](https://abelvm.github.io/performance-helpers/?page=lru-cache-with-ttl-and-memoizer) keyed by tile URL; repeated queries over the same area skip network and parsing.

**Tile parsing (`parseTile`):**

1. Decodes the MVT `transportation` layer using `@mapbox/vector-tile` + `pbf`.
2. Filters features by transport mode using the [OpenMapTiles transportation schema](https://openmaptiles.org/schema/#transportation) — road class, subclass, and access tags (`access`, `foot`, `bicycle`, `oneway`).
3. Clips every road segment to the exact tile boundary using [**Liang-Barsky parametric line clipping**](https://en.wikipedia.org/wiki/Liang%E2%80%93Barsky_algorithm). Because the clip interpolation uses the same floating-point arithmetic in both adjacent tiles, the boundary coordinate is bit-identical — no proximity snapping is needed to stitch the graph at tile seams.
4. Projects tile pixel coordinates to `[lng, lat]` using precomputed per-tile scale constants (avoids repeated `Math.pow` / trig per vertex).

**Graph merge (`mergeSegments`):**

Segments from all tile workers are merged on the main thread. Node deduplication is done via a `coordKey` hash (coordinates rounded to 6 decimal places ≈ 0.1 m). Each unique node gets a sequential integer ID. For every segment an edge is added with:

- `cost` — forward traversal cost (haversine metres, or −1 if `oneway = -1`)
- `reverseCost` — backward traversal cost (haversine metres, or −1 if `oneway = 1`)
- `travelTime` — `length / speed` in seconds, where speed comes from per-class defaults

### 3. Route preparation and endpoint snapping — `chRouter.js`

#### Graph flattening (`buildCH`)

Converts the merged graph into compact typed arrays and CSR adjacency for both forward and reverse traversal. Costs are stored as scaled integers (`DIST_SCALE = 10`) for stable and fast inner-loop arithmetic.

#### Nearest node lookup (`nearestNode`)

Endpoints are snapped to graph nodes with a cached `KDBush` spatial index and a configurable max snap distance.

### 4. Routing execution and engine selection — `chRouter.js`

`queryRoute` supports explicit engine IDs and an `auto` mode. In `auto`, the selector in `src/tuning/tuning.js` uses route and graph features (`E`, `N`, beeline, density and branching bands) plus runtime capability (for example SharedArrayBuffer and Worker availability) to choose the best engine for each query.

Execution flow:

1. Select engine (`auto` or explicit).
2. Apply per-engine parallel policy when runtime allows it.
3. Run in engine worker when available, otherwise run on main thread.
4. Validate returned route geometry and cost.
5. If invalid or no path from a non-baseline engine, retry with `bidirectional-astar` for correctness.

The returned result includes selected engine metadata and fallback information when a retry path was used.

---

## Transport modes and road classes

Road filtering follows the [OpenMapTiles transportation schema](https://openmaptiles.org/schema/#transportation):

| Mode | Allowed classes | Excluded |
| --- | --- | --- |
| `car` | motorway(_link), trunk(_link), primary(_link), secondary(_link), tertiary(_link), minor, service, track | pedestrian/footway/cycleway/steps/bridleway/corridor subclasses |
| `pedestrian` | path, minor, service, track (+ pedestrian/footway/steps/path/corridor/platform subclasses) | motorways and non-foot-access roads |
| `bicycle` | path, minor, service, tertiary, secondary, track (+ cycleway/path subclasses) | motorway, motorway_link, non-bicycle-access roads |

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
