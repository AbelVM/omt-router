/* Lightweight IndexedDB helper for benchmark result persistence */
const DB_NAME = 'omp-benchmark-db';
const DB_VERSION = 4;
const STORE_RESULTS = 'results';
const STORE_RUNS = 'runs';
const STORE_METRICS = 'metrics';

let _db = null;
let _dbPromise = null;
let _pendingWrites = new Set();

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours default retention

// Detect environment IndexedDB availability and provide an in-memory
// fallback for Node/jsdom environments where `indexedDB` is not present.
const HAS_INDEXED_DB = typeof indexedDB !== 'undefined' && indexedDB !== null;

// In-memory fallback state
const _memResults = [];
const _memRuns = new Map();
const _memMetrics = new Map();
let _memAutoIncrement = 1;
let _memMetricsAutoIncrement = 1;

function openDB() {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    // centralised upgrade handler so we can re-use it for repair opens
    const upgradeHandler = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_RESULTS)) {
        const store = db.createObjectStore(STORE_RESULTS, { autoIncrement: true });
        store.createIndex('runId', 'runId', { unique: false });
        store.createIndex('ts', 'ts', { unique: false });
      } else {
        const store = ev.target.transaction.objectStore(STORE_RESULTS);
        if (!store.indexNames.contains('runId')) {
          store.createIndex('runId', 'runId', { unique: false });
        }
        if (!store.indexNames.contains('ts')) {
          store.createIndex('ts', 'ts', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        const store = db.createObjectStore(STORE_RUNS, { keyPath: 'runId' });
        store.createIndex('completed', 'completed', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      } else {
        // ensure runs indexes exist in upgrade txn as well
        const store = ev.target.transaction.objectStore(STORE_RUNS);
        if (!store.indexNames.contains('completed')) {
          store.createIndex('completed', 'completed', { unique: false });
        }
        if (!store.indexNames.contains('updatedAt')) {
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      }
      
      // add metrics store for persisting typed-array-backed graph metrics
      if (!db.objectStoreNames.contains(STORE_METRICS)) {
        const store = db.createObjectStore(STORE_METRICS, { autoIncrement: true });
        store.createIndex('ts', 'ts', { unique: false });
      } else {
        const store = ev.target.transaction.objectStore(STORE_METRICS);
        if (!store.indexNames.contains('ts')) {
          store.createIndex('ts', 'ts', { unique: false });
        }
      }
    };

    const openAndMaybeRepair = (openVersion = DB_VERSION) => {
      const req = indexedDB.open(DB_NAME, openVersion);
      req.onupgradeneeded = upgradeHandler;
      req.onsuccess = (ev) => {
        const db = ev.target.result;
        if (!db || typeof db.transaction !== 'function') {
          _dbPromise = null;
          reject(new Error('IndexedDB openDB: invalid database object'));
          return;
        }

        // verify indexes exist; if they are missing, attempt a repair by bumping the DB version.
        let needsRepair = false;
        try {
          // Validate STORE_RESULTS schema: expect no keyPath (autoIncrement)
          if (!db.objectStoreNames.contains(STORE_RESULTS)) needsRepair = true;
          else {
            const tx = db.transaction(STORE_RESULTS, 'readonly');
            const store = tx.objectStore(STORE_RESULTS);
            // If an unexpected keyPath is present (e.g. legacy schema) force repair
            if (store.keyPath !== null) {
              needsRepair = true;
            } else if (!store.indexNames.contains('runId') || !store.indexNames.contains('ts')) {
              needsRepair = true;
            }
          }

          // Validate STORE_RUNS: must exist and use keyPath 'runId'
          if (!db.objectStoreNames.contains(STORE_RUNS)) needsRepair = true;
          else {
            const tx2 = db.transaction(STORE_RUNS, 'readonly');
            const store2 = tx2.objectStore(STORE_RUNS);
            if (store2.keyPath !== 'runId') needsRepair = true;
            if (!store2.indexNames.contains('completed') || !store2.indexNames.contains('updatedAt')) needsRepair = true;
          }

          // Validate STORE_METRICS: expect no keyPath (autoIncrement) but ensure index exists
          if (!db.objectStoreNames.contains(STORE_METRICS)) {
            // metrics store is optional but create if missing
            needsRepair = true;
          } else {
            const tx3 = db.transaction(STORE_METRICS, 'readonly');
            const store3 = tx3.objectStore(STORE_METRICS);
            if (store3.keyPath !== null) needsRepair = true;
            if (!store3.indexNames.contains('ts')) needsRepair = true;
          }
        } catch (err) {
          // If any runtime error occurs while checking, treat as needing repair.
          needsRepair = true;
        }

        if (needsRepair) {
          try {
            db.close();
          } catch (_e) {}
          // bump the version to trigger onupgradeneeded and repair schema
          const repairVersion = db.version + 1;
          const repairReq = indexedDB.open(DB_NAME, repairVersion);
          repairReq.onupgradeneeded = upgradeHandler;
          repairReq.onsuccess = (e2) => {
            _db = e2.target.result;
            resolve(_db);
          };
          repairReq.onerror = (e2) => {
            _dbPromise = null;
            reject(e2.target.error);
          };
          return;
        }

        _db = db;
        resolve(_db);
      };
      req.onerror = (ev) => {
        _dbPromise = null;
        reject(ev.target.error);
      };
    };

    openAndMaybeRepair(DB_VERSION);
  });
  return _dbPromise;
}

