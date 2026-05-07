const VALID_ROUTE_MODES = new Set(['car', 'bicycle', 'pedestrian']);
const VALID_TILE_SCHEMAS = new Set(['zxy', 'tms']);

function isValidLngLatCoordinates(value) {
  return (
    Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90
  );
}

export function validateRouteCoordinates(value, name) {
  if (!isValidLngLatCoordinates(value)) {
    throw new Error(
      `Invalid ${name}: expected [lng, lat] with finite numbers, lng ∈ [-180, 180], lat ∈ [-90, 90]`,
    );
  }
}

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

export function validateZoom(zoom) {
  if (!Number.isFinite(zoom) || !Number.isInteger(zoom) || zoom < 0 || zoom > 22) {
    throw new Error('Invalid zoom: expected an integer between 0 and 22.');
  }
}

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

export function validateUrlTemplate(urlTemplate) {
  if (typeof urlTemplate !== 'string' || !urlTemplate.trim()) {
    throw new Error('Invalid urlTemplate: expected a non-empty string.');
  }
}

export function validateMaxAcceptableSnapDistance(maxAcceptableSnapDistanceM) {
  if (
    maxAcceptableSnapDistanceM !== undefined
    && (!Number.isFinite(maxAcceptableSnapDistanceM) || maxAcceptableSnapDistanceM < 0)
  ) {
    throw new Error('Invalid maxAcceptableSnapDistanceM: expected a non-negative finite number.');
  }
}

export function validateRadius(radius) {
  if (!Number.isFinite(radius) || !Number.isInteger(radius) || radius < 1) {
    throw new Error('Invalid radius: expected a positive integer.');
  }

  return Math.floor(radius);
}
