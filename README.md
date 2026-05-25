# OMT Router

[![npm](https://img.shields.io/npm/v/omt-router)](https://www.npmjs.com/package/omt-router) [![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.en.html)

Client-side routing library for OpenMapTiles vector tiles. Computes optimal routes and isolines for `car`, `pedestrian`, and `bicycle` travel entirely in the browser — no external routing backend required.

This repository is provider-agnostic for OpenMapTiles-compatible vector tiles, so the same tiles used for your basemap can be used for routing (reduces network and operational overhead).

[Live demo](https://abelvm.github.io/omt-router/example/)

---

## Table of contents

- [Overview](#overview)
- [Key features](#key-features)
- [Available routing engines](#available-routing-engines)
- [Engine selector](#engine-selector)
- [Quick start](#quick-start)
- [MapLibre integration](#maplibre-integration)
- [API reference](#api-reference)
- [Architecture](#architecture)
- [Transport modes & road classes](#transport-modes--road-classes)
- [Development](#development)
- [Caveats](#caveats)
- [License](#license)

---

## Overview

`omt-router` builds a routing graph from OpenMapTiles-formatted vector tiles in Web Workers, then runs routing algorithms in the browser. It is designed for: high performance, deterministic tile stitching across tile boundaries, and flexible engine selection to trade runtime vs reliability.

The library supports route finding, isoline (reachability) polygons, worker pools, tile caching, and a lightweight MapLibre control for quick integration into web maps.

## Key features

- Zero backend — client-side graph construction and routing; no third-party routing API required.
- Routing and isolines (isoPHAST) for `car`, `pedestrian`, and `bicycle` modes.
- Multi-engine routing: `bidirectional-astar`, `adaptive-barrier`, `delta-stepping`, `ultra-dijkstra`.
- Automatic runtime engine selector (benchmark-trained) with conservative fallbacks.
- Endpoint snapping with configurable quality guard (`maxAcceptableSnapDistanceM`).
- Seamless tile stitching using Liang–Barsky clipping to ensure bit-identical boundary nodes across tiles.
- Worker pool (`PowerPool`) + tile parse cache (`PowerCache`) for parallel parsing and reuse.

For details on the training and benchmark pipeline, see [benchmark/README.md](benchmark/README.md).

---

## Available routing engines

The library exposes several engines. Use `engineId` to force a specific engine, or `auto` to use the runtime selector.

| Engine ID             | Algorithm                                                                                                                    | Parallel ready | Best fit                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | :------------: | ------------------------------------------------------------------------- |
| `bidirectional-astar` | [Bidirectional A* with geographic heuristic](https://en.wikipedia.org/wiki/Bidirectional_search)                              |                | Stable performance on sparse or long routes                               |
| `adaptive-barrier`    | [Adaptive Barrier SSSP](https://doi.org/10.48550/arXiv.2504.17033)                                                           |       ✓        | Dense, medium/large graphs; benefits from parallel runtime                |
| `delta-stepping`      | [Delta-Stepping SSSP](https://en.wikipedia.org/wiki/Parallel_single-source_shortest_path_algorithm#Delta_stepping_algorithm) |       ✓        | Large frontiers and bursty relax phases                                   |
| `ultra-dijkstra`      | [Optimized Dijkstra (4-ary heap)](https://doi.org/10.48550/arXiv.1505.05033)                                                  |                | Reliable baseline and fallback                                             |

Notes:

- `queryRoute()` and `route()` accept `options.engineId` to force a specific engine.
- When an engine returns invalid/no-path, the router can fall back to `bidirectional-astar` for correctness.

---

## Engine selector

An ML-based selector chooses the engine per request to minimize runtime while keeping correctness risk low. The compact runtime artifact is `src/tuning/model.js` and inference lives in `src/tuning/tuning.js`.

- Validation: selects the optimal engine in ~91% of validation cases; selects a “good-enough” engine ~92% of the time (average runtime within ~6–7% of optimal).
- Trained on 16,646 samples; supports `sabOn` (SharedArrayBuffer/worker-enabled) and `sabOff` profiles.
- Conservative defaults: `ultra-dijkstra` is used as a low-risk fallback; thresholds can be tuned for canary rollouts.

At runtime the selector evaluates features such as beeline distance, `E` (edge count), `N` (node count), density/branching indicators, and available runtime capabilities (SharedArrayBuffer, Worker availability, cross-origin isolation).

---

## Quick start

Install:

```bash
npm install omt-router
```

Basic `route()` example:

```javascript
import { route } from 'omt-router';

const metadata = await fetch('https://tiles.openfreemap.org/planet').then((r) => r.json());
const urlTemplate = metadata.tiles[0];

const result = await route(
  [-3.7038, 40.4168], // origin  [lng, lat]
  [-3.6937, 40.4101], // destination
  'car', // 'car' | 'pedestrian' | 'bicycle'
  urlTemplate,
  { costField: 'travelTime' } // 'distance' | 'travelTime' | 'optimal'
);

console.log(result.found); // true
console.log(result.coordinates); // [[lng, lat], ...]
console.log(result.cost); // total route cost for the selected costField
```

MapTiler or other providers also work:

```javascript
const urlTemplate = 'https://api.maptiler.com/tiles/v3-openmaptiles/{z}/{x}/{y}.pbf?key=YOUR_KEY';
```

Returned `RouteResult` highlights:

| Field          | Type                 | Description                                                                          |
| -------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `found`        | `boolean`            | Whether a path was found                                                             |
| `path`         | `number[]`           | Sequence of internal node IDs                                                        |
| `coordinates`  | `[number, number][]` | `[lng, lat]` pairs ready for GeoJSON                                                 |
| `cost`         | `number`             | Total route cost (`distance` in metres or `travelTime` in seconds)                   |
| `costField`    | `string`             | Cost field used (`distance` / `travelTime` / `optimal`)                              |
| `partialGraph` | `boolean`            | `true` when computed against a graph with missing tiles                              |

---

## MapLibre integration

`omt-router` provides a `MapLibreRoutingControl` for easy integration with MapLibre GL JS.

Example usage:

```javascript
import {
  MapLibreRoutingControl,
  route,
  getEngineWorkerStatus,
  onEngineWorkerStatusChange,
  cancelRunningEngine,
} from 'omt-router';

const control = new MapLibreRoutingControl({
  routeFunction: route,
  getEngineWorkerStatus,
  onEngineWorkerStatusChange,
  cancelRunningEngine,
  tileJsonUrl: 'https://tiles.openfreemap.org/planet',
  maplibre: maplibregl,
});
map.addControl(control, 'top-left');
```

Constructor options (selected):

| Option                       | Type       | Default                                                | Description |
| ---------------------------- | ---------- | ------------------------------------------------------ | ----------- |
| `maplibre`                   | `object`   | —                                                      | Required MapLibre GL object (`maplibregl`). |
| `tileJsonUrl`                | `string`   | —                                                      | Metadata endpoint returning `{ tiles: [urlTemplate] }`. |
| `urlTemplate`                | `string`   | —                                                      | Optional `{z}/{x}/{y}.pbf` template; if present, no metadata fetch is required. |
| `routeFunction`              | `function` | `route`                                                | Custom route implementation returning the routing result. |
| `getEngineWorkerStatus`      | `function` | —                                                      | Optional callback that returns engine worker status. |
| `onEngineWorkerStatusChange` | `function` | —                                                      | Subscription callback for engine status changes. |
| `cancelRunningEngine`        | `function` | —                                                      | Cancel callback used when a route request times out or control is removed. |
| `defaultMode`                | `string`   | `car`                                                  | Initial transport mode: `car`, `pedestrian`, or `bicycle`. |
| `defaultCostField`           | `string`   | `distance`                                             | Optimization target: `distance`, `travelTime`, or `optimal`. |
| `theme`                      | `string`   | `light`                                                | UI theme: `auto`, `light`, or `dark`. |
| `panelClassName`             | `string`   | ``                                                     | Additional CSS class(es) for the control panel. |
| `routeTimeoutMs`             | `number`   | `20000`                                                | Route request timeout (ms). |
| `routeOptions`               | `object`   | `{ maxAutoRadius: 8, maxAcceptableSnapDistanceM: 60 }` | Forwarded to route engine. |
| `showGraph`                  | `boolean`  | `false`                                                | Whether to render the internal graph overlay. |
| `features`                   | `string`   | `both`                                                 | Which features to show: `routing`, `isolines`, or `both`. |
| `isolineMaxCost`             | `number`   | `1000` / `900`                                         | Default isoline max cost (meters for `distance`, seconds for `travelTime`). |

All unspecified text in `locale_override` is merged from the selected built-in locale. See the examples in the repository for localization overrides.

### Instance API (selected)

- `setOrigin(lngLat)` — set origin and trigger route update.
- `setDest(lngLat)` — set destination and trigger route update.
- `setUrlTemplate(urlTemplate)` — update tile URL template and refresh route.
- `setTileJsonUrl(url)` — update tile metadata URL, fetch template, refresh route.
- `dispose()` / `shutdown()` — free worker pools and caches.

### Isolines

- Integrated isoline (isoPHAST) UI computes reachability polygons for a selected point.
- `features === 'both'` renders tabs for routing and isolines; switching clears the alternate feature's layers/sources.
- Isolines are output to `isolineSourceId` as a GeoJSON `FeatureCollection`; each feature includes `properties.color` used for styling.
- Default isoline behaviour: direction `from`, `isolineMaxCost` defaults to `1000` m for `distance`, `900` s for `travelTime`.

---

## API reference

This section summarizes the most important public functions and options. For full details, consult the source in `src/`.

### `route(start, end, mode, urlTemplate, options?)`

High-level convenience function. Fetches tiles, builds the graph, and returns the route result.

Key `options` (selected):

- `zoom` (number) — default `14`.
- `schema` (`'zxy'` | `'tms'`) — default `'zxy'`.
- `maxAutoRadius` (number) — default `8`.
- `engineId` (string) — `'auto'` (default) or explicit engine id.
- `costField` (string) — `'distance'` (default), `'travelTime'`, or `'optimal'`.
- `penalties` (object) — `{ intersectionPenaltySec, turnPenaltySec, turnAngleThresholdDeg }`.
- `maxAcceptableSnapDistanceM` (number) — default `60`.
- `includeGraph` (boolean) — include prepared graph for debugging.

Returned result includes runtime metadata: `engine`, optional `fallback`, `startSnapDistanceM`, `endSnapDistanceM`, `partialGraph`, `hasMissingTiles`, `missingTileErrors`, and `reason` on failure.

### `buildTileURL(urlTemplate, tile, options?)`

Formats a `{z}/{x}/{y}` tile URL and supports `tileProxyTemplate` and `tileUrlTransform` hooks.

Example:

```javascript
const tileUrl = buildTileURL('https://example.com/{z}/{x}/{y}.pbf', { z: 14, x: 4827, y: 6372 }, {
  tileProxyTemplate: '/api/tile?url={url}',
});
```

### `buildGraphForTiles(tiles, mode, options?)`

Build a prepared routing graph from an explicit tile list without running `route()`. Useful for preloads and reusing graphs across requests.

Example:

```javascript
const tiles = [ { z: 14, x: 4827, y: 6372 }, { z: 14, x: 4828, y: 6372 } ];
const graph = await buildGraphForTiles(tiles, 'car', { urlTemplate });
```

### `routeBatch(requests, urlTemplate, options?)`

Run many `route()` requests in parallel while sharing tile cache and worker pools.

### `computeRoute(startCoords, endCoords, graph, options?)`

Run routing on a pre-built graph (when you manage tile loading yourself). Supports `costField`, `penalties`, `snapDistancesM`, `maxAcceptableSnapDistanceM`, and `engineId` hints.

### `buildCH(graph, costField?)`

Convert merged graph into compact typed arrays and CSR adjacency for engine execution; costs are scaled for fast inner-loop arithmetic.

### `queryRoute(startId, endId, prepared, options?)`

Run the routing algorithm on a `buildCH`-prepared graph. Supports `engineId: 'auto'` and explicit engine IDs, `useCache`, `allowFallback`, and parallel/serial policies.

### `nearestNode(coords, graph, maxDistM?)`

Return the nearest graph node id within `maxDistM` (default 500 m).

---

## Architecture

High-level flow:

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

Key implementation notes:

- Tile corridor enumeration uses [Bresenham rasterisation](https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm) to select slippy-map tiles around the origin→destination corridor and supports adaptive radius retry loops for robustness.
- Tile parsing is parallelised using [PowerPool](https://abelvm.github.io/performance-helpers/#/powerpool) workers and cached in [PowerCache](https://abelvm.github.io/performance-helpers/#/lru-cache-with-ttl-and-memoizer) to avoid repeated decoding.
- Road segments are clipped to tile boundaries using [Liang–Barsky clipping](https://en.wikipedia.org/wiki/Liang%E2%80%93Barsky_algorithm); adjacent tiles produce bit-identical boundary coordinates, avoiding proximity snapping.
- Graph merging deduplicates nodes with a coordinate hash (rounded to 6 decimal places) and computes edge costs and travel times from per-class defaults.

---

## Transport modes & road classes

Road filtering follows the OpenMapTiles transportation schema.

| Mode         | Allowed classes                                                                                              | Excluded                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `car`        | motorway(_link), trunk(_link), primary(_link), secondary(_link), tertiary(_link), minor, service, track     | pedestrian/footway/cycleway/steps/bridleway/corridor subclasses |
| `pedestrian` | path, minor, service, track (+ pedestrian/footway/steps/path/corridor/platform subclasses)                    | motorways and non-foot-access roads                             |
| `bicycle`    | path, minor, service, tertiary, secondary, track (+ cycleway/path subclasses)                                | motorway, motorway_link, non-bicycle-access roads               |

Default per-class speeds are used to compute `travelTime` (km/h). These defaults produce conservative, predictable travel-time estimates.

---

## Development

Common commands:

```bash
npm install        # install dependencies
npm run dev        # Vite dev server (serves example/)
npm run build      # build library to dist/
npm run test       # run Vitest test suite
npm run lint       # ESLint
npm run format     # Prettier
```

Serve the `example/` demo locally with `npm run dev` and open `http://localhost:5173/example/`.

Training note: `npm run train` runs the selector training script `benchmark/train_engine_selector_ml.py` using `.venv/bin/python`. Ensure a Python virtualenv is available or update the script to point to your interpreter.

---

## Caveats

- Route quality depends on OpenStreetMap data coverage and tagging. If routing inaccuracies appear, consider improving source OSM data.
- Endpoints must snap to routable graph edges; snaps beyond `maxAcceptableSnapDistanceM` will fail with a clear reason (`no_node`, `poor_snap`).
- Tile servers must allow CORS for uncached cross-origin tile requests — otherwise use `tileProxyTemplate` to proxy tiles through a same-origin endpoint.

If you see `reason: 'tile_cors'` with `code: 'MissingAllowOriginHeader'` the browser blocked a cross-origin uncached tile request. Fix by adding CORS headers or configuring `tileProxyTemplate`.

---

## References & links

- [Live demo](https://abelvm.github.io/omt-router/example/)
- OpenMapTiles schema: https://openmaptiles.org/schema/#transportation
- OpenFreeMap metadata used in the example: https://tiles.openfreemap.org/planet
- Performance helpers: https://abelvm.github.io/performance-helpers
- Benchmark/training pipeline: [benchmark/README.md](benchmark/README.md)

---

## License

[AGPL-3.0-only](./LICENSE) © Abel Vázquez Montoro
