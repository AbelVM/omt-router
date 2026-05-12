import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBuildGraphAsync = vi.fn();
const mockGetTilesAlongLine = vi.fn();
const mockGetSharedTilePool = vi.fn();
const mockDisposeSharedTilePool = vi.fn();
const mockComputeRoute = vi.fn();
const mockShutdownEngineWorker = vi.fn();

vi.mock('../src/graphs/graphBuilder.js', async () => {
  const actual = await vi.importActual('../src/graphs/graphBuilder.js');
  return {
    ...actual,
    buildGraphAsync: mockBuildGraphAsync,
    getTilesAlongLine: mockGetTilesAlongLine,
  };
});

vi.mock('../src/tiles/tilePool.js', async () => {
  const actual = await vi.importActual('../src/tiles/tilePool.js');
  return {
    ...actual,
    getSharedTilePool: mockGetSharedTilePool,
    disposeSharedTilePool: mockDisposeSharedTilePool,
  };
});

vi.mock('../src/engines/router.js', async () => {
  const actual = await vi.importActual('../src/engines/router.js');
  return {
    ...actual,
    computeRoute: mockComputeRoute,
    shutdownEngineWorker: mockShutdownEngineWorker,
  };
});

let route;
let buildTileURL;
let disposeFn;
let shutdownFn;

beforeEach(async () => {
  vi.resetAllMocks();
  mockGetSharedTilePool.mockReturnValue({ pool: true });
  mockGetTilesAlongLine.mockReturnValue([{ z: 14, x: 8200, y: 5600 }]);
  const module = await import('../src/index.js');
  route = module.route;
  buildTileURL = module.buildTileURL;
  disposeFn = module.dispose;
  shutdownFn = module.shutdown;
});

describe('index module route and tile URL helpers', () => {
  it('builds proxy URLs with {url} placeholders', () => {
    const raw = 'https://example.com/{z}/{x}/{y}.pbf';
    const proxy = 'https://proxy/?url={url}';
    const result = buildTileURL(raw, { z: 14, x: 1, y: 2 }, { tileProxyTemplate: proxy });

    expect(result).toContain('https://proxy/?url=');
    expect(result).toContain('https%3A%2F%2Fexample.com%2F14%2F1%2F2.pbf');
  });

  it('builds proxy URLs by concatenation when no {url} placeholder is present', () => {
    const raw = 'https://example.com/{z}/{x}/{y}.pbf';
    const template = 'https://proxy/?target=';
    const result = buildTileURL(raw, { z: 14, x: 1, y: 2 }, { tileProxyTemplate: template });

    expect(result).toBe('https://proxy/?target=https%3A%2F%2Fexample.com%2F14%2F1%2F2.pbf');
  });

  it('throws when tileUrlTransform returns a non-string value', () => {
    expect(() => buildTileURL('https://example.com/{z}/{x}/{y}.pbf', { z: 14, x: 1, y: 2 }, {
      tileUrlTransform: () => null,
    })).toThrow(/Invalid tileUrlTransform/);
  });

  it('throws for an unsupported costField in route()', async () => {
    await expect(route([0, 0], [0.001, 0], 'car', 'https://example.com/{z}/{x}/{y}.pbf', {
      costField: 'speed',
    })).rejects.toThrow(/Unknown costField/);
  });

  it('returns includeGraph result and partial graph status when graph is complete', async () => {
    mockBuildGraphAsync.mockResolvedValue({ hasMissingTiles: false, missingTileErrors: [] });
    mockComputeRoute.mockResolvedValue({
      found: true,
      cost: 123,
      path: [0, 1],
      coordinates: [[0, 0], [0, 1]],
      reason: null,
    });

    const result = await route([0, 0], [0.001, 0], 'car', 'https://example.com/{z}/{x}/{y}.pbf', {
      includeGraph: true,
    });

    expect(result.found).toBe(true);
    expect(result.graph).toEqual({ hasMissingTiles: false, missingTileErrors: [] });
    expect(result.hasMissingTiles).toBe(false);
    expect(result.reason).toBe(null);
  });

  it('returns a tile CORS error result when the route fails and missing tile CORS info exists', async () => {
    mockBuildGraphAsync.mockResolvedValue({
      hasMissingTiles: true,
      missingTileErrors: [{ code: 'MissingAllowOriginHeader', message: 'CORS blocked' }],
    });
    mockComputeRoute.mockResolvedValue({
      found: false,
      reason: 'no_path',
      cost: 0,
      path: [],
      coordinates: [],
    });

    const result = await route([0, 0], [0.001, 0], 'car', 'https://example.com/{z}/{x}/{y}.pbf');

    expect(result.found).toBe(false);
    expect(result.reason).toBe('tile_cors');
    expect(result.code).toBe('MissingAllowOriginHeader');
    expect(result.message).toBe('CORS blocked');
    expect(result.hasMissingTiles).toBe(true);
  });

  it('retries on no_path and eventually returns a successful route', async () => {
    mockBuildGraphAsync.mockResolvedValue({ hasMissingTiles: false, missingTileErrors: [] });
    mockComputeRoute
      .mockResolvedValueOnce({
        found: false,
        reason: 'no_path',
        cost: 0,
        path: [],
        coordinates: [],
      })
      .mockResolvedValueOnce({
        found: true,
        cost: 42,
        path: [0, 1],
        coordinates: [[0, 0], [0, 1]],
      });

    const result = await route([0, 0], [0.001, 0], 'car', 'https://example.com/{z}/{x}/{y}.pbf', {
      maxAutoRadius: 2,
    });

    expect(result.found).toBe(true);
    expect(mockComputeRoute).toHaveBeenCalledTimes(2);
    expect(result.cost).toBe(42);
  });

  it('returns early when a non-retry route failure reason occurs', async () => {
    mockBuildGraphAsync.mockResolvedValue({ hasMissingTiles: false, missingTileErrors: [] });
    mockComputeRoute.mockResolvedValue({
      found: false,
      reason: 'unsupported_mode',
      cost: 0,
      path: [],
      coordinates: [],
    });

    const result = await route([0, 0], [0.001, 0], 'car', 'https://example.com/{z}/{x}/{y}.pbf');

    expect(result.found).toBe(false);
    expect(result.reason).toBe('unsupported_mode');
    expect(mockComputeRoute).toHaveBeenCalledTimes(1);
  });
});

describe('dispose lifecycle', () => {
  it('cleans up the tile pool and ignores shutdown errors', () => {
    mockShutdownEngineWorker.mockImplementation(() => { throw new Error('boom'); });

    expect(() => disposeFn()).not.toThrow();
    expect(mockDisposeSharedTilePool).toHaveBeenCalled();
  });

  it('aliases shutdown to dispose', () => {
    expect(shutdownFn).toBe(disposeFn);
  });
});
