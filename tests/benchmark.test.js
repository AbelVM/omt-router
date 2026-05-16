/**
 * @vitest-environment jsdom
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

function buildMinimalBenchmarkDOM() {
  document.body.innerHTML = `
    <div id="category-filters"></div>
    <div id="length-filters"></div>
    <input id="success-routes-input" />
    <input id="route-count" />
    <button id="run-btn" type="button"></button>
    <button id="stop-btn" type="button"></button>
    <div id="progress-section"></div>
    <div id="results-section"></div>
    <table id="results-table"><thead><tr><th data-col="name"></th></tr></thead><tbody id="results-tbody"></tbody></table>
    <div id="summary-cards"></div>
    <table id="summary-table"><thead id="summary-thead"></thead><tbody id="summary-tbody"></tbody></table>
    <div id="cost-summary-cards"></div>
    <table id="cost-summary-table"><thead id="cost-summary-thead"></thead><tbody id="cost-summary-tbody"></tbody></table>
    <div id="auto-selector-summary"></div>
    <div id="auto-selector-cards"></div>
    <div id="progress-bar"></div>
    <div id="progress-text"></div>
    <div id="results-run-context"></div>
    <div id="benchmark-stopwatch"></div>
    <div id="scatter"></div>
    <div id="density"></div>
    <div id="histogram"></div>
    <div id="bubble"></div>
    <input id="url-input" />
    <div id="pagination-controls"></div>
    <div id="pagination-info"></div>
    <button id="pagination-prev" type="button"></button>
    <button id="pagination-next" type="button"></button>
    <select id="mode-select"></select>
    <input id="runs-input" />
    <input id="pause-input" />
    <button id="pause-btn" type="button"></button>
    <button id="download-btn" type="button"></button>
    <button id="report-btn" type="button"></button>
    <button id="copy-report-btn" type="button"></button>
    <div id="report-panel"></div>
    <div id="report-type-controls"></div>
    <select id="report-view-select"></select>
    <div id="report-status"></div>
    <div id="report-note"></div>
    <textarea id="report-output"></textarea>
    <div id="pause-state"></div>
    <div id="suggestion-wrap"></div>
  `;
}

function createFakeIndexedDB() {
  const databases = new Map();

  class FakeIDBObjectStore {
    constructor(name, options = {}) {
      this.name = name;
      this.keyPath = options.keyPath;
      this.autoIncrement = options.autoIncrement;
      this.records = [];
      this.indexes = new Map();
      const indexNames = new Set();
      this.indexNames = {
        contains: (indexName) => indexNames.has(indexName),
        add: (indexName) => indexNames.add(indexName),
        item: (index) => Array.from(indexNames)[index] ?? null,
        get size() {
          return indexNames.size;
        },
      };
    }

    add(value) {
      const request = {};
      Promise.resolve().then(() => {
        const cloned = JSON.parse(JSON.stringify(value));
        if (this.autoIncrement) {
          const id = this.records.length + 1;
          cloned.id = id;
        }
        this.records.push(cloned);
        request.result = cloned.id ?? cloned[this.keyPath];
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request });
        }
      });
      return request;
    }

    createIndex(name, keyPath, options) {
      const index = new FakeIDBIndex(this, name, keyPath, options);
      this.indexes.set(name, index);
      this.indexNames.add(name);
      return index;
    }

    index(name) {
      return this.indexes.get(name);
    }

    openCursor(range) {
      const request = {};
      Promise.resolve().then(() => {
        const records = this.records.filter((record) => {
          if (!range) return true;
          if (range.type === 'only') {
            return record[range.valueKey] === range.value;
          }
          if (range.type === 'upperBound') {
            return record[range.valueKey] <= range.value;
          }
          return true;
        });

        const cursor =
          records.length > 0 ? new FakeIDBCursor(records, this.records, request) : null;
        request.result = cursor;
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request });
        }
      });
      return request;
    }

    clear() {
      const request = {};
      Promise.resolve().then(() => {
        this.records = [];
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request });
        }
      });
      return request;
    }
  }

  class FakeIDBIndex {
    constructor(store, name, keyPath, options = {}) {
      this.store = store;
      this.name = name;
      this.keyPath = keyPath;
      this.options = options;
    }

    openCursor(range) {
      const request = {};
      Promise.resolve().then(() => {
        const filtered = this.store.records.filter((record) => {
          if (!range) return true;
          const value = record[this.keyPath];
          if (range.type === 'only') {
            return value === range.value;
          }
          if (range.type === 'upperBound') {
            return value <= range.value;
          }
          return true;
        });
        const cursor =
          filtered.length > 0 ? new FakeIDBCursor(filtered, this.store.records, request) : null;
        request.result = cursor;
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request });
        }
      });
      return request;
    }
  }

  class FakeIDBCursor {
    constructor(records, sourceRecords, request) {
      this.records = records;
      this.sourceRecords = sourceRecords;
      this.index = 0;
      this.value = this.records.length > 0 ? this.records[0] : null;
      this._request = request;
      this._deleted = false;
      if (this._request) {
        this._request.result = this.value ? this : null;
      }
    }

    continue() {
      Promise.resolve().then(() => {
        if (!this._deleted) {
          this.index += 1;
        }
        this._deleted = false;

        if (this.index < this.records.length) {
          this.value = this.records[this.index];
        } else {
          this.value = null;
        }
        if (this._request) {
          this._request.result = this.value ? this : null;
        }
        if (this._request && typeof this._request.onsuccess === 'function') {
          this._request.onsuccess({ target: this._request });
        }
      });
      return this._request;
    }

    delete() {
      if (this.value === null) return;
      const sourceIndex = this.sourceRecords.indexOf(this.value);
      if (sourceIndex !== -1) {
        this.sourceRecords.splice(sourceIndex, 1);
      }
      this.records.splice(this.index, 1);
      this.value = this.records[this.index] ?? null;
      this._deleted = true;
      if (this._request) {
        this._request.result = this.value ? this : null;
      }
    }
  }

  class FakeIDBTransaction {
    constructor(db, storeNames, mode) {
      this.db = db;
      this.mode = mode;
      this._oncomplete = null;
      this._onerror = null;
      this._onabort = null;
      this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
      this._completed = false;

      Promise.resolve().then(() => {
        this._completed = true;
        if (typeof this._oncomplete === 'function') {
          this._oncomplete({ target: this });
        }
      });
    }

    get oncomplete() {
      return this._oncomplete;
    }

    set oncomplete(fn) {
      this._oncomplete = fn;
      if (fn && this._completed) {
        fn({ target: this });
      }
    }

    get onerror() {
      return this._onerror;
    }

    set onerror(fn) {
      this._onerror = fn;
    }

    get onabort() {
      return this._onabort;
    }

    set onabort(fn) {
      this._onabort = fn;
    }

    objectStore(name) {
      return this.db.objectStores.get(name);
    }
  }

  class FakeIDBDatabase {
    constructor(name, version) {
      this.name = name;
      this.version = version;
      this.objectStores = new Map();
      const names = new Set();
      this.objectStoreNames = {
        contains: (storeName) => names.has(storeName),
        add: (storeName) => names.add(storeName),
        delete: (storeName) => names.delete(storeName),
        get size() {
          return names.size;
        },
        item: (index) => Array.from(names)[index] ?? null,
      };
    }

    createObjectStore(name, options = {}) {
      const objectStore = new FakeIDBObjectStore(name, options);
      this.objectStores.set(name, objectStore);
      this.objectStoreNames.add(name);
      return objectStore;
    }

    transaction(storeName, mode = 'readonly') {
      return new FakeIDBTransaction(this, storeName, mode);
    }

    close() {}
  }

  return {
    open(name, version = 1) {
      const request = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      Promise.resolve().then(() => {
        const existing = databases.get(name);
        const oldVersion = existing ? existing.version : 0;
        if (!existing || version > oldVersion) {
          const db = new FakeIDBDatabase(name, version);
          const event = {
            target: { result: db, transaction: null, oldVersion, newVersion: version },
          };
          if (typeof request.onupgradeneeded === 'function') {
            request.onupgradeneeded(event);
          }
          databases.set(name, { version, db });
          if (typeof request.onsuccess === 'function') {
            request.onsuccess({ target: { result: db } });
          }
        } else {
          if (typeof request.onsuccess === 'function') {
            request.onsuccess({ target: { result: existing.db } });
          }
        }
      });

      return request;
    },
  };
}

function createFetchMock() {
  const saveResults = [];
  const fetchMock = vi.fn(async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/__benchmark/save-results')) {
      const path = `artifact-${saveResults.length + 1}.json`;
      saveResults.push({ url, init, path });
      return {
        ok: true,
        json: async () => ({ path }),
      };
    }

    return {
      ok: true,
      json: async () => ({ tiles: ['https://fake.tiles/{z}/{x}/{y}.pbf'] }),
    };
  });
  fetchMock.savedResults = saveResults;
  return fetchMock;
}

function setupFetchAndDOM() {
  buildMinimalBenchmarkDOM();
  const fetchMock = createFetchMock();
  window.fetch = fetchMock;
  return fetchMock;
}

describe('Benchmark report artifact generation', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    delete global.indexedDB;
    delete global.IDBKeyRange;
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tiles: ['https://fake.tiles/{z}/{x}/{y}.pbf'] }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../benchmark/assets/benchmark.js');
    vi.doUnmock('chart.js/auto');
  });

  it('persists and retrieves run results from IndexedDB across requests', async () => {
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-1', { clearAll: true });

    await benchDb.saveResultToDB('run-1', 1, 1, { id: 'row-a', score: 10 });
    await benchDb.saveResultToDB('run-1', 0, 2, { id: 'row-b', score: 20 });
    await benchDb.waitForPendingWrites();

    const rows = await benchDb.getRecordsForRun('run-1');
    expect(rows.map((row) => row.result.id)).toEqual(['row-b', 'row-a']);
    expect(rows[0].passIndex).toBe(0);
    expect(rows[1].passIndex).toBe(1);

    await benchDb.deleteRunRecords('run-1');
    const emptyRows = await benchDb.getRecordsForRun('run-1');
    expect(emptyRows).toEqual([]);
  });

  it('reconstructs _insertedAt metadata when loading DB-only results for report generation', async () => {
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-ts', { clearAll: true });
    await benchDb.saveResultToDB('run-ts', 0, 0, { id: 'row-ts' });
    await benchDb.waitForPendingWrites();

    const rows = await benchDb.getRecordsForRun('run-ts');
    expect(rows[0].result._insertedAt).toBeDefined();
    expect(rows[0].result._insertedAt).toBeGreaterThan(0);

    setupFetchAndDOM();
    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-ts');
    const results = await benchmark.getReportResults();
    expect(results[0]._insertedAt).toBe(rows[0].result._insertedAt);
  });

  it('resolves purgeOld when ts index is unavailable', async () => {
    vi.resetModules();
    global.indexedDB = {
      open() {
        const req = {};
        setTimeout(() => {
          req.result = {
            transaction() {
              return {
                objectStore() {
                  return {
                    indexNames: { contains: () => false },
                  };
                },
              };
            },
          };
          req.onsuccess({ target: req });
        }, 0);
        return req;
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await expect(benchDb.purgeOld(1)).resolves.toBeUndefined();
  });

  it('continues when openDB fails during prepareForRun', async () => {
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    global.indexedDB = {
      open() {
        const req = {};
        setTimeout(() => {
          req.error = new Error('open failed');
          req.onerror({ target: req });
        }, 0);
        return req;
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await expect(benchDb.prepareForRun('run-error', { clearAll: true, ttlMs: 1 })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('closes the database and resets internal state without throwing', async () => {
    vi.resetModules();
    global.indexedDB = {
      open() {
        const req = {};
        setTimeout(() => {
          req.result = { close: () => {
            throw new Error('close failed');
          } };
          req.onsuccess({ target: req });
        }, 0);
        return req;
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-close', { clearAll: true });
    await expect(benchDb.disposeBenchDb()).resolves.toBeUndefined();
  });

  it('loads report results from IndexedDB when a current run is active', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-123', { clearAll: true });
    await benchDb.saveResultToDB('run-123', 0, 0, { id: 'db-row' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-123');
    const results = await benchmark.getReportResults();

    expect(results).toMatchObject([
      { runId: 'run-123', passIndex: 0, routeIndex: 0, id: 'db-row' },
    ]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('saves per-pass artifacts when DB-loaded results have passIndex but no _passIndex', async () => {
    setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-1', { clearAll: true });
    await benchDb.saveResultToDB('run-1', 0, 0, { id: 'db-row-0', _passIndex: 0 });
    await benchDb.saveResultToDB('run-1', 1, 1, { id: 'db-row-1', _passIndex: 1 });
    await benchDb.waitForPendingWrites();

    const results = await benchDb.getRecordsForRun('run-1');
    const normalizedResults = results.map((row) => ({
      ...row.result,
      runId: row.runId,
      passIndex: row.passIndex,
      routeIndex: row.routeIndex,
    }));

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);

    const savedPaths = await benchmark.saveRunArtifacts(normalizedResults, { runId: 'run-1' });
    expect(savedPaths).toHaveLength(2);
  });

  it('saves per-pass artifacts when DB-loaded results use one-based pass indices', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-onebased', { clearAll: true });
    await benchDb.saveResultToDB('run-onebased', 0, 0, { id: 'db-row-0', _passIndex: 1 });
    await benchDb.saveResultToDB('run-onebased', 1, 1, { id: 'db-row-1', _passIndex: 2 });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'bad-row' }], {
      runId: 'run-onebased',
    });
    expect(savedPaths).toHaveLength(2);

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payload1 = JSON.parse(saveCalls[0][1].body).payload;
    const payload2 = JSON.parse(saveCalls[1][1].body).payload;
    expect(payload1.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-0' }));
    expect(payload2.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-1' }));
    expect(payload1.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
    expect(payload2.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
  });

  it('loads DB-only results when saving artifacts for a runId provided in context', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-2', { clearAll: true });
    await benchDb.saveResultToDB('run-2', 0, 0, { id: 'db-row-0' });
    await benchDb.saveResultToDB('run-2', 1, 1, { id: 'db-row-1' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'bad-row' }], {
      runId: 'run-2',
    });
    expect(savedPaths).toHaveLength(2);

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payload1 = JSON.parse(saveCalls[0][1].body).payload;
    const payload2 = JSON.parse(saveCalls[1][1].body).payload;
    expect(payload1.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-0' }));
    expect(payload2.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-1' }));
    expect(payload1.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
    expect(payload2.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
  });

  it('loads both pass results from IndexedDB for the current run', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-both-passes', { clearAll: true });
    await benchDb.saveResultToDB('run-both-passes', 0, 0, { id: 'db-row-0', _passIndex: 0 });
    await benchDb.saveResultToDB('run-both-passes', 1, 1, { id: 'db-row-1', _passIndex: 1 });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-both-passes');

    const results = await benchmark.getReportResults();
    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'db-row-0', _passIndex: 0 }),
        expect.objectContaining({ id: 'db-row-1', _passIndex: 1 }),
      ])
    );
  });

  it('loads DB-only results when saving artifacts for the current run', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-1', { clearAll: true });
    await benchDb.saveResultToDB('run-1', 0, 0, { id: 'db-row-0' });
    await benchDb.saveResultToDB('run-1', 1, 1, { id: 'db-row-1' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);
    benchmark.setCurrentRunId('run-1');

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'bad-row' }], {
      runId: 'run-1',
    });
    expect(savedPaths).toHaveLength(2);

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payload1 = JSON.parse(saveCalls[0][1].body).payload;
    const payload2 = JSON.parse(saveCalls[1][1].body).payload;
    expect(payload1.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-0' }));
    expect(payload2.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-1' }));
    expect(payload1.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
    expect(payload2.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
  });

  it('loads DB-only partial run results and saves empty pass artifacts for missing passes', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-partial-stop', { clearAll: true });
    await benchDb.saveResultToDB('run-partial-stop', 0, 0, {
      id: 'db-row-0',
      _passIndex: 0,
      _sab: true,
    });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-partial-stop');
    benchmark.setPassContexts([
      { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
      { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
    ]);

    const savedPaths = await benchmark.saveRunArtifacts([], { runId: 'run-partial-stop' });
    expect(savedPaths).toHaveLength(2);
    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    const parallelPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'parallel');
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');

    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([
      expect.objectContaining({ id: 'db-row-0', _sab: true }),
    ]);
    expect(serialPayload.rawResults).toEqual([]);
  });

  it('skips empty per-pass artifacts when one pass has no results', async () => {
    const fetchMock = setupFetchAndDOM();
    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
      { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
    ]);

    const savedPaths = await benchmark.saveRunArtifacts([
      { _passIndex: 0, _sab: true, route: 'route-a' },
    ]);

    expect(savedPaths).toHaveLength(2);
    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);
    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    const parallelPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'parallel');
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');
    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([
      expect.objectContaining({ route: 'route-a', _sab: true }),
    ]);
    expect(parallelPayload.overview.routesRun).toBe(1);
    expect(serialPayload.rawResults).toEqual([]);
    expect(serialPayload.overview.routesRun).toBe(0);
  });

  it('does not create empty pass report variants for missing pass results', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.setPassContexts([
        { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
        { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
      ]);

      const variants = benchmark.createReportVariants([
        { _passIndex: 0, route: 'route-a' },
      ]);
      expect(variants.find((variant) => variant.key === 'sab_off')).toBeUndefined();
      expect(variants.find((variant) => variant.key === 'sab_on')).toBeDefined();
    });

    it('does not create empty pass report variants when SAB metadata is used without pass contexts', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.setPassContexts(null);

      const variants = benchmark.createReportVariants([
        { _passIndex: 0, _sab: true, route: 'route-a' },
      ]);
      expect(variants.find((variant) => variant.key === 'sab_off')).toBeUndefined();
      expect(variants.find((variant) => variant.key === 'sab_on')).toBeDefined();
    });

    it('saves per-pass artifacts from DB SAB metadata when no pass context is available', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-sab-db', { clearAll: true });
    await benchDb.saveResultToDB('run-sab-db', 0, 0, { id: 'db-row-0', _sab: true });
    await benchDb.saveResultToDB('run-sab-db', 1, 1, { id: 'db-row-1', _sab: false });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-sab-db');

    const savedPaths = await benchmark.saveRunArtifacts([], { runId: 'run-sab-db' });
    expect(savedPaths).toHaveLength(2);

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payload1 = JSON.parse(saveCalls[0][1].body).payload;
    const payload2 = JSON.parse(saveCalls[1][1].body).payload;
    expect(payload1.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-0', _sab: true }));
    expect(payload2.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-1', _sab: false }));
  });

  it('clears cached render results when switching to a new current runId', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-old', { clearAll: true });
    await benchDb.saveResultToDB('run-old', 0, 0, { id: 'db-old' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-old');
    let results = await benchmark.getReportResults();
    expect(results).toContainEqual(expect.objectContaining({ id: 'db-old' }));

    await benchDb.prepareForRun('run-new', { clearAll: false });
    await benchDb.saveResultToDB('run-new', 0, 0, { id: 'db-new' });
    await benchDb.waitForPendingWrites();

    benchmark.setCurrentRunId('run-new');
    results = await benchmark.getReportResults();
    expect(results).toContainEqual(expect.objectContaining({ id: 'db-new' }));
    expect(results).not.toContainEqual(expect.objectContaining({ id: 'db-old' }));
  });

  it('saves DB-only artifacts when the stop button is clicked for an active run', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-stop', { clearAll: true });
    await benchDb.saveResultToDB('run-stop', 0, 0, { id: 'db-row-0' });
    await benchDb.saveResultToDB('run-stop', 1, 1, { id: 'db-row-1' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);
    benchmark.setCurrentRunId('run-stop');

    document.getElementById('stop-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    const parallelPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'parallel');
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');

    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([
      expect.objectContaining({ id: 'db-row-0' }),
    ]);
    expect(serialPayload.rawResults).toEqual([
      expect.objectContaining({ id: 'db-row-1' }),
    ]);
  });

  it('does not duplicate saves when stop is pressed during a running benchmark', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const runBenchmarkMock = vi.fn((options, progressCallback) => {
      return new Promise((resolve, reject) => {
        const result = {
          id: 'partial-row',
          route: 'route-0',
          error: false,
          _passIndex: 0,
        };

        const onAbort = () => {
          reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
        };

        if (options.signal) {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }

        setTimeout(() => {
          progressCallback({ routeName: 'route-0', result, done: true, phase: 'routing' });
        }, 0);

        setTimeout(() => {
          if (!options.signal?.aborted) resolve();
        }, 50);
      });
    });

    vi.doMock('../benchmark/assets/benchmark.js', () => ({
      runBenchmark: runBenchmarkMock,
      clearBenchmarkCache: vi.fn(),
      disposeBenchmarkResources: vi.fn(),
      getSharedPool: vi.fn(() => ({})),
      downloadCSV: vi.fn(),
      drawScatter: vi.fn(),
      drawDensityScatter: vi.fn(),
      drawFeatureHistogram: vi.fn(),
      drawTimingBubble: vi.fn(),
      installTooltip: vi.fn(),
      generatePerformanceSummary: vi.fn(() => ({})),
      generateCostSummary: vi.fn(() => ({ groupKeys: [], rows: [], formatValue: (v) => v })),
      generateCopilotReport: vi.fn(() => ''),
      sleep: vi.fn(async () => {}),
    }));

    const benchmark = await import('../benchmark/assets/index.js');
    document.getElementById('url-input').value = 'https://fake.tiles/{z}/{x}/{y}.pbf';
    document.getElementById('mode-select').innerHTML = '<option value="test">test</option>';
    document.getElementById('mode-select').value = 'test';
    document.getElementById('runs-input').value = '1';
    document.getElementById('pause-input').value = '0';

    document.getElementById('run-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 5));
    document.getElementById('stop-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 150));

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    expect(payloads.filter((payload) => payload.runtime.parallelOrSerial === 'parallel')).toHaveLength(1);
    expect(payloads.filter((payload) => payload.runtime.parallelOrSerial === 'serial')).toHaveLength(1);
  });

  it('loads DB-only results and preserves route metadata when benchmark finishes normally', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-finish', { clearAll: true });
    await benchDb.saveResultToDB('run-finish', 0, 3, { id: 'db-row-0', detail: 'complete' });
    await benchDb.saveResultToDB('run-finish', 1, 5, { id: 'db-row-1', detail: 'complete' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-finish');

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'bad-row' }], {
      runId: 'run-finish',
    });

    expect(savedPaths).toHaveLength(2);
    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    const pass0Payload = payloads.find((payload) => payload.rawResults.some((row) => row.passIndex === 0));
    const pass1Payload = payloads.find((payload) => payload.rawResults.some((row) => row.passIndex === 1));

    expect(pass0Payload).toBeDefined();
    expect(pass1Payload).toBeDefined();
    expect(pass0Payload.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-0', passIndex: 0, routeIndex: 3, detail: 'complete' })
    );
    expect(pass1Payload.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-1', passIndex: 1, routeIndex: 5 })
    );
    expect(pass0Payload.rawResults.every((row) => typeof row._insertedAt === 'number')).toBe(true);
    expect(pass1Payload.rawResults.every((row) => typeof row._insertedAt === 'number')).toBe(true);
    expect(pass0Payload.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
    expect(pass1Payload.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
  });

  it('saves DB-only pass artifacts when benchmark finishes normally with pass contexts', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-finish-pass', { clearAll: true });
    await benchDb.saveResultToDB('run-finish-pass', 0, 0, {
      id: 'db-row-0',
      success: true,
      route: 'route-0',
    });
    await benchDb.saveResultToDB('run-finish-pass', 1, 1, {
      id: 'db-row-1',
      success: true,
      route: 'route-1',
    });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);
    benchmark.setCurrentRunId('run-finish-pass');

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'bad-row' }], {
      runId: 'run-finish-pass',
    });

    expect(savedPaths).toHaveLength(2);

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payload1 = JSON.parse(saveCalls[0][1].body).payload;
    const payload2 = JSON.parse(saveCalls[1][1].body).payload;
    expect(payload1.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-0', passIndex: 0, routeIndex: 0 })
    );
    expect(payload2.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-1', passIndex: 1, routeIndex: 1 })
    );
    expect(payload1.rawResults.every((row) => typeof row._insertedAt === 'number')).toBe(true);
    expect(payload2.rawResults.every((row) => typeof row._insertedAt === 'number')).toBe(true);
    expect(payload1.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
    expect(payload2.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
  });

  it('loads DB-only results and preserves route metadata when benchmark finishes early from success threshold', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-success-threshold', { clearAll: true });
    await benchDb.saveResultToDB('run-success-threshold', 0, 0, { id: 'db-row-0', success: true });
    await benchDb.saveResultToDB('run-success-threshold', 1, 1, { id: 'db-row-1', success: true });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);
    benchmark.setCurrentRunId('run-success-threshold');

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'bad-row' }], {
      runId: 'run-success-threshold',
    });
    expect(savedPaths).toHaveLength(2);

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payload1 = JSON.parse(saveCalls[0][1].body).payload;
    const payload2 = JSON.parse(saveCalls[1][1].body).payload;
    expect(payload1.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-0', success: true, passIndex: 0, routeIndex: 0 })
    );
    expect(payload2.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-1', success: true, passIndex: 1, routeIndex: 1 })
    );
    expect(payload1.rawResults.every((row) => typeof row._insertedAt === 'number')).toBe(true);
    expect(payload2.rawResults.every((row) => typeof row._insertedAt === 'number')).toBe(true);
    expect(payload1.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
    expect(payload2.rawResults).not.toContainEqual(expect.objectContaining({ route: 'bad-row' }));
  });

  it('uses only DB-loaded per-pass artifacts when no pass contexts exist', async () => {
    const fetchMock = setupFetchAndDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun('run-3', { clearAll: true });
    await benchDb.saveResultToDB('run-3', 0, 0, { id: 'db-row-0' });
    await benchDb.saveResultToDB('run-3', 1, 1, { id: 'db-row-1' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId('run-3');

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'bad-row' }], {
      runId: 'run-3',
    });

    expect(savedPaths).toHaveLength(2);
    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    const pass0Payload = payloads.find((payload) => payload.rawResults.some((row) => row.id === 'db-row-0'));
    const pass1Payload = payloads.find((payload) => payload.rawResults.some((row) => row.id === 'db-row-1'));

    expect(pass0Payload).toBeDefined();
    expect(pass1Payload).toBeDefined();
    expect(pass0Payload.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-0' }));
    expect(pass1Payload.rawResults).toContainEqual(expect.objectContaining({ id: 'db-row-1' }));
    expect(payloads.flatMap((payload) => payload.rawResults)).not.toContainEqual(
      expect.objectContaining({ route: 'bad-row' })
    );
  });

  it('saves artifact payloads with report JSON and per-pass artifacts when pass contexts exist', async () => {
    const fetchMock = setupFetchAndDOM();
    const benchmark = await import('../benchmark/assets/index.js');

    benchmark.setPassContexts([
      { passKey: 'pass-1', description: 'Pass 1' },
      { passKey: 'pass-2', description: 'Pass 2' },
    ]);

    const results = [
      { _passIndex: 0, route: 'route-a', raw: { duration: 10 } },
      { _passIndex: 1, route: 'route-b', raw: { duration: 20 } },
    ];

    const savedPaths = await benchmark.saveRunArtifacts(results, { runId: 'run-123' });

    expect(savedPaths).toHaveLength(2);
    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const firstPayload = JSON.parse(saveCalls[0][1].body);
    expect(firstPayload.payload.rawResults).toMatchObject([expect.objectContaining(results[0])]);
    expect(firstPayload.payload.overview.routesRun).toBe(1);

    const secondPayload = JSON.parse(saveCalls[1][1].body);
    expect(secondPayload.payload.rawResults).toMatchObject([expect.objectContaining(results[1])]);
    expect(secondPayload.payload.overview.routesRun).toBe(1);
  });

  it('saves pass artifacts when stop occurs mid-benchmark with partial pass results', async () => {
    const fetchMock = setupFetchAndDOM();
    const benchmark = await import('../benchmark/assets/index.js');

    benchmark.setPassContexts([
      { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
      { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
    ]);

    const results = [{ _passIndex: 0, _sab: true, route: 'route-a', raw: { duration: 10 } }];

    const savedPaths = await benchmark.saveRunArtifacts(results, { runId: 'run-123' });

    expect(savedPaths).toHaveLength(2);
    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    const parallelPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'parallel');
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');

    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([
      expect.objectContaining({ route: 'route-a' }),
    ]);
    expect(serialPayload.rawResults).toEqual([]);
    expect(parallelPayload.overview.routesRun).toBe(1);
    expect(serialPayload.overview.routesRun).toBe(0);
  });

  it('saves pass artifacts when stop occurs mid-benchmark with incomplete multi-pass results', async () => {
    const fetchMock = setupFetchAndDOM();
    const benchmark = await import('../benchmark/assets/index.js');

    benchmark.setPassContexts([
      { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
      { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
    ]);

    const results = [
      { _passIndex: 0, _sab: true, route: 'route-a', raw: { duration: 10 } },
      { _passIndex: 1, _sab: false, route: 'route-b', raw: { duration: 20 } },
    ];

    const savedPaths = await benchmark.saveRunArtifacts(results, {
      runId: 'run-123',
      routesSelected: 2,
    });

    expect(savedPaths).toHaveLength(2);
    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    const parallelPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'parallel');
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');

    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([
      expect.objectContaining({ route: 'route-a' }),
    ]);
    expect(serialPayload.rawResults).toEqual([
      expect.objectContaining({ route: 'route-b' }),
    ]);
  });

  it('builds a complete benchmark JSON payload with rawResults and overview data', async () => {
    setupFetchAndDOM();
    const benchmark = await import('../benchmark/assets/index.js');
    const results = [
      { _passIndex: 0, route: 'route-a' },
      { _passIndex: 1, route: 'route-b' },
    ];
    const payload = benchmark.buildBenchmarkJsonPayload(results, { mode: 'test-mode' });

    expect(payload.rawResults).toMatchObject(results);
    expect(payload.overview).toMatchObject({ mode: 'test-mode', routesRun: 2 });
  });

  it('returns no saved paths when there are no per-pass artifacts to save', async () => {
    vi.resetModules();
    buildMinimalBenchmarkDOM();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/__benchmark/save-results')) {
        return {
          ok: false,
          status: 500,
          text: async () => 'save-failed',
        };
      }
      return {
        ok: true,
        json: async () => ({ tiles: ['https://fake.tiles/{z}/{x}/{y}.pbf'] }),
      };
    });

    const benchmark = await import('../benchmark/assets/index.js');
    const savedPaths = await benchmark.saveRunArtifacts([
      { _passIndex: 0, route: 'route-a' },
    ], { runId: 'run-fail' });

    expect(savedPaths).toEqual([]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('returns no saved paths when all per-pass artifact saves fail', async () => {
    vi.resetModules();
    buildMinimalBenchmarkDOM();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'pass-save-failed',
    }));

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([
      { passKey: 'pass-1' },
      { passKey: 'pass-2' },
    ]);

    const savedPaths = await benchmark.saveRunArtifacts([
      { _passIndex: 0, route: 'route-a' }], { runId: 'run-pass-fail' });

    expect(savedPaths).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  describe('Benchmark selector feature classification', () => {
    it('classifies selector features for low-edge graphs and produces a signature', async () => {
      const { classifySelectorFeatures, getSelectorBins } = await import(
        '../benchmark/assets/benchmark-selector-features.js'
      );

      const features = classifySelectorFeatures({
        nodeCount: 10,
        edgeCount: 5,
        haversineDistance: 2,
        averageNodeDegree: 1.0,
        relativeDensity: 0.05,
        globalCoverage: 0.1,
        emptyRatio: 0.8,
        sourceDegree: 1,
        targetDegree: 1,
        sourceCentrality: 0.1,
        targetCentrality: 0.1,
      });

      expect(features.safeN).toBe(10);
      expect(features.sizeBand).toBe('small');
      expect(features.beelineBand).toBe('micro');
      expect(features.densityBand).toBe('sparse');
      expect(features.coverageBand).toBe('low-coverage');
      expect(features.emptyBand).toBe('sparse');
      expect(features.branchBand).toBe('low-branch');
      expect(features.signature).toContain('small|micro|sparse|low-branch');

      const bins = getSelectorBins({
        edgeCount: 5,
        nodeCount: 10,
        haversineDistance: 2,
      });
      expect(bins.signature).toBe(features.signature);
    });

    it('classifies higher-density graphs with medium size and non-empty bands', async () => {
      const { classifySelectorFeatures } = await import('../benchmark/assets/benchmark-selector-features.js');

      const features = classifySelectorFeatures({
        nodeCount: 25000,
        edgeCount: 50000,
        haversineDistance: 2000,
        averageNodeDegree: 3.0,
        relativeDensity: 0.5,
        globalCoverage: 0.6,
        emptyRatio: 0.05,
        nodeDegreeSource: 3,
        nodeDegreeTarget: 4,
        nodeCentralitySource: 0.5,
        nodeCentralityTarget: 0.6,
      });

      expect(features.sizeBand).toBe('medium');
      expect(features.beelineBand).toBe('short');
      expect(features.densityBand).toBe('dense');
      expect(features.coverageBand).toBe('strong-coverage');
      expect(features.emptyBand).toBe('compact');
      expect(features.branchBand).toBe('high-branch');
    });
  });

  describe('Benchmark utility functions', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '';
    });

    it('picks a winner and detects a tie within tolerance', async () => {
      const { selectTimingWinner } = await import('../benchmark/assets/benchmark.js');
      const result = selectTimingWinner({
        'bidirectional-astar': 100,
        'adaptive-barrier': 103,
        'delta-stepping': 130,
      });

      expect(result.fastestMs).toBe(100);
      expect(result.winner).toBe('bidirectional-astar');
      expect(result.winnerTied).toBe(true);
      expect(result.winnerCandidates).toEqual(expect.arrayContaining(['bidirectional-astar', 'adaptive-barrier']));
      expect(result.engineCountWithin5Pct).toBeGreaterThanOrEqual(1);
      expect(result.engineCountWithin10Pct).toBeGreaterThanOrEqual(2);
    });

    it('summarizes sample timing metrics and returns stable statistics', async () => {
      const { summarizeSamples } = await import('../benchmark/assets/benchmark.js');
      const summary = summarizeSamples([10, 30, 20, 40, 50]);

      expect(summary.count).toBe(5);
      expect(summary.minMs).toBe(10);
      expect(summary.maxMs).toBe(50);
      expect(summary.meanMs).toBe(30);
      expect(summary.medianMs).toBe(30);
      expect(summary.p95Ms).toBe(50);
      expect(summary.stdDevMs).toBeGreaterThan(0);
    });

    it('resolves sleep immediately when the signal is already aborted', async () => {
      const { sleep } = await import('../benchmark/assets/benchmark.js');
      const controller = new AbortController();
      controller.abort();

      await expect(sleep(1000, controller.signal)).resolves.toBeUndefined();
    });

    it('builds a performance summary with valid percentages and missing values', async () => {
      const { generatePerformanceSummary } = await import('../benchmark/assets/benchmark.js');
      const summary = generatePerformanceSummary([
        {
          category: 'test',
          lengthCategory: 'short',
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 5,
          ultra_dijkstra_ms: 0,
          safeE: 1,
        },
      ]);

      expect(summary.groupKeys).toEqual(['short-small']);
      expect(summary.rows.some((row) => row.engine === 'A★ (Bidirectional)')).toBe(true);
      expect(summary.formatValue(summary.rows[0][summary.groupKeys[0]])).toMatch(/%$/);
    });

    it('builds a cost summary with zero floor behavior and valid percentages', async () => {
      const { generateCostSummary } = await import('../benchmark/assets/benchmark.js');
      const summary = generateCostSummary([
        {
          category: 'test',
          lengthCategory: 'short',
          bidirectional_astar_cost: 0,
          adaptive_barrier_cost: 10,
          delta_stepping_cost: 20,
          ultra_dijkstra_cost: 5,
          safeE: 1,
        },
      ]);

      expect(summary.groupKeys).toEqual(['short-small']);
      expect(summary.rows.some((row) => row.engine === 'A★ (Bidirectional)')).toBe(true);
      expect(summary.formatValue(summary.rows[0][summary.groupKeys[0]])).toMatch(/%$/);
    });

    it('exposes feature bubble radius for finite values', async () => {
      const { bubbleRadiusForFeature } = await import('../benchmark/assets/benchmark.js');
      expect(bubbleRadiusForFeature(0.5)).toBeGreaterThanOrEqual(4);
      expect(bubbleRadiusForFeature(Infinity)).toBe(4);
      expect(bubbleRadiusForFeature(-1)).toBeGreaterThanOrEqual(4);
    });

    it('exposes size-based bubble radius and helper chart radius utilities', async () => {
      const {
        bubbleRadiusForSize,
        bubbleRadiusForFastestMs,
        bubbleRadiusForWinnerMarginPct,
      } = await import('../benchmark/assets/benchmark.js');

      expect(bubbleRadiusForSize(5, { minValue: 5, maxValue: 5 })).toBeGreaterThanOrEqual(4);
      expect(bubbleRadiusForSize(5, { minValue: 0, maxValue: 10 })).toBeGreaterThan(4);
      expect(bubbleRadiusForSize(Infinity, { minValue: 0, maxValue: 10 })).toBe(4);
      expect(bubbleRadiusForFastestMs(Infinity)).toBe(4);
      expect(bubbleRadiusForFastestMs(25)).toBeGreaterThan(4);
      expect(bubbleRadiusForWinnerMarginPct(Infinity)).toBe(4);
      expect(bubbleRadiusForWinnerMarginPct(0.2)).toBeGreaterThan(4);
    });

    it('normalizes benchmark rows with no finite timings and honors engines_found mapping', async () => {
      buildMinimalBenchmarkDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      const payload = benchmark.buildBenchmarkJsonPayload(
        [
          {
            category: 'test',
            lengthCategory: 'short',
            safeE: 1,
            safeN: 2,
            safeBeelineKm: 0.9,
            engines_found: {
              'bidirectional-astar': true,
              'adaptive-barrier': false,
              'delta-stepping': true,
              'ultra-dijkstra': false,
            },
          },
        ],
        { mode: 'test-mode' }
      );

      expect(payload.rawResults).toHaveLength(1);
      expect(payload.rawResults[0].winner).toBeNull();
      expect(payload.rawResults[0].winner_candidate_count).toBe(0);
      expect(payload.rawResults[0].n_engines_found).toBe(2);
      expect(payload.rawResults[0].all_engines_found).toBe(false);
    });

    it('rounds finite values to four decimals and returns null for non-finite values', async () => {
      buildMinimalBenchmarkDOM();
      const { round4 } = await import('../benchmark/assets/index.js');
      expect(round4(1.23456)).toBe(1.2346);
      expect(round4(Number.POSITIVE_INFINITY)).toBeNull();
    });

    it('normalizes benchmark rows with finite timings and selects winner candidates', async () => {
      buildMinimalBenchmarkDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      const payload = benchmark.buildBenchmarkJsonPayload(
        [
          {
            category: 'test',
            lengthCategory: 'short',
            safeE: 1,
            safeN: 2,
            safeBeelineKm: 1.1,
            bidirectional_astar_ms: 10,
            adaptive_barrier_ms: 11,
            delta_stepping_ms: 20,
            ultra_dijkstra_ms: 15,
            bidirectional_astar_cost: 4,
            adaptive_barrier_cost: 5,
            delta_stepping_cost: 10,
            ultra_dijkstra_cost: 6,
            engines_found: {
              'bidirectional-astar': true,
              'adaptive-barrier': true,
              'delta-stepping': true,
              'ultra-dijkstra': true,
            },
          },
        ],
        { mode: 'test-mode' }
      );

      expect(payload.rawResults[0].winner_candidate_count).toBe(1);
      expect(payload.rawResults[0].winner_candidates).toContain('bidirectional-astar');
      expect(payload.rawResults[0].n_engines_found).toBe(4);
      expect(payload.rawResults[0].all_engines_found).toBe(true);
      expect(payload.rawResults[0].winner_vs_cost_pct).toBe(0);
    });

    it('generates a copilot report with miss pockets and errors sections', async () => {
      const { generateCopilotReport } = await import('../benchmark/assets/benchmark.js');
      const report = generateCopilotReport(
        [
          {
            name: 'A route',
            category: 'test',
            lengthCategory: 'short',
            safeE: 1,
            safeN: 1,
            safeBeelineKm: 0.001,
            auto_engine: 'delta-stepping',
            winner: 'bidirectional-astar',
            auto_vs_winner_pct: 20,
            auto_matches_winner: 0,
            error: null,
            bidirectional_astar_ms: 100,
            adaptive_barrier_ms: 120,
            delta_stepping_ms: 110,
            ultra_dijkstra_ms: 130,
          },
          {
            name: 'Errored route',
            error: 'timeout',
          },
        ],
        { mode: 'unit-test', generatedAt: '2026-01-01T00:00:00.000Z' }
      );

      expect(report).toContain('OMT Router Benchmark Report');
      expect(report).toContain('Run Context');
      expect(report).toContain('Auto Selector');
      expect(report).toContain('Misses Table');
      expect(report).toContain('Errors');
      expect(report).toContain('timeout');
    });

    it('converts results to a valid CSV string and escapes special characters', async () => {
      const { toCSV, downloadCSV } = await import('../benchmark/assets/benchmark.js');
      const rows = [
        { id: 1, name: 'A, B', category: 'test', lengthCategory: 'short', safeN: 1, safeE: 2 },
      ];
      const csv = toCSV(rows);

      expect(csv).toContain('id,name,category,lengthCategory');
      expect(csv).toContain('"A, B"');
      expect(csv.split('\n').length).toBeGreaterThan(1);

      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const result = downloadCSV(rows, 'test.csv');
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:url');
      expect(result).toBeUndefined();
    });

    it('updates report controls and selects a report variant with sharedArrayBuffer contexts', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');

      benchmark.setPassContexts([
        { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
        { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
      ]);

      const variants = benchmark.createReportVariants([{ _passIndex: 0, route: 'route-a' }, { _passIndex: 1, route: 'route-b' }]);
      expect(variants).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'sab_on' })]));
      benchmark.updateReportTypeControls();
      expect(document.getElementById('report-view-select').children.length).toBeGreaterThan(0);

      const selected = benchmark.getSelectedReportVariant();
      expect(selected).toBeDefined();
      expect(benchmark.getReportFilename(selected, 'benchmark')).toContain('benchmark');
    });

    it('creates pass-specific report variants when passContext indices are 1-based', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.setPassContexts([
        { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
        { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
      ]);

      const variants = benchmark.createReportVariants([
        { _passIndex: 0, route: 'route-a' },
        { _passIndex: 1, route: 'route-b' },
      ]);

      expect(variants.find((variant) => variant.key === 'sab_on').results).toEqual([
        { _passIndex: 0, route: 'route-a' },
      ]);
      expect(variants.find((variant) => variant.key === 'sab_off').results).toEqual([
        { _passIndex: 1, route: 'route-b' },
      ]);
    });

    it('creates pass-specific report variants when results use one-based pass indices', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.setPassContexts([
        { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
        { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
      ]);

      const variants = benchmark.createReportVariants([
        { _passIndex: 1, route: 'route-a' },
        { _passIndex: 2, route: 'route-b' },
      ]);

      expect(variants.find((variant) => variant.key === 'sab_on').results).toEqual([
        { _passIndex: 1, route: 'route-a' },
      ]);
      expect(variants.find((variant) => variant.key === 'sab_off').results).toEqual([
        { _passIndex: 2, route: 'route-b' },
      ]);
    });

    it('preserves report variants when pass contexts are cleared after a run', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');

      benchmark.setPassContexts([
        { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 1, totalPasses: 2 },
        { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 2, totalPasses: 2 },
      ]);
      benchmark.createReportVariants([
        { _passIndex: 0, route: 'route-a' },
        { _passIndex: 1, route: 'route-b' },
      ]);

      const initialVariants = benchmark.buildReportVariants();
      expect(initialVariants).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'sab_on' }),
        expect.objectContaining({ key: 'sab_off' }),
      ]));

      benchmark.setPassContexts(null);
      const preservedVariants = benchmark.buildReportVariants();
      expect(preservedVariants).toEqual(initialVariants);
    });

    it('collects checked route filters and updates route count display', async () => {
      buildMinimalBenchmarkDOM();
      document.getElementById('category-filters').innerHTML =
        '<label><input type="checkbox" value="highway" checked /></label>';
      document.getElementById('length-filters').innerHTML =
        '<label><input type="checkbox" value="long" checked /></label>';
      document.getElementById('success-routes-input').value = '1';

      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.updateRouteCount();
      const routeCountMessage = document.getElementById('route-count').textContent;
      expect(routeCountMessage).toContain('routes');
    });

    it('resolves report variant labels and report filenames', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');

      expect(benchmark.getReportVariantLabel('sab_on')).toBe('SAB On');
      expect(benchmark.getReportVariantLabel('sab_off')).toBe('SAB Off');
      expect(benchmark.getReportFilename({ key: 'sab_off' }, 'benchmark')).toContain('_sab_off_');
      expect(benchmark.getReportFilename(undefined, 'benchmark')).not.toContain('_combined_');
    });

    it('hides report type controls when there are no report variants', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');

      benchmark.updateReportTypeControls();
      expect(document.getElementById('report-type-controls').hidden).toBe(true);
    });

    it('falls back to the first report variant when selection is invalid', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.setPassContexts([
        { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 0, totalPasses: 2 },
        { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 1, totalPasses: 2 },
      ]);

      benchmark.createReportVariants([{ _passIndex: 0, route: 'route-a' }, { _passIndex: 1, route: 'route-b' }]);
      benchmark.updateReportTypeControls();
      document.getElementById('report-view-select').value = 'invalid-selection';

      const selected = benchmark.getSelectedReportVariant();
      expect(selected).toBeDefined();
      expect(selected.key).toBe('sab_on');
    });

    it('renders summary and cost summary tables through showResults', async () => {
      vi.resetModules();
      const fetchMock = setupFetchAndDOM();
      const FakeChart = class {
        constructor(canvas, config) {
          this.canvas = canvas;
          this.config = config;
          this.options = config.options;
          this.data = config.data || { datasets: [] };
          this.config.data = this.data;
          FakeChart.instances.push(this);
        }

        update() {}
        destroy() {
          this.destroyed = true;
        }

        static getChart(canvas) {
          return FakeChart.instances.find((chart) => chart.canvas === canvas) || null;
        }
      };
      FakeChart.instances = [];
      vi.doMock('chart.js/auto', () => ({ default: FakeChart }));

      const benchmark = await import('../benchmark/assets/index.js');
      const results = [
        {
          route: 'route-1',
          routeLabel: 'route 1',
          passIndex: 0,
          name: 'route 1',
          category: 'highway',
          lengthCategory: 'short',
          logBeelineKm: 1.0,
          logCoverageEmptyContrast: 2.0,
          logGlobalCoverage: 0.4,
          logEmptyRatio: 0.2,
          safeE: 1,
          safeN: 1,
          safeBeelineKm: 0.5,
          bidirectional_astar_ms: 10,
          bidirectional_astar_cost: 10,
          winner: 'bidirectional-astar',
          winner_tied: 1,
          auto_matches_winner: 1,
          auto_engine: 'bidirectional-astar',
        },
      ];

      benchmark.showResults(results);
      expect(document.getElementById('summary-tbody').children.length).toBeGreaterThan(0);
      expect(document.getElementById('cost-summary-tbody').children.length).toBeGreaterThan(0);
      expect(document.getElementById('summary-cards').textContent).toContain('Routes run');
      expect(document.getElementById('summary-tbody').textContent).toContain('—');
      expect(document.getElementById('cost-summary-tbody').textContent).toContain('—');

      const densityChart = FakeChart.instances.find((chart) => chart.config.type === 'bubble');
      const timingChart = FakeChart.instances.filter((chart) => chart.config.type === 'bubble')[1];
      expect(densityChart.options.scales.y.ticks.callback(0.123)).toBe(0.123);
      expect(densityChart.options.scales.x.ticks.callback(undefined)).toBe('');
      expect(timingChart.options.scales.y.ticks.callback(12.345)).toBe(12.3);
      expect(timingChart.options.scales.x.ticks.callback(null)).toBe('');

      expect(fetchMock).toHaveBeenCalled();
    });

    it('shows route error and unrecovered engine error summary cards and reuses tooltip cleanup', async () => {
      vi.resetModules();
      const fetchMock = setupFetchAndDOM();
      const FakeChart = class {
        constructor(canvas, config) {
          this.canvas = canvas;
          this.config = config;
          this.options = config.options;
          this.data = config.data || { datasets: [] };
          this.config.data = this.data;
          FakeChart.instances.push(this);
        }

        update() {}
        destroy() {
          this.destroyed = true;
        }

        static getChart(canvas) {
          return FakeChart.instances.find((chart) => chart.canvas === canvas) || null;
        }
      };
      FakeChart.instances = [];
      vi.doMock('chart.js/auto', () => ({ default: FakeChart }));

      const benchmark = await import('../benchmark/assets/index.js');
      const results = [
        {
          route: 'route-1',
          routeLabel: 'route 1',
          passIndex: 0,
          name: 'route 1',
          category: 'highway',
          lengthCategory: 'short',
          logBeelineKm: 1.0,
          logCoverageEmptyContrast: 2.0,
          logGlobalCoverage: 0.4,
          logEmptyRatio: 0.2,
          safeE: 1,
          safeN: 1,
          safeBeelineKm: 0.5,
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 30,
          ultra_dijkstra_ms: 40,
          bidirectional_astar_cost: 10,
          adaptive_barrier_cost: 12,
          delta_stepping_cost: 15,
          ultra_dijkstra_cost: 20,
          winner: 'bidirectional-astar',
          routeError: 'failed',
        },
        {
          route: 'route-2',
          routeLabel: 'route 2',
          passIndex: 0,
          name: 'route 2',
          category: 'road',
          lengthCategory: 'long',
          logBeelineKm: 2.0,
          logCoverageEmptyContrast: 1.5,
          logGlobalCoverage: 0.5,
          logEmptyRatio: 0.3,
          safeE: 2,
          safeN: 2,
          safeBeelineKm: 0.8,
          bidirectional_astar_ms: 11,
          adaptive_barrier_ms: 12,
          delta_stepping_ms: 14,
          ultra_dijkstra_ms: 16,
          bidirectional_astar_cost: 11,
          adaptive_barrier_cost: 10,
          delta_stepping_cost: 13,
          ultra_dijkstra_cost: 18,
          winner: 'adaptive-barrier',
          any_engine_error: true,
        },
      ];

      benchmark.showResults(results);
      expect(document.getElementById('summary-cards').textContent).toContain('Route errors');
      expect(document.getElementById('summary-cards').textContent).toContain('Routes with unrecovered engine errors');

      benchmark.showResults(results);
      expect(document.getElementById('summary-cards').textContent).toContain('Routes with unrecovered engine errors');
      expect(fetchMock).toHaveBeenCalled();
    });

    it('creates UI-safe result rows by stripping diagnostic metadata', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      const row = benchmark.createUIResultRow({
        id: 'row-1',
        rawDiagnostics: { error: true },
        samplesMs: [1, 2],
        sampleStats: { mean: 1.5 },
        timingRounds: [10, 20],
        route: 'test-route',
      });

      expect(row).toEqual({ id: 'row-1', route: 'test-route' });
    });

    it('returns no selected routes when no category or length filters are checked', async () => {
      buildMinimalBenchmarkDOM();
      const benchmark = await import('../benchmark/assets/index.js');

      document.querySelectorAll('#category-filters input').forEach((input) => {
        input.checked = false;
      });
      document.querySelectorAll('#length-filters input').forEach((input) => {
        input.checked = false;
      });

      expect(benchmark.getSelectedRoutes()).toEqual([]);
    });

    it('builds a performance summary with invalid timings and null groups', async () => {
      const { generatePerformanceSummary } = await import('../benchmark/assets/benchmark.js');
      const summary = generatePerformanceSummary([
        {
          category: 'test',
          lengthCategory: 'short',
          bidirectional_astar_ms: -1,
          adaptive_barrier_ms: NaN,
          delta_stepping_ms: Infinity,
          ultra_dijkstra_ms: -0.5,
          safeE: 1,
        },
      ]);

      expect(summary.groupKeys).toEqual(['short-small']);
      expect(summary.rows.every((row) => row[summary.groupKeys[0]] === null)).toBe(true);
      expect(summary.formatValue(null)).toBe('—');
    });

    it('builds a cost summary with invalid cost values and null groups', async () => {
      const { generateCostSummary } = await import('../benchmark/assets/benchmark.js');
      const summary = generateCostSummary([
        {
          category: 'test',
          lengthCategory: 'short',
          bidirectional_astar_cost: NaN,
          adaptive_barrier_cost: -1,
          delta_stepping_cost: null,
          ultra_dijkstra_cost: undefined,
          safeE: 1,
        },
      ]);

      expect(summary.groupKeys).toEqual(['short-small']);
      expect(summary.rows.every((row) => row[summary.groupKeys[0]] === null)).toBe(true);
      expect(summary.formatValue(null)).toBe('—');
    });

    it('renders summary and cost table colors for 100% and low-percentage values', async () => {
      buildMinimalBenchmarkDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      const results = [
        {
          category: 'test',
          lengthCategory: 'short',
          route: 'route-1',
          routeLabel: 'route 1',
          name: 'route 1',
          winner: 'bidirectional-astar',
          costWinner: 'bidirectional-astar',
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 40,
          ultra_dijkstra_ms: 200,
          bidirectional_astar_cost: 5,
          adaptive_barrier_cost: 10,
          delta_stepping_cost: 20,
          ultra_dijkstra_cost: 100,
          logBeelineKm: 1.0,
          logCoverageEmptyContrast: 1.0,
          logGlobalCoverage: 0.5,
          logEmptyRatio: 0.2,
          safeE: 1,
          safeN: 1,
          safeBeelineKm: 0.5,
          passIndex: 0,
          auto_matches_winner: 1,
          auto_engine: 'bidirectional-astar',
          auto_vs_winner_pct: 0,
        },
      ];

      benchmark.showResults(results);

      const summaryRows = Array.from(document.querySelectorAll('#summary-tbody tr'));
      const summaryFastest = summaryRows.find((row) => row.children[0].textContent === 'A★ (Bidirectional)');
      const summarySlow = summaryRows.find((row) => row.children[0].textContent === 'Barrier (Adaptive SSP)');
      expect(summaryFastest.children[2].textContent).toBe('100%');
      expect(summaryFastest.children[2].style.color).toBe('var(--green)');
      expect(summarySlow.children[2].textContent).toBe('50%');
      expect(summarySlow.children[2].style.color).toBe('var(--red)');

      const costRows = Array.from(document.querySelectorAll('#cost-summary-tbody tr'));
      const costFastest = costRows.find((row) => row.children[0].textContent === 'A★ (Bidirectional)');
      const costSlow = costRows.find((row) => row.children[0].textContent === 'Barrier (Adaptive SSP)');
      expect(costFastest.children[2].textContent).toBe('100%');
      expect(costFastest.children[2].style.color).toBe('var(--green)');
      expect(costSlow.children[2].textContent).toBe('50%');
      expect(costSlow.children[2].style.color).toBe('var(--red)');
    });

    it('generates a copilot report with a miss and no errors, and escapes markdown text', async () => {
      const { generateCopilotReport } = await import('../benchmark/assets/benchmark.js');
      const report = generateCopilotReport(
        [
          {
            name: 'Exact route|test\nA',
            category: 'test',
            lengthCategory: 'short',
            safeE: 1,
            safeN: 1,
            safeBeelineKm: 0.5,
            auto_engine: 'delta-stepping',
            winner: 'bidirectional-astar',
            auto_vs_winner_pct: 12,
            auto_matches_winner: 0,
            error: null,
            signature: 'small|micro|sparse|low-branch',
            winner_candidates: ['bidirectional-astar'],
            bidirectional_astar_ms: 10,
            adaptive_barrier_ms: 12,
            delta_stepping_ms: 9,
            ultra_dijkstra_ms: 13,
          },
        ],
        {
          mode: 'unit-test',
          generatedAt: '2026-01-01T00:00:00.000Z',
          selectedCategories: ['test'],
          selectedLengths: ['short'],
        }
      );

      expect(report).toContain('categories: test');
      expect(report).toContain('lengths: short');
      expect(report).toContain('Misses Table');
      expect(report).toContain('Miss Pockets');
      expect(report).not.toContain('Errors');
      expect(report).toContain('Exact route\\|test A');
    });
  });

  describe('Benchmark chart helpers', () => {
    let FakeChart;

    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '';
      FakeChart = class {
        constructor(canvas, config) {
          this.canvas = canvas;
          this.config = config;
          this.data = config.data || { labels: [], datasets: [] };
          this.options = config.options || { scales: { y: {} } };
          this.updated = [];
          this.destroyed = false;
          FakeChart.instances.push(this);
        }

        update(mode) {
          this.updated.push(mode);
        }

        destroy() {
          this.destroyed = true;
        }

        static getChart(canvas) {
          return FakeChart.instances.find((chart) => chart.canvas === canvas) || null;
        }
      };
      FakeChart.instances = [];
      vi.doMock('chart.js/auto', () => ({ default: FakeChart }));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders density scatter, histogram, and timing bubble charts', async () => {
      buildMinimalBenchmarkDOM();
      const benchmark = await import('../benchmark/assets/benchmark.js');
      const canvasA = document.createElement('canvas');
      const canvasB = document.createElement('canvas');
      const canvasC = document.createElement('canvas');
      document.body.append(canvasA, canvasB, canvasC);

      const results = [
        {
          route: 'route-1',
          routeLabel: 'route 1',
          passIndex: 0,
          name: 'route 1',
          lengthCategory: 'short',
          category: 'highway',
          logGlobalCoverage: 0.5,
          logEmptyRatio: 0.4,
          logBeelineKm: 1.0,
          logCoverageEmptyContrast: 2.0,
          safeE: 1,
          safeN: 1,
          safeBeelineKm: 0.5,
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 30,
          ultra_dijkstra_ms: 40,
          winner: 'bidirectional-astar',
          auto_matches_winner: 1,
          auto_engine: 'bidirectional-astar',
          auto_vs_winner_pct: 0,
        },
      ];

      const scatterChart = benchmark.drawScatter(canvasA, results, {});
      expect(scatterChart).toBeInstanceOf(FakeChart);
      expect(scatterChart.config.type).toBe('scatter');

      const density = benchmark.drawDensityScatter(canvasA, results);
      expect(density).toBeInstanceOf(FakeChart);
      expect(density.config.type).toBe('bubble');

      const histogram = benchmark.drawFeatureHistogram(canvasB, results, {});
      expect(histogram).toBeInstanceOf(FakeChart);
      expect(histogram.config.type).toBe('bar');

      const timing = benchmark.drawTimingBubble(canvasC, results, {});
      expect(timing).toBeInstanceOf(FakeChart);
      expect(timing.config.type).toBe('bubble');
      expect(typeof scatterChart.options.scales.y.ticks.callback).toBe('function');
      expect(scatterChart.options.scales.y.ticks.callback(NaN)).toBe('');
      expect(typeof scatterChart.options.scales.x.ticks.callback).toBe('function');
      expect(scatterChart.options.scales.x.ticks.callback(1.234)).toBe(1.23);
      expect(typeof density.options.scales.x.ticks.callback).toBe('function');
      expect(density.options.scales.x.ticks.callback(undefined)).toBe('');
      expect(typeof timing.options.scales.x.ticks.callback).toBe('function');
      expect(timing.options.scales.x.ticks.callback(null)).toBe('');
      expect(typeof density.options.plugins.tooltip.callbacks.title).toBe('function');
      expect(density.options.plugins.tooltip.callbacks.title([{ raw: { routeName: 'route 1' } }])).toBe('route 1');
      expect(density.options.plugins.tooltip.callbacks.label({ raw: null })).toEqual([]);
      expect(density.options.plugins.tooltip.callbacks.label({
        raw: {
          category: 'highway',
          lengthCategory: 'short',
          x: 1.234,
          y: 0.567,
          radiusLabel: 'radius label',
          timing: { fastestMs: 500, winnerMarginPct: null },
        },
      })).toEqual([
        'highway · short',
        'x: 1.23',
        'y: 0.567',
        'radius label',
        'fastest: 500ms',
        'margin: n/a',
      ]);

      const timingUpdated = benchmark.drawTimingBubble(canvasC, results, {}, timing);
      expect(timingUpdated).toBe(timing);
      expect(timing.updated).toContain('none');
    });

    it('renders scatter and histogram updates, creates error bubble datasets, and destroys old charts', async () => {
      buildMinimalBenchmarkDOM();
      const benchmark = await import('../benchmark/assets/benchmark.js');
      const canvasScatter = document.createElement('canvas');
      const canvasHistogram = document.createElement('canvas');
      const canvasDensity = document.createElement('canvas');
      document.body.append(canvasScatter, canvasHistogram, canvasDensity);

      const results = [
        {
          name: 'route-winner',
          category: 'test',
          lengthCategory: 'medium',
          logBeelineKm: 1.5,
          logCoverageEmptyContrast: 1.8,
          logGlobalCoverage: 0.6,
          logEmptyRatio: 0.5,
          safeE: 5,
          safeN: 4,
          safeBeelineKm: 0.2,
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 30,
          ultra_dijkstra_ms: 40,
          winner: 'bidirectional-astar',
        },
        {
          name: 'route-error',
          category: 'test',
          lengthCategory: 'short',
          logBeelineKm: 1.6,
          logCoverageEmptyContrast: 2.1,
          logGlobalCoverage: 0.7,
          logEmptyRatio: 0.4,
          safeE: 6,
          safeN: 3,
          safeBeelineKm: 0.4,
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 30,
          ultra_dijkstra_ms: 40,
          winner: null,
        },
      ];

      const scatterChart = benchmark.drawScatter(canvasScatter, results);
      expect(scatterChart).toBeInstanceOf(FakeChart);
      expect(scatterChart.config.type).toBe('scatter');
      expect(scatterChart.data.datasets.some((ds) => ds.label === 'Error / N.A.')).toBe(true);

      const updatedScatterChart = benchmark.drawScatter(canvasScatter, results, {}, scatterChart);
      expect(updatedScatterChart).toBe(scatterChart);
      expect(scatterChart.updated).toContain('none');

      const histogramChart = benchmark.drawFeatureHistogram(canvasHistogram, results, {});
      expect(histogramChart).toBeInstanceOf(FakeChart);
      expect(histogramChart.config.type).toBe('bar');

      const updatedHistogramChart = benchmark.drawFeatureHistogram(canvasHistogram, results, {}, histogramChart);
      expect(updatedHistogramChart).toBe(histogramChart);
      expect(histogramChart.updated).toContain('none');

      const destroyedChart = benchmark.drawDensityScatter(canvasDensity, results);
      expect(destroyedChart).toBeInstanceOf(FakeChart);
      expect(destroyedChart.config.type).toBe('bubble');

      expect(destroyedChart.destroyed).toBe(false);
      const nextChart = benchmark.drawDensityScatter(canvasDensity, results);
      expect(nextChart).toBeInstanceOf(FakeChart);
      expect(nextChart).not.toBe(destroyedChart);
      expect(destroyedChart.destroyed).toBe(true);
    });

    it('renders timing bubbles with no winner and includes an error dataset', async () => {
      buildMinimalBenchmarkDOM();
      const benchmark = await import('../benchmark/assets/benchmark.js');
      const canvas = document.createElement('canvas');
      document.body.append(canvas);

      const results = [
        {
          name: 'route-error',
          category: 'test',
          lengthCategory: 'short',
          logBeelineKm: 1.2,
          logCoverageEmptyContrast: 1.8,
          logGlobalCoverage: 0.7,
          logEmptyRatio: 0.4,
          safeE: 4,
          safeN: 3,
          safeBeelineKm: 0.5,
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 30,
          ultra_dijkstra_ms: 40,
          winner: null,
        },
      ];

      const chart = benchmark.drawTimingBubble(canvas, results);
      expect(chart).toBeInstanceOf(FakeChart);
      expect(chart.config.type).toBe('bubble');
      expect(chart.data.datasets.some((ds) => ds.label === 'No winner / error')).toBe(true);
    });

    it('uses chart tooltip callbacks for density and histogram charts', async () => {
      vi.resetModules();
      const FakeChart = class {
        constructor(canvas, config) {
          this.canvas = canvas;
          this.config = config;
          this.options = config.options;
          this.data = config.data || { datasets: [] };
          this.config.data = this.data;
          FakeChart.instances.push(this);
        }

        update() {}
        destroy() {
          this.destroyed = true;
        }

        static getChart(canvas) {
          return FakeChart.instances.find((chart) => chart.canvas === canvas) || null;
        }
      };
      FakeChart.instances = [];
      vi.doMock('chart.js/auto', () => ({ default: FakeChart }));

      const benchmark = await import('../benchmark/assets/benchmark.js');
      const canvasDensity = document.createElement('canvas');
      const canvasHistogram = document.createElement('canvas');
      document.body.append(canvasDensity, canvasHistogram);

      const results = [
        {
          name: 'route-A',
          category: 'test',
          lengthCategory: 'short',
          logBeelineKm: 1.2,
          logCoverageEmptyContrast: 1.8,
          logGlobalCoverage: 0.7,
          logEmptyRatio: 0.4,
          safeE: 4,
          safeN: 3,
          safeBeelineKm: 0.5,
          bidirectional_astar_ms: 10,
          adaptive_barrier_ms: 20,
          delta_stepping_ms: 30,
          ultra_dijkstra_ms: 40,
          winner: 'bidirectional-astar',
        },
      ];

      const densityChart = benchmark.drawDensityScatter(canvasDensity, results);
      expect(densityChart).toBeInstanceOf(FakeChart);
      const densityTooltip = densityChart.config.options.plugins.tooltip.callbacks;
      console.log('DEBUG TOOLTIP CALLBACK KEYS', Object.keys(densityTooltip), densityTooltip.labelColor);
      expect(densityTooltip.title([{ raw: { routeName: 'route-A' } }])).toBe('route-A');
      expect(densityTooltip.title([])).toBe('');
      expect(densityTooltip.label({ raw: { category: 'test', lengthCategory: 'short', x: 1.234, y: 2.345 } })).toEqual([
        'test · short',
        'x: 1.23',
        'y: 2.35',
      ]);
      expect(densityTooltip.label({ raw: null })).toEqual([]);
      expect(densityTooltip.labelColor({ dataset: { borderColor: '#aaa', backgroundColor: '#bbb' } })).toEqual({
        borderColor: '#aaa',
        backgroundColor: '#bbb',
      });

      const histogramChart = benchmark.drawFeatureHistogram(canvasHistogram, results, {});
      const histogramTooltip = histogramChart.config.options.plugins.tooltip.callbacks;
      expect(histogramTooltip.label({ dataset: { label: 'Routes' }, parsed: { y: 5 } })).toBe('Routes: 5 routes');
    });

    it('provides no-op tooltip cleanup and null threshold suggestions', async () => {
      const benchmark = await import('../benchmark/assets/benchmark.js');
      const cleanup = benchmark.installTooltip(document.createElement('canvas'), [], document.createElement('div'));
      expect(typeof cleanup).toBe('function');
      expect(cleanup()).toBeUndefined();
      expect(benchmark.suggestThresholds([])).toEqual({ suggestedE: null, suggestedBeelineM: null, stats: {} });
    });
  });
});