// Export openDB as a named export so dynamic imports can access it as
// `module.openDB()` in tests and other callers.
export { openDB };

function _defer() {
  let res;
  let rej;
  const p = new Promise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  return { promise: p, resolve: res, reject: rej };
}

function _payloadShapeSummary(obj) {
  const out = {};
  try {
    if (!obj || typeof obj !== 'object') return out;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      try {
        if (v == null) out[k] = null;
        else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(v)) out[k] = `${v.constructor?.name}@${v.length}`;
        else if (v instanceof ArrayBuffer) out[k] = `ArrayBuffer@${v.byteLength}`;
        else if (Array.isArray(v)) out[k] = `array(${v.length})`;
        else if (typeof v === 'object') out[k] = `object(${Object.keys(v).length})`;
        else out[k] = typeof v;
      } catch (_e) {
        out[k] = typeof v;
      }
    }
  } catch (_e) {
    return out;
  }
  return out;
}

function normalizeResultForStorage(result) {
  if (!result || typeof result !== 'object') return {};
  const payloadResult = { ...result };

  if (payloadResult.results && typeof payloadResult.results === 'object') {
    payloadResult.results = { ...payloadResult.results };
    for (const [engineId, engineResult] of Object.entries(payloadResult.results)) {
      if (engineResult && typeof engineResult === 'object') {
        payloadResult.results[engineId] = { ...engineResult };
        delete payloadResult.results[engineId].samplesMs;
        delete payloadResult.results[engineId].sampleStats;
      }
    }
  }

  // Trim arrays that are not needed for persisted artifact generation.
  // Keep rawDiagnostics so saved benchmark artifacts can still build clustering rows.
  delete payloadResult.samplesMs;
  delete payloadResult.sampleStats;
  if (payloadResult.rawDiagnostics?.execution) {
    payloadResult.rawDiagnostics = { ...payloadResult.rawDiagnostics };
    payloadResult.rawDiagnostics.execution = { ...payloadResult.rawDiagnostics.execution };
    delete payloadResult.rawDiagnostics.execution.timingRounds;
  }

  payloadResult._passIndex = Number(payloadResult._passIndex ?? 0);
  // Defensive: strip typed-array-backed fields from any `graph` object
  if (payloadResult.graph && typeof payloadResult.graph === 'object') {
    const g = { ...payloadResult.graph };
    for (const k of Object.keys(g)) {
      const v = g[k];
      try {
        if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) delete g[k];
      } catch (_e) {
        // ignore environments without ArrayBuffer support
      }
    }
    // also drop any embedded density sampler which may hold large buffers
    delete g._densitySampler;
    payloadResult.graph = g;
  }

  return payloadResult;
}

