import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { u82o } from 'performance-helpers/powerBuffer';
import { PowerLogger } from 'performance-helpers/powerLogger';
import { ways, getDefaultSpeedKmh } from '../utils/ways_defaults.js';
import { haversineDistance } from '../utils/misc.js';

const logger = new PowerLogger(import.meta.env?.DEV ? 3 : 0, { name: 'omt-router/graph' });
const COORD_KEY_SCALE = 1e6;
const CAR_CLASS_FIB_SCORE = buildCarClassFibonacciScore();

function buildCarClassFibonacciScore() {
  const carClasses = Array.from(ways.car.class);
  const fib = [1, 1];
  for (let i = 2; i < carClasses.length; i++) {
    fib[i] = fib[i - 1] + fib[i - 2];
  }

  const score = {};
  for (let i = 0; i < carClasses.length; i++) {
    score[carClasses[i]] = fib[i];
  }
  return score;
}

/**
 * Produce a stable integer-string key for a coordinate pair (1e-6 deg ≈ 0.1 m).
 * Math.round(x * COORD_KEY_SCALE) is significantly faster than x.toFixed(6)
 * because it avoids the float-to-string number formatter.
 * @param {number} lng
 * @param {number} lat
 * @returns {string}
 */
function coordKey(lng, lat) {
  return `${Math.round(lng * COORD_KEY_SCALE)},${Math.round(lat * COORD_KEY_SCALE)}`;
}

/**
 * Determine whether a transportation feature is usable by a given transport mode.
 * Applies the class / subclass / access-tag rules from ways.js.
 *
 * @param {object} props  - Feature properties from the transportation layer
 * @param {'car'|'pedestrian'|'bicycle'} mode
 * @returns {boolean}
 */
function isAccessible(props, mode) {
  // Respect explicit access restrictions regardless of mode
  if (props.access === 'no' || props.access === false) return false;

  const rules = ways[mode];
  const cls = props.class ?? '';
  const sub = props.subclass ?? '';

  if (mode === 'car') {
    if (!rules.class.has(cls)) return false;
    if (sub && rules.exclude_subclass.has(sub)) return false;
    return true;
  }

  if (mode === 'pedestrian') {
    const foot = props.foot ?? '';
    return rules.class.has(cls) || rules.subclass.has(sub) || rules.foot.has(foot);
  }

  if (mode === 'bicycle') {
    if (rules.exclude_classes.has(cls)) return false;
    const bicycle = props.bicycle ?? '';
    return (
      rules.class.has(cls) || rules.subclass.has(sub) || rules.bicycle.has(bicycle)
    );
  }

  return false;
}

/**
 * Parse a single tile's transportation layer into a flat, serializable list of
 * road segments for a given transport mode.
 *
 * This is the CPU-intensive step (Pbf decode + geometry projection). It is
 * intentionally free of shared state so it can run inside a PowerPool worker
 * and its result can be stored in a PowerCache.
 *
 * @param {ArrayBuffer} buffer  Raw MVT tile bytes
 * @param {number} x   Tile column
 * @param {number} y   Tile row
 * @param {number} z   Zoom level
 * @param {'car'|'pedestrian'|'bicycle'} mode
 * @returns {Array<{ c1: [number,number], c2: [number,number], oneway: number, speed: number, props: object }>}
 */
