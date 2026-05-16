/**
 * @module graphs/snapper
 *
 * Helpers for endpoint snapping, segment projection, and augmented graph
 * creation. These utilities are used by the router to prepare a routable
 * graph around origin/destination coordinates without mutating the base graph.
 */
import KDBush from 'kdbush';
import RBush from 'rbush';
import { haversineDistance as haversine } from '../utils/misc.js';

export const DEG_TO_RAD = Math.PI / 180;
export const LATITUDE_METERS = 111_320;
export const MIN_COS_LAT = 1e-6;
export const DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M = 60;
const SEGMENT_SNAP_EXTRA_M = 250;

export function safeCosLat(lat) {
  return Math.max(Math.cos(lat * DEG_TO_RAD), MIN_COS_LAT);
}

/**
 * Returns true when the coordinates array is a valid longitude/latitude pair.
 * @param {any} coords
 * @returns {coords is [number, number]}
 */
export function isValidCoords(coords) {
  return (
    Array.isArray(coords) &&
    coords.length === 2 &&
    Number.isFinite(coords[0]) &&
    Number.isFinite(coords[1])
  );
}

/**
 * Build a KDBush spatial index over graph nodes and cache it on the graph.
 * The index stores point coordinates in insertion order, and nodeIds maps point
 * indexes back to actual graph node IDs.
 * @param {{ nodes: Map<number, { id: number, coords: [number, number] }> }} graph
 * @returns {{ index: KDBush, coordsArr: Array<[number, number]>, nodeIds: number[] }}
 */
export function buildSpatialIndex(graph) {
  const { nodes } = graph;
  const size = nodes.size;
  const index = new KDBush(size);
  const coordsArr = new Array(size);
  const nodeIds = new Array(size);
  let pointIndex = 0;

  for (const [nodeId, node] of nodes) {
    index.add(node.coords[0], node.coords[1]);
    nodeIds[pointIndex] = nodeId;
    coordsArr[pointIndex] = node.coords;
    pointIndex += 1;
  }

  index.finish();
  return { index, coordsArr, nodeIds };
}

/**
 * Return the nearby node IDs within maxDistM of coordinates.
 * @param {object} graph
 * @param {[number, number]} coords
 * @param {number} maxDistM
 * @returns {number[]}
 */
export function getNearbyNodeIds(graph, coords, maxDistM) {
  if (!graph._spatialIndex) {
    graph._spatialIndex = buildSpatialIndex(graph);
  }

  const { index, nodeIds } = graph._spatialIndex;
  const [lng, lat] = coords;
  const cosLat = safeCosLat(lat);
  const radiusDeg = maxDistM / (LATITUDE_METERS * cosLat);
  return index.within(lng, lat, radiusDeg).map((pointIndex) => nodeIds[pointIndex]);
}

/**
 * Find the nearest node to coordinates within a search radius.
 * Returns -1 when no node exists within the provided distance.
 * @param {[number, number]} coords
 * @param {object} graph - Graph object with node coordinates and an optional spatial index.
 * @param {number} [maxDistM=500]
 * @returns {number}
 * @throws {Error} When graph is not a valid routable graph.
 */
export function nearestNode(coords, graph, maxDistM = 500) {
  if (
    !graph ||
    typeof graph !== 'object' ||
    !graph.nodes ||
    typeof graph.nodes !== 'object' ||
    typeof graph.nodes.get !== 'function' ||
    typeof graph.nodes.has !== 'function' ||
    typeof graph.nodes.size !== 'number'
  ) {
    throw new Error('Invalid graph: expected object with nodes Map.');
  }
  if (!isValidCoords(coords)) return -1;
  if (!graph._spatialIndex) {
    graph._spatialIndex = buildSpatialIndex(graph);
  }
  const { index, coordsArr, nodeIds } = graph._spatialIndex;
  const [lng, lat] = coords;
  const cosLat = safeCosLat(lat);
  const radiusDeg = maxDistM / (LATITUDE_METERS * cosLat);
  const candidates = index.within(lng, lat, radiusDeg);

  if (candidates.length === 0) return -1;

  let bestId = -1;
  let bestDist = maxDistM;
  for (const pointIndex of candidates) {
    const nodeId = nodeIds[pointIndex];
    const d = haversine(coords, coordsArr[pointIndex]);
    if (d < bestDist) {
      bestDist = d;
      bestId = nodeId;
    }
  }
  return bestId;
}

/**
 * Build an index of incident edge IDs for each graph node.
 * @param {object} graph
 * @returns {Array<number[]>}
 */