export async function saveResultToDB(runId, passIndex, routeIndex, result) {
  const payloadResult = normalizeResultForStorage(result);
  payloadResult._passIndex = Number(passIndex ?? payloadResult._passIndex ?? 0);

  const payload = {
    runId,
    passIndex: Number(passIndex ?? 0),
    routeIndex: Number.isFinite(routeIndex) ? routeIndex : -1,
    ts: Date.now(),
    result: payloadResult,
  };

  payloadResult._insertedAt = payloadResult._insertedAt ?? payload.ts;

  if (!HAS_INDEXED_DB) {
    // Simple in-memory fallback for Node/jsdom tests.
    const id = _memAutoIncrement++;
    const record = { ...payload, id };
    _memResults.push(record);
    const p = Promise.resolve(id);
    _pendingWrites.add(p);
    p.finally(() => _pendingWrites.delete(p));
    return p;
  }

  // Avoid holding a reference to the full `result` in an in-memory
  // batching buffer. Write each result to IndexedDB immediately using
  // the open database connection and a dedicated transaction.
  const deferred = _defer();
  _pendingWrites.add(deferred.promise);

  (async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_RESULTS, 'readwrite');
      const store = tx.objectStore(STORE_RESULTS);
      let generatedId = null;

      try {
        const request = store.add(payload);
        request.onsuccess = (e) => {
          generatedId = e.target.result;
        };
        request.onerror = () => {
          // Attempt a put() fallback and emit a compact diagnostic to help
          // surface legacy schema/payload shape mismatches that cause DataError.
          try {
            const summary = _payloadShapeSummary(payload);
            console.warn('[bench-db] add() failed for STORE_RESULTS, attempting put() fallback', {
              store: STORE_RESULTS,
              keyPath: store.keyPath,
              payloadSummary: summary,
              error: request.error?.message ?? String(request.error),
            });
          } catch (_e) {}

          try {
            const putReq = store.put(payload);
            putReq.onsuccess = (e2) => {
              generatedId = e2.target.result;
            };
            putReq.onerror = () => {
              // Let tx.onerror/abort surface the final error
              deferred.reject(putReq.error || request.error || new Error('IndexedDB add/put error'));
            };
          } catch (e2) {
            deferred.reject(e2);
          }
        };
      } catch (e) {
        // Synchronous failure constructing the request -> reject early
        deferred.reject(e);
      }

      tx.oncomplete = () => deferred.resolve(generatedId);
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
  if (!HAS_INDEXED_DB) {
    const rows = _memResults.filter((r) => r.runId === runId).slice();
    rows.sort((a, b) => a.passIndex - b.passIndex || a.routeIndex - b.routeIndex);
    return Promise.resolve(rows);
  }

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
          rows.sort((a, b) => a.passIndex - b.passIndex || a.routeIndex - b.routeIndex);
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
        rows.sort((a, b) => a.passIndex - b.passIndex || a.routeIndex - b.routeIndex);
        resolve(rows);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

export async function savePreparedMetricsToDB(metrics) {
  if (!metrics) return null;

  const payload = {
    ts: Date.now(),
    metrics,
  };

  if (!HAS_INDEXED_DB) {
    const id = _memMetricsAutoIncrement++;
    _memMetrics.set(id, metrics);
    const p = Promise.resolve(id);
    _pendingWrites.add(p);
    p.finally(() => _pendingWrites.delete(p));
    return p;
  }

  const deferred = _defer();
  _pendingWrites.add(deferred.promise);

  (async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_METRICS, 'readwrite');
      const store = tx.objectStore(STORE_METRICS);
      let generatedId = null;

      try {
        const request = store.add(payload);
        request.onsuccess = (e) => {
          generatedId = e.target.result;
        };
        request.onerror = () => {
          try {
            const summary = _payloadShapeSummary(payload);
            // Provide a compact diagnostic about the metrics payload shape.
            console.warn('[bench-db] add() failed for STORE_METRICS, attempting put() fallback', {
              store: STORE_METRICS,
              keyPath: store.keyPath,
              payloadSummary: summary,
              // If metrics object contains common summary fields, include them.
              metricsSnippet: payload && payload.metrics ? {
                nodeCount: payload.metrics.nodeCount ?? payload.metrics.safeN ?? null,
                edgeCount: payload.metrics.edgeCount ?? payload.metrics.safeE ?? null,
                haversine: payload.metrics.haversineDistance ?? payload.metrics.safeBeelineKm ?? null,
              } : null,
              error: request.error?.message ?? String(request.error),
            });
          } catch (_e) {}

          try {
            const putReq = store.put(payload);
            putReq.onsuccess = (e2) => {
              generatedId = e2.target.result;
            };
            putReq.onerror = () => {
              deferred.reject(putReq.error || request.error || new Error('IndexedDB add/put error'));
            };
          } catch (e2) {
            deferred.reject(e2);
          }
        };
      } catch (e) {
        deferred.reject(e);
      }

      tx.oncomplete = () => deferred.resolve(generatedId);
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

export async function getMetricsById(metricsId) {
  if (!metricsId && metricsId !== 0) return null;
  if (!HAS_INDEXED_DB) {
    return Promise.resolve(_memMetrics.get(Number(metricsId)) ?? null);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METRICS, 'readonly');
    const store = tx.objectStore(STORE_METRICS);
    const req = store.get(Number(metricsId));
    req.onsuccess = () => resolve(req.result ? req.result.metrics : null);
    req.onerror = () => reject(req.error);
  });
}

