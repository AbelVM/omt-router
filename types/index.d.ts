export type LatLng = [number, number];
export type CostField = 'distance' | 'travelTime' | 'optimal';
export type TileSchema = 'zxy' | 'tms';

export interface Tile {
  z: number;
  x: number;
  y: number;
  url?: string;
}

export interface RouteResult {
  found: boolean;
  cost: number;
  costField: CostField;
  path: number[];
  coordinates: LatLng[];
  engine?: string;
  reason?: string;
  message?: string;
  code?: string;
  fallback?: Record<string, unknown>;
  graph?: unknown;
  startSnapDistanceM?: number;
  endSnapDistanceM?: number;
  partialGraph?: boolean;
  hasMissingTiles?: boolean;
  missingTileErrors?: unknown[];
}

export interface RouteOptions {
  zoom?: number;
  schema?: TileSchema;
  radius?: number;
  maxAutoRadius?: number;
  costField?: CostField;
  penalties?: Record<string, unknown>;
  maxAcceptableSnapDistanceM?: number;
  engineId?: string;
  useWorkerPool?: boolean;
  engineWorkerPoolSize?: number | null;
  engineWorkerMaxPoolSize?: number | null;
  tileUrlTransform?: (rawURL: string, tile: Tile) => string;
  tileProxyTemplate?: string;
  includeGraph?: boolean;
  signal?: AbortSignal;
}

export interface RouteBatchRequest {
  start: LatLng;
  end: LatLng;
  mode: string;
  costField?: CostField;
}

export interface BuildGraphForTilesOptions {
  zoom?: number;
  schema?: TileSchema;
  urlTemplate?: string;
  tileProxyTemplate?: string;
  tileUrlTransform?: (rawURL: string, tile: Tile) => string;
  pool?: unknown;
}

export interface MapLibreRoutingControlOptions {
  urlTemplate?: string | null;
  tileJsonUrl?: string | null;
  mode?: string;
  costField?: CostField;
  zoom?: number;
  schema?: TileSchema;
  radius?: number;
  maxAutoRadius?: number;
  engineId?: string;
  penalties?: Record<string, unknown>;
  tileUrlTransform?: (rawURL: string, tile: Tile) => string;
  tileProxyTemplate?: string;
  collapsed?: boolean;
  showTools?: boolean;
  openByDefault?: boolean;
  [key: string]: unknown;
}

export interface MapLibreLngLat {
  lng: number;
  lat: number;
}

export function route(
  start: LatLng,
  end: LatLng,
  mode: string,
  urlTemplate: string,
  options?: RouteOptions
): Promise<RouteResult>;

export function routeBatch(
  requests: RouteBatchRequest[],
  urlTemplate: string,
  options?: RouteOptions & { maxConcurrentRoutes?: number }
): Promise<RouteResult[]>;

export function buildGraphForTiles(
  tiles: Tile[],
  mode: string,
  options?: BuildGraphForTilesOptions
): Promise<unknown>;

export function dispose(): void;
export const shutdown: typeof dispose;

export function buildTileURL(
  urlTemplate: string,
  tile: Tile,
  opts?: {
    tileUrlTransform?: (rawURL: string, tile: Tile) => string;
    tileProxyTemplate?: string;
  }
): string;

export function buildCH(
  graph: unknown,
  costField?: CostField,
  penalties?: Record<string, unknown>
): unknown;
export function queryRoute(...args: unknown[]): unknown;
export function computeRoute(...args: unknown[]): unknown;
export function nearestNode(...args: unknown[]): unknown;
export function getEngineWorkerStatus(): unknown;
export function onEngineWorkerStatusChange(listener: (status: unknown) => void): () => void;
export function cancelRunningEngine(reason?: string): void;
export function releaseGraph(graph: unknown): void;
export function ensureAdjCostMap(graph: unknown): unknown;

export class MapLibreRoutingControl {
  constructor(options?: MapLibreRoutingControlOptions);
  onAdd(map: unknown): HTMLElement;
  onRemove(): void;
  setOrigin(lngLat: MapLibreLngLat): void;
  setDest(lngLat: MapLibreLngLat): void;
  setOriginFromMap(lngLat: MapLibreLngLat): void;
  setDestFromMap(lngLat: MapLibreLngLat): void;
  setIsoline(lngLat: MapLibreLngLat): void;
  setIsolineFromMap(lngLat: MapLibreLngLat): void;
  setUrlTemplate(urlTemplate: string | null): void;
  setTileJsonUrl(url: string): void;
}