export function parseTile(buffer, x, y, z, mode) {
  const tile = new VectorTile(new Pbf(buffer));
  const layer = tile.layers['transportation'];
  if (!layer) return [];

  // Precompute tile-level coordinate constants once per tile (not per vertex).
  // tileToLngLat recomputes 2**z and all the scale factors on every call;
  // hoisting them cuts ~6 multiplications and a Math.pow per vertex.
  const n = 2 ** z;
  const lngBase  = (x / n) * 360 - 180;
  const lngScale = 360 / (n * layer.extent);
  const latYBase  = 1 - (2 * y) / n;
  const latYScale = -2 / (n * layer.extent);
  const toDeg = 180 / Math.PI;

  // Convert tile pixel coords to [lng, lat] using precomputed constants.
  const toLngLat = (lx, ly) => {
    const lng = lngBase + lx * lngScale;
    const latRad = Math.atan(Math.sinh(Math.PI * (latYBase + ly * latYScale)));
    return [lng, latRad * toDeg];
  };

  const segments = [];
  const rules = ways[mode];
  let featureAccessible;
  if (mode === 'car') {
    featureAccessible = (props) => {
      if (!rules.class.has(props.class ?? '')) return false;
      const sub = props.subclass ?? '';
      return !(sub && rules.exclude_subclass.has(sub));
    };
  } else if (mode === 'pedestrian') {
    featureAccessible = (props) => {
      const cls = props.class ?? '';
      const sub = props.subclass ?? '';
      const foot = props.foot ?? '';
      return rules.class.has(cls) || rules.subclass.has(sub) || rules.foot.has(foot);
    };
  } else if (mode === 'bicycle') {
    featureAccessible = (props) => {
      const cls = props.class ?? '';
      if (rules.exclude_classes.has(cls)) return false;
      const sub = props.subclass ?? '';
      const bicycle = props.bicycle ?? '';
      return rules.class.has(cls) || rules.subclass.has(sub) || rules.bicycle.has(bicycle);
    };
  } else {
    featureAccessible = () => false;
  }

  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 2) continue;
    const props = feature.properties;
    if (!featureAccessible(props)) continue;
    const oneway = props.oneway ?? 0;
    const speed = getDefaultSpeedKmh(mode, props.class ?? '');
    for (const line of feature.loadGeometry()) {
      for (let j = 0; j < line.length - 1; j++) {
        // Clip each segment to [0, extent]×[0, extent] using Liang-Barsky.
        // Roads extend into the buffer region of neighbouring tiles; clipping
        // ensures every boundary crossing lands on the exact same pixel
        // coordinate in both tiles, so coordKey deduplication in mergeSegments
        // naturally stitches the graph across tile seams — no proximity snap
        // needed.
        const clipped = clipSegmentToTile(
          line[j].x, line[j].y,
          line[j + 1].x, line[j + 1].y,
          layer.extent
        );
        if (!clipped) continue;
        const [lx1, ly1, lx2, ly2] = clipped;
        segments.push({
          c1: toLngLat(lx1, ly1),
          c2: toLngLat(lx2, ly2),
          oneway,
          speed,
          props,
        });
      }
    }
  }
  return segments;
}

/**
 * Liang-Barsky line clipping to the rectangle [0, extent]×[0, extent].
 *
 * Returns the clipped [x1, y1, x2, y2] or null if the segment is entirely
 * outside the rectangle. Boundary points are computed with the same floating-
 * point arithmetic in both neighbouring tiles (the buffer vertices shift by
 * exactly ±extent), so the interpolated boundary coordinate is bit-identical
 * across tiles.
 *
 * Implemented as a parametric "slab" intersector: compute the [t0, t1]
 * interval where the line is inside the x-slab, then narrow it with the
 * y-slab. No array allocations per call — only scalar arithmetic.
 *
 * @param {number} x1 @param {number} y1 - start point (tile pixel coords)
 * @param {number} x2 @param {number} y2 - end point
 * @param {number} extent - tile extent (typically 4096)
 * @returns {[number,number,number,number]|null}
 */
function clipSegmentToTile(x1, y1, x2, y2, extent) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;

  // X slab [0, extent]
  if (dx === 0) {
    if (x1 < 0 || x1 > extent) return null;
  } else {
    const invDx = 1 / dx;
    const txA = -x1 * invDx;
    const txB = (extent - x1) * invDx;
    t0 = Math.max(t0, Math.min(txA, txB));
    t1 = Math.min(t1, Math.max(txA, txB));
    if (t0 > t1) return null;
  }

  // Y slab [0, extent]
  if (dy === 0) {
    if (y1 < 0 || y1 > extent) return null;
  } else {
    const invDy = 1 / dy;
    const tyA = -y1 * invDy;
    const tyB = (extent - y1) * invDy;
    t0 = Math.max(t0, Math.min(tyA, tyB));
    t1 = Math.min(t1, Math.max(tyA, tyB));
    if (t0 > t1) return null;
  }

  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/**
 * Create an accumulator for building a routing graph incrementally.
 * This avoids allocating a temporary list of all parsed tile batches.
 * @param {'car'|'pedestrian'|'bicycle'} mode
 */
function createGraphAccumulator(mode) {
  /** @type {Map<number, { id: number, coords: [number, number] }>} */
  const nodes = new Map();
  /** @type {Map<string, number>} */
  const nodeIndex = new Map();
  /** @type {Array<object>} */
  const edges = [];
  /** @type {Map<number, Set<number>>} */
  const edgeSet = new Map();
  /** @type {number[]} */
  const outDegree = [];
  /** @type {number[]|null} */
  const outCarCentrality = mode === 'car' ? [] : null;
  let nodeCounter = 0;
  let edgeCounter = 0;
  const classToFibonacciScore = mode === 'car' ? CAR_CLASS_FIB_SCORE : null;

  const getOrCreateNode = (coords) => {
    const key = coordKey(coords[0], coords[1]);
    const existing = nodeIndex.get(key);
    if (existing !== undefined) return existing;
    const id = nodeCounter++;
    nodeIndex.set(key, id);
    nodes.set(id, { id, coords });
    return id;
  };

  return {
    nodes,
    nodeIndex,
    edges,
    edgeSet,
    outDegree,
    outCarCentrality,
    nodeCounter,
    edgeCounter,
    classToFibonacciScore,
    getOrCreateNode,
  };
}

function appendSegments(acc, segments) {
  const { edgeSet, outDegree, outCarCentrality } = acc;
  for (const { c1, c2, oneway, speed, props } of segments) {
    const src = acc.getOrCreateNode(c1);
    const tgt = acc.getOrCreateNode(c2);
    let targets = edgeSet.get(src);
    if (!targets) {
      targets = new Set();
      edgeSet.set(src, targets);
    }
    if (targets.has(tgt)) continue;
    targets.add(tgt);

    const length = haversineDistance(c1, c2);
    const travelTime = length / (speed / 3.6);
    const edge = {
      id: acc.edgeCounter++,
      source: src,
      target: tgt,
      cost: oneway === -1 ? -1 : length,
      reverseCost: oneway === 1 ? -1 : length,
      length,
      speed,
      travelTime,
      properties: props,
    };

    if (acc.classToFibonacciScore) {
      const roadClass = props.class ?? '';
      edge.fibonacciScore = acc.classToFibonacciScore[roadClass] ?? 1;
    }

    outDegree[src] = (outDegree[src] || 0) + 1;
    if (outCarCentrality) {
      outCarCentrality[src] = (outCarCentrality[src] || 0) + (edge.fibonacciScore ?? 1);
    }
    acc.edges.push(edge);
  }
}

function finalizeGraph(acc) {
  return {
    nodes: acc.nodes,
    edges: acc.edges,
    nodeIndex: acc.nodeIndex,
    outDegree: new Int32Array(acc.outDegree),
    outCarCentrality: acc.outCarCentrality ? new Int32Array(acc.outCarCentrality) : undefined,
  };
}

/**
 * Merge pre-parsed segment batches from multiple tiles into a single routing
 * graph, deduplicating nodes and edges that appear in overlapping tile buffers.
 * This step is sequential and lightweight compared to parsing.
 *
 * @param {Array<Array<{ c1, c2, oneway, speed, props }>>} batches
 * @returns {{ nodes: Map<number, object>, edges: Array<object>, nodeIndex: Map<string, number> }}
 */
function mergeSegments(batches, mode) {
  const accumulator = createGraphAccumulator(mode);
  for (const segments of batches) {
    appendSegments(accumulator, segments);
  }

  return finalizeGraph(accumulator);
}


/**
 * Build a routing graph from a set of OpenMapTiles vector tiles for a specific
 * transport mode.  Mirrors the pgRouting edge-table produced by osm2pgrouting:
 * every road segment becomes a directed edge with a forward cost and a reverse
 * cost (−1 meaning "not traversable in that direction").
 *
 * Input tiles may overlap; shared boundary nodes are deduplicated by rounding
 * coordinates to 6 decimal places (~0.1 m).
 *
 * @param {Array<{ buffer: ArrayBuffer, x: number, y: number, z: number }>} tiles
 *   Raw MVT tile buffers together with their ZXY coordinates.
 * @param {'car'|'pedestrian'|'bicycle'} mode
 *   Transport mode used to filter which road features are included.
 *
 * @returns {{
 *   nodes: Map<number, { id: number, coords: [number, number] }>,
 *   edges: Array<{
 *     id:          number,
 *     source:      number,
 *     target:      number,
 *     cost:        number,
 *     reverseCost: number,
 *     length:      number,
 *     speed:       number,
 *     travelTime:  number,
 *     properties:  object
 *   }>,
 *   nodeIndex: Map<string, number>,
 *   outDegree?: Int32Array,
 *   outCarCentrality?: Int32Array
 * }}
 */
export function buildGraph(tiles, mode) {
  if (!ways[mode]) {
    throw new Error(`Unknown transport mode "${mode}". Valid values: car, pedestrian, bicycle.`);
  }

  const accumulator = createGraphAccumulator(mode);
  for (const { buffer, x, y, z } of tiles) {
    appendSegments(accumulator, parseTile(buffer, x, y, z, mode));
  }
  return finalizeGraph(accumulator);
}

/**
 * Async variant of {@link buildGraph} that parallelises the CPU-heavy tile
 * fetch + parsing step across a PowerPool worker pool and caches each tile's
 * segment list in a PowerCache so that the same tile+mode pair is never
 * fetched or parsed twice.
 *
 * Workflow:
 *   1. For each tile, check PowerCache for key `graph:<mode>:<z>/<x>/<y>`.
 *   2. On a cache miss, dispatch `{ op: 'parse-tile', url, x, y, z, mode }`
 *      to a worker. The worker fetches the tile and calls parseTile itself.
 *   3. All tile parses are fanned out concurrently with Promise.all.
 *   4. Once every batch is resolved, run the sequential mergeSegments step on
 *      the calling thread (node/edge deduplication cannot be parallelised).
 *
 * @param {Array<{ url: string, x: number, y: number, z: number }>} tiles
 *   Tile descriptors. The worker will fetch each URL independently.
 * @param {'car'|'pedestrian'|'bicycle'} mode
 * @param {{
 *   pool:  import('@powerpool/powerpool').PowerPool,
 *   cache: import('@powerpool/powercache').PowerCache,
 *   ttl?:  number
 * }} options
 * @returns {Promise<{ nodes: Map<number, object>, edges: Array<object>, nodeIndex: Map<string, number> }>}
 */
export async function buildGraphAsync(tiles, mode, { pool, cache, ttl = 300_000 } = {}) {
  if (!ways[mode]) {
    throw new Error(`Unknown transport mode "${mode}". Valid values: car, pedestrian, bicycle.`);
  }

  const cacheVersion = 'v2';
  const results = await Promise.allSettled(
    tiles.map(({ url, x, y, z }) =>
      cache.getOrSetAsync(
        `graph:${cacheVersion}:${mode}:${z}/${x}/${y}`,
        async () => {
          const response = await pool.postMessage(
            { op: 'parse-tile', url, x, y, z, mode },
            undefined,
            { awaitResponse: true, timeout: 10_000 }
          );

          if (response?.fetchFailed) {
            const reasonCode = response?.fetchError?.code;
            const reasonMessage = response?.fetchError?.message;
            const err = new Error(
              reasonMessage
                ? `tile fetch failed for ${z}/${x}/${y}: ${reasonMessage}`
                : `tile fetch failed for ${z}/${x}/${y}`
            );
            err.code = reasonCode ?? 'TileFetchFailed';
            err.tile = { z, x, y, url };
            throw err;
          }

          const payload = response?.output ?? response;
          return payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)
            ? u82o(payload)
            : payload;
        },
        { ttl }
      )
    )
  );

  const accumulator = createGraphAccumulator(mode);
  let hasMissingTiles = false;
  const missingTileErrors = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      hasMissingTiles = true;
      logger.warn(() => `tile fetch failed, skipping: ${result.reason?.message ?? result.reason}`);
      missingTileErrors.push({
        code: result.reason?.code ?? 'TileFetchFailed',
        message: result.reason?.message ?? String(result.reason),
        tile: result.reason?.tile ?? null,
      });
      continue;
    }
    appendSegments(accumulator, result.value);
  }

  const graph = finalizeGraph(accumulator);
  graph.hasMissingTiles = hasMissingTiles;
  graph.missingTileErrors = missingTileErrors;
  return graph;
}