export async function getRunRecordCount(runId) {
  if (!HAS_INDEXED_DB) {
    const count = _memResults.reduce((acc, r) => (r.runId === runId ? acc + 1 : acc), 0);
    return Promise.resolve(count);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readonly');
    const store = tx.objectStore(STORE_RESULTS);
    if (!store.indexNames.contains('runId')) {
      const req = store.openCursor();
      let count = 0;
      req.onsuccess = (e) => {
        const c = e.target.result;
        if (c) {
          if (c.value.runId === runId) count += 1;
          c.continue();
        } else {
          resolve(count);
        }
      };
      req.onerror = () => reject(req.error);
      return;
    }
    const idx = store.index('runId');
    const req = idx.count(runId);
    req.onsuccess = () => resolve(req.result ?? 0);
    req.onerror = () => reject(req.error);
  });
}

export async function getRecordsForRunPage(runId, { page = 1, pageSize = 250, sortCol = '_insertedAt', sortAsc = false } = {}) {
  if (!HAS_INDEXED_DB) {
    const offset = Math.max(0, (page - 1) * pageSize);
    const rowsAll = _memResults.filter((r) => r.runId === runId).slice();
    // Simple sort by passIndex, routeIndex when paging.
    rowsAll.sort((a, b) => a.passIndex - b.passIndex || a.routeIndex - b.routeIndex);
    const pageRows = rowsAll.slice(offset, offset + pageSize);
    return Promise.resolve(pageRows);
  }

  const db = await openDB();
  const offset = Math.max(0, (page - 1) * pageSize);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readonly');
    const store = tx.objectStore(STORE_RESULTS);
    const rows = [];
    const options = sortAsc ? 'next' : 'prev';

    const openCursor = () => {
      const useRunIdIndex = sortCol === '_insertedAt' || sortCol === 'ts';
      if (useRunIdIndex && store.indexNames.contains('runId')) {
        const idx = store.index('runId');
        return idx.openCursor(IDBKeyRange.only(runId), options);
      }
      return store.openCursor();
    };

    const cursorReq = openCursor();
    let skipped = 0;
    cursorReq.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        const value = c.value;
        if (value.runId === runId) {
          if (skipped < offset) {
            skipped += 1;
            c.continue();
            return;
          }
          rows.push(value);
          if (rows.length >= pageSize) {
            resolve(rows);
            return;
          }
        }
        c.continue();
      } else {
        resolve(rows);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

export async function streamRunRecords(runId, onRecord) {
  if (!HAS_INDEXED_DB) {
    try {
      for (const v of _memResults) {
        if (v.runId === runId) onRecord(v);
      }
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readonly');
    const store = tx.objectStore(STORE_RESULTS);
    const idx = store.indexNames.contains('runId') ? store.index('runId') : null;
    const cursorReq = idx
      ? idx.openCursor(IDBKeyRange.only(runId))
      : store.openCursor();

    cursorReq.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        const value = c.value;
        if (!idx && value.runId !== runId) {
          c.continue();
          return;
        }
        try {
          onRecord(value);
        } catch (err) {
          reject(err);
          return;
        }
        c.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

export async function waitForPendingWrites() {
  while (_pendingWrites.size > 0) {
    await Promise.allSettled(Array.from(_pendingWrites));
  }
}

export async function deleteRunRecords(runId) {
  if (!HAS_INDEXED_DB) {
    for (let i = _memResults.length - 1; i >= 0; i--) {
      if (_memResults[i].runId === runId) _memResults.splice(i, 1);
    }
    return Promise.resolve();
  }

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

export async function saveRunMetadata(runId, metadata = {}) {
  if (!runId) return undefined;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RUNS, 'readwrite');
    const store = tx.objectStore(STORE_RUNS);
    const existingReq = store.get(runId);
    existingReq.onsuccess = (event) => {
      const existing = event.target.result || {};
      const now = Date.now();
      const payload = {
        runId,
        createdAt: existing.createdAt ?? metadata.createdAt ?? now,
        completed: metadata.completed ?? existing.completed ?? false,
        completedAt: metadata.completedAt ?? existing.completedAt ?? null,
        artifactPaths: Array.isArray(metadata.artifactPaths)
          ? metadata.artifactPaths
          : existing.artifactPaths ?? [],
        ...existing,
        ...metadata,
        updatedAt: Math.max(existing.updatedAt ?? 0, now) + 1,
      };
      const request = store.put(payload);
      request.onsuccess = () => resolve(payload);
      request.onerror = () => reject(request.error);
    };
    existingReq.onerror = () => reject(existingReq.error);
  });
}

export async function getRunMetadata(runId) {
  if (!runId) return undefined;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RUNS, 'readonly');
    const store = tx.objectStore(STORE_RUNS);
    const req = store.get(runId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function findIncompleteRunMetadata() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RUNS, 'readonly');
    const store = tx.objectStore(STORE_RUNS);
    const req = store.openCursor();
    let latest = null;
    req.onsuccess = (e) => {
      const c = e.target.result;
      if (c) {
        const value = c.value;
        if (!value.completed) {
          if (!latest || (value.updatedAt || 0) > (latest.updatedAt || 0)) {
            latest = value;
          }
        }
        c.continue();
      } else {
        resolve(latest);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  if (!HAS_INDEXED_DB) {
    _memResults.length = 0;
    _memRuns.clear();
    _memMetrics.clear();
    return Promise.resolve();
  }

  const db = await openDB();
  await Promise.all([
    clearStore(db, STORE_RESULTS),
    clearStore(db, STORE_RUNS),
    clearStore(db, STORE_METRICS),
  ]);
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
  const { clearAll: clear = false, resume = false, ttlMs = TTL_MS } = options;

  try {
    await openDB();
  } catch (e) {
    console.warn('[bench-db] prepareForRun: openDB failed:', e);
  }

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

  if (!resume) {
    // ensure no leftover records for this run id
    try {
      await deleteRunRecords(runId);
    } catch (_e) {
      /* best-effort */
    }
  }
}

// Run a TTL-driven purge on module load, but only if the last purge time is older than TTL.
const LAST_PURGE_KEY = 'omp_bench_db_last_purge_v1';
function _maybePurgeOnLoad() {
  try {
    // Only attempt a background purge when both localStorage and
    // IndexedDB are available. In Node/jsdom test environments this
    // prevents import-time calls to `indexedDB.open`.
    if (typeof localStorage === 'undefined' || typeof indexedDB === 'undefined') return;

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
    // ignore localStorage/indexedDB errors
  }
}

export async function disposeBenchDb() {
  try {
    await waitForPendingWrites();
  } catch (e) {
    console.warn('[bench-db] disposeBenchDb: waitForPendingWrites error:', e);
  }

  if (_db) {
    try {
      _db.close();
    } catch (_e) {
      /* ignore */
    }
    _db = null;
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
  savePreparedMetricsToDB,
  getMetricsById,
};
