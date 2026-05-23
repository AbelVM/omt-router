/**
 * Route option validation helpers for public API inputs.
 * @module src/utils/routeValidation
 */
import { isKnownEngineId } from '../engines/constants.js';

const VALID_ROUTE_MODES = new Set(['car', 'bicycle', 'pedestrian']);
const VALID_TILE_SCHEMAS = new Set(['zxy', 'tms']);
const VALID_COST_FIELDS = new Set(['distance', 'travelTime', 'optimal']);

function isValidLngLatCoordinates(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

/**
 * Validate a longitude/latitude coordinate pair for route endpoints.
 * @param {*} value Input value to validate.
 * @param {string} name Parameter name used in error messages.
 * @returns {void}
 */
export function validateRouteCoordinates(value, name) {
  if (!isValidLngLatCoordinates(value)) {
    throw new Error(
      `Invalid ${name}: expected [lng, lat] with finite numbers, lng ∈ [-180, 180], lat ∈ [-90, 90]`
    );
  }
}

/**
 * Normalize and validate a transport mode string.
 * @param {*} mode Mode value to normalize.
 * @returns {'car'|'bicycle'|'pedestrian'} Normalized transport mode.
 */
export function normalizeRouteMode(mode) {
  if (typeof mode !== 'string') {
    throw new Error('Invalid transport mode: expected "car", "bicycle", or "pedestrian".');
  }

  const normalized = mode.toLowerCase();
  if (!VALID_ROUTE_MODES.has(normalized)) {
    throw new Error('Unknown transport mode: expected "car", "bicycle", or "pedestrian".');
  }

  return normalized;
}

/**
 * Validate map zoom level.
 * @param {*} zoom Zoom value.
 * @returns {void}
 */
export function validateZoom(zoom) {
  if (!Number.isFinite(zoom) || !Number.isInteger(zoom) || zoom < 0 || zoom > 22) {
    throw new Error('Invalid zoom: expected an integer between 0 and 22.');
  }
}

/**
 * Normalize and validate a tile schema identifier.
 * @param {*} schema Tile schema input.
 * @returns {'zxy'|'tms'} Normalized tile schema.
 */
export function normalizeTileSchema(schema) {
  if (typeof schema !== 'string') {
    throw new Error('Invalid tile schema: expected "zxy" or "tms".');
  }

  const normalized = schema.toLowerCase();
  if (!VALID_TILE_SCHEMAS.has(normalized)) {
    throw new Error('Invalid tile schema: expected "zxy" or "tms".');
  }

  return normalized;
}

/**
 * Validate a URL template string used for tile or data requests.
 * @param {*} urlTemplate Template value to validate.
 * @returns {void}
 */
export function validateUrlTemplate(urlTemplate) {
  if (typeof urlTemplate !== 'string' || !urlTemplate.trim()) {
    throw new Error('Invalid urlTemplate: expected a non-empty string.');
  }
}

/**
 * Validate the maximum acceptable snap distance in meters.
 * @param {*} maxAcceptableSnapDistanceM Distance threshold value.
 * @returns {void}
 */
export function validateMaxAcceptableSnapDistance(maxAcceptableSnapDistanceM) {
  if (
    maxAcceptableSnapDistanceM !== undefined &&
    (!Number.isFinite(maxAcceptableSnapDistanceM) || maxAcceptableSnapDistanceM < 0)
  ) {
    throw new Error('Invalid maxAcceptableSnapDistanceM: expected a non-negative finite number.');
  }
}

/**
 * Validate routing cost field.
 * @param {*} costField Cost field input.
 * @returns {'distance'|'travelTime'|'optimal'} Normalized cost field.
 */
export function validateCostField(costField) {
  if (typeof costField !== 'string' || !VALID_COST_FIELDS.has(costField)) {
    throw new Error('Unknown costField: expected "distance", "travelTime", or "optimal".');
  }

  return costField;
}

/**
 * Validate a positive integer tile corridor radius.
 * @param {*} radius Radius input.
 * @returns {number} Normalized positive integer radius.
 */
export function validateRadius(radius) {
  if (!Number.isFinite(radius) || !Number.isInteger(radius) || radius < 1) {
    throw new Error('Invalid radius: expected a positive integer.');
  }

  return Math.floor(radius);
}

export function validateEngineId(engineId) {
  if (engineId === undefined || engineId === null) {
    return 'auto';
  }

  if (typeof engineId !== 'string' || !engineId.trim()) {
    throw new Error('Invalid engineId: expected a non-empty string or "auto".');
  }

  const trimmed = engineId.trim();
  if (!isKnownEngineId(trimmed)) {
    throw new Error(
      `Unknown engineId "${trimmed}". Expected "auto" or one of: bidirectional-astar, adaptive-barrier, delta-stepping, ultra-dijkstra.`
    );
  }

  return trimmed;
}

export function validateTileUrlTransform(tileUrlTransform) {
  if (tileUrlTransform !== undefined && typeof tileUrlTransform !== 'function') {
    throw new Error('Invalid tileUrlTransform: expected a function.');
  }
}

export function validateTileProxyTemplate(tileProxyTemplate) {
  if (tileProxyTemplate !== undefined && typeof tileProxyTemplate !== 'string') {
    throw new Error('Invalid tileProxyTemplate: expected a string.');
  }
}

/**
 * Normalize and validate routing penalty settings.
 *
 * This is the single source of truth for penalty validation across the
 * public route API and engine preparation/query logic.
 *
 * @param {object} [penalties={}] Penalty options object.
 * @param {number} [penalties.intersectionPenaltySec=0]
 * @param {number} [penalties.turnPenaltySec=0]
 * @param {number} [penalties.turnAngleThresholdDeg=25]
 * @returns {{intersectionPenaltySec:number,turnPenaltySec:number,turnAngleThresholdDeg:number}}
 */
export function normalizePenalties(penalties = {}) {
  const { intersectionPenaltySec = 0, turnPenaltySec = 0, turnAngleThresholdDeg = 25 } = penalties;

  const values = [
    ['intersectionPenaltySec', intersectionPenaltySec],
    ['turnPenaltySec', turnPenaltySec],
    ['turnAngleThresholdDeg', turnAngleThresholdDeg],
  ];

  for (const [name, value] of values) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid penalties.${name}: expected a non-negative finite number`);
    }
  }

  return { intersectionPenaltySec, turnPenaltySec, turnAngleThresholdDeg };
}
