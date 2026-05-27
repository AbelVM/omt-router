/**
 * @vitest-environment jsdom
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let formatDuration;
let benchmarkModule;
let benchmarkRouteWorkerModule;

beforeAll(async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ tiles: ['https://example.com/tiles'] }) })
  );
  buildMinimalBenchmarkDOM();
  benchmarkModule = await import('../benchmark/assets/index.js');
  benchmarkRouteWorkerModule = await import('../benchmark/assets/benchmark-route-worker.js');
  formatDuration = benchmarkModule.formatDuration;
  globalThis.fetch = oldFetch;
});

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
    <canvas id="scatter"></canvas>
    <canvas id="density"></canvas>
    <canvas id="histogram"></canvas>
    <canvas id="bubble"></canvas>
    <input id="url-input" />
    <div id="pagination-controls"></div>
    <div id="pagination-info"></div>
    <button id="pagination-prev" type="button"></button>
    <button id="pagination-next" type="button"></button>
    <select id="mode-select"></select>
    <input id="runs-input" />
    <input id="pause-input" />
    <button id="pause-btn" type="button"></button>
    <div id="pending-run-prompt" hidden>
      <div id="pending-run-message"></div>
      <button id="resume-run-btn" type="button"></button>
      <button id="restart-run-btn" type="button"></button>
    </div>
    <button id="download-btn" type="button"></button>
    <div id="pause-state"></div>
    <div id="suggestion-wrap"></div>
  `;
}

describe('benchmark stopwatch formatting', () => {
  it('formats durations longer than one hour with hours', () => {
    expect(formatDuration(3_660_500)).toBe('1:01:00.5');
    expect(formatDuration(7_205_900)).toBe('2:00:05.9');
  });

  it('formats durations under one hour with minutes and seconds', () => {
    expect(formatDuration(125_400)).toBe('2:05.4');
  });

  it('formats durations under one minute with seconds and tenths', () => {
    expect(formatDuration(9_200)).toBe('9.2s');
  });
});

describe('benchmark route worker cleanup', () => {
  beforeEach(() => {
    window.__benchmarkAttachedPorts = 0;
  });

  it('releases a shared tile pool port when cleanup is invoked', () => {
    expect(window.__debug_benchmark).toBeDefined();
    const debug = window.__debug_benchmark;
    const sharedPortMap = debug.benchmarkRouteWorkerSharedPortMap;
    expect(sharedPortMap).toBeInstanceOf(WeakMap);

    const fakePort = {
      close: vi.fn(),
      onmessage: null,
    };
    const fakeWorkerObj = {};
    sharedPortMap.set(fakeWorkerObj, fakePort);
    window.__benchmarkAttachedPorts = 1;

    debug.cleanupSharedTilePoolPort(fakeWorkerObj);

    expect(fakePort.close).toHaveBeenCalled();
    expect(window.__benchmarkAttachedPorts).toBe(0);
  });

  it('restores the original terminate method during cleanup', () => {
    expect(window.__debug_benchmark).toBeDefined();
    const debug = window.__debug_benchmark;
    const sharedPortMap = debug.benchmarkRouteWorkerSharedPortMap;
    expect(sharedPortMap).toBeInstanceOf(WeakMap);

    const fakePort = {
      close: vi.fn(),
      onmessage: null,
    };
    const originalTerminate = vi.fn();
    const underlyingWorker = {
      terminate: vi.fn(),
      __benchmark_original_terminate: originalTerminate,
    };
    const fakeWorkerObj = { worker: { _underlying: underlyingWorker } };
    sharedPortMap.set(fakeWorkerObj, fakePort);
    window.__benchmarkAttachedPorts = 1;

    debug.cleanupSharedTilePoolPort(fakeWorkerObj);

    expect(fakePort.close).toHaveBeenCalled();
    expect(window.__benchmarkAttachedPorts).toBe(0);
    expect(underlyingWorker.terminate).toBe(originalTerminate);
    expect(underlyingWorker.__benchmark_original_terminate).toBeUndefined();
  });

  it('cleans up shared tile port when worker terminate is called', () => {
    expect(window.__debug_benchmark).toBeDefined();
    const debug = window.__debug_benchmark;
    const originalTerminate = vi.fn();
    const underlyingWorker = {
      postMessage: vi.fn(),
      terminate: originalTerminate,
    };
    const fakeWorkerObj = { worker: { _underlying: underlyingWorker } };
    window.__benchmarkAttachedPorts = 0;

    debug.attachSharedTilePoolPort(fakeWorkerObj);
    expect(window.__benchmarkAttachedPorts).toBe(1);
    expect(underlyingWorker.postMessage).toHaveBeenCalled();
    expect(underlyingWorker.terminate).not.toBe(originalTerminate);

    underlyingWorker.terminate();

    expect(window.__benchmarkAttachedPorts).toBe(0);
    expect(originalTerminate).toHaveBeenCalled();
  });

  it('re-registers route worker error handlers after cleanup when the same wrapper is reused', () => {
    expect(window.__debug_benchmark).toBeDefined();
    const debug = window.__debug_benchmark;
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const underlyingWorker = {
      postMessage: vi.fn(),
      addEventListener,
      removeEventListener,
    };
    const wrapper = {
      _underlying: underlyingWorker,
      addEventListener,
      removeEventListener,
    };
    const fakeWorkerObj = { worker: wrapper };
    window.__benchmarkAttachedPorts = 0;

    debug.patchRouteWorkerMessageHandling(fakeWorkerObj);
    expect(addEventListener).toHaveBeenCalledTimes(6);
    expect(removeEventListener).toHaveBeenCalledTimes(0);

    debug.cleanupSharedTilePoolPort(fakeWorkerObj);
    expect(removeEventListener).toHaveBeenCalledTimes(6);

    debug.patchRouteWorkerMessageHandling(fakeWorkerObj);
    expect(addEventListener).toHaveBeenCalledTimes(12);
  });

  it('registers shared tile pool port cleanup with FinalizationRegistry when available', async () => {
    const originalFinalizationRegistry = globalThis.FinalizationRegistry;
    const originalFetch = globalThis.fetch;
    const originalBenchmarkRouteWorkerCtor = globalThis.__benchmarkRouteWorkerCtor;
    const registerSpy = vi.fn();
    const unregisterSpy = vi.fn();

    globalThis.FinalizationRegistry = vi.fn(function () {
      this.register = registerSpy;
      this.unregister = unregisterSpy;
    });
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ tiles: ['https://example.com/tiles'] }) })
    );
    globalThis.__benchmarkRouteWorkerCtor = class FakeBenchmarkRouteWorker {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true;
      }
    };
    vi.resetModules();

    await import('../benchmark/assets/index.js');
    globalThis.fetch = originalFetch;
    globalThis.FinalizationRegistry = originalFinalizationRegistry;
    if (originalBenchmarkRouteWorkerCtor === undefined) {
      delete globalThis.__benchmarkRouteWorkerCtor;
    } else {
      globalThis.__benchmarkRouteWorkerCtor = originalBenchmarkRouteWorkerCtor;
    }
    vi.resetModules();

    const debug = window.__debug_benchmark;
    expect(debug).toBeDefined();

    const fakeWorkerObj = {
      worker: { _underlying: { postMessage: vi.fn(), addEventListener: vi.fn() } },
    };
    window.__benchmarkAttachedPorts = 0;

    debug.attachSharedTilePoolPort(fakeWorkerObj);

    expect(registerSpy).toHaveBeenCalledTimes(1);
    const registerArgs = registerSpy.mock.calls[0];
    expect(registerArgs[0]).toBe(fakeWorkerObj);
    expect(registerArgs[1]).toEqual(expect.any(Object));
    expect(registerArgs[2]).toEqual(expect.any(Object));
    expect(registerArgs[2]).not.toBe(fakeWorkerObj);

    // Ensure explicit cleanup uses the token instead of the worker object.
    debug.cleanupSharedTilePoolPort(fakeWorkerObj);
    expect(unregisterSpy).toHaveBeenCalledWith(registerArgs[2]);
  });

  it('disposes an existing shared tile pool port before reinitializing a new port', () => {
    const { initSharedTilePoolPort, disposeSharedTilePoolPort } = benchmarkRouteWorkerModule;
    const oldPort = { close: vi.fn(), onmessage: vi.fn(), postMessage: vi.fn(), start: vi.fn() };
    initSharedTilePoolPort(oldPort);

    const newPort = { close: vi.fn(), onmessage: null, postMessage: vi.fn(), start: vi.fn() };
    initSharedTilePoolPort(newPort);

    expect(oldPort.onmessage).toBeNull();
    expect(oldPort.close).toHaveBeenCalled();

    disposeSharedTilePoolPort();
  });

  it('releases route cache entries and disposes prepared graph state', () => {
    const { _routeCache, releasePreparedRoute, getRouteCacheStats } = benchmarkRouteWorkerModule;

    const routeDef = { start: [1, 2], end: [3, 4], forceRadius: 5 };
    const cacheKey = '1,2|3,4|car|10|distance|5|5';
    const stopCleanup = vi.fn();
    const clear = vi.fn();
    const cacheEntry = {
      prepared: { _routeCache: { stopCleanup, clear } },
      graph: { nodes: new Map() },
      routeSetup: { graph: { edges: [] } },
      radius: 5,
      fetchMs: 42,
      startId: 1,
      endId: 2,
    };
    _routeCache.set(cacheKey, cacheEntry);

    const released = releasePreparedRoute(
      routeDef,
      'https://example.com/{z}/{x}/{y}.png',
      'car',
      10,
      'distance'
    );

    expect(released).toBe(true);
    expect(stopCleanup).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(cacheEntry.prepared).toBeNull();
    expect(cacheEntry.graph).toBeNull();
    expect(cacheEntry.routeSetup).toBeNull();
    expect(getRouteCacheStats().size).toBe(0);
  });

  it('clears the shared tile pool port safely when disposed', () => {
    const { initSharedTilePoolPort, disposeSharedTilePoolPort } = benchmarkRouteWorkerModule;
    const port = { close: vi.fn(), onmessage: vi.fn(), postMessage: vi.fn(), start: vi.fn() };
    initSharedTilePoolPort(port);
    disposeSharedTilePoolPort();

    expect(port.onmessage).toBeNull();
    expect(port.close).toHaveBeenCalled();
  });
});

function createFakeIndexedDB() {
  const databases = new Map();

  // Deep clone helper that preserves ArrayBuffer and TypedArray values
  function cloneDeepPreserveTypedArrays(value) {
    if (value === null || value === undefined) return value;
    if (ArrayBuffer.isView(value)) {
      const Ctor = value.constructor;
      return new Ctor(value);
    }
    if (value instanceof ArrayBuffer) {
      return value.slice(0);
    }
    if (Array.isArray(value)) return value.map(cloneDeepPreserveTypedArrays);
    if (value instanceof Date) return new Date(value.getTime());
    if (typeof value === 'object') {
      const out = {};
      for (const k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) {
          out[k] = cloneDeepPreserveTypedArrays(value[k]);
        }
      }
      return out;
    }
    return value;
  }

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
        const cloned = cloneDeepPreserveTypedArrays(value);
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

    put(value) {
      const request = {};
      Promise.resolve().then(() => {
        const cloned = cloneDeepPreserveTypedArrays(value);
        let key = cloned[this.keyPath];
        if (key === undefined && this.autoIncrement) {
          key = this.records.length + 1;
          cloned.id = key;
        }
        const existingIndex = this.records.findIndex((record) => record[this.keyPath] === key);
        if (existingIndex >= 0) {
          this.records[existingIndex] = cloned;
        } else {
          this.records.push(cloned);
        }
        request.result = key;
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request });
        }
      });
      return request;
    }

    get(key) {
      const request = {};
      Promise.resolve().then(() => {
        const record = this.records.find((record) => record[this.keyPath] === key);
        request.result = record === undefined ? undefined : cloneDeepPreserveTypedArrays(record);
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

    count(range) {
      const request = {};
      Promise.resolve().then(() => {
        const count = this.store.records.reduce((total, record) => {
          if (!range) return total + 1;
          const value = record[this.keyPath];
          if (range.type === 'only') {
            return value === range.value ? total + 1 : total;
          }
          if (range.type === 'upperBound') {
            return value <= range.value ? total + 1 : total;
          }
          return total + 1;
        }, 0);
        request.result = count;
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
        // these may be set on upgrade events
        result: undefined,
        transaction: undefined,
        oldVersion: undefined,
        newVersion: undefined,
      };

      Promise.resolve().then(() => {
        const existing = databases.get(name);
        const oldVersion = existing ? existing.version : 0;
        if (!existing || version > oldVersion) {
          // Use existing.db when upgrading so existing object stores are
          // available during the upgrade transaction; otherwise create a
          // fresh DB for initial creation.
          const db = existing ? existing.db : new FakeIDBDatabase(name, version);

          // Create an upgrade transaction that exposes objectStore access
          // via event.target.transaction during onupgradeneeded.
          const upgradeStoreNames = Array.from(db.objectStores.keys());
          const tx = new FakeIDBTransaction(db, upgradeStoreNames, 'versionchange');

          // Attach upgrade context to the request so handlers can access it.
          request.result = db;
          request.transaction = tx;
          request.oldVersion = oldVersion;
          request.newVersion = version;

          if (typeof request.onupgradeneeded === 'function') {
            request.onupgradeneeded({ target: request });
          }

          // Persist the (possibly upgraded) DB and version.
          databases.set(name, { version, db });

          // For the onsuccess event, clear the transient upgrade fields and
          // surface the resulting DB as the request.result.
          request.transaction = undefined;
          request.oldVersion = undefined;
          request.newVersion = undefined;
          if (typeof request.onsuccess === 'function') {
            request.onsuccess({ target: request });
          }
        } else {
          request.result = existing.db;
          if (typeof request.onsuccess === 'function') {
            request.onsuccess({ target: request });
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
  });

  it('counts successful routes only once when results include multiple passes for the same route', async () => {
    vi.resetModules();
    buildMinimalBenchmarkDOM();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ tiles: ['https://fake.tiles/{z}/{x}/{y}.pbf'] }),
    }));
    const benchmark = await import('../benchmark/assets/index.js');

    benchmark._setBenchmarkRouteWorkerState({
      totalTasks: 1,
      totalRoutes: 1,
      totalPasses: 2,
      completedTasks: 0,
      startedTasks: 0,
      lastStatus: null,
      successfulRoutes: 0,
      successfulRouteIndices: new Set(),
      successThreshold: 2,
      activeTasks: 0,
    });

    benchmark._handleBenchmarkRouteWorkerMessage({
      data: {
        type: 'result',
        runId: 'run-1',
        routeIndex: 0,
        passIndex: 0,
        routeLabel: 'route-0',
        result: { found: true, error: null },
      },
    });
    benchmark._handleBenchmarkRouteWorkerMessage({
      data: {
        type: 'result',
        runId: 'run-1',
        routeIndex: 0,
        passIndex: 1,
        routeLabel: 'route-0',
        result: { found: true, error: null },
      },
    });

    const state = benchmark._getBenchmarkRouteWorkerState();
    expect(state.successfulRoutes).toBe(1);
    expect(state.successfulRouteIndices.has(0)).toBe(true);
    expect(state.successfulRouteIndices.size).toBe(1);
  });

  it('tracks completed routes instead of completed passes for progress labels', async () => {
    vi.resetModules();
    buildMinimalBenchmarkDOM();
    const benchmark = await import('../benchmark/assets/index.js');

    benchmark._setBenchmarkRouteWorkerState({
      totalTasks: 1,
      totalRoutes: 1,
      totalPasses: 2,
      completedTasks: 0,
      completedRoutes: 0,
      completedRouteIndices: new Set(),
      startedTasks: 0,
      lastStatus: null,
      successfulRoutes: 0,
      successfulRouteIndices: new Set(),
      successThreshold: Infinity,
      activeTasks: 0,
    });

    benchmark._handleBenchmarkRouteWorkerMessage({
      data: {
        type: 'result',
        runId: 'run-1',
        routeIndex: 0,
        passIndex: 0,
        routeLabel: 'route-0',
        result: { found: true, error: null },
      },
    });
    benchmark._flushBenchmarkUi();

    expect(document.getElementById('progress-text').textContent).toContain('0/1');
    expect(benchmark._getBenchmarkRouteWorkerState().completedRoutes).toBe(0);

    benchmark._handleBenchmarkRouteWorkerMessage({
      data: { type: 'routeCompleted', runId: 'run-1', routeIndex: 0 },
    });
    benchmark._flushBenchmarkUi();

    expect(document.getElementById('progress-text').textContent).toContain('1/1');
    expect(benchmark._getBenchmarkRouteWorkerState().completedRoutes).toBe(1);
  });

  it('updates progress bar and label against success threshold when set', async () => {
    buildMinimalBenchmarkDOM();
    const benchmark = await import('../benchmark/assets/index.js');

    benchmark._setBenchmarkRouteWorkerState({
      totalTasks: 3,
      totalRoutes: 3,
      totalPasses: 1,
      completedTasks: 0,
      startedTasks: 0,
      lastStatus: null,
      successfulRoutes: 0,
      successfulRouteIndices: new Set(),
      successThreshold: 2,
      activeTasks: 0,
    });

    benchmark._handleBenchmarkRouteWorkerMessage({
      data: {
        type: 'status',
        runId: 'run-1',
        routeIndex: 0,
        passIndex: 0,
        routeLabel: 'route-0',
        status: 'fetching-tiles',
      },
    });

    benchmark._flushBenchmarkUi();

    expect(document.getElementById('progress-bar').style.width).toBe('0%');
    expect(document.getElementById('progress-text').textContent).toContain('0/2');

    benchmark._handleBenchmarkRouteWorkerMessage({
      data: {
        type: 'result',
        runId: 'run-1',
        routeIndex: 0,
        passIndex: 0,
        routeLabel: 'route-0',
        result: { found: true, error: null },
      },
    });

    benchmark._flushBenchmarkUi();

    expect(document.getElementById('progress-bar').style.width).toBe('50%');
    expect(document.getElementById('progress-text').textContent).toContain('1/2');
  });

  it('ignores unsupported memory status updates so progress text does not become "memory unavailable"', async () => {
    buildMinimalBenchmarkDOM();
    const benchmark = await import('../benchmark/assets/index.js');

    benchmark._setBenchmarkRouteWorkerState({
      totalTasks: 2,
      totalRoutes: 2,
      totalPasses: 1,
      completedTasks: 0,
      startedTasks: 0,
      lastStatus: null,
      successfulRoutes: 0,
      successfulRouteIndices: new Set(),
      successThreshold: Infinity,
      activeTasks: 0,
    });

    benchmark._handleBenchmarkRouteWorkerMessage({
      data: {
        type: 'status',
        runId: 'run-1',
        routeIndex: 0,
        passIndex: 0,
        routeLabel: 'route-0',
        status: 'fetching-tiles',
      },
    });

    benchmark._flushBenchmarkUi();

    const initialText = document.getElementById('progress-text').textContent;
    benchmark._handleBenchmarkRouteWorkerMessage({
      data: {
        type: 'status',
        runId: 'run-1',
        routeIndex: 0,
        passIndex: 0,
        routeLabel: 'route-0',
        status: 'memory',
      },
    });

    benchmark._flushBenchmarkUi();

    expect(document.getElementById('progress-text').textContent).toBe(initialText);
  });

  it('never estimates total runtime shorter than elapsed time', async () => {
    document.body.innerHTML = `
      <div id="category-filters"></div>
      <div id="length-filters"></div>
      <div id="route-count"></div>
      <div id="progress-section"></div>
      <div id="results-section"></div>
      <div id="results-tbody"></div>
      <div id="summary-cards"></div>
      <div id="summary-tbody"></div>
      <div id="summary-thead"></div>
      <div id="cost-summary-tbody"></div>
      <div id="cost-summary-thead"></div>
      <table id="summary-table"></table>
      <table id="cost-summary-table"></table>
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
      <button id="pagination-prev"></button>
      <button id="pagination-next"></button>
      <table id="results-table"></table>
      <select id="mode-select"></select>
      <input id="runs-input" />
      <input id="pause-input" />
      <div id="report-panel"></div>
      <div id="report-type-controls"></div>
      <select id="report-view-select"></select>
      <div id="report-status"></div>
      <div id="report-note"></div>
      <div id="report-output"></div>
      <div id="pause-state"></div>
      <div id="suggestion-wrap"></div>
      <button id="run-btn"></button>
      <button id="stop-btn"></button>
      <button id="download-btn"></button>
      <button id="pause-btn"></button>
      <button id="report-btn"></button>
      <button id="copy-report-btn"></button>
      <div id="results-table-wrap"></div>
      <input id="success-routes-input" type="number" value="0" />
    `;

    const benchmark = await import('../benchmark/assets/index.js');

    const estimated = benchmark.computeBenchmarkEstimatedTotalMs({
      elapsedMs: 9000,
      completedRoutes: 10,
      effectiveTotalRoutes: 5,
    });

    expect(estimated).toBeGreaterThanOrEqual(9000);
  });

  it('ignores late result events when benchmark state is not initialized', async () => {
    buildMinimalBenchmarkDOM();
    const benchmark = await import('../benchmark/assets/index.js');

    expect(() => {
      benchmark._handleBenchmarkRouteWorkerMessage({
        data: {
          type: 'result',
          runId: 'run-1',
          routeIndex: 0,
          passIndex: 0,
          routeLabel: 'route-0',
          result: { found: true, error: null },
        },
      });
    }).not.toThrow();

    expect(document.getElementById('progress-bar').style.width).toBe('');
    expect(document.getElementById('progress-text').textContent).toBe('');
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

  it('strips nested sample arrays and timing rounds before saving results', async () => {
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
    await benchDb.prepareForRun('run-strip', { clearAll: true });
    const result = {
      id: 'row-strip',
      results: {
        'bidirectional-astar': {
          medianMs: 10,
          samplesMs: [10, 11],
          sampleStats: { mean: 10.5 },
        },
      },
      rawDiagnostics: {
        execution: {
          timingRounds: [{ engines: {} }],
          timingSamplesMsByEngine: { 'bidirectional-astar': [10, 11] },
          timingSampleStatsByEngine: { 'bidirectional-astar': { mean: 10.5 } },
        },
      },
    };

    await benchDb.saveResultToDB('run-strip', 0, 0, result);
    await benchDb.waitForPendingWrites();

    const rows = await benchDb.getRecordsForRun('run-strip');
    expect(rows[0].result.results['bidirectional-astar'].samplesMs).toBeUndefined();
    expect(rows[0].result.results['bidirectional-astar'].sampleStats).toBeUndefined();
    expect(rows[0].result.rawDiagnostics.execution.timingRounds).toBeUndefined();
    expect(
      rows[0].result.rawDiagnostics.execution.timingSamplesMsByEngine['bidirectional-astar']
    ).toEqual([10, 11]);
  });

  it('repairs missing results.runId index and returns run records', async () => {
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    // Pre-create a DB at the expected version but without the results.runId index.
    const createReq = indexedDB.open('omp-benchmark-db', 4);
    await new Promise((resolve, reject) => {
      createReq.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore('results', { autoIncrement: true });
        const runs = db.createObjectStore('runs', { keyPath: 'runId' });
        runs.createIndex('completed', 'completed', { unique: false });
        db.createObjectStore('metrics', { autoIncrement: true });
      };
      createReq.onsuccess = (e) => resolve(e.target.result);
      createReq.onerror = (e) => reject(e.target.error);
    });

    // Insert a sample result row into the pre-created DB.
    const dbPre = await new Promise((resolve) => {
      const r = indexedDB.open('omp-benchmark-db');
      r.onsuccess = () => resolve(r.result);
    });
    const tx = dbPre.transaction('results', 'readwrite');
    const store = tx.objectStore('results');
    store.add({
      runId: 'run-missing',
      passIndex: 0,
      routeIndex: 0,
      ts: Date.now(),
      result: { id: 'row1' },
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const benchDb = await import('../benchmark/assets/bench-db.js');
    // openDB should detect the missing index and repair the DB schema.
    const db = await benchDb.openDB();
    const tx2 = db.transaction('results', 'readonly');
    const store2 = tx2.objectStore('results');
    expect(store2.indexNames.contains('runId')).toBe(true);

    const rows = await benchDb.getRecordsForRun('run-missing');
    expect(rows).toHaveLength(1);
    expect(rows[0].result.id).toBe('row1');
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
    await expect(
      benchDb.prepareForRun('run-error', { clearAll: true, ttlMs: 1 })
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('preserves existing run records when resuming a pending run', async () => {
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
    await benchDb.prepareForRun('run-resume', { clearAll: true });
    await benchDb.saveResultToDB('run-resume', 1, 0, { id: 'resume-row' });
    await benchDb.waitForPendingWrites();

    await benchDb.prepareForRun('run-resume', { clearAll: false, resume: true });
    const rows = await benchDb.getRecordsForRun('run-resume');
    expect(rows).toHaveLength(1);
    expect(rows[0].result.id).toBe('resume-row');
  });

  it('saves and retrieves run metadata with completed flag', async () => {
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
    const metadata = await benchDb.saveRunMetadata('run-meta', {
      createdAt: 100,
      completed: false,
    });
    expect(metadata).toMatchObject({ runId: 'run-meta', createdAt: 100, completed: false });

    const loaded = await benchDb.getRunMetadata('run-meta');
    expect(loaded).toMatchObject({ runId: 'run-meta', createdAt: 100, completed: false });

    const updated = await benchDb.saveRunMetadata('run-meta', {
      completed: true,
      completedAt: 200,
    });
    expect(updated).toMatchObject({ runId: 'run-meta', completed: true, completedAt: 200 });
    expect(updated.updatedAt).toBeGreaterThan(metadata.updatedAt);
  });

  it('persists summary state inside run metadata for resume card rehydration', async () => {
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
    const summaryState = {
      totalRoutes: 4,
      completedRoutes: 2,
      routeErrorCount: 1,
      engineWins: {
        'bidirectional-astar': 1,
        'adaptive-barrier': 1,
      },
      tieCount: 0,
      unrecoveredEngineErrorRouteCount: 0,
      autoSelector: { selected: 0, changed: 0 },
    };

    await benchDb.saveRunMetadata('run-summary', {
      createdAt: 50,
      completed: false,
      summaryState,
    });

    const loaded = await benchDb.getRunMetadata('run-summary');
    expect(loaded).toMatchObject({ runId: 'run-summary', completed: false, summaryState });
  });

  it('clears both results and run metadata when prepareForRun clearAll is true', async () => {
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
    await benchDb.saveRunMetadata('run-clear', { completed: false });
    await benchDb.saveResultToDB('run-clear', 0, 0, { id: 'keep' });
    await benchDb.waitForPendingWrites();

    await benchDb.prepareForRun('run-clear', { clearAll: true });

    const runMetadata = await benchDb.getRunMetadata('run-clear');
    expect(runMetadata).toBeUndefined();
    const rows = await benchDb.getRecordsForRun('run-clear');
    expect(rows).toHaveLength(0);
  });

  it('shows explicit resume/restart controls when a pending DB run exists', async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    buildMinimalBenchmarkDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const runId = 'pending-run-123';
    localStorage.setItem('omp_benchmark_last_run_v1', runId);

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.saveRunMetadata(runId, {
      createdAt: 1,
      completed: false,
      totalRoutes: 1,
      totalPasses: 1,
    });

    const benchmark = await import('../benchmark/assets/index.js');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById('pending-run-prompt').hidden).toBe(false);
    expect(document.getElementById('run-btn').disabled).toBe(true);

    document.getElementById('resume-run-btn').click();
    expect(document.getElementById('pending-run-prompt').hidden).toBe(true);
    expect(document.getElementById('run-btn').disabled).toBe(false);

    // restart should clear the saved run id and re-enable the UI
    document.getElementById('restart-run-btn').click();
    expect(localStorage.getItem('omp_benchmark_last_run_v1')).toBeNull();
    expect(document.getElementById('pending-run-prompt').hidden).toBe(true);
    expect(document.getElementById('run-btn').disabled).toBe(false);
  });

  it('loads persisted summary state from run metadata for current run ids', async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    buildMinimalBenchmarkDOM();
    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const runId = 'resume-summary-run';
    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.saveRunMetadata(runId, {
      createdAt: Date.now(),
      completed: false,
      totalRoutes: 1,
      totalPasses: 1,
      summaryState: {
        totalRoutes: 1,
        engineWins: {
          'bidirectional-astar': 1,
          'adaptive-barrier': 0,
          'delta-stepping': 0,
          'ultra-dijkstra': 0,
        },
        tieCount: 0,
        routeErrorCount: 0,
        unrecoveredEngineErrorRouteCount: 0,
        autoSelector: {
          exactHits: 1,
          nearTieHits: 0,
          misses: 0,
          coverage: 100,
        },
      },
    });

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId(runId);
    benchmark._setBenchmarkSummaryState({
      totalRoutes: 0,
      engineWins: {
        'bidirectional-astar': 0,
        'adaptive-barrier': 0,
        'delta-stepping': 0,
        'ultra-dijkstra': 0,
      },
      tieCount: 0,
      routeErrorCount: 0,
      unrecoveredEngineErrorRouteCount: 0,
      autoSelector: {
        exactHits: 0,
        nearTieHits: 0,
        misses: 0,
        coverage: 0,
      },
    });

    await benchmark.showResults([]);

    expect(document.getElementById('auto-selector-summary').hidden).toBe(false);
    expect(document.getElementById('auto-selector-cards').textContent).toContain('Exact hits');
  });

  it('closes the database and resets internal state without throwing', async () => {
    vi.resetModules();
    global.indexedDB = {
      open() {
        const req = {};
        setTimeout(() => {
          req.result = {
            close: () => {
              throw new Error('close failed');
            },
          };
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

  // Table rendering and DOM-based sorting removed from the simplified benchmark
  // UI. The previous test validated paged DB sorting via the table UI; with the
  // table UI gone this behavior is exercised via the DB helpers and paging
  // logic directly. Omit the DOM-based test to avoid depending on removed UI.

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
    const parallelPayload = payloads.find(
      (payload) => payload.runtime.parallelOrSerial === 'parallel'
    );
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
    const parallelPayload = payloads.find(
      (payload) => payload.runtime.parallelOrSerial === 'parallel'
    );
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

    const variants = benchmark.createReportVariants([{ _passIndex: 0, route: 'route-a' }]);
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
    expect(payload1.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-0', _sab: true })
    );
    expect(payload2.rawResults).toContainEqual(
      expect.objectContaining({ id: 'db-row-1', _sab: false })
    );
  });

  it('clears cached render results when switching to a new current runId', async () => {
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
    const parallelPayload = payloads.find(
      (payload) => payload.runtime.parallelOrSerial === 'parallel'
    );
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');

    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([expect.objectContaining({ id: 'db-row-0' })]);
    expect(serialPayload.rawResults).toEqual([expect.objectContaining({ id: 'db-row-1' })]);
  });

  it('marks a benchmark complete even when stop-path artifact saving fails', async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    buildMinimalBenchmarkDOM();

    const fetchMock = setupFetchAndDOM();
    fetchMock.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/__benchmark/save-results')) {
        return { ok: false, status: 500, text: async () => 'server error' };
      }
      return { ok: true, json: async () => ({ tiles: ['https://fake.tiles/{z}/{x}/{y}.pbf'] }) };
    });

    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const runId = 'run-stop-failure';
    localStorage.setItem('omp_benchmark_last_run_v1', runId);

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun(runId, { clearAll: true });
    await benchDb.saveRunMetadata(runId, {
      createdAt: 1,
      completed: false,
      totalRoutes: 1,
      totalPasses: 1,
    });
    await benchDb.saveResultToDB(runId, 0, 0, { id: 'db-row-0' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([{ passKey: 'pass-1', description: 'Pass 1' }]);
    benchmark.setCurrentRunId(runId);

    document.getElementById('stop-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(localStorage.getItem('omp_benchmark_last_run_v1')).toBeNull();
    expect(document.getElementById('report-status').textContent).toBe('Report ready');
  });

  it('clears incomplete pending run state when benchmark stop is clicked', async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    buildMinimalBenchmarkDOM();

    const fetchMock = setupFetchAndDOM();
    fetchMock.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/__benchmark/save-results')) {
        return { ok: true, json: async () => ({ path: 'artifact.json' }) };
      }
      return { ok: true, json: async () => ({ tiles: ['https://fake.tiles/{z}/{x}/{y}.pbf'] }) };
    });

    global.indexedDB = createFakeIndexedDB();
    global.IDBKeyRange = {
      only(value) {
        return { type: 'only', value, valueKey: 'runId' };
      },
      upperBound(value) {
        return { type: 'upperBound', value, valueKey: 'ts' };
      },
    };

    const runId = 'run-stop-pending-cleanup';
    localStorage.setItem('omp_benchmark_last_run_v1', runId);

    const benchDb = await import('../benchmark/assets/bench-db.js');
    await benchDb.prepareForRun(runId, { clearAll: true });
    await benchDb.saveRunMetadata(runId, {
      createdAt: 1,
      completed: false,
      totalRoutes: 1,
      totalPasses: 1,
    });
    await benchDb.saveResultToDB(runId, 0, 0, { id: 'db-row-0' });
    await benchDb.waitForPendingWrites();

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setPassContexts([{ passKey: 'pass-1', description: 'Pass 1' }]);
    benchmark.setCurrentRunId(runId);

    document.getElementById('stop-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(localStorage.getItem('omp_benchmark_last_run_v1')).toBeNull();
    const pending = await benchDb.findIncompleteRunMetadata();
    expect(pending).toBeNull();
  });

  it('clears saved run ID when benchmark completes, including early threshold finishes', async () => {
    vi.resetModules();
    document.body.innerHTML = '';
    buildMinimalBenchmarkDOM();

    const runId = 'run-complete-clear-saved-id';
    localStorage.setItem('omp_benchmark_last_run_v1', runId);

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
    await benchDb.prepareForRun(runId, { clearAll: true });

    const benchmark = await import('../benchmark/assets/index.js');
    benchmark.setCurrentRunId(runId);

    await benchmark.markRunComplete(runId);
    expect(localStorage.getItem('omp_benchmark_last_run_v1')).toBeNull();
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

    const previousSharedArrayBuffer = global.SharedArrayBuffer;
    global.SharedArrayBuffer = class SharedArrayBuffer {};
    globalThis.__benchmarkRouteWorkerCtor = class FakeBenchmarkRouteWorker {
      constructor() {
        this.onmessage = null;
        this.onerror = null;
      }
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() {
        return true;
      }
    };

    const benchmark = await import('../benchmark/assets/index.js');
    document.querySelectorAll('#category-filters input').forEach((el, idx) => {
      el.checked = idx === 0;
    });
    document.querySelectorAll('#length-filters input').forEach((el, idx) => {
      el.checked = idx === 0;
    });
    benchmark.updateRouteCount();

    const cleanupSharedArrayBuffer = () => {
      if (previousSharedArrayBuffer === undefined) {
        delete global.SharedArrayBuffer;
      } else {
        global.SharedArrayBuffer = previousSharedArrayBuffer;
      }
    };

    const cleanupWorker = () => {
      delete globalThis.__benchmarkRouteWorkerCtor;
    };

    try {
      document.getElementById('url-input').value = 'https://fake.tiles/{z}/{x}/{y}.pbf';
      document.getElementById('mode-select').innerHTML = '<option value="test">test</option>';
      document.getElementById('mode-select').value = 'test';
      document.getElementById('runs-input').value = '1';
      document.getElementById('pause-input').value = '0';

      document.getElementById('run-btn').click();
      await new Promise((resolve) => setTimeout(resolve, 5));
      document.getElementById('stop-btn').click();
      await new Promise((resolve) => setTimeout(resolve, 150));
    } finally {
      cleanupSharedArrayBuffer();
      cleanupWorker();
    }

    const saveCalls = fetchMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('/__benchmark/save-results')
    );
    expect(saveCalls).toHaveLength(2);

    const payloads = saveCalls.map((call) => JSON.parse(call[1].body).payload);
    expect(
      payloads.filter((payload) => payload.runtime.parallelOrSerial === 'parallel')
    ).toHaveLength(1);
    expect(
      payloads.filter((payload) => payload.runtime.parallelOrSerial === 'serial')
    ).toHaveLength(1);
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
    const pass0Payload = payloads.find((payload) =>
      payload.rawResults.some((row) => row.passIndex === 0)
    );
    const pass1Payload = payloads.find((payload) =>
      payload.rawResults.some((row) => row.passIndex === 1)
    );

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
    expect(pass0Payload.rawResults).not.toContainEqual(
      expect.objectContaining({ route: 'bad-row' })
    );
    expect(pass1Payload.rawResults).not.toContainEqual(
      expect.objectContaining({ route: 'bad-row' })
    );
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
    const pass0Payload = payloads.find((payload) =>
      payload.rawResults.some((row) => row.id === 'db-row-0')
    );
    const pass1Payload = payloads.find((payload) =>
      payload.rawResults.some((row) => row.id === 'db-row-1')
    );

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
    const parallelPayload = payloads.find(
      (payload) => payload.runtime.parallelOrSerial === 'parallel'
    );
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');

    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([expect.objectContaining({ route: 'route-a' })]);
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
    const parallelPayload = payloads.find(
      (payload) => payload.runtime.parallelOrSerial === 'parallel'
    );
    const serialPayload = payloads.find((payload) => payload.runtime.parallelOrSerial === 'serial');

    expect(parallelPayload).toBeDefined();
    expect(serialPayload).toBeDefined();
    expect(parallelPayload.rawResults).toEqual([expect.objectContaining({ route: 'route-a' })]);
    expect(serialPayload.rawResults).toEqual([expect.objectContaining({ route: 'route-b' })]);
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
    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'route-a' }], {
      runId: 'run-fail',
    });

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
    benchmark.setPassContexts([{ passKey: 'pass-1' }, { passKey: 'pass-2' }]);

    const savedPaths = await benchmark.saveRunArtifacts([{ _passIndex: 0, route: 'route-a' }], {
      runId: 'run-pass-fail',
    });

    expect(savedPaths).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  describe('Benchmark selector feature classification', () => {
    it('classifies selector features for low-edge graphs and produces a signature', async () => {
      const { classifySelectorFeatures, getSelectorBins } =
        await import('../benchmark/assets/benchmark-selector-features.js');

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
      const { classifySelectorFeatures } =
        await import('../benchmark/assets/benchmark-selector-features.js');

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
      expect(result.winnerCandidates).toEqual(
        expect.arrayContaining(['bidirectional-astar', 'adaptive-barrier'])
      );
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

    // chart-related helpers removed — tests for visual helpers omitted

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
    // CSV export test removed: CSV helpers deleted from benchmark assets.

    it('updates report controls and selects a report variant with sharedArrayBuffer contexts', async () => {
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
      expect(variants).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: 'sab_on' })])
      );
      benchmark.updateReportTypeControls();

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
      expect(initialVariants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'sab_on' }),
          expect.objectContaining({ key: 'sab_off' }),
        ])
      );

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

    it('defaults to the combined report variant when no pass contexts are present', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');

      benchmark.updateReportTypeControls();
      const selected = benchmark.getSelectedReportVariant();
      expect(selected.key).toBe('combined');
    });

    it('falls back to the first report variant when no selection is set', async () => {
      setupFetchAndDOM();
      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.setPassContexts([
        { sharedArrayBuffer: true, parallelOrSerial: 'parallel', passIndex: 0, totalPasses: 2 },
        { sharedArrayBuffer: false, parallelOrSerial: 'serial', passIndex: 1, totalPasses: 2 },
      ]);

      benchmark.createReportVariants([
        { _passIndex: 0, route: 'route-a' },
        { _passIndex: 1, route: 'route-b' },
      ]);
      benchmark.updateReportTypeControls();

      const selected = benchmark.getSelectedReportVariant();
      expect(selected).toBeDefined();
      expect(selected.key).toBe('combined');
    });

    // Chart/table test removed — benchmark UI simplified.

    it('keeps action buttons hidden until benchmark completion during showResults', async () => {
      setupFetchAndDOM();
      const wrapper = document.createElement('div');
      wrapper.className = 'actions';
      wrapper.hidden = true;
      wrapper.innerHTML =
        '<button id="download-btn"></button><button id="report-btn"></button><button id="copy-report-btn"></button>';
      document.body.appendChild(wrapper);

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

      await benchDb.prepareForRun('run-show-results-actions', { clearAll: true });
      await benchDb.saveResultToDB('run-show-results-actions', 0, 0, results[0]);
      await benchDb.waitForPendingWrites();

      const benchmark = await import('../benchmark/assets/index.js');
      benchmark.setCurrentRunId('run-show-results-actions');
      await benchmark.showResults();
      expect(document.querySelector('.actions').hidden).toBe(true);
    });

    // Chart/table test removed — benchmark UI simplified.

    // Chart/table test removed — benchmark UI simplified.

    // Chart/table tests removed — benchmark UI simplified.

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
  // Chart and table tests removed — benchmark UI simplified.
});
