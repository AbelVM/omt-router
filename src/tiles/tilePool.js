import { PowerPool } from 'performance-helpers/powerPool';
import tilesWorker from './tilesWorker?worker&inline.js';

const _hwConcurrency =
  typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
const TILE_POOL_MAX_SIZE = Math.min(8, Math.max(1, _hwConcurrency - 1));
const TILE_POOL_BASE_SIZE = Math.min(2, TILE_POOL_MAX_SIZE);
let _pool = null;
const IS_WORKER_AVAILABLE = typeof Worker !== 'undefined';

export function getSharedTilePool() {
  if (_pool) return _pool;
  if (!IS_WORKER_AVAILABLE) {
    throw new Error('Web Worker is not available in this environment.');
  }

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

export function disposeSharedTilePool() {
  if (!_pool) return;
  try {
    _pool.shutdown();
  } finally {
    _pool = null;
  }
}