export function buildIncidentEdgeIndex(graph) {
  if (graph._incidentEdgeIndex) return graph._incidentEdgeIndex;
  const count = graph.nodes.size;
  const incident = Array.from({ length: count }, () => []);
  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    const edge = graph.edges[edgeIndex];
    if (edge.source >= 0 && edge.source < count) incident[edge.source].push(edgeIndex);
    if (edge.target >= 0 && edge.target < count) incident[edge.target].push(edgeIndex);
  }
  graph._incidentEdgeIndex = incident;
  return incident;
}

export function buildEdgeSpatialIndex(graph) {
  if (graph._edgeSpatialIndex) return graph._edgeSpatialIndex;

  const tree = new RBush();
  const edgeItems = [];

  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex += 1) {
    const edge = graph.edges[edgeIndex];
    const source = graph.nodes.get(edge.source);
    const target = graph.nodes.get(edge.target);
    if (!source || !target) continue;

    const [sourceLng, sourceLat] = source.coords;
    const [targetLng, targetLat] = target.coords;
    const minX = Math.min(sourceLng, targetLng);
    const minY = Math.min(sourceLat, targetLat);
    const maxX = Math.max(sourceLng, targetLng);
    const maxY = Math.max(sourceLat, targetLat);

    edgeItems.push({
      minX,
      minY,
      maxX,
      maxY,
      edgeIndex,
    });
  }

  tree.load(edgeItems);
  graph._edgeSpatialIndex = { tree };
  return graph._edgeSpatialIndex;
}

export function getNearbyEdgeIds(graph, coords, maxDistM) {
  const { tree } = buildEdgeSpatialIndex(graph);
  const [lng, lat] = coords;
  const cosLat = safeCosLat(lat);
  const lonRadiusDeg = maxDistM / (LATITUDE_METERS * cosLat);
  const latRadiusDeg = maxDistM / LATITUDE_METERS;

  return tree
    .search({
      minX: lng - lonRadiusDeg,
      minY: lat - latRadiusDeg,
      maxX: lng + lonRadiusDeg,
      maxY: lat + latRadiusDeg,
    })
    .map((item) => item.edgeIndex);
}

/**
 * Project a point onto a line segment in projected coordinates.
 * @param {[number, number]} coords
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @param {number} cosLat
 * @returns {{ t: number, projected: [number, number] } | null}
 */
export function projectPointOnSegment(coords, a, b, cosLat) {
  const px = coords[0] * cosLat;
  const py = coords[1];
  const ax = a[0] * cosLat;
  const ay = a[1];
  const bx = b[0] * cosLat;
  const by = b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return null;
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  return {
    t,
    projected: [ax + dx * t, ay + dy * t],
  };
}

/**
 * Find the closest segment projection to a coordinate within the search radius.
 * @param {[number, number]} coords
 * @param {object} graph
 * @param {number} maxDistM
 * @param {number} [snapDistanceLimitM=DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M]
 * @returns {object|null}
 */
export function findClosestSegmentProjection(
  coords,
  graph,
  maxDistM,
  snapDistanceLimitM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M
) {
  const nodeIds = getNearbyNodeIds(graph, coords, maxDistM + SEGMENT_SNAP_EXTRA_M);
  const incident = buildIncidentEdgeIndex(graph);
  const candidateEdges = new Set();

  for (const nodeId of nodeIds) {
    const edges = incident[nodeId];
    if (!edges) continue;
    for (const edgeIndex of edges) candidateEdges.add(edgeIndex);
  }

  for (const edgeIndex of getNearbyEdgeIds(graph, coords, maxDistM + SEGMENT_SNAP_EXTRA_M)) {
    candidateEdges.add(edgeIndex);
  }

  if (candidateEdges.size === 0) return null;

  const cosLat = safeCosLat(coords[1]);
  let best = null;

  const scanEdge = (edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    if (!edge) return;
    const a = graph.nodes.get(edge.source)?.coords;
    const b = graph.nodes.get(edge.target)?.coords;
    if (!a || !b) return;
    if (edge.cost === -1 && edge.reverseCost === -1) return;

    const projection = projectPointOnSegment(coords, a, b, cosLat);
    if (!projection) return;
    const { t, projected } = projection;

    const clampedT = Math.max(0, Math.min(1, t));
    const projectedCoords =
      clampedT === t
        ? [projected[0] / cosLat, projected[1]]
        : [
            (a[0] * cosLat + (b[0] * cosLat - a[0] * cosLat) * clampedT) / cosLat,
            a[1] + (b[1] - a[1]) * clampedT,
          ];

    const distanceM = haversine(coords, projectedCoords);
    if (distanceM > maxDistM || distanceM > snapDistanceLimitM) return;

    if (!best || distanceM < best.distanceM) {
      best = {
        edge,
        edgeIndex,
        projectedCoords,
        distanceM,
        source: edge.source,
        target: edge.target,
        t: clampedT,
      };
    }
  };

  for (const edgeIndex of candidateEdges) {
    scanEdge(edgeIndex);
  }

  return best;
}

