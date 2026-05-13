/**
 * Tile worker pool manager for tile parsing and tile-fetch coordination.
 * This module exports a shared PowerPool used by the application to parse tiles
 * in background workers without creating excessive worker instances.
 * @module src/tiles/tilePool
 */
import { PowerPool } from 'performance-helpers/powerPool';
import tilesWorker from './tilesWorker?worker&inline.js';

const _hwConcurrency =
  typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
const TILE_POOL_MAX_SIZE = Math.min(8, Math.max(1, _hwConcurrency - 1));
const TILE_POOL_BASE_SIZE = Math.min(2, TILE_POOL_MAX_SIZE);
let _pool = null;
const IS_WORKER_AVAILABLE = typeof Worker !== 'undefined';

/**
 * Get the shared tile worker pool.
 * Creates the pool on first invocation and returns the cached instance afterwards.
 * @returns {import('performance-helpers/powerPool').PowerPool}
 */
export function getSharedTilePool() {
  if (_pool) return _pool;
  if (!IS_WORKER_AVAILABLE) {
    throw new Error('Web Worker is not available in this environment.');
  }

  /**
   * Create the shared tile parsing pool lazily and return it.
   * @returns {import('performance-helpers/powerPool').PowerPool}
   */
  _pool = new PowerPool(tilesWorker, {
    size: TILE_POOL_BASE_SIZE,
    maxSize: TILE_POOL_MAX_SIZE,
    lazy: true,
    autoScale: {
      intervalMs: 350,
      targetMs: 55,
      alpha: 0.32,
      cooldownMs: 1_200,
      hysteresis: 0.2,
      stepUp: 2,
      stepDown: 1,
      backoffFactor: 1.5,
      backoffMaxMultiplier: 4,
      backoffResetMs: 6_000,
    },
    idleTimeout: 30_000,
  });

  return _pool;
}

/**
 * Dispose of the shared tile worker pool and reset internal state.
 * Safe to call multiple times.
 * @returns {void}
 */
export function disposeSharedTilePool() {
  if (!_pool) return;
  try {
    _pool.shutdown();
  } finally {
    _pool = null;
  }
}
