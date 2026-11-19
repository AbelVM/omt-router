# AGENTS.md — omt-router

Client-side routing engine for OpenMapTiles vector tiles. Runs in the browser (or a Web Worker) with no server-side component. Builds a routable graph from vector tiles, then answers route queries using multiple routing algorithms with automatic engine selection.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` | Production build → `dist/omt-router.js` + `.cjs` + `.css` |
| `npm test` | Run all tests (Vitest, 30 files, 340 tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with coverage |
| `npm run lint` | ESLint on `src/`, `tests/`, `benchmark/` |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier |
| `npm run train` | Train ML engine selector (Python venv) |
| `npm run analyze:errors` | Benchmark error analysis |
| `npm run analyze:features` | Engine selector feature importance |
| `npm run compare-models` | Compare engine selector results |

## Architecture

### Entry point
- `src/index.js` — Public API: `route`, `routeBatch`, `buildGraphForTiles`, `buildTileURL`, `isoline`, `dispose`/`shutdown`, `MapLibreRoutingControl`. Module-level singletons for tile cache, graph cache, and tile pool.

### Engines (`src/engines/`)
- `router.js` — Core routing logic: `computeRoute`, `queryRoute`, `buildCH`, `prepareGraph`, engine selection, worker pool management, route cache, single-flight dedup.
- `engineMainWorker.js` — Web Worker that runs engines off the main thread. Handles `prepare` and `run` messages.
- `BidirectionalAStar/` — Fallback engine, always available.
- `AdaptiveBarrierSSSP/` — Parallel SSSP with SharedArrayBuffer + Atomics. Uses PowerPool for worker dispatch.
- `DeltaStepping/` — Delta-stepping SSSP with shared memory. Uses PowerPool for worker dispatch.
- `UltraDijkstra/` — GPU-accelerated Dijkstra (CPU fallback).
- `constants.js` — Engine IDs, error codes, route failure reasons.

### Graphs (`src/graphs/`)
- `graphBuilder.js` — Fetches tiles via PowerPool, parses them, builds routing graph. Uses `getOrSetAsync` for tile segment caching with inflight dedup.
- `graphMetrics.js` — Graph density/quality metrics for engine selection.
- `graphValidation.js` — Route result validation.
- `snapper.js` — Snap coordinates to nearest graph node/segment.

### Tiles (`src/tiles/`)
- `tilePool.js` — Shared PowerPool for tile fetching/parsing. Uses `autoScale.policy: 'aimd'`, `maxQueueLength: 'auto'`.
- `tilesWorker.js` — Worker that fetches and parses tiles. Uses `PowerRetry` with `PowerRetryBudget` and `attemptTimeout`.
- `tilesManager.js` — Tile URL building, tile coordinate math.

### Isolines (`src/isolines/`)
- `index.js` — Public `isoline()` function: isoPHAST search + d3-tricontour conversion.
- `isoPHAST.js` — IsoPHAST algorithm (bounded Dijkstra from point).
- `tricontour-adapter.js` — Converts isoPHAST distance field to GeoJSON isobands.

### UI (`src/ui/`)
- `MapLibreRoutingControl.js` — MapLibre GL JS control. Composed of:
  - `MapLibreRoutingControl.core.js` — Route/isoline computation, worker management, timeout handling.
  - `MapLibreRoutingControl.map.js` — Map layer/source management.
  - `MapLibreRoutingControl.ui.js` — UI elements (panels, tabs, controls).
  - `MapLibreRoutingControl.isoline.worker.js` — Isoline Web Worker.

### Tuning (`src/tuning/`)
- `tuning.js` — Engine selection logic (ML model or heuristic).
- `model.js` — ML model weights and feature extraction.

### Utils (`src/utils/`)
- `cacheKeys.js`, `fastPointInRing.js`, `misc.js`, `routeValidation.js`, `ways_defaults.js`.

## Key patterns

### PowerPool usage
All four pools use `maxQueueLength: 'auto'` to prevent unbounded queue growth. Workers communicate via `zeroCopy: true` (bypasses 2.x framed codec, posts plain objects via structured clone). Pool timeouts are set to 30s (`ENGINE_WORKER_TIMEOUT_MS`).

### PowerCache usage
- `_tileCache` — 500 entries, 60s TTL, `getOrSetAsync` with inflight dedup.
- `_graphCache` — 8 entries, 90s TTL, `admission: 'tinylfu'` to resist scan pollution.
- `_routeCache` — Per-prepared-graph, disposed via `disposeRouteCache()`.

### Single-flight dedup
`computeRoute` uses `_routeInflight` Map on prepared graphs. Concurrent identical requests (same `cacheKey`) share the first computation's promise instead of running the engine again.

### Timeout protection
- Engine worker: 30s timeout on both single-worker and pool paths. Rejects with `ENGINE_WORKER_TIMEOUT`.
- Isoline worker: 30s timeout. Rejects with `ISO_LINE_WORKER_TIMEOUT`.
- Tile fetch: 8s per-attempt timeout via `PowerRetry.attemptTimeout`.

### Error handling
Errors carry structured fields: `code`, `status`, `tile`, `reason`. Fatal tile errors (4xx) break batch processing; transient errors (5xx, network) are retried. Engine errors use `EngineErrorCode` constants.

## Testing

- 30 test files, 340 tests.
- Worker scripts tested via `vi.stubGlobal('self', ...)` + direct `onmessage` calls.
- Engine tests use mock workers (`MockEngineMainWorker`).
- Benchmark suite in `benchmark/` for performance regression testing.

## Dependencies

- **Runtime:** `@mapbox/vector-tile`, `d3-tricontour`, `kdbush`, `pbf`, `performance-helpers` (2.3.0), `rbush`.
- **Dev:** Vite 8, Vitest 5, ESLint 10, Prettier 3, Terser 5, jsdom 31, esbuild, postcss, cssnano.

## performance-helpers 2.3.0

The project uses: `PowerPool` (4 pools), `PowerCache` (3 caches), `PowerRetry` + `PowerRetryBudget`, `PowerLogger`, `powerBuffer` (u82o/o2u8). See `tmp/ph-2.3-migration.md` for the full migration report.