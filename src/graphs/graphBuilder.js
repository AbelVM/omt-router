/**
 * @module graphs/graphBuilder
 *
 * Utilities for parsing OpenMapTiles transportation tiles and assembling
 * the resulting road network into a routing graph. Exported helpers include
 * synchronous and asynchronous graph builders, as well as segment merging
 * utilities used by the router and worker layers.
 */
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { u82o } from 'performance-helpers/powerBuffer';
import { PowerLogger } from 'performance-helpers/powerLogger';
import { ways, getDefaultSpeedKmh } from '../utils/ways_defaults.js';
import { haversineDistanceCoords, isWithinDistanceMetersCoords } from '../utils/misc.js';

const logger = new PowerLogger(0, { name: 'omt-router/graph' });
const COORD_KEY_SCALE = 1e6;
const BOUNDARY_MATCH_DISTANCE_M = 15;
const T_JUNCTION_SNAP_DISTANCE_M = 2;
const T_JUNCTION_BUCKET_SIZE_DEG = 0.001;
const T_JUNCTION_BUCKET_KEY_OFFSET = 200000;
const T_JUNCTION_BUCKET_KEY_MULT = 400001;
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
export function normalizeTagValue(value) {
  if (typeof value === 'string') return value;
  return value == null ? '' : String(value);
}

function normalizeOneway(value) {
  if (value === 1 || value === -1) return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === '1' || lower === 'yes' || lower === 'true') return 1;
    if (lower === '-1' || lower === 'reverse') return -1;
  }
  return 0;
}

function effectiveOneway(mode, originalOneway) {
  // Pedestrian graphs ignore OSM one-way restrictions so walking routes are
  // treated as undirected edges in the routing graph.
  return mode === 'pedestrian' ? 0 : originalOneway;
}

export function isAccessible(props, mode) {
  // Respect explicit access restrictions regardless of mode
  const access = normalizeTagValue(props.access);
  if (access === 'no' || access === 'private') {
    return false;
  }

  const rules = ways[mode];
  const cls = normalizeTagValue(props.class);
  const sub = normalizeTagValue(props.subclass);

  if (mode === 'car') {
    if (!rules.class.has(cls)) return false;
    if (sub && rules.exclude_subclass.has(sub)) return false;
    return true;
  }

  if (mode === 'pedestrian') {
    const foot = normalizeTagValue(props.foot);
    if (foot === 'no' || foot === 'private') return false;
    return rules.class.has(cls) || rules.subclass.has(sub) || rules.foot.has(foot);
  }

  if (mode === 'bicycle') {
    if (rules.exclude_classes.has(cls)) return false;
    const bicycle = normalizeTagValue(props.bicycle);
    if (bicycle === 'no' || bicycle === 'private') return false;
    return rules.class.has(cls) || rules.subclass.has(sub) || rules.bicycle.has(bicycle);
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
 * @returns {Array<number|object>}
 *   Flat segment data encoded as fixed-width tuples:
 *   [c1lng, c1lat, c2lng, c2lat, c1Key, c2Key, oneway, speed, props, roadId,
 *    c1boundary, c2boundary, clipped]
 */
export function parseTile(buffer, x, y, z, mode) {
  const tile = new VectorTile(new Pbf(buffer));
  const layer = tile.layers['transportation'];
  if (!layer) return [];

  // Precompute tile-level coordinate constants once per tile (not per vertex).
  // tileToLngLat recomputes 2**z and all the scale factors on every call;
  // hoisting them cuts ~6 multiplications and a Math.pow per vertex.
  const n = 2 ** z;
  const lngBase = (x / n) * 360 - 180;
  const lngScale = 360 / (n * layer.extent);
  const latYBase = 1 - (2 * y) / n;
  const latYScale = -2 / (n * layer.extent);
  const toDeg = 180 / Math.PI;

  // Convert tile pixel coords to [lng, lat] using precomputed constants.
  const segments = [];
  const featureAccessible = (props) => isAccessible(props, mode);
  const isBoundaryPoint = (lx, ly, extent) => {
    const eps = 1e-9;
    return (
      Math.abs(lx) < eps ||
      Math.abs(lx - extent) < eps ||
      Math.abs(ly) < eps ||
      Math.abs(ly - extent) < eps
    );
  };

  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 2) continue;
    const { class: rawClass, subclass, access, foot, bicycle, oneway: rawOneway, maxspeed: rawMaxspeed } = feature.properties;
    const normalizedClass = normalizeTagValue(rawClass);
    const props = {
      access: normalizeTagValue(access),
      class: normalizedClass,
      subclass: normalizeTagValue(subclass),
      foot: normalizeTagValue(foot),
      bicycle: normalizeTagValue(bicycle),
      maxspeed: normalizeTagValue(rawMaxspeed),
    };
    if (!featureAccessible(props)) continue;
    const oneway = effectiveOneway(mode, normalizeOneway(rawOneway ?? 0));
    const speed = getDefaultSpeedKmh(mode, normalizedClass, rawMaxspeed);
    const roadId = feature.id == null ? undefined : Math.floor(feature.id / 10);
    for (const line of feature.loadGeometry()) {
      for (let j = 0; j < line.length - 1; j++) {
        // Clip each segment to [0, extent]×[0, extent] using Liang-Barsky.
        // Roads extend into the buffer region of neighbouring tiles; clipping
        // ensures every boundary crossing lands on the exact same pixel
        // coordinate in both tiles, so coordKey deduplication in mergeSegments
        // naturally stitches the graph across tile seams — no proximity snap
        // needed.
        const clipped = clipSegmentToTile(
          line[j].x,
          line[j].y,
          line[j + 1].x,
          line[j + 1].y,
          layer.extent
        );
        if (!clipped) continue;
        const [lx1, ly1, lx2, ly2, segmentClipped] = clipped;
        const c1lng = lngBase + lx1 * lngScale;
        const c1lat = Math.atan(Math.sinh(Math.PI * (latYBase + ly1 * latYScale))) * toDeg;
        const c2lng = lngBase + lx2 * lngScale;
        const c2lat = Math.atan(Math.sinh(Math.PI * (latYBase + ly2 * latYScale))) * toDeg;
        segments.push(
          c1lng,
          c1lat,
          c2lng,
          c2lat,
          coordKey(c1lng, c1lat),
          coordKey(c2lng, c2lat),
          oneway,
          speed,
          props,
          roadId,
          isBoundaryPoint(lx1, ly1, layer.extent) ? 1 : 0,
          isBoundaryPoint(lx2, ly2, layer.extent) ? 1 : 0,
          segmentClipped ? 1 : 0
        );
      }
    }
  }
  return splitSegmentsAtEndpoints(segments);
}

/**
 * Liang-Barsky line clipping to the rectangle [0, extent]×[0, extent].
 *
 * Returns the clipped [x1, y1, x2, y2, clipped] or null if the segment is
 * entirely outside the rectangle. The fifth returned value is a boolean flag
 * indicating whether the segment endpoints were trimmed by the tile boundary.
 * Boundary points are computed with the same floating-point arithmetic in both
 * neighbouring tiles (the buffer vertices shift by exactly ±extent), so the
 * interpolated boundary coordinate is bit-identical across tiles.
 *
 * Implemented as a parametric "slab" intersector: compute the [t0, t1]
 * interval where the line is inside the x-slab, then narrow it with the
 * y-slab. No array allocations per call — only scalar arithmetic.
 *
 * @param {number} x1 @param {number} y1 - start point (tile pixel coords)
 * @param {number} x2 @param {number} y2 - end point
 * @param {number} extent - tile extent (typically 4096)
 * @returns {[number,number,number,number,boolean]|null}
 */
function clipSegmentToTile(x1, y1, x2, y2, extent) {
  const dx = x2 - x1,
    dy = y2 - y1;
  let t0 = 0,
    t1 = 1;

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

  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy, t0 !== 0 || t1 !== 1];
}

function projectPointToSegment(lng, lat, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return null;

  const t = ((lng - x1) * dx + (lat - y1) * dy) / lengthSquared;
  if (t <= 0 || t >= 1) return null;

  const px = x1 + t * dx;
  const py = y1 + t * dy;
  if (haversineDistanceCoords(lng, lat, px, py) > T_JUNCTION_SNAP_DISTANCE_M) return null;

  return { t, x: px, y: py };
}

function splitSegmentsAtEndpoints(segments) {
  if (segments.length === 0) return segments;
  if (segments.length % SEGMENT_STRIDE !== 0) {
    throw new Error(`splitSegmentsAtEndpoints: invalid segment buffer length ${segments.length}`);
  }

  const assertFiniteNumber = (value, label, segmentIndex) => {
    if (!Number.isFinite(value)) {
      throw new Error(`splitSegmentsAtEndpoints: invalid ${label} in segment ${segmentIndex}: ${value}`);
    }
  };

  const segmentCount = segments.length / SEGMENT_STRIDE;
  const segmentBuckets = new Map();
  const splitCandidates = new Array(segmentCount);
  const visitedSegmentStamps = new Uint32Array(segmentCount);
  let visitId = 1;
  const bucketScale = 1 / T_JUNCTION_BUCKET_SIZE_DEG;
  const bucketOffset = T_JUNCTION_BUCKET_KEY_OFFSET;
  const bucketMult = T_JUNCTION_BUCKET_KEY_MULT;
  const endpointScale = COORD_KEY_SCALE;
  const getBucketKey = (bx, by) => (bx + bucketOffset) * bucketMult + (by + bucketOffset);

  for (let i = 0; i < segments.length; i += SEGMENT_STRIDE) {
    const segmentIndex = i / SEGMENT_STRIDE;
    const c1lng = segments[i];
    const c1lat = segments[i + 1];
    const c2lng = segments[i + 2];
    const c2lat = segments[i + 3];
    assertFiniteNumber(c1lng, 'c1lng', segmentIndex);
    assertFiniteNumber(c1lat, 'c1lat', segmentIndex);
    assertFiniteNumber(c2lng, 'c2lng', segmentIndex);
    assertFiniteNumber(c2lat, 'c2lat', segmentIndex);
    const minLng = Math.min(c1lng, c2lng) - T_JUNCTION_BUCKET_SIZE_DEG;
    const maxLng = Math.max(c1lng, c2lng) + T_JUNCTION_BUCKET_SIZE_DEG;
    const minLat = Math.min(c1lat, c2lat) - T_JUNCTION_BUCKET_SIZE_DEG;
    const maxLat = Math.max(c1lat, c2lat) + T_JUNCTION_BUCKET_SIZE_DEG;

    const minBucketX = Math.floor(minLng * bucketScale);
    const maxBucketX = Math.floor(maxLng * bucketScale);
    const minBucketY = Math.floor(minLat * bucketScale);
    const maxBucketY = Math.floor(maxLat * bucketScale);

    for (let bx = minBucketX; bx <= maxBucketX; bx++) {
      for (let by = minBucketY; by <= maxBucketY; by++) {
        const bucketKey = (bx + bucketOffset) * bucketMult + (by + bucketOffset);
        let bucket = segmentBuckets.get(bucketKey);
        if (bucket === undefined) {
          bucket = [];
          segmentBuckets.set(bucketKey, bucket);
        }
        bucket.push(segmentIndex);
      }
    }
  }

  for (let i = 0; i < segments.length; i += SEGMENT_STRIDE) {
    const currentSegmentIndex = i / SEGMENT_STRIDE;

    for (let endpointIndex = 0; endpointIndex < 2; endpointIndex++) {
      const endpointLng = endpointIndex === 0 ? segments[i] : segments[i + 2];
      const endpointLat = endpointIndex === 0 ? segments[i + 1] : segments[i + 3];
      const endpointKeyX = Math.round(endpointLng * endpointScale);
      const endpointKeyY = Math.round(endpointLat * endpointScale);
      const endpointBucketX = Math.floor(endpointLng * bucketScale);
      const endpointBucketY = Math.floor(endpointLat * bucketScale);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = segmentBuckets.get(getBucketKey(endpointBucketX + dx, endpointBucketY + dy));
          if (!bucket) continue;
          for (const candidateIndex of bucket) {
            if (candidateIndex === currentSegmentIndex || visitedSegmentStamps[candidateIndex] === visitId) continue;
            visitedSegmentStamps[candidateIndex] = visitId;

            const base = candidateIndex * SEGMENT_STRIDE;
            const candidateC1lng = segments[base];
            const candidateC1lat = segments[base + 1];
            const candidateC2lng = segments[base + 2];
            const candidateC2lat = segments[base + 3];
            const candidateC1KeyX = Math.round(candidateC1lng * endpointScale);
            const candidateC1KeyY = Math.round(candidateC1lat * endpointScale);
            const candidateC2KeyX = Math.round(candidateC2lng * endpointScale);
            const candidateC2KeyY = Math.round(candidateC2lat * endpointScale);
            if (
              (endpointKeyX === candidateC1KeyX && endpointKeyY === candidateC1KeyY) ||
              (endpointKeyX === candidateC2KeyX && endpointKeyY === candidateC2KeyY)
            ) {
              continue;
            }

            const projection = projectPointToSegment(
              endpointLng,
              endpointLat,
              candidateC1lng,
              candidateC1lat,
              candidateC2lng,
              candidateC2lat
            );
            if (!projection) continue;
            if (!Number.isFinite(projection.t) || projection.t <= 0 || projection.t >= 1) {
              throw new Error(`splitSegmentsAtEndpoints: invalid projection.t=${projection.t} for segment ${candidateIndex}`);
            }

            const splitKey = coordKey(endpointLng, endpointLat);
            let candidateSplits = splitCandidates[candidateIndex];
            if (!candidateSplits) {
              splitCandidates[candidateIndex] = [[splitKey, projection.t]];
              continue;
            }
            let duplicate = false;
            for (let j = 0; j < candidateSplits.length; j++) {
              if (candidateSplits[j][0] === splitKey) {
                duplicate = true;
                break;
              }
            }
            if (duplicate) continue;
            candidateSplits.push([splitKey, projection.t]);
          }
        }
      }

      visitId += 1;
    }
  }

  const result = [];
  for (let i = 0; i < segments.length; i += SEGMENT_STRIDE) {
    const segmentIndex = i / SEGMENT_STRIDE;
    const c1lng = segments[i];
    const c1lat = segments[i + 1];
    const c2lng = segments[i + 2];
    const c2lat = segments[i + 3];
    const c1Key = segments[i + 4];
    const c2Key = segments[i + 5];
    const originalOneway = segments[i + 6];
    const speed = segments[i + 7];
    const props = segments[i + 8];
    const roadId = segments[i + 9];
    const c1boundary = segments[i + 10];
    const c2boundary = segments[i + 11];
    const clipped = segments[i + 12];
    const candidateSplits = splitCandidates[segmentIndex];

    if (!candidateSplits || candidateSplits.length === 0) {
      result.push(
        c1lng,
        c1lat,
        c2lng,
        c2lat,
        c1Key,
        c2Key,
        originalOneway,
        speed,
        props,
        roadId,
        c1boundary,
        c2boundary,
        clipped
      );
      continue;
    }

    const splits = candidateSplits.length > 1 ? candidateSplits.sort((a, b) => a[1] - b[1]) : candidateSplits;

    let previousLng = c1lng;
    let previousLat = c1lat;
    let previousKey = c1Key;
    let previousBoundary = c1boundary;

    for (const [splitKey, t] of splits) {
      const splitLng = c1lng + (c2lng - c1lng) * t;
      const splitLat = c1lat + (c2lat - c1lat) * t;
      const splitCoordsKey = splitKey;
      result.push(
        previousLng,
        previousLat,
        splitLng,
        splitLat,
        previousKey,
        splitCoordsKey,
        originalOneway,
        speed,
        props,
        roadId,
        previousBoundary,
        0,
        clipped
      );
      previousLng = splitLng;
      previousLat = splitLat;
      previousKey = splitCoordsKey;
      previousBoundary = 0;
    }

    result.push(
      previousLng,
      previousLat,
      c2lng,
      c2lat,
      previousKey,
      c2Key,
      originalOneway,
      speed,
      props,
      roadId,
      0,
      c2boundary,
      clipped
    );
  }

  return result;
}

/**
 * Create an accumulator for building a routing graph incrementally.
 * This avoids allocating a temporary list of all parsed tile batches.
 * @param {'car'|'pedestrian'|'bicycle'} mode
 */
const TYPED_ARRAY_INITIAL_CAPACITY = 1024;

function createInt32Buffer(initialCapacity = TYPED_ARRAY_INITIAL_CAPACITY) {
  return {
    data: new Int32Array(initialCapacity),
    length: 0,
  };
}

function ensureInt32Capacity(buffer, index) {
  if (index >= buffer.data.length) {
    const newCapacity = Math.max(index + 1, buffer.data.length * 2);
    const next = new Int32Array(newCapacity);
    next.set(buffer.data);
    buffer.data = next;
  }
  if (index >= buffer.length) buffer.length = index + 1;
}

function incrementInt32(buffer, index, delta = 1) {
  ensureInt32Capacity(buffer, index);
  buffer.data[index] += delta;
}

function createGraphAccumulator(mode) {
  /** @type {Map<number, { id: number, coords: [number, number] }>} */
  const nodes = new Map();
  /** @type {Map<string, number>} */
  const nodeIndex = new Map();
  const BOUNDARY_BUCKET_SIZE_DEG = (BOUNDARY_MATCH_DISTANCE_M / 111320) * 2;
  const getBoundaryBucketCoords = (lng, lat) => [
    Math.floor(lng / BOUNDARY_BUCKET_SIZE_DEG),
    Math.floor(lat / BOUNDARY_BUCKET_SIZE_DEG),
  ];
  const BOUNDARY_MATCH_DEG = BOUNDARY_MATCH_DISTANCE_M / 111_320;
  /** @type {Map<number, Map<number, Array<{ id: number, coords: [number, number] }>>>} */
  const clippedBoundaryNodeIndex = new Map();
  /** @type {Array<object>} */
  const edges = [];
  /** @type {Map<number, Set<number>>} */
  const edgeSet = new Map();
  const outDegree = createInt32Buffer();
  const outCarCentrality = mode === 'car' ? createInt32Buffer() : null;
  const classToFibonacciScore = mode === 'car' ? CAR_CLASS_FIB_SCORE : null;

  const getOrCreateNode = (lng, lat, roadId, boundary, clipped, key) => {
    const resolvedKey = key ?? coordKey(lng, lat);
    const existing = nodeIndex.get(resolvedKey);
    if (existing !== undefined) return existing;

    if (boundary && clipped) {
      const [bucketX, bucketY] = getBoundaryBucketCoords(lng, lat);
      for (let dx = -1; dx <= 1; dx++) {
        const row = clippedBoundaryNodeIndex.get(bucketX + dx);
        if (!row) continue;
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = row.get(bucketY + dy);
          if (!bucket) continue;
          for (const { coords: existingCoords, id } of bucket) {
            const dx = existingCoords[0] - lng;
            const dy = existingCoords[1] - lat;
            if (
              dx > BOUNDARY_MATCH_DEG ||
              dx < -BOUNDARY_MATCH_DEG ||
              dy > BOUNDARY_MATCH_DEG ||
              dy < -BOUNDARY_MATCH_DEG
            ) {
              continue;
            }
            if (
              isWithinDistanceMetersCoords(
                existingCoords[0],
                existingCoords[1],
                lng,
                lat,
                BOUNDARY_MATCH_DISTANCE_M
              )
            ) {
              nodeIndex.set(resolvedKey, id);
              return id;
            }
          }
        }
      }
    }

    const id = acc.nodeCounter++;
    nodeIndex.set(resolvedKey, id);
    const coords = [lng, lat];
    nodes.set(id, { id, coords });
    if (boundary && clipped) {
      const [bucketX, bucketY] = getBoundaryBucketCoords(coords[0], coords[1]);
      let row = clippedBoundaryNodeIndex.get(bucketX);
      if (!row) {
        row = new Map();
        clippedBoundaryNodeIndex.set(bucketX, row);
      }
      let bucket = row.get(bucketY);
      if (!bucket) {
        bucket = [];
        row.set(bucketY, bucket);
      }
      bucket.push({ id, coords });
    }
    return id;
  };

  const acc = {
    nodes,
    nodeIndex,
    edges,
    edgeSet,
    outDegree,
    outCarCentrality,
    nodeCounter: 0,
    edgeCounter: 0,
    classToFibonacciScore,
    mode,
    getOrCreateNode,
  };

  return acc;
}

const SEGMENT_STRIDE = 13;

function appendSegments(acc, segments) {
  const { edgeSet, outDegree, outCarCentrality, mode } = acc;
  if (segments.length === 0) return;

  const firstSegment = segments[0];
  if (typeof firstSegment !== 'object' || firstSegment === null) {
    if (segments.length % SEGMENT_STRIDE !== 0) {
      throw new Error(`appendSegments: invalid flat segment buffer length ${segments.length}`);
    }
  }
  if (typeof firstSegment === 'object' && firstSegment !== null && 'c1' in firstSegment) {
    for (const segment of segments) {
      const [c1lng, c1lat] = segment.c1;
      const [c2lng, c2lat] = segment.c2;
      const c1Key = segment.c1Key ?? coordKey(c1lng, c1lat);
      const c2Key = segment.c2Key ?? coordKey(c2lng, c2lat);
      const originalOneway = segment.oneway;
      const speed = segment.speed;
      const props = segment.props;
      const roadId = segment.roadId;
      const c1boundary = !!segment.c1boundary;
      const c2boundary = !!segment.c2boundary;
      const clipped = !!segment.clipped;
      const oneway = effectiveOneway(mode, originalOneway);
      const src = acc.getOrCreateNode(c1lng, c1lat, roadId, c1boundary, clipped, c1Key);
      const tgt = acc.getOrCreateNode(c2lng, c2lat, roadId, c2boundary, clipped, c2Key);
      let targets = edgeSet.get(src);
      if (!targets) {
        targets = new Set();
        edgeSet.set(src, targets);
      }
      if (targets.has(tgt)) continue;
      targets.add(tgt);

      const length = haversineDistanceCoords(c1lng, c1lat, c2lng, c2lat);
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
        roadId,
        properties: props,
      };

        if (acc.classToFibonacciScore) {
        const roadClass = props.class ?? '';
        edge.fibonacciScore = acc.classToFibonacciScore[roadClass] ?? 1;
      }

      incrementInt32(outDegree, src, 1);
      if (outCarCentrality) {
        incrementInt32(outCarCentrality, src, edge.fibonacciScore ?? 1);
      }
      acc.edges.push(edge);
    }
    return;
  }

  for (let i = 0; i < segments.length; i += SEGMENT_STRIDE) {
    const c1lng = segments[i];
    const c1lat = segments[i + 1];
    const c2lng = segments[i + 2];
    const c2lat = segments[i + 3];
    const c1Key = segments[i + 4];
    const c2Key = segments[i + 5];
    const originalOneway = segments[i + 6];
    const speed = segments[i + 7];
    const props = segments[i + 8];
    const roadId = segments[i + 9];
    const c1boundary = !!segments[i + 10];
    const c2boundary = !!segments[i + 11];
    const clipped = !!segments[i + 12];
    const oneway = effectiveOneway(mode, originalOneway);
    const src = acc.getOrCreateNode(c1lng, c1lat, roadId, c1boundary, clipped, c1Key);
    const tgt = acc.getOrCreateNode(c2lng, c2lat, roadId, c2boundary, clipped, c2Key);
    let targets = edgeSet.get(src);
    if (!targets) {
      targets = new Set();
      edgeSet.set(src, targets);
    }
    if (targets.has(tgt)) continue;
    targets.add(tgt);

    const length = haversineDistanceCoords(c1lng, c1lat, c2lng, c2lat);
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
      roadId,
      properties: props,
    };

    if (acc.classToFibonacciScore) {
      const roadClass = props.class ?? '';
      edge.fibonacciScore = acc.classToFibonacciScore[roadClass] ?? 1;
    }

    incrementInt32(outDegree, src, 1);
    if (outCarCentrality) {
      incrementInt32(outCarCentrality, src, edge.fibonacciScore ?? 1);
    }
    acc.edges.push(edge);
  }
}

function finalizeGraph(acc) {
  return {
    mode: acc.mode,
    nodes: acc.nodes,
    edges: acc.edges,
    nodeIndex: acc.nodeIndex,
    outDegree: acc.outDegree.data.subarray(0, acc.nodeCounter),
    outCarCentrality: acc.outCarCentrality
      ? acc.outCarCentrality.data.subarray(0, acc.nodeCounter)
      : undefined,
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
export function mergeSegments(batches, mode) {
  const accumulator = createGraphAccumulator(mode);
  for (const segments of batches) {
    const firstSegment = segments[0];
    const normalizedSegments =
      typeof firstSegment === 'object' && firstSegment !== null && 'c1' in firstSegment
        ? segments
        : splitSegmentsAtEndpoints(segments);
    appendSegments(accumulator, normalizedSegments);
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
 *   3. Tile parses are dispatched in limited concurrent batches so large tile
 *      sets are backpressured and fatal fetch failures can stop remaining work.
 *   4. Once every batch is resolved, run the sequential mergeSegments step on
 *      the calling thread (node/edge deduplication cannot be parallelised).
 *
 * @param {Array<{ url: string, x: number, y: number, z: number }>} tiles
 *   Tile descriptors. The worker will fetch each URL independently.
 * @param {'car'|'pedestrian'|'bicycle'} mode
 * @param {{
 *   pool:  import('@powerpool/powerpool').PowerPool,
 *   cache: import('@powerpool/powercache').PowerCache,
 *   ttl?:  number,
 *   maxConcurrentTiles?: number
 * }} options
 * @returns {Promise<{ nodes: Map<number, object>, edges: Array<object>, nodeIndex: Map<string, number>, hasMissingTiles: boolean, missingTileErrors: Array<object> }>}
 */
function isFatalTileError(error) {
  if (!error || typeof error.code !== 'string') return false;
  return (
    error.code === 'MissingAllowOriginHeader' ||
    error.code === 'NetworkError' ||
    error.code.startsWith('HTTP_')
  );
}

export async function buildGraphAsync(
  tiles,
  mode,
  { pool, cache, ttl = 300_000, maxConcurrentTiles } = {}
) {
  if (!ways[mode]) {
    throw new Error(`Unknown transport mode "${mode}". Valid values: car, pedestrian, bicycle.`);
  }

  const cacheVersion = 'v2';
  const tileBatchSize = Math.max(
    1,
    typeof maxConcurrentTiles === 'number' && maxConcurrentTiles > 0
      ? Math.min(maxConcurrentTiles, tiles.length)
      : Math.min(6, tiles.length, typeof pool?.maxSize === 'number' ? pool.maxSize : 6)
  );

  const buildTileSegment = ({ url, x, y, z }) =>
    cache.getOrSetAsync(
      // Include URL in cache key to avoid cross-provider collisions for the same z/x/y.
      // (Different providers can serve different tiles for identical coordinates.)
      `graph:${cacheVersion}:${mode}:${z}/${x}/${y}:${url}`,
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
    );

  const accumulator = createGraphAccumulator(mode);
  let hasMissingTiles = false;
  const missingTileErrors = [];

  for (let i = 0; i < tiles.length; i += tileBatchSize) {
    const batch = tiles.slice(i, i + tileBatchSize).map((tile) => buildTileSegment(tile));
    const settled = await Promise.allSettled(batch);

    for (const result of settled) {
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

    if (settled.some((result) => result.status === 'rejected' && isFatalTileError(result.reason))) {
      break;
    }
  }

  const graph = finalizeGraph(accumulator);
  graph.hasMissingTiles = hasMissingTiles;
  graph.missingTileErrors = missingTileErrors;
  // `hasMissingTiles` flags that some tile fetch/parses failed. Callers can still
  // evaluate a route against the partial graph, but should avoid caching it as
  // a complete graph that may later produce false negatives.
  return graph;
}
