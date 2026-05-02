import { PowerPool } from 'performance-helpers/powerPool';
import { PowerCache } from 'performance-helpers/powerCache';
import tilesWorker from './workers/tilesWorker?worker&inline';
import { getTilesAlongLine } from './tilesManager.js';
import { buildGraphAsync } from './graphBuilder.js';
import { interpolate, haversineDistance } from './utils/misc.js';
import { buildCH, queryRoute, computeRoute, nearestNode } from './chRouter.js';

export { buildCH, queryRoute, computeRoute, nearestNode };

// Module-level singletons — created once at import time, shared across all
// route() calls. Avoids ~50–200 ms of worker-spawn latency per call and lets
// the tile cache persist between calls so revisited tiles are never re-fetched.
const _hwConcurrency =
  typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
const _pool = new PowerPool(tilesWorker, {
  size: _hwConcurrency,       // match CPU core count
  maxSize: _hwConcurrency,
  lazy: false,                // prewarm workers at import time
  autoScale: true,            // sets maxTasksPerWorker=1 (CPU-bound tasks)
  idleTimeout: 300_000,       // keep workers alive 5 min between calls
});
const _cache = new PowerCache({ maxEntries: 5000, defaultTTL: 300_000 });

/**
 * Compute the tile fetch radius needed to reliably contain the real path.
 *
 * `radius` is in tile units; it controls how many tiles on each side of the
 * Bresenham line are loaded.  At zoom 14, one tile ≈ 2π·R·cos(lat)/2^14 m
 * (≈ 1 870 m at 40°N).
 *
 * The real path can deviate *laterally* from the beeline due to one-way
 * streets, rivers, parks, and highway access restrictions.  That lateral
 * budget is:
 *   - Floor of 600 m (covers typical urban one-way detours)
 *   - Plus 15% of the beeline for long routes where geographic features
 *     (rivers, motorway spurs) force larger diversions
 *
 * radius = ceil(bufferM / tileWidthM), clamped to [1, 3].
 *
 * Examples at zoom 14 / 40°N (tileWidthM ≈ 1 870 m):
 *   500 m route  → bufferM = 600 m → radius = 1  (3-tile-wide corridor ≈ 5.6 km)
 *   5 km route   → bufferM = 750 m → radius = 1
 *   10 km route  → bufferM = 1 500 m → radius = 1
 *   14 km route  → bufferM = 2 100 m → radius = 2  (5-tile-wide corridor ≈ 9.4 km)
 *   30 km route  → bufferM = 4 500 m → radius = 3
 */
function computeRadius(start, end, zoom) {
  const midLat = (start[1] + end[1]) / 2;
  const tileWidthM = (2 * Math.PI * 6_371_000 * Math.cos(midLat * Math.PI / 180)) / (2 ** zoom);
  const beelineM = haversineDistance(start, end);
  const bufferM = Math.max(600, beelineM * 0.15);
  return Math.min(3, Math.max(1, Math.ceil(bufferM / tileWidthM)));
}

export const route = async (
  start,
  end,
  mode,
  urlTemplate,
  { zoom = 14, schema = 'zxy', radius } = {}
) => {
  const initialRadius = radius ?? computeRadius(start, end, zoom);

  // Retry loop: if the graph at the current radius has both nodes but no
  // connecting path, a physical barrier (river, mountain, motorway) is forcing
  // the real route outside the loaded tile corridor.  Widen by +1 tile and
  // retry.  The tile cache ensures already-fetched tiles are not re-downloaded.
  //
  // We do NOT retry on 'no_node' (start/end coords have no road nearby at all
  // — widening tiles won't help if there's simply no road within 500 m).
  //
  // Cap: initialRadius + 2 expansions, maximum radius 4.  Beyond that the
  // tile window is so large that the route is genuinely unreachable within
  // the loaded area and the caller should handle it.
  const maxRadius = Math.min(4, initialRadius + 2);

  let lastResult;
  for (let r = initialRadius; r <= maxRadius; r++) {
    const candidateTiles = getTilesAlongLine(start, end, zoom, r, schema);
    const tiles = candidateTiles.map((tile) => {
      const url = interpolate(urlTemplate, { z: tile.z, x: tile.x, y: tile.y });
      return { ...tile, url };
    });
    const graph = await buildGraphAsync(tiles, mode, { pool: _pool, cache: _cache });
    lastResult = await computeRoute(start, end, graph, { costField: 'distance' });

    if (lastResult.found) return lastResult;
    if (lastResult.reason !== 'no_path') return lastResult; // no_node — don't retry

    if (r < maxRadius) {
      // Log so the caller can see the retry in dev tools.
      console.debug(`[omp-router] no path at radius=${r}, retrying with radius=${r + 1}`);
    }
  }

  return lastResult;
};
