import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('tilePool module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws when no Web Worker implementation is available', async () => {
    const { getSharedTilePool } = await import('../src/tiles/tilePool.js');
    expect(() => getSharedTilePool()).toThrow('Web Worker is not available in this environment.');
  });

  it('creates and disposes a shared pool when Worker is available', async () => {
    vi.stubGlobal('Worker', class WorkerStub {});
    vi.doMock('../src/tiles/tilesWorker?worker&inline.js', () => ({
      default: class WorkerThread {},
    }));

    const { getSharedTilePool, disposeSharedTilePool } = await import('../src/tiles/tilePool.js');
    const pool = getSharedTilePool();
    expect(pool).toBeDefined();

    disposeSharedTilePool();
    expect(() => disposeSharedTilePool()).not.toThrow();

    const secondPool = getSharedTilePool();
    expect(secondPool).toBeDefined();
    expect(secondPool).not.toBe(pool);
    disposeSharedTilePool();
  });
});