/**
 * Create a view of graph nodes with an extra snapped node.
 * @param {Map<number, object>} baseNodes
 * @param {number} newNodeId
 * @param {[number, number]} projectedCoords
 * @returns {{ size: number, get: function(number): object }}
 * @private
 */
function createAugmentedNodes(baseNodes, newNodeId, projectedCoords) {
  const newNode = { id: newNodeId, coords: projectedCoords };
  return {
    size: baseNodes.size + 1,
    get(id) {
      return id === newNodeId ? newNode : baseNodes.get(id);
    },
    has(id) {
      return id === newNodeId || baseNodes.has(id);
    },
    keys() {
      return (function* () {
        for (const id of baseNodes.keys()) yield id;
        yield newNodeId;
      })();
    },
    values() {
      return (function* () {
        for (const node of baseNodes.values()) yield node;
        yield newNode;
      })();
    },
    entries() {
      return (function* () {
        for (const entry of baseNodes.entries()) yield entry;
        yield [newNodeId, newNode];
      })();
    },
    [Symbol.iterator]() {
      return this.entries();
    },
  };
}

/**
 * Create a new edge array with the snapped edge split and the original edge removed.
 * @param {Array<object>} baseEdges
 * @param {number} removedEdgeIndex
 * @param {Array<object>} insertedEdges
 * @returns {Array<object>}
 * @private
 */
function createAugmentedEdges(baseEdges, removedEdgeIndex, insertedEdges) {
  const resultLength = baseEdges.length + insertedEdges.length - 1;
  const augmentedEdges = new Array(resultLength);
  let targetIndex = 0;

  for (let i = 0; i < removedEdgeIndex; i += 1) {
    augmentedEdges[targetIndex++] = baseEdges[i];
  }

  for (let i = 0; i < insertedEdges.length; i += 1) {
    augmentedEdges[targetIndex++] = insertedEdges[i];
  }

  for (let i = removedEdgeIndex + 1; i < baseEdges.length; i += 1) {
    augmentedEdges[targetIndex++] = baseEdges[i];
  }

  return augmentedEdges;
}

/**
 * Augment a graph with an extra node at the snapped projection point.
 * @param {object} graph
 * @param {object} snap
 * @returns {object}
 */
function getNextNodeId(graph) {
  let maxId = -1;
  for (const nodeId of graph.nodes.keys()) {
    if (nodeId > maxId) maxId = nodeId;
  }
  return maxId + 1;
}

export function createAugmentedGraph(graph, snap) {
  const newNodeId = getNextNodeId(graph);
  const augmentedNodes = createAugmentedNodes(graph.nodes, newNodeId, snap.projectedCoords);

  const sourceCoords = graph.nodes.get(snap.edge.source).coords;
  const targetCoords = graph.nodes.get(snap.edge.target).coords;
  const lengthA = haversine(sourceCoords, snap.projectedCoords);
  const lengthB = haversine(snap.projectedCoords, targetCoords);
  const travelTimeA = lengthA / (snap.edge.speed / 3.6);
  const travelTimeB = lengthB / (snap.edge.speed / 3.6);
  const props = snap.edge.properties;
  const score = snap.edge.fibonacciScore;
  const baseEdgeId = Number.isFinite(snap.edge.id) ? snap.edge.id : graph.edges.length;
  const firstEdgeId = -(baseEdgeId * 2 + 1);
  const secondEdgeId = -(baseEdgeId * 2 + 2);

  const costA = snap.edge.cost === -1 ? -1 : lengthA;
  const costB = snap.edge.cost === -1 ? -1 : lengthB;
  const reverseCostA = snap.edge.reverseCost === -1 ? -1 : lengthA;
  const reverseCostB = snap.edge.reverseCost === -1 ? -1 : lengthB;

  const insertedEdges = [
    {
      id: firstEdgeId,
      source: snap.edge.source,
      target: newNodeId,
      cost: costA,
      reverseCost: reverseCostA,
      length: lengthA,
      speed: snap.edge.speed,
      travelTime: travelTimeA,
      properties: props,
      fibonacciScore: score,
    },
    {
      id: secondEdgeId,
      source: newNodeId,
      target: snap.edge.target,
      cost: costB,
      reverseCost: reverseCostB,
      length: lengthB,
      speed: snap.edge.speed,
      travelTime: travelTimeB,
      properties: props,
      fibonacciScore: score,
    },
  ];

  const augmentedEdges = createAugmentedEdges(graph.edges, snap.edgeIndex, insertedEdges);

  const augmentedGraph = {
    ...graph,
    nodes: augmentedNodes,
    edges: augmentedEdges,
    nodeIndex: graph.nodeIndex && new Map(graph.nodeIndex),
    _lastAddedNodeId: newNodeId,
  };
  delete augmentedGraph._spatialIndex;
  delete augmentedGraph._incidentEdgeIndex;
  delete augmentedGraph._edgeSpatialIndex;
  delete augmentedGraph._prepared;
  return augmentedGraph;
}

