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
import { isRoutableNodeCollection } from './graphValidation.js';

export const DEG_TO_RAD = Math.PI / 180;
export const LATITUDE_METERS = 111_320;
export const MIN_COS_LAT = 1e-6;
export const DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M = 60;
const SEGMENT_SNAP_EXTRA_M = 250;
const COORD_KEY_SCALE = 1e6;

function coordKey(lng, lat) {
  return `${Math.round(lng * COORD_KEY_SCALE)},${Math.round(lat * COORD_KEY_SCALE)}`;
}

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
function queryWithin(index, x, y, r, out) {
  const count = index.withinInto(x, y, r, out);
  out.length = count;
  return out;
}

export function getNearbyNodeIds(graph, coords, maxDistM) {
  if (!graph._spatialIndex) {
    graph._spatialIndex = buildSpatialIndex(graph);
  }

  const { index, nodeIds } = graph._spatialIndex;
  const [lng, lat] = coords;
  const cosLat = safeCosLat(lat);
  const radiusDeg = maxDistM / (LATITUDE_METERS * cosLat);
  const out = graph._spatialIndex._withinOut || (graph._spatialIndex._withinOut = []);
  const hits = queryWithin(index, lng, lat, radiusDeg, out);

  const result = new Array(hits.length);
  for (let i = 0; i < hits.length; i += 1) {
    result[i] = nodeIds[hits[i]];
  }
  return result;
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
  const out = graph._spatialIndex._withinOut || (graph._spatialIndex._withinOut = []);
  const candidates = queryWithin(index, lng, lat, radiusDeg, out);

  if (candidates.length === 0) return -1;

  let bestId = -1;
  let bestDist = maxDistM;
  for (let i = 0; i < candidates.length; i += 1) {
    const pointIndex = candidates[i];
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
  const incident = new Map();
  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    const edge = graph.edges[edgeIndex];
    if (edge.source >= 0) {
      const edges = incident.get(edge.source);
      if (edges) edges.push(edgeIndex);
      else incident.set(edge.source, [edgeIndex]);
    }
    if (edge.target >= 0) {
      const edges = incident.get(edge.target);
      if (edges) edges.push(edgeIndex);
      else incident.set(edge.target, [edgeIndex]);
    }
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
  const candidateEdges =
    graph._segmentSnapCandidateReuse ?? (graph._segmentSnapCandidateReuse = new Set());
  candidateEdges.clear();

  for (const nodeId of nodeIds) {
    const edges = incident.get(nodeId);
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
 * Copy any routable node collection into a real Map.
 * @param {object} baseNodes
 * @returns {Map<number, object>}
 */
function copyNodesToMap(baseNodes) {
  const nodes = new Map();
  if (baseNodes instanceof Map) {
    for (const [id, node] of baseNodes) nodes.set(id, node);
    return nodes;
  }
  if (isRoutableNodeCollection(baseNodes)) {
    for (const id of baseNodes.keys()) nodes.set(id, baseNodes.get(id));
  }
  return nodes;
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
  const augmentedNodes = copyNodesToMap(graph.nodes);
  augmentedNodes.set(newNodeId, { id: newNodeId, coords: snap.projectedCoords });

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
    nodeIndex: graph.nodeIndex ? new Map(graph.nodeIndex) : new Map(),
    _lastAddedNodeId: newNodeId,
  };
  const [snapLng, snapLat] = snap.projectedCoords;
  augmentedGraph.nodeIndex.set(coordKey(snapLng, snapLat), newNodeId);
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

/**
 * Resolve snapped endpoints for a coordinate pair over a routable graph.
 * Shared by computeRoute() and prepareRoutableGraph().
 *
 * @param {object} graph
 * @param {[number, number]} startCoords
 * @param {[number, number]} endCoords
 * @param {object} [options]
 * @param {number[]} [options.snapDistancesM]
 * @param {number} [options.maxAcceptableSnapDistanceM]
 * @returns {object}
 */
export function resolveRouteEndpoints(
  graph,
  startCoords,
  endCoords,
  { snapDistancesM, maxAcceptableSnapDistanceM = DEFAULT_MAX_ACCEPTABLE_SNAP_DISTANCE_M } = {}
) {
  const distances =
    Array.isArray(snapDistancesM) && snapDistancesM.length > 0 ? snapDistancesM : [250, 500, 800];

  const baseGraph = graph;
  let workingGraph = graph;
  let startId = -1;
  let endId = -1;
  let usedSnapDistance = distances[distances.length - 1];

  if (!isValidCoords(startCoords) || !isValidCoords(endCoords)) {
    return {
      workingGraph,
      baseGraph,
      startId,
      endId,
      startSnapDistanceM: Infinity,
      endSnapDistanceM: Infinity,
      startSnapApplied: false,
      endSnapApplied: false,
      startSegmentSnap: null,
      endSegmentSnap: null,
      baseStartId: -1,
      baseEndId: -1,
      originalStartSnapDistanceM: Infinity,
      originalEndSnapDistanceM: Infinity,
      usedSnapDistance,
      reason: 'no_node',
    };
  }

  for (const maxDistM of distances) {
    startId = nearestNode(startCoords, workingGraph, maxDistM);
    endId = nearestNode(endCoords, workingGraph, maxDistM);
    usedSnapDistance = maxDistM;
    if (startId !== -1 && endId !== -1) break;
  }

  let startSnapDistanceM =
    startId === -1 ? Infinity : haversine(startCoords, workingGraph.nodes.get(startId).coords);
  let endSnapDistanceM =
    endId === -1 ? Infinity : haversine(endCoords, workingGraph.nodes.get(endId).coords);
  const originalStartSnapDistanceM = startSnapDistanceM;
  const originalEndSnapDistanceM = endSnapDistanceM;
  const baseStartId = startId;
  const baseEndId = endId;

  let startCandidate = findEndpointCandidate(
    startCoords,
    workingGraph,
    distances,
    maxAcceptableSnapDistanceM
  );
  let endCandidate = findEndpointCandidate(
    endCoords,
    workingGraph,
    distances,
    maxAcceptableSnapDistanceM
  );
  let startSegmentSnap = startCandidate.segmentSnap;
  let endSegmentSnap = endCandidate.segmentSnap;
  let startSnapApplied = false;
  let endSnapApplied = false;

  if (startCandidate.type === 'segment') {
    workingGraph = createAugmentedGraph(workingGraph, startCandidate.segmentSnap);
    startId = workingGraph._lastAddedNodeId ?? workingGraph.nodes.size - 1;
    startSnapDistanceM = startCandidate.snapDistanceM;
    startSnapApplied = true;

    endCandidate = findEndpointCandidate(
      endCoords,
      workingGraph,
      distances,
      maxAcceptableSnapDistanceM
    );
    endSegmentSnap = endCandidate.segmentSnap;
    endSnapDistanceM = endCandidate.snapDistanceM;
  } else if (startCandidate.type === 'node') {
    startId = startCandidate.nodeId;
    startSnapDistanceM = startCandidate.snapDistanceM;
  }

  if (endCandidate.type === 'segment') {
    workingGraph = createAugmentedGraph(workingGraph, endCandidate.segmentSnap);
    endId = workingGraph._lastAddedNodeId ?? workingGraph.nodes.size - 1;
    endSnapDistanceM = endCandidate.snapDistanceM;
    endSnapApplied = true;
  } else if (endCandidate.type === 'node') {
    endId = endCandidate.nodeId;
    endSnapDistanceM = endCandidate.snapDistanceM;
  }

  if (startId === -1 || endId === -1) {
    return {
      workingGraph,
      baseGraph,
      startId,
      endId,
      startSnapDistanceM,
      endSnapDistanceM,
      startSnapApplied,
      endSnapApplied,
      startSegmentSnap,
      endSegmentSnap,
      baseStartId,
      baseEndId,
      originalStartSnapDistanceM,
      originalEndSnapDistanceM,
      usedSnapDistance,
      reason: 'no_node',
    };
  }

  if (
    startSnapDistanceM > maxAcceptableSnapDistanceM ||
    endSnapDistanceM > maxAcceptableSnapDistanceM
  ) {
    return {
      workingGraph,
      baseGraph,
      startId,
      endId,
      startSnapDistanceM,
      endSnapDistanceM,
      startSnapApplied,
      endSnapApplied,
      startSegmentSnap,
      endSegmentSnap,
      baseStartId,
      baseEndId,
      originalStartSnapDistanceM,
      originalEndSnapDistanceM,
      usedSnapDistance,
      reason: 'poor_snap',
    };
  }

  return {
    workingGraph,
    baseGraph,
    startId,
    endId,
    startSnapDistanceM,
    endSnapDistanceM,
    startSnapApplied,
    endSnapApplied,
    startSegmentSnap,
    endSegmentSnap,
    baseStartId,
    baseEndId,
    originalStartSnapDistanceM,
    originalEndSnapDistanceM,
    usedSnapDistance,
    reason: null,
  };
}
