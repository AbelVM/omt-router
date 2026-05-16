/* Lightweight IndexedDB helper for benchmark result persistence */
const DB_NAME = 'omp-benchmark-db';
const DB_VERSION = 1;
const STORE_RESULTS = 'results';

let _dbPromise = null;
let _pendingWrites = new Set();

// batching / retention defaults
const BATCH_SIZE = 20;
const FLUSH_MS = 200; // flush interval in ms
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours default retention

let _buffer = [];
let _flushTimer = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_RESULTS)) {
        const store = db.createObjectStore(STORE_RESULTS, { keyPath: 'id' });
        store.createIndex('runId', 'runId', { unique: false });
        store.createIndex('ts', 'ts', { unique: false });
      } else {
        // attempt to add missing indexes during upgrades
        try {
          const txStore = ev.target.transaction.objectStore(STORE_RESULTS);
          if (!txStore.indexNames.contains('runId')) txStore.createIndex('runId', 'runId', { unique: false });
          if (!txStore.indexNames.contains('ts')) txStore.createIndex('ts', 'ts', { unique: false });
        } catch (_e) {
          // ignore — best-effort index creation
        }
      }
    };
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = (ev) => reject(ev.target.error);
  });
  return _dbPromise;
}

function _makeId(runId, passIndex, routeIndex) {
  const ri = Number.isFinite(routeIndex) ? routeIndex : 'x';
  const pi = Number.isFinite(passIndex) ? passIndex : '0';
  return `${runId}:${pi}:${ri}`;
}

function _defer() {
  let res;
  let rej;
  const p = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  return { promise: p, resolve: res, reject: rej };
}

async function _flushBuffer() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  if (_buffer.length === 0) return;
  const batch = _buffer.splice(0, _buffer.length);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_RESULTS, 'readwrite');
      const store = tx.objectStore(STORE_RESULTS);
      for (const item of batch) {
        try {
          store.put(item.payload);
        } catch (err) {
          // synchronous error for this item — reject it immediately
          try {
            item.deferred.reject(err);
          } catch (_e) {
            /* ignore */
          }
        }
      }

      tx.oncomplete = () => {
        for (const item of batch) {
          try {
            item.deferred.resolve(item.payload.id);
          } catch (_e) {
            /* ignore */
          }
        }
        resolve();
      };

      tx.onabort = tx.onerror = () => {
        const err = tx.error || new Error('IndexedDB transaction error');
        for (const item of batch) {
          try {
            item.deferred.reject(err);
          } catch (_e) {
            /* ignore */
          }
        }
        reject(err);
      };
    } catch (err) {
      for (const item of batch) {
        try {
          item.deferred.reject(err);
        } catch (_e) {
          /* ignore */
        }
      }
      reject(err);
    }
  });
}

export async function saveResultToDB(runId, passIndex, routeIndex, result) {
  const id = _makeId(runId, passIndex, routeIndex);
  const payload = {
    id,
    runId,
    passIndex: Number(passIndex ?? 0),
    routeIndex: Number.isFinite(routeIndex) ? routeIndex : -1,
    ts: Date.now(),
    result,
  };

  // Avoid holding a reference to the full `result` in an in-memory
  // batching buffer. Write each result to IndexedDB immediately using
  // its own transaction so there is no long-lived JS-side reference
  // to potentially huge diagnostic/graph objects.
  const deferred = _defer();
  _pendingWrites.add(deferred.promise);

  (async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_RESULTS, 'readwrite');
      const store = tx.objectStore(STORE_RESULTS);
      try {
        store.put(payload);
      } catch (err) {
        // synchronous structured-clone errors
        deferred.reject(err);
        return;
      }

      tx.oncomplete = () => deferred.resolve(payload.id);
      tx.onabort = tx.onerror = () => {
        const err = tx.error || new Error('IndexedDB transaction error');
        deferred.reject(err);
      };
    } catch (err) {
      deferred.reject(err);
    }
  })();

  deferred.promise.finally(() => _pendingWrites.delete(deferred.promise));
  return deferred.promise;
}