/**
 * Build a candidate object for a coordinate using nearest-node or segment snaps.
 * @param {[number, number]} coords
 * @param {object} graph
 * @param {number} maxDistM
 * @param {number} [maxAcceptableSnapDistanceM=DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M]
 * @returns {object}
 */
export function chooseEndpointCandidate(
  coords,
  graph,
  maxDistM,
  maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M
) {
  const candidate = {
    type: 'none',
    nodeId: -1,
    nodeSnapDistanceM: Infinity,
    segmentSnap: null,
    segmentSnapDistanceM: Infinity,
    snapDistanceM: Infinity,
  };
  if (!isValidCoords(coords)) return candidate;

  const nodeId = nearestNode(coords, graph, maxDistM);
  candidate.nodeId = nodeId;

  if (nodeId !== -1) {
    const node = graph.nodes.get(nodeId);
    candidate.nodeSnapDistanceM = haversine(coords, node?.coords ?? [NaN, NaN]);
  }

  const segmentSnap = findClosestSegmentProjection(
    coords,
    graph,
    maxDistM,
    maxAcceptableSnapDistanceM
  );
  if (segmentSnap) {
    candidate.segmentSnap = segmentSnap;
    candidate.segmentSnapDistanceM = segmentSnap.distanceM;

    if (segmentSnap.t === 0 || segmentSnap.t === 1) {
      const endpointNodeId = segmentSnap.t === 0 ? segmentSnap.source : segmentSnap.target;
      candidate.nodeId = endpointNodeId;
      candidate.nodeSnapDistanceM = segmentSnap.distanceM;
      candidate.type = 'node';
      candidate.snapDistanceM = segmentSnap.distanceM;
    } else {
      candidate.type = 'segment';
      candidate.snapDistanceM = candidate.segmentSnapDistanceM;
    }
  } else if (candidate.nodeId !== -1) {
    candidate.type = 'node';
    candidate.snapDistanceM = candidate.nodeSnapDistanceM;
  }

  return candidate;
}

/**
 * Search endpoint candidates across a list of snap radii and return the first hit.
 * @param {[number, number]} coords
 * @param {object} graph
 * @param {number[]|undefined} snapDistancesM
 * @param {number} [maxAcceptableSnapDistanceM=DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M]
 * @returns {object}
 */
export function findEndpointCandidate(
  coords,
  graph,
  snapDistancesM,
  maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M
) {
  const distances =
    Array.isArray(snapDistancesM) && snapDistancesM.length > 0 ? snapDistancesM : [250, 500, 800];

  let candidate = {
    type: 'none',
    nodeId: -1,
    nodeSnapDistanceM: Infinity,
    segmentSnap: null,
    segmentSnapDistanceM: Infinity,
    snapDistanceM: Infinity,
  };

  for (const maxDistM of distances) {
    candidate = chooseEndpointCandidate(coords, graph, maxDistM, maxAcceptableSnapDistanceM);
    if (candidate.type !== 'none') return candidate;
  }

  return candidate;
}

/**
 * Try to add a snapped endpoint to the graph and return the augmented graph/node.
 * @param {object} graph
 * @param {[number, number]} coords
 * @param {number} maxDistM
 * @param {number} [maxAcceptableSnapDistanceM=DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M]
 * @returns {{graph: object, nodeId: number, snapDistanceM: number}|null}
 */
export function tryAddSegmentSnap(
  graph,
  coords,
  maxDistM,
  maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M
) {
  if (!isValidCoords(coords)) return null;
  const snap = findClosestSegmentProjection(coords, graph, maxDistM, maxAcceptableSnapDistanceM);
  if (!snap) return null;
  const augmentedGraph = createAugmentedGraph(graph, snap);
  return {
    graph: augmentedGraph,
    nodeId: augmentedGraph._lastAddedNodeId ?? augmentedGraph.nodes.size - 1,
    snapDistanceM: snap.distanceM,
  };
}