export async function getRecordsForRun(runId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readonly');
    const store = tx.objectStore(STORE_RESULTS);
    if (!store.indexNames.contains('runId')) {
      // fallback: iterate all
      const reqAll = store.openCursor();
      const rows = [];
      reqAll.onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          const v = c.value;
          if (v.runId === runId) rows.push(v);
          c.continue();
        } else {
          rows.sort((a, b) => (a.passIndex - b.passIndex) || (a.routeIndex - b.routeIndex));
          resolve(rows);
        }
      };
      reqAll.onerror = () => reject(reqAll.error);
      return;
    }

    const idx = store.index('runId');
    const cursorReq = idx.openCursor(IDBKeyRange.only(runId));
    const rows = [];
    cursorReq.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        rows.push(c.value);
        c.continue();
      } else {
        rows.sort((a, b) => (a.passIndex - b.passIndex) || (a.routeIndex - b.routeIndex));
        resolve(rows);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

export async function waitForPendingWrites() {
  // ensure any buffered items are flushed first
  if (_buffer.length > 0) {
    try {
      await _flushBuffer();
    } catch (e) {
      console.warn('[bench-db] flush error in waitForPendingWrites:', e);
    }
  }
  await Promise.allSettled(Array.from(_pendingWrites));
}

export async function deleteRunRecords(runId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    const store = tx.objectStore(STORE_RESULTS);
    const idx = store.index('runId');
    const req = idx.openCursor(IDBKeyRange.only(runId));
    req.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        c.delete();
        c.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    const store = tx.objectStore(STORE_RESULTS);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function purgeOld(ttlMs = TTL_MS) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    const store = tx.objectStore(STORE_RESULTS);
    if (!store.indexNames.contains('ts')) {
      resolve();
      return;
    }
    const idx = store.index('ts');
    const cutoff = Date.now() - ttlMs;
    const req = idx.openCursor(IDBKeyRange.upperBound(cutoff));
    req.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        c.delete();
        c.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function prepareForRun(runId, options = {}) {
  const { clearAll: clear = false, ttlMs = TTL_MS } = options;
  // flush any buffered writes first
  try {
    await waitForPendingWrites();
  } catch (e) {
    // continue — we still attempt pruning/clear
    console.warn('[bench-db] prepareForRun: waitForPendingWrites error:', e);
  }

  if (clear) {
    try {
      await clearAll();
    } catch (e) {
      console.warn('[bench-db] prepareForRun: clearAll failed:', e);
    }
  } else {
    try {
      await purgeOld(ttlMs);
    } catch (e) {
      console.warn('[bench-db] prepareForRun: purgeOld failed:', e);
    }
  }

  // ensure no leftover records for this run id
  try {
    await deleteRunRecords(runId);
  } catch (_e) {
    /* best-effort */
  }
}

// Run a TTL-driven purge on module load, but only if the last purge time is older than TTL.
const LAST_PURGE_KEY = 'omp_bench_db_last_purge_v1';
function _maybePurgeOnLoad() {
  try {
    const last = Number.parseInt(localStorage.getItem(LAST_PURGE_KEY) || '0', 10) || 0;
    if (Date.now() - last > TTL_MS) {
      // don't await — run best-effort in background
      purgeOld()
        .then(() => {
          try {
            localStorage.setItem(LAST_PURGE_KEY, String(Date.now()));
          } catch (_e) {
            /* ignore */
          }
        })
        .catch(() => {
          /* ignore purge errors */
        });
    }
  } catch (_e) {
    // ignore localStorage errors
  }
}

export async function disposeBenchDb() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }

  _buffer.length = 0;

  try {
    await waitForPendingWrites();
  } catch (e) {
    console.warn('[bench-db] disposeBenchDb: waitForPendingWrites error:', e);
  }

  _dbPromise = null;
}

_maybePurgeOnLoad();

export default {
  openDB,
  saveResultToDB,
  getRecordsForRun,
  waitForPendingWrites,
  deleteRunRecords,
  clearAll,
  purgeOld,
  prepareForRun,
  disposeBenchDb,
};
