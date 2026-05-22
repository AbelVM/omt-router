import {
  ROUTES,
  CATEGORIES,
  LENGTH_CATEGORIES,
  CATEGORY_LABELS,
  LENGTH_CATEGORY_LABELS,
} from './routes.js';
import {
  disposeBenchmarkResources,
  getSharedPool,
  generatePerformanceSummary,
  generateCostSummary,
  generateCopilotReport,
  sleep,
} from './benchmark.js';
import {
  prepareForRun,
  getRecordsForRun,
  getRunRecordCount,
  getRecordsForRunPage,
  streamRunRecords,
  waitForPendingWrites,
  disposeBenchDb,
  saveRunMetadata,
  getRunMetadata,
  findIncompleteRunMetadata,
} from './bench-db.js';
import { PowerPool } from 'performance-helpers/powerPool';
import BenchmarkRouteWorker from './benchmark-route-worker.js?worker&inline';
// Lightweight logging + focused instrumentation (quiet by default).
// Toggle verbose logging by setting `globalThis.__benchmarkDebug = true`.
const __benchmarkLog = (() => {
  const WARN_LIMIT = 3;
  const warnCounts = new Map();
  function info(...args) {
    if (typeof globalThis !== 'undefined' && globalThis.__benchmarkDebug) {
      console.info('[benchmark]', ...args);
    }
  }
  function warn(...args) {
    const key = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    const cnt = warnCounts.get(key) || 0;
    if (typeof globalThis !== 'undefined' && globalThis.__benchmarkDebug) {
      if (cnt < WARN_LIMIT) {
        console.warn('[benchmark]', ...args);
        warnCounts.set(key, cnt + 1);
      }
    }
  }
  function error(...args) {
    if (typeof globalThis !== 'undefined' && globalThis.__benchmarkDebug) {
      console.error('[benchmark]', ...args);
    }
  }
  return { info, warn, error };
})();

let _pendingRunMetadata = null;
let _pendingRunChoice = null;
let _pendingRunRunId = null;
let _progressSaveTimer = null;

function updatePendingRunChooser() {
  if (!pendingRunPromptEl || !pendingRunMessageEl || !runBtn) return;
  if (!_pendingRunMetadata) {
    pendingRunPromptEl.hidden = true;
    if (runBtn) runBtn.disabled = false;
    return;
  }

  const createdAt = typeof _pendingRunMetadata.createdAt === 'number'
    ? new Date(_pendingRunMetadata.createdAt).toLocaleString()
    : _pendingRunMetadata.createdAt
      ? String(_pendingRunMetadata.createdAt)
      : 'an earlier session';

  pendingRunMessageEl.textContent =
    `A previous benchmark run from ${createdAt} is still incomplete in the database. ` +
    'Resume that run or restart fresh?';
  pendingRunPromptEl.hidden = false;
  if (runBtn) runBtn.disabled = true;
}

async function detectPendingRunMetadata() {
  if (!pendingRunPromptEl || !runBtn) return;
  try {
    const pending = await findIncompleteRunMetadata();
    _pendingRunMetadata = pending || null;
  } catch (err) {
    __benchmarkLog.warn('[benchmark] detectPendingRunMetadata failed:', err);
    _pendingRunMetadata = null;
  }
  updatePendingRunChooser();
}

function choosePendingRunAction(choice) {
  _pendingRunChoice = choice;
  if (choice === 'resume') {
    _pendingRunRunId = _pendingRunMetadata?.runId ?? null;
  }
  if (choice === 'restart') {
    clearSavedRunId();
  }
  _pendingRunMetadata = null;
  updatePendingRunChooser();
}

// Persist / clear a saved run id in localStorage (best-effort, no-throw)
function saveRunId(runId) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      // Persist the last run id using the stable key used by tests and older code
      if (runId == null) localStorage.removeItem('omp_benchmark_last_run_v1');
      else localStorage.setItem('omp_benchmark_last_run_v1', String(runId));
    }
  } catch (e) {}
}

function clearSavedRunId() {
  try {
    saveRunId(null);
  } catch (e) {}
}

async function selectRunIdForBenchmarkStart(benchmarkTimestamp, { explicitRunId, forceNewRun } = {}) {
  if (explicitRunId) return explicitRunId;
  if (!forceNewRun) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        const saved = localStorage.getItem('omp_benchmark_last_run_v1');
        if (saved) return saved;
      }
    } catch (e) {}
  }
  const ts = benchmarkTimestamp ?? makeBenchmarkTimestamp(new Date());
  return `${ts}_${Math.random().toString(36).slice(2, 8)}`;
}

async function markRunComplete(runId, metadata = {}) {
  if (!runId) return;
  try {
    await flushBenchmarkSummaryStatePersist();
    await flushBenchmarkProgressPersist();
    await saveRunMetadata(runId, {
      completed: true,
      completedAt: Date.now(),
      ...metadata,
    });
  } catch (err) {
    console.warn('[benchmark] markRunComplete failed:', err);
  }
  clearSavedRunId();
}

async function loadExistingRunProgress(runId, totalPasses) {
  if (!runId) return null;

  // Prefer stored progress in run metadata to avoid scanning the results store.
  try {
    const meta = await getRunMetadata(runId);
    const p = meta?.progress;
    if (p) {
      const routePassCompletion = new Map();
      try {
        const rpc = p.routePassCompletion ?? {};
        if (rpc && typeof rpc === 'object') {
          if (typeof rpc.forEach === 'function') {
            rpc.forEach((arr, key) => {
              routePassCompletion.set(Number(key), new Set(Array.isArray(arr) ? arr.map(Number) : []));
            });
          } else {
            Object.entries(rpc).forEach(([k, v]) => {
              routePassCompletion.set(Number(k), new Set(Array.isArray(v) ? v.map(Number) : []));
            });
          }
        }
      } catch (_e) {
        /* best-effort */
      }

      const completedRouteIndices = new Set((p.completedRouteIndices ?? []).map(Number));
      if (completedRouteIndices.size === 0 && routePassCompletion.size > 0) {
        for (const [routeIndex, passes] of routePassCompletion.entries()) {
          if ((passes?.size ?? 0) === totalPasses) completedRouteIndices.add(routeIndex);
        }
      }

      const successfulRouteIndices = new Set((p.successfulRouteIndices ?? []).map(Number));
      const failedRouteIndices = new Set((p.failedRouteIndices ?? []).map(Number));
      const completedTasks = Number(p.completedTasks ?? Array.from(routePassCompletion.values()).reduce((s, set) => s + (set?.size ?? 0), 0));

      return {
        completedRoutes: completedRouteIndices.size,
        completedTasks,
        completedRouteIndices,
        successfulRouteIndices,
        failedRouteIndices,
        routePassCompletion,
      };
    }
  } catch (_err) {
    __benchmarkLog.warn('[benchmark] loadExistingRunProgress metadata read failed:', _err);
  }

  // Fallback: scan results store (index-first inside getRecordsForRun)
  const rows = await getRecordsForRun(runId);
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const routePassCompletion = new Map();
  const successfulRouteIndices = new Set();
  const failedRouteIndices = new Set();

  for (const row of rows) {
    const routeIndex = Number(row.routeIndex);
    const passIndex = Number(row.passIndex);
    if (!routePassCompletion.has(routeIndex)) {
      routePassCompletion.set(routeIndex, new Set());
    }
    routePassCompletion.get(routeIndex).add(passIndex);

    const result = row.result;
    const routeFailed = Boolean(result?.error || result?.routeError);
    if (routeFailed) {
      failedRouteIndices.add(routeIndex);
      successfulRouteIndices.delete(routeIndex);
    } else if (!failedRouteIndices.has(routeIndex)) {
      successfulRouteIndices.add(routeIndex);
    }
  }

  const completedRouteIndices = new Set(
    Array.from(routePassCompletion.entries())
      .filter(([, passes]) => passes.size === totalPasses)
      .map(([routeIndex]) => routeIndex),
  );

  return {
    completedRoutes: completedRouteIndices.size,
    completedTasks: rows.length,
    completedRouteIndices,
    successfulRouteIndices,
    failedRouteIndices,
    routePassCompletion,
  };
}

// Simple runtime metrics exposed for quick inspection during profiling.
const benchmarkMetrics = (() => {
  const m = {
    attachedPorts: 0,
    attachEvents: 0,
    detachEvents: 0,
    lastAttachTs: null,
    lastDetachTs: null,
    attachHistory: [],
  };
  try {
    if (typeof globalThis !== 'undefined') {
      Object.defineProperty(globalThis, '__benchmarkMetrics', {
        configurable: true,
        enumerable: false,
        get() {
          return m;
        },
      });
    }
  } catch (_err) {
    /* ignore */
  }
  return m;
})();

function incAttachedPorts(n = 1) {
  benchmarkMetrics.attachedPorts = (benchmarkMetrics.attachedPorts || 0) + n;
  benchmarkMetrics.attachEvents = (benchmarkMetrics.attachEvents || 0) + n;
  benchmarkMetrics.lastAttachTs = Date.now();
  benchmarkMetrics.attachHistory.push({ ts: benchmarkMetrics.lastAttachTs, delta: n });
  try {
    if (typeof globalThis !== 'undefined') globalThis.__benchmarkAttachedPorts = (globalThis.__benchmarkAttachedPorts || 0) + n;
  } catch (_err) {
    /* ignore */
  }
}

function decAttachedPorts(n = 1) {
  benchmarkMetrics.attachedPorts = Math.max(0, (benchmarkMetrics.attachedPorts || 0) - n);
  benchmarkMetrics.detachEvents = (benchmarkMetrics.detachEvents || 0) + n;
  benchmarkMetrics.lastDetachTs = Date.now();
  benchmarkMetrics.attachHistory.push({ ts: benchmarkMetrics.lastDetachTs, delta: -n });
  try {
    if (typeof globalThis !== 'undefined') globalThis.__benchmarkAttachedPorts = Math.max(0, (globalThis.__benchmarkAttachedPorts || 0) - n);
  } catch (_err) {
    /* ignore */
  }
}

const benchmarkRouteWorkerSharedPortMap = new WeakMap();
const benchmarkRouteWorkerSharedPortFinalizerTokenMap = new WeakMap();
const benchmarkRouteWorkerErrorLoggedWorkers = new WeakSet();
const benchmarkRouteWorkerErrorHandlers = new WeakMap();
const benchmarkRouteWorkerSharedPortFinalizer = typeof FinalizationRegistry === 'function'
  ? new FinalizationRegistry((port) => {
      if (!port) return;
      try {
        port.onmessage = null;
      } catch (_err) {
        /* ignore */
      }
      try {
        port.close();
      } catch (_err) {
        /* ignore */
      }
      try {
        decAttachedPorts();
      } catch (_err) {
        /* ignore */
      }
      __benchmarkLog.info("finalized shared tile pool port for GC'd route worker");
    })
  : null;

// Consolidated tile pool: use the canonical `getSharedPool()` from benchmark.js
// (removes the previous local singleton `benchmarkSharedTilePool`).

function cleanupBenchmarkRouteWorkerSharedPort(workerObj) {
  if (!workerObj) return;
  const port = benchmarkRouteWorkerSharedPortMap.get(workerObj);
  const finalizerToken = benchmarkRouteWorkerSharedPortFinalizer
    ? benchmarkRouteWorkerSharedPortFinalizerTokenMap.get(workerObj)
    : null;

  if (port) {
    try {
      // Remove the onmessage handler to break closures capturing the
      // sharedPool so they can be GC'd, then close the port.
      try {
        port.onmessage = null;
      } catch (_err) {
        /* ignore */
      }
      try {
        port.close();
      } catch (_err) {
        /* ignore */
      }
      try {
        decAttachedPorts();
      } catch (_err) {
        /* ignore */
      }
    } catch (_err) {
      __benchmarkLog.warn('failed to close shared tile pool port for route worker cleanup', _err);
    } finally {
      try {
        benchmarkRouteWorkerSharedPortMap.delete(workerObj);
      } catch (_err) {
        /* ignore */
      }
    }
  }

  if (benchmarkRouteWorkerSharedPortFinalizer && finalizerToken) {
    try {
      benchmarkRouteWorkerSharedPortFinalizer.unregister(finalizerToken);
      benchmarkRouteWorkerSharedPortFinalizerTokenMap.delete(workerObj);
    } catch (_err) {
      /* ignore */
    }
  }

  // If we previously monkey-patched the underlying worker's terminate method,
  // try to restore the original so we don't retain unnecessary closures.
  try {
    const worker = workerObj.worker;
    const underlyingWorker = worker?._underlying ?? worker;
    if (underlyingWorker && underlyingWorker.__benchmark_original_terminate) {
      try {
        underlyingWorker.terminate = underlyingWorker.__benchmark_original_terminate;
      } catch (_err) {
        // ignore restore failures
      }
      try {
        delete underlyingWorker.__benchmark_original_terminate;
      } catch (_err) {
        // ignore delete failures
      }
    }
  } catch (_err) {
    // ignore any issues while restoring terminate
  }

  try {
    const wrapper = workerObj?.worker;
    const underlyingWorker = wrapper?._underlying ?? wrapper;
    const handlers = benchmarkRouteWorkerErrorHandlers.get(wrapper);
    if (handlers) {
      for (const [key, listener] of Object.entries(handlers)) {
        const target = key.startsWith('wrapper') ? wrapper : underlyingWorker;
        if (target && typeof target.removeEventListener === 'function' && typeof listener === 'function') {
          try {
            const eventName = key.replace(/^wrapper/, '').toLowerCase();
            target.removeEventListener(eventName, listener);
          } catch (_err) {
            /* ignore */
          }
        }
      }
      if (typeof wrapper.onmessage === 'function' && wrapper.onmessage.__benchmarkOriginalOnMessage) {
        try {
          wrapper.onmessage = wrapper.onmessage.__benchmarkOriginalOnMessage;
        } catch (_err) {
          /* ignore */
        }
      }
      benchmarkRouteWorkerErrorHandlers.delete(wrapper);
      try {
        benchmarkRouteWorkerErrorLoggedWorkers.delete(wrapper);
      } catch (_err) {
        /* ignore */
      }
    }
  } catch (_err) {
    /* ignore */
  }
}

function attachSharedTilePoolPort(workerObj) {
  if (!workerObj || !workerObj.worker || benchmarkRouteWorkerSharedPortMap.has(workerObj)) return;
  const sharedPool = getSharedPool();
  const { port1, port2 } = new MessageChannel();

  port2.onmessage = async (event) => {
    const data = event?.data;
    if (!data || data.type !== 'sharedTilePoolRequest' || typeof data.correlationId !== 'string') return;

    try {
      const response = await sharedPool.postMessage(data.message, undefined, {
        awaitResponse: true,
        timeout: Number.isFinite(data.timeout) ? data.timeout : 10_000,
      });
      port2.postMessage({ type: 'sharedTilePoolResponse', correlationId: data.correlationId, response });
    } catch (err) {
      port2.postMessage({
        type: 'sharedTilePoolResponse',
        correlationId: data.correlationId,
        error: { message: err?.message ?? String(err), code: err?.code ?? null },
      });
    }
  };
  port2.start?.();

  try {
    const worker = workerObj.worker;
    const underlyingWorker = worker?._underlying ?? worker;
    if (!underlyingWorker || typeof underlyingWorker.postMessage !== 'function') {
      throw new Error('Route worker underlying object does not support postMessage');
    }

    // Send the shared tile pool MessagePort directly to the underlying worker,
    // bypassing the PowerPool wrapper's object-encoding postMessage path.
    // This preserves the transferable port and avoids serializing the message
    // body to a Uint8Array, which would drop the port reference.
    underlyingWorker.postMessage({ type: 'initSharedTilePoolPort', port: port1 }, [port1]);
    benchmarkRouteWorkerSharedPortMap.set(workerObj, port2);
    if (benchmarkRouteWorkerSharedPortFinalizer) {
      try {
        const token = {};
        benchmarkRouteWorkerSharedPortFinalizerTokenMap.set(workerObj, token);
        benchmarkRouteWorkerSharedPortFinalizer.register(workerObj, port2, token);
      } catch (_err) {
        benchmarkRouteWorkerSharedPortFinalizerTokenMap.delete(workerObj);
      }
    }
    try {
      incAttachedPorts();
    } catch (_err) {
      /* ignore */
    }
    try {
      __benchmarkLog.info('attached shared tile pool port — total ports:', benchmarkMetrics.attachedPorts);
    } catch (_err) {
      /* ignore logging failures */
    }
    try {
      const mem = getMainThreadMemoryUsage();
      if (mem) console.debug('[benchmark] main-memory attachSharedTilePoolPort', mem);
    } catch (_err) {
      /* ignore */
    }
    // Monkey-patch underlying worker termination so we can reliably cleanup
    // the associated shared port before the worker is torn down. Store the
    // original terminate function so it can be restored during cleanup.
    try {
      if (underlyingWorker && typeof underlyingWorker.terminate === 'function' && !underlyingWorker.__benchmark_original_terminate) {
        const workerWeakRef = typeof WeakRef === 'function' ? new WeakRef(workerObj) : null;
        const originalTerminate = underlyingWorker.terminate.bind(underlyingWorker);
        underlyingWorker.__benchmark_original_terminate = originalTerminate;
        underlyingWorker.terminate = function (...args) {
          try {
            const targetWorker = workerWeakRef?.deref() ?? workerObj;
            cleanupBenchmarkRouteWorkerSharedPort(targetWorker);
          } catch (err) {
            __benchmarkLog.warn('error cleaning up shared port during terminate', err);
          }
          return originalTerminate(...args);
        };
      }
    } catch (err) {
      // Non-fatal if we can't patch terminate on this worker.
      __benchmarkLog.warn('failed to patch worker.terminate for cleanup:', err);
    }
  } catch (err) {
    __benchmarkLog.warn('failed to attach shared tile pool port to route worker', err);
    try {
      if (port2) {
        try {
          port2.onmessage = null;
        } catch (_err) {
          /* ignore */
        }
        try {
          port2.close();
        } catch (_err) {
          /* ignore */
        }
      }
    } catch (_err) {
      /* ignore */
    }
    try {
      if (port1) {
        try {
          port1.close();
        } catch (_err) {
          /* ignore */
        }
      }
    } catch (_err) {
      /* ignore */
    }
    try {
      __benchmarkLog.info('cleaned up shared tile pool port — total ports:', (typeof globalThis !== 'undefined' && globalThis.__benchmarkAttachedPorts) || 0);
    } catch (_err) {
      /* ignore logging failures */
    }
    try {
      const mem = getMainThreadMemoryUsage();
      if (mem) console.debug('[benchmark] main-memory attachSharedTilePoolPort.cleanup', mem);
    } catch (_err) {
      /* ignore */
    }
  }
}

const root = document;
const categoryFiltersEl = root.getElementById('category-filters');
const lengthFiltersEl = root.getElementById('length-filters');
const successRoutesInput = root.getElementById('success-routes-input');
const routeCountEl = root.getElementById('route-count');
const runBtn = root.getElementById('run-btn');
const stopBtn = root.getElementById('stop-btn');
const progressSectionEl = root.getElementById('progress-section');
const resultsSectionEl = root.getElementById('results-section');
const resultsSectionHeaderEl = resultsSectionEl?.querySelector('h2');
const actionRowEl = resultsSectionEl?.querySelector('.actions');
const summaryCardsEl = root.getElementById('summary-cards');
const autoSelectorSummaryEl = root.getElementById('auto-selector-summary');
const autoSelectorCardsEl = root.getElementById('auto-selector-cards');
const progressBarEl = root.getElementById('progress-bar');
const progressTextEl = root.getElementById('progress-text');
function getProgressBarEl() {
  return progressBarEl || document.getElementById('progress-bar');
}
function getProgressTextEl() {
  return progressTextEl || document.getElementById('progress-text');
}
const resultsRunContextEl = root.getElementById('results-run-context');
const pendingRunPromptEl = root.getElementById('pending-run-prompt');
const pendingRunMessageEl = root.getElementById('pending-run-message');
const resumeRunBtn = root.getElementById('resume-run-btn');
const restartRunBtn = root.getElementById('restart-run-btn');
const benchmarkStopwatchEl = root.getElementById('benchmark-stopwatch');
 
const urlInputEl = root.getElementById('url-input');
const paginationControlsEl = root.getElementById('pagination-controls');
const modeSelectEl = root.getElementById('mode-select');
const runsInputEl = root.getElementById('runs-input');
const pauseInputEl = root.getElementById('pause-input');
const pauseBtn = root.getElementById('pause-btn');
const pauseStateEl = root.getElementById('pause-state');
if (pauseStateEl) pauseStateEl.hidden = true;
const suggestionWrapEl = root.getElementById('suggestion-wrap');

// Autofill tile URL template if the input is empty (best-effort).
// Attempt to fetch the OpenFreeMap tile manifest and use `tiles[0]` when available.
try {
  if (urlInputEl && String(urlInputEl.value || '').trim() === '') {
    const fallbackTemplate = 'https://tiles.openfreemap.org/planet/{z}/{x}/{y}.png';

    // If fetch isn't available (tests/server), use the fallback immediately.
    if (typeof fetch !== 'function') {
      urlInputEl.value = fallbackTemplate;
      if (!urlInputEl.getAttribute('placeholder')) urlInputEl.setAttribute('placeholder', fallbackTemplate);
    } else {
      (async () => {
        try {
          const resp = await fetch('https://tiles.openfreemap.org/planet', { cache: 'no-store' });
          if (!resp || !resp.ok) {
            urlInputEl.value = fallbackTemplate;
            if (!urlInputEl.getAttribute('placeholder')) urlInputEl.setAttribute('placeholder', fallbackTemplate);
            return;
          }
          const data = await resp.json();
          let template = fallbackTemplate;
          if (data) {
            if (Array.isArray(data) && data.length && typeof data[0] === 'string') {
              template = data[0];
            } else if (data.tiles && Array.isArray(data.tiles) && data.tiles.length && typeof data.tiles[0] === 'string') {
              template = data.tiles[0];
            }
          }
          urlInputEl.value = template;
          if (!urlInputEl.getAttribute('placeholder')) urlInputEl.setAttribute('placeholder', template);
        } catch (err) {
          urlInputEl.value = fallbackTemplate;
          if (!urlInputEl.getAttribute('placeholder')) urlInputEl.setAttribute('placeholder', fallbackTemplate);
        }
      })();
    }
  }
} catch (e) {
  // best-effort, ignore failures
}


// ── Populate filter checkboxes from routes.js ────────────────────────────
(function buildFilters() {
  if (!categoryFiltersEl || !lengthFiltersEl) return;
  const catFragment = document.createDocumentFragment();
  CATEGORIES.forEach((val) => {
    const lbl = document.createElement('label');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = val;
    chk.checked = true;
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(' ' + (CATEGORY_LABELS[val] ?? val)));
    catFragment.appendChild(lbl);
  });
  categoryFiltersEl.appendChild(catFragment);

  const lenFragment = document.createDocumentFragment();
  LENGTH_CATEGORIES.forEach((val) => {
    const lbl = document.createElement('label');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = val;
    chk.checked = true;
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(' ' + (LENGTH_CATEGORY_LABELS[val] ?? val)));
    lenFragment.appendChild(lbl);
  });
  lengthFiltersEl.appendChild(lenFragment);
})();

// ── Route count indicator ─────────────────────────────────────────────────
function getCheckedValues(containerEl) {
  if (!containerEl) return [];
  return Array.from(containerEl.querySelectorAll('input:checked'), (el) => el.value);
}

function getSelectedRoutes() {
  const cats = getCheckedValues(categoryFiltersEl);
  const lengths = getCheckedValues(lengthFiltersEl);
  return ROUTES.filter((r) => cats.includes(r.category) && lengths.includes(r.lengthCategory));
}

function updateRouteCount() {
  const n = getSelectedRoutes().length;
  const successThreshold = Math.max(0, parseInt(successRoutesInput?.value || '0', 10) || 0);
  const thresholdText =
    successThreshold > 0 ? `, ${successThreshold.toLocaleString()} selected` : '';
  if (routeCountEl) routeCountEl.textContent = `${n.toLocaleString()} routes available${thresholdText}`;
}

function getReportVariantLabel(key) {
  return key === 'sab_on' ? 'SAB On' : key === 'sab_off' ? 'SAB Off' : '';
}

function getReportFilename(variant, reportType = 'benchmark') {
  const key = variant?.key;
  const suffix = key && key !== 'combined' ? `_${key}_` : '';
  return `${reportType}${suffix}.json`;
}

function getPassResultIndex(row) {
  if (!row || typeof row !== 'object') return null;
  const maybeIndex = Number.isFinite(Number(row._passIndex))
    ? Number(row._passIndex)
    : Number.isFinite(Number(row.passIndex))
    ? Number(row.passIndex)
    : null;
  return Number.isFinite(maybeIndex) ? maybeIndex : null;
}

function determinePassIndexMode(results, passCount) {
  const passValues = Array.isArray(results)
    ? results.map(getPassResultIndex).filter((idx) => Number.isFinite(idx))
    : [];
  if (passValues.length === 0 || !Number.isFinite(passCount) || passCount <= 0) {
    return 'unknown';
  }

  const allZeroBased = passValues.every((idx) => idx >= 0 && idx < passCount);
  const allOneBased = passValues.every((idx) => idx >= 1 && idx <= passCount);

  if (allOneBased && !allZeroBased) return 'one-based';
  if (allZeroBased && !allOneBased) return 'zero-based';
  if (allOneBased && allZeroBased) {
    return passValues.some((idx) => idx === passCount) ? 'one-based' : 'zero-based';
  }

  return 'mixed';
}

function getPassVariantKey(row) {
  if (!row || typeof row !== 'object') return null;
  if (row._sab === true || row.sharedArrayBuffer === true) return 'sab_on';
  if (row._sab === false || row.sharedArrayBuffer === false) return 'sab_off';
  return null;
}

function groupResultsByPassVariant(results) {
  const groups = { sab_on: [], sab_off: [] };
  if (!Array.isArray(results)) return groups;

  for (const row of results) {
    const key = getPassVariantKey(row);
    if (key) groups[key].push(row);
  }

  return groups;
}

function groupResultsByPassIndex(results) {
  const groups = new Map();
  if (!Array.isArray(results)) return groups;

  for (const row of results) {
    const idx = getPassResultIndex(row);
    if (!Number.isFinite(idx)) continue;
    if (!groups.has(idx)) groups.set(idx, []);
    groups.get(idx).push(row);
  }

  return groups;
}

function getPassContextFromResults(results, passPosition) {
  if (!Array.isArray(results) || results.length === 0) {
    return {};
  }

  const rowWithSab = results.find(
    (row) => row._sab === true || row._sab === false || typeof row.sharedArrayBuffer === 'boolean'
  );
  if (rowWithSab) {
    const sharedArrayBuffer = rowWithSab._sab === true || rowWithSab.sharedArrayBuffer === true;
    return {
      sharedArrayBuffer,
      parallelOrSerial: sharedArrayBuffer ? 'parallel' : 'serial',
    };
  }

  return {
    parallelOrSerial: passPosition === 0 ? 'parallel' : 'serial',
  };
}

function isOneBasedPassContext(contexts) {
  return Array.isArray(contexts) &&
    contexts.every(
      (context) =>
        context &&
        Number.isFinite(Number(context.passIndex)) &&
        Number(context.passIndex) > 0 &&
        Number(context.passIndex) <= contexts.length
    );
}

function passIndexMatchesContext(row, contextPassIndex, contextsAreOneBased, passIndexMode) {
  const rowPassIndex = getPassResultIndex(row);
  if (!Number.isFinite(rowPassIndex)) return false;

  const resolvedContextIndex = Number.isFinite(Number(contextPassIndex))
    ? Number(contextPassIndex)
    : 0;

  const zeroBasedTarget = contextsAreOneBased
    ? resolvedContextIndex - 1
    : resolvedContextIndex;
  const oneBasedTarget = contextsAreOneBased
    ? resolvedContextIndex
    : resolvedContextIndex + 1;

  if (passIndexMode === 'zero-based') {
    return rowPassIndex === zeroBasedTarget;
  }

  if (passIndexMode === 'one-based') {
    return rowPassIndex === oneBasedTarget;
  }

  return rowPassIndex === zeroBasedTarget || rowPassIndex === oneBasedTarget;
}

function buildReportVariants() {
  if (!Array.isArray(_reportVariants) || _reportVariants.length === 0) {
    createReportVariants([]);
  }
  return Array.isArray(_reportVariants) ? _reportVariants.slice() : [];
}

function createReportVariants(results) {
  const combinedResults = Array.isArray(results) ? results : [];

  const variants = [
    {
      key: 'combined',
      label: 'Combined',
      results: combinedResults,
      context: {
        ...buildReportContext(),
        parallelOrSerial: 'combined',
      },
    },
  ];

  if (Array.isArray(_passContexts) && _passContexts.length > 0) {
    const contextsAreOneBased = _passContexts.some((context) => Number(context?.passIndex) === 1);
    const passIndexMode = determinePassIndexMode(results, _passContexts.length);

    _passContexts.forEach((context, index) => {
      if (!context) return;
      const key = context.sharedArrayBuffer ? 'sab_on' : 'sab_off';
      const passResults = Array.isArray(results)
        ? results.filter((row) =>
            passIndexMatchesContext(row, context.passIndex ?? index, contextsAreOneBased, passIndexMode)
          )
        : [];

      if (passResults.length === 0 || !key) return;
      variants.push({
        key,
        label: getReportVariantLabel(key),
        results: passResults,
        context: {
          ...context,
          parallelOrSerial: key,
        },
      });
    });
  } else if (Array.isArray(results)) {
    const grouped = groupResultsByPassVariant(results);
    for (const key of ['sab_on', 'sab_off']) {
      const passResults = grouped[key] || [];
      if (passResults.length === 0) continue;
      variants.push({
        key,
        label: getReportVariantLabel(key),
        results: passResults,
        context: {
          sharedArrayBuffer: key === 'sab_on',
          parallelOrSerial: key,
        },
      });
    }
  }

  _reportVariants = variants;
  return variants;
}

function updateReportTypeControls() {
  const variants = buildReportVariants();
  if (variants.length <= 1) {
    _reportSelection = variants[0]?.key || '';
    return;
  }

  if (!_reportSelection || !variants.some((variant) => variant.key === _reportSelection)) {
    _reportSelection = variants[0]?.key || '';
  }
}

function getSelectedReportVariant() {
  const selection = _reportSelection || '';
  const variants = buildReportVariants();
  return variants.find((variant) => variant.key === selection) ?? variants[0];
}

//

if (categoryFiltersEl) categoryFiltersEl.addEventListener('change', updateRouteCount);
if (lengthFiltersEl) lengthFiltersEl.addEventListener('change', updateRouteCount);
if (successRoutesInput) successRoutesInput.addEventListener('input', updateRouteCount);
if (successRoutesInput) successRoutesInput.addEventListener('change', updateRouteCount);
updateRouteCount();

// ── State ─────────────────────────────────────────────────────────────────
const RESULTS_PAGE_SIZE = 250;
const MAX_ROUTE_COMPLETION_TIME_SAMPLES = 10;
let _currentPage = 1;
let _stopped = false;
let _paused = false;
let _pauseResolvers = [];
let _savedArtifactsOnStop = false;
let _stopSaveInProgress = false;
let benchmarkStartTime = null;
 
let _stopwatchRaf = null;
let _routeCompletionTimes = [];
//
let _runContext = null;
let _passContexts = null;
let _reportVariants = [];
let _reportSelection = '';
let _currentRunId = null;
let _currentPageResults = [];
 
let _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
let benchmarkRouteWorker = null;
let _benchmarkRouteScheduler = null;
let _pendingRoutePromises = new Map();
let _benchmarkRouteWorkerState = null;
let _benchmarkRouteDispatchStats = {
  batchCount: 0,
  totalDispatched: 0,
  totalAccepted: 0,
  totalRejected: 0,
  lastBatchSize: 0,
  lastDispatchResults: null,
  lastQueueLength: 0,
};
let _abortController = null;
let _benchmarkSummaryState = null;
let _summaryStateSaveTimer = null;
let _benchmarkRunComplete = false;

// Expose debug accessors for runtime inspection via DevTools MCP.
// These are non-enumerable helpers that return current internal state
// without creating strong references that would prevent GC.
try {
  if (typeof window !== 'undefined') {
    window.__debug_benchmark = window.__debug_benchmark || {};
    Object.defineProperty(window.__debug_benchmark, 'benchmarkRouteWorker', {
      configurable: true,
      enumerable: false,
      get: () => benchmarkRouteWorker,
    });
    Object.defineProperty(window.__debug_benchmark, 'benchmarkSharedTilePool', {
      configurable: true,
      enumerable: false,
      get: () => {
        try {
          return getSharedPool();
        } catch (_err) {
          return null;
        }
      },
    });
    Object.defineProperty(window.__debug_benchmark, 'benchmarkRouteWorkerSharedPortMap', {
      configurable: true,
      enumerable: false,
      get: () => benchmarkRouteWorkerSharedPortMap,
    });
    window.__debug_benchmark.attachSharedTilePoolPort = (workerObj) => {
      try {
        return attachSharedTilePoolPort(workerObj);
      } catch (err) {
        console.warn('[benchmark][debug] attachSharedTilePoolPort failed', err);
      }
    };
    window.__debug_benchmark.cleanupSharedTilePoolPort = (workerObj) => {
      try {
        return cleanupBenchmarkRouteWorkerSharedPort(workerObj);
      } catch (err) {
        console.warn('[benchmark][debug] cleanupBenchmarkRouteWorkerSharedPort failed', err);
      }
    };
    window.__debug_benchmark.patchRouteWorkerMessageHandling = (workerObj) => {
      try {
        return patchRouteWorkerMessageHandling(workerObj);
      } catch (err) {
        console.warn('[benchmark][debug] patchRouteWorkerMessageHandling failed', err);
      }
    };
  }
} catch (_err) {
  /* ignore debug exposure failures */
}

function resetBenchmarkRunState() {
  _runContext = null;
  _routeCompletionTimes = [];
  _benchmarkSummaryState = null;
  if (_summaryStateSaveTimer) {
    clearTimeout(_summaryStateSaveTimer);
    _summaryStateSaveTimer = null;
  }
  _benchmarkRouteWorkerState = null;
  _benchmarkRouteScheduler = null;
}

const decodeWorkerMessageData = (data) => {
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    try {
      const decoded = new TextDecoder().decode(data);
      return JSON.parse(decoded);
    } catch (decodeError) {
      console.warn('[benchmark] failed to decode worker binary payload', decodeError, data);
      return data;
    }
  }
  return data;
};

const normalizeWorkerMessageEvent = (event) => {
  const decodedData = decodeWorkerMessageData(event?.data);
  if (decodedData === event?.data) return event;
  try {
    return new MessageEvent(event.type, {
      data: decodedData,
      origin: event.origin,
      lastEventId: event.lastEventId,
      source: event.source,
      ports: event.ports,
    });
  } catch (normalizeError) {
    console.warn('[benchmark] failed to normalize worker message event', normalizeError, event);
    return event;
  }
};

function patchRouteWorkerMessageHandling(workerObj) {
  const wrapper = workerObj?.worker;
  if (!wrapper) return;

  const pool = benchmarkRouteWorker;
  const originalOnMessage = typeof wrapper.onmessage === 'function'
    ? wrapper.onmessage.__benchmarkOriginalOnMessage ?? wrapper.onmessage
    : null;
  const patchedOnMessage = function (event) {
    const normalizedEvent = normalizeWorkerMessageEvent(event);
    const msg = normalizedEvent?.data;
    const isProgressEvent =
      msg &&
      typeof msg === 'object' &&
      (msg.type === 'status' || msg.type === 'result');
    if (isProgressEvent) {
      if (pool && typeof pool._onmessage === 'function') {
        pool._onmessage(normalizedEvent);
      }
      return;
    }
    if (originalOnMessage) {
      return originalOnMessage.call(this, normalizedEvent);
    }
    if (pool && typeof pool._onmessage === 'function') {
      return pool._onmessage(normalizedEvent);
    }
  };
  patchedOnMessage.__benchmarkOriginalOnMessage = originalOnMessage;
  wrapper.onmessage = patchedOnMessage;

  // Robust error/exit cleanup: handle all error/exit/messageerror events and worker GC
  if (!benchmarkRouteWorkerErrorLoggedWorkers.has(wrapper)) {
    const workerWeakRef = typeof WeakRef === 'function' ? new WeakRef(workerObj) : null;
    const registerWorkerErrorHandler = (target, eventName) => {
      if (!target || typeof target.addEventListener !== 'function') return null;
      const listener = (event) => {
        const targetWorker = workerWeakRef?.deref() ?? workerObj;
        try {
          cleanupBenchmarkRouteWorkerSharedPort(targetWorker);
          if (typeof disposeBenchmarkResources === 'function') {
            disposeBenchmarkResources();
          }
        } catch (_err) {
          __benchmarkLog.warn('cleanup failed while handling route worker ' + eventName, _err);
        }
        console.error('[benchmark] route worker ' + eventName, {
          workerId: targetWorker?.id,
          event,
        });
      };
      target.addEventListener(eventName, listener);
      return listener;
    };

    const underlying = wrapper._underlying ?? wrapper;
    const handlers = {
      error: registerWorkerErrorHandler(underlying, 'error'),
      messageerror: registerWorkerErrorHandler(underlying, 'messageerror'),
      exit: registerWorkerErrorHandler(underlying, 'exit'),
    };
    if (typeof wrapper.addEventListener === 'function') {
      handlers.wrapperError = registerWorkerErrorHandler(wrapper, 'error');
      handlers.wrapperMessageError = registerWorkerErrorHandler(wrapper, 'messageerror');
      handlers.wrapperExit = registerWorkerErrorHandler(wrapper, 'exit');
    }
    benchmarkRouteWorkerErrorHandlers.set(wrapper, handlers);
    benchmarkRouteWorkerErrorLoggedWorkers.add(wrapper);
  }
}

function scheduleBenchmarkSummaryStatePersist() {
  if (!_currentRunId || !_benchmarkSummaryState || _summaryStateSaveTimer) return;
  _summaryStateSaveTimer = setTimeout(async () => {
    _summaryStateSaveTimer = null;
    try {
      await saveRunMetadata(_currentRunId, { summaryState: _benchmarkSummaryState });
    } catch (err) {
      console.warn('[benchmark] persistBenchmarkSummaryState failed:', err);
    }
  }, 100);
}

function scheduleBenchmarkProgressPersist() {
  if (!_currentRunId || !_benchmarkRouteWorkerState || _progressSaveTimer) return;
  _progressSaveTimer = setTimeout(async () => {
    _progressSaveTimer = null;
    try {
      // serialize routePassCompletion (Map -> object) and Sets -> arrays for storage
      const routePassObj = {};
      const rpc = _benchmarkRouteWorkerState.routePassCompletion;
      if (rpc && typeof rpc === 'object') {
        try {
          if (typeof rpc.forEach === 'function') {
            // Map-like
            rpc.forEach((set, key) => {
              try {
                routePassObj[String(key)] = Array.from(set || []);
              } catch (_e) {
                routePassObj[String(key)] = [];
              }
            });
          } else if (Object.prototype.toString.call(rpc) === '[object Object]') {
            Object.entries(rpc).forEach(([k, v]) => {
              routePassObj[String(k)] = Array.isArray(v) ? v.slice() : [];
            });
          }
        } catch (_e) {
          /* best-effort */
        }
      }

      const payload = {
        progress: {
          completedTasks: Number(_benchmarkRouteWorkerState.completedTasks ?? 0),
          completedRouteIndices: Array.from(_benchmarkRouteWorkerState.completedRouteIndices ?? new Set()),
          successfulRouteIndices: Array.from(_benchmarkRouteWorkerState.successfulRouteIndices ?? new Set()),
          failedRouteIndices: Array.from(_benchmarkRouteWorkerState.failedRouteIndices ?? new Set()),
          routePassCompletion: routePassObj,
        },
      };
      await saveRunMetadata(_currentRunId, payload);
    } catch (err) {
      console.warn('[benchmark] persistBenchmarkProgress failed:', err);
    }
  }, 100);
}

async function flushBenchmarkProgressPersist() {
  if (_progressSaveTimer) {
    clearTimeout(_progressSaveTimer);
    _progressSaveTimer = null;
  }
  if (!_currentRunId || !_benchmarkRouteWorkerState) return;
  try {
    const routePassObj = {};
    const rpc = _benchmarkRouteWorkerState.routePassCompletion;
    if (rpc && typeof rpc === 'object') {
      try {
        if (typeof rpc.forEach === 'function') {
          rpc.forEach((set, key) => {
            try {
              routePassObj[String(key)] = Array.from(set || []);
            } catch (_e) {
              routePassObj[String(key)] = [];
            }
          });
        } else if (Object.prototype.toString.call(rpc) === '[object Object]') {
          Object.entries(rpc).forEach(([k, v]) => {
            routePassObj[String(k)] = Array.isArray(v) ? v.slice() : [];
          });
        }
      } catch (_e) {
        /* best-effort */
      }
    }
    const payload = {
      progress: {
        completedTasks: Number(_benchmarkRouteWorkerState.completedTasks ?? 0),
        completedRouteIndices: Array.from(_benchmarkRouteWorkerState.completedRouteIndices ?? new Set()),
        successfulRouteIndices: Array.from(_benchmarkRouteWorkerState.successfulRouteIndices ?? new Set()),
        failedRouteIndices: Array.from(_benchmarkRouteWorkerState.failedRouteIndices ?? new Set()),
        routePassCompletion: routePassObj,
      },
    };
    await saveRunMetadata(_currentRunId, payload);
  } catch (err) {
    console.warn('[benchmark] flushBenchmarkProgressPersist failed:', err);
  }
}

async function flushBenchmarkSummaryStatePersist() {
  if (_summaryStateSaveTimer) {
    clearTimeout(_summaryStateSaveTimer);
    _summaryStateSaveTimer = null;
  }
  if (!_currentRunId || !_benchmarkSummaryState) return;
  try {
    await saveRunMetadata(_currentRunId, { summaryState: _benchmarkSummaryState });
  } catch (err) {
    console.warn('[benchmark] flushBenchmarkSummaryStatePersist failed:', err);
  }
}

function createBenchmarkRouteWorker() {
  if (benchmarkRouteWorker) return benchmarkRouteWorker;

  const routeWorkerConstructor = globalThis.__benchmarkRouteWorkerCtor ?? BenchmarkRouteWorker;
  console.info('[benchmark] routeWorkerConstructor type', typeof routeWorkerConstructor, routeWorkerConstructor?.name, routeWorkerConstructor?.prototype?.constructor?.name);

  try {
    const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
    const maxPoolSize = Math.max(1, Math.floor(hardwareConcurrency / 3));
    const poolOptions = {
      size: 2,
      maxSize: maxPoolSize,
      maxTasksPerWorker: 1,
      lazy: false,
      autoScale: {
        intervalMs: 250,
        targetMs: 100,
        stepUp: 2,
        stepDown: 1,
        cooldownMs: 1000,
      },
      idleTimeout: 600_000,
      taskQueue: true,
      queuePolicy: 'reject', // reject saturated tasks instead of allowing PowerPool fallback queueing
    };

    console.info('[benchmark] createBenchmarkRouteWorker', { hardwareConcurrency, maxPoolSize, poolOptions });
    const routeWorkerSource = () => {
      console.info('[benchmark] routeWorkerSource invoke', typeof routeWorkerConstructor, routeWorkerConstructor?.name);
      try {
        return new routeWorkerConstructor();
      } catch (err) {
        console.error('[benchmark] routeWorkerSource failed', err);
        throw err;
      }
    };
    benchmarkRouteWorker = new PowerPool(routeWorkerSource, poolOptions);

    benchmarkRouteWorker.workers?.forEach((workerObj) => {
      patchRouteWorkerMessageHandling(workerObj);
      attachSharedTilePoolPort(workerObj);
    });
    const originalAddWorkerInstance = benchmarkRouteWorker._addWorkerInstance.bind(benchmarkRouteWorker);
    benchmarkRouteWorker._addWorkerInstance = (...args) => {
      const workerObj = originalAddWorkerInstance(...args);
      patchRouteWorkerMessageHandling(workerObj);
      attachSharedTilePoolPort(workerObj);
      return workerObj;
    };

    const originalReapIdleWorkers = benchmarkRouteWorker._reapIdleWorkers?.bind(benchmarkRouteWorker);
    if (typeof originalReapIdleWorkers === 'function') {
      benchmarkRouteWorker._reapIdleWorkers = (...args) => {
        const beforeWorkers = new Set(benchmarkRouteWorker.workers || []);
        const result = originalReapIdleWorkers(...args);
        for (const workerObj of beforeWorkers) {
          if (!benchmarkRouteWorker.workers?.includes(workerObj)) {
            cleanupBenchmarkRouteWorkerSharedPort(workerObj);
          }
        }
        return result;
      };
    }

    const originalRemoveWorker = benchmarkRouteWorker.removeWorker?.bind(benchmarkRouteWorker);
    if (typeof originalRemoveWorker === 'function') {
      benchmarkRouteWorker.removeWorker = () => {
        const workerObj = benchmarkRouteWorker.workers?.[benchmarkRouteWorker.workers.length - 1];
        cleanupBenchmarkRouteWorkerSharedPort(workerObj);
        return originalRemoveWorker();
      };
    }
  } catch (err) {
    console.error('[benchmark] Route worker pool creation failed', err);
    throw err;
  }

  if ('onmessage' in benchmarkRouteWorker) {
    benchmarkRouteWorker.onmessage = handleBenchmarkRouteWorkerMessage;
  }

  return benchmarkRouteWorker;
}

function disposeBenchmarkRouteWorker() {
  if (!benchmarkRouteWorker) return;

  const attachedWorkers = Array.isArray(benchmarkRouteWorker.workers)
    ? [...benchmarkRouteWorker.workers]
    : [];

  try {
    if (typeof benchmarkRouteWorker.shutdown === 'function') {
      benchmarkRouteWorker.shutdown();
    } else if (typeof benchmarkRouteWorker.terminate === 'function') {
      benchmarkRouteWorker.terminate();
    }
  } catch (err) {
    console.warn('[benchmark] Failed to dispose route worker pool:', err);
  }

  // Cleanup ports by iterating worker instances we captured before
  // shutdown. Some pool implementations clear `workers` during shutdown,
  // so we need a copy to avoid losing shared port cleanup.
  for (const workerObj of attachedWorkers) {
    try {
      cleanupBenchmarkRouteWorkerSharedPort(workerObj);
    } catch (err) {
      console.warn('[benchmark] Failed to cleanup shared tile pool port for worker during dispose:', err);
    }
  }
  try {
    if (typeof globalThis !== 'undefined') {
      globalThis.__benchmarkAttachedPorts = 0;
    }
  } catch (_err) {
    /* ignore */
  }

  try {
    if (typeof disposeBenchmarkResources === 'function') {
      disposeBenchmarkResources();
    }
  } catch (err) {
    console.warn('[benchmark] Failed to dispose shared tile pool:', err);
  }
  try {
    const mem = getMainThreadMemoryUsage();
    if (mem) console.debug('[benchmark] main-memory disposeBenchmarkRouteWorker', mem);
  } catch (_err) {
    /* ignore */
  }

  stopBenchmarkUiTicker();
  benchmarkRouteWorker = null;
  clearPendingRoutePromises(new Error('Benchmark route worker disposed'));
}

function clearPendingRoutePromises(reason) {
  const shouldResolve = reason instanceof Error && reason.message === 'Benchmark route worker disposed';
  for (const { resolve, reject } of _pendingRoutePromises.values()) {
    try {
      if (shouldResolve) {
        resolve();
      } else {
        reject(reason);
      }
    } catch (err) {
      console.warn('[benchmark] Failed to settle pending worker promise:', err);
    }
  }
  _pendingRoutePromises.clear();
}

function formatWorkerStatusMessage(message) {
  if (!message || typeof message !== 'object') return '';
  switch (message.status) {
    case 'started':
      return 'Starting route';
    case 'fetching-tiles':
      return `Fetching tiles (${message.tileCount ?? 'unknown'})`;
    case 'building-graph':
      return 'Building graph';
    case 'prepare-route':
      return 'Preparing route';
    case 'route-cached':
      return 'Route cached';
    case 'warming-engine':
      return `Warming ${message.engineId}`;
    case 'timing-round':
      return `Timing round ${message.round}/${message.totalRounds}`;
    case 'result-saved':
      return 'Result saved';
    case 'memory': {
      const phaseLabel = message.phase ? `Memory ${message.phase}` : 'Memory snapshot';
      if (message.memory && typeof message.memory === 'object') {
        const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = message.memory;
        const used = Number.isFinite(usedJSHeapSize) ? `${Math.round(usedJSHeapSize / 1024 / 1024)} MB` : 'unknown';
        const total = Number.isFinite(totalJSHeapSize) ? `${Math.round(totalJSHeapSize / 1024 / 1024)} MB` : 'unknown';
        const limit = Number.isFinite(jsHeapSizeLimit) ? `${Math.round(jsHeapSizeLimit / 1024 / 1024)} MB` : 'unknown';
        return `${phaseLabel} (${used} / ${total}, limit ${limit})`;
      }
      return `${phaseLabel} (memory unavailable)`;
    }
    default:
      return String(message.status || 'Running');
  }
}

function getThresholdProgress(state) {
  if (!state || typeof state !== 'object') {
    return {
      active: false,
      target: 0,
      current: 0,
      pct: 0,
    };
  }

  const active = Number.isFinite(state.successThreshold) && state.successThreshold > 0;
  const target = active ? state.successThreshold : state.totalTasks;
  const current = active
    ? state.successfulRoutes
    : Number.isFinite(state.completedRoutes)
    ? state.completedRoutes
    : state.completedTasks;
  const pct = target > 0 ? Math.round((current / target) * 100) : 0;
  return {
    active,
    target,
    current,
    pct: Math.min(100, Math.max(0, pct)),
  };
}

let _benchmarkUiTicker = null;

function renderProgressFromState(routeState, summaryState) {
  try {
    const { active, target, current, pct } = getThresholdProgress(routeState);
    const passIndex = routeState?.lastStatus?.passIndex;
    const passPrefix =
      typeof passIndex === 'number' && routeState?.totalPasses > 1 ? `[${passIndex}/${routeState.totalPasses}] ` : '';
    const progressBar = getProgressBarEl();
    if (progressBar) progressBar.style.width = `${pct}%`;
    const progressText = getProgressTextEl();
    if (progressText) {
      if (active) {
        progressText.textContent = `${current}/${target}`;
      } else {
        const completed = Number.isFinite(routeState?.completedRoutes) ? routeState.completedRoutes : routeState?.completedTasks ?? 0;
        progressText.textContent = `${passPrefix}${completed}/${routeState?.totalTasks ?? 0}`;
      }
    }
    if (summaryState) updateSummaryCardsFromState(summaryState);
  } catch (e) {
    /* best-effort */
  }
}

function startBenchmarkUiTicker(intervalMs = 200) {
  if (_benchmarkUiTicker) return;
  _benchmarkUiTicker = setInterval(() => renderProgressFromState(_benchmarkRouteWorkerState, _benchmarkSummaryState), intervalMs);
}

function stopBenchmarkUiTicker() {
  if (!_benchmarkUiTicker) return;
  clearInterval(_benchmarkUiTicker);
  _benchmarkUiTicker = null;
}

function handleBenchmarkRouteWorkerMessage(event) {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  const { type, runId, routeIndex, result, status, routeLabel, passIndex } = msg;
  if (type === 'status') {
    if (status === 'memory' && (!msg.memory || typeof msg.memory !== 'object')) {
      // Suppress unsupported memory snapshots so the progress label is not repeatedly set to "memory unavailable".
      return;
    }

    if (status === 'memory') {
      // Memory snapshots are handled through the progress UI; avoid noisy console logs.
    }

    if (!_benchmarkRouteWorkerState) return;
    _benchmarkRouteWorkerState.lastStatus = msg;
    // UI updates are throttled by the benchmark UI ticker; state is updated here only.

    // When a worker indicates the full result was persisted to the bench DB,
    // fetch the saved row and update the in-memory summary state so the UI
    // remains in sync without requiring the worker to post the full payload.
    if (status === 'result-saved') {
      (async () => {
        try {
          const rows = await getRecordsForRun(runId);
          if (!Array.isArray(rows) || rows.length === 0) return;
          const match = rows.find((r) => Number(r.passIndex) === Number(passIndex ?? r.passIndex) && Number(r.routeIndex) === Number(routeIndex ?? r.routeIndex));
          if (!match) return;
          const normalized = normalizeDbRow(match);

          if (_benchmarkRouteWorkerState) {
            _benchmarkRouteWorkerState.completedTasks = (_benchmarkRouteWorkerState.completedTasks ?? 0) + 1;

            const thresholdActive = Number.isFinite(_benchmarkRouteWorkerState.successThreshold) && _benchmarkRouteWorkerState.successThreshold > 0;
            if (thresholdActive) {
              const routeKey = Number.isFinite(routeIndex) ? routeIndex : routeIndex;
              if (!_benchmarkRouteWorkerState.failedRouteIndices) {
                _benchmarkRouteWorkerState.failedRouteIndices = new Set();
              }
              if (!_benchmarkRouteWorkerState.successfulRouteIndices) {
                _benchmarkRouteWorkerState.successfulRouteIndices = new Set();
              }

              const hasRouteError = Boolean(normalized.error || normalized.routeError);
              const failedRouteIndices = _benchmarkRouteWorkerState.failedRouteIndices;
              const successfulRouteIndices = _benchmarkRouteWorkerState.successfulRouteIndices;

              if (hasRouteError) {
                failedRouteIndices.add(routeKey);
                if (successfulRouteIndices.has(routeKey)) {
                  successfulRouteIndices.delete(routeKey);
                  _benchmarkRouteWorkerState.successfulRoutes = successfulRouteIndices.size;
                }
              } else if (!failedRouteIndices.has(routeKey) && !successfulRouteIndices.has(routeKey)) {
                successfulRouteIndices.add(routeKey);
                _benchmarkRouteWorkerState.successfulRoutes = successfulRouteIndices.size;
              }
            }

            // Track persisted pass completion per route (Map(routeIndex -> Set(passIndex)))
            try {
              if (!_benchmarkRouteWorkerState.routePassCompletion) _benchmarkRouteWorkerState.routePassCompletion = new Map();
              const rIdx = Number(routeIndex);
              let passSet = _benchmarkRouteWorkerState.routePassCompletion.get(rIdx);
              if (!passSet) {
                passSet = new Set();
                _benchmarkRouteWorkerState.routePassCompletion.set(rIdx, passSet);
              }
              const pIdx = Number(passIndex ?? normalized.passIndex ?? normalized._passIndex ?? -1);
              if (Number.isFinite(pIdx) && pIdx >= 0) passSet.add(pIdx);
            } catch (_e) {
              /* best-effort */
            }
          }

          if (!_benchmarkSummaryState) _benchmarkSummaryState = createBenchmarkSummaryState();
          updateSummaryStateWithResult(_benchmarkSummaryState, normalized);
          // UI updates are throttled by the benchmark UI ticker.
          scheduleBenchmarkSummaryStatePersist();
          scheduleBenchmarkProgressPersist();
          try {
            // Debug: force immediate render to check DOM visibility (temporary)
            renderProgressFromState(_benchmarkRouteWorkerState, _benchmarkSummaryState);
          } catch (e) {
            /* best-effort */
          }
        } catch (err) {
          __benchmarkLog.warn('[benchmark] failed fetching saved result for summary update', err);
        }
      })();
    }

    return;
  }

  if (type === 'routeCompleted') {
    const key = `${runId}|${routeIndex}`;
    const pending = _pendingRoutePromises.get(key);
    if (pending) {
      pending.resolve(msg);
      _pendingRoutePromises.delete(key);
    } else if (benchmarkRouteWorker) {
      console.warn('[benchmark] route worker completion received with no pending promise', { key, msg });
    }

    if (_benchmarkRouteWorkerState) {
      if (!_benchmarkRouteWorkerState.completedRouteIndices) {
        _benchmarkRouteWorkerState.completedRouteIndices = new Set();
      }
      const thresholdActive = Number.isFinite(_benchmarkRouteWorkerState.successThreshold) && _benchmarkRouteWorkerState.successThreshold > 0;
      if (!_benchmarkRouteWorkerState.completedRouteIndices.has(routeIndex)) {
        _benchmarkRouteWorkerState.completedRouteIndices.add(routeIndex);
        _benchmarkRouteWorkerState.completedRoutes = (_benchmarkRouteWorkerState.completedRoutes ?? 0) + 1;

        if (thresholdActive) {
          if (!_benchmarkRouteWorkerState.successfulRouteIndices) {
            _benchmarkRouteWorkerState.successfulRouteIndices = new Set();
          }
          if (!_benchmarkRouteWorkerState.failedRouteIndices) {
            _benchmarkRouteWorkerState.failedRouteIndices = new Set();
          }

          const routeKey = Number.isFinite(routeIndex) ? routeIndex : routeIndex;
          const successfulRouteIndices = _benchmarkRouteWorkerState.successfulRouteIndices;
          const failedRouteIndices = _benchmarkRouteWorkerState.failedRouteIndices;
          if (!failedRouteIndices.has(routeKey) && !successfulRouteIndices.has(routeKey)) {
            successfulRouteIndices.add(routeKey);
            _benchmarkRouteWorkerState.successfulRoutes = successfulRouteIndices.size;
          }

          if (_benchmarkRouteWorkerState.successfulRoutes >= _benchmarkRouteWorkerState.successThreshold) {
            _stopped = true;
            _abortController?.abort();
            disposeBenchmarkRouteWorker();
          }
        }

        // UI updates are throttled by the benchmark UI ticker.
        // Persist progress after marking route completed
        scheduleBenchmarkProgressPersist();
        try {
          // Debug: force immediate render to check DOM visibility (temporary)
          renderProgressFromState(_benchmarkRouteWorkerState, _benchmarkSummaryState);
        } catch (e) {
          /* best-effort */
        }
      }
    }

    _routeCompletionTimes.push(performance.now());
    if (_routeCompletionTimes.length > MAX_ROUTE_COMPLETION_TIME_SAMPLES) {
      _routeCompletionTimes.splice(0, _routeCompletionTimes.length - MAX_ROUTE_COMPLETION_TIME_SAMPLES);
    }
    return;
  }

  if (type !== 'result' || !_benchmarkRouteWorkerState) {
    return;
  }

  _benchmarkRouteWorkerState.completedTasks = (_benchmarkRouteWorkerState.completedTasks ?? 0) + 1;

  if (result && typeof result === 'object') {
      const thresholdActive = Number.isFinite(_benchmarkRouteWorkerState.successThreshold) && _benchmarkRouteWorkerState.successThreshold > 0;
      if (thresholdActive) {
        const routeKey = Number.isFinite(routeIndex) ? routeIndex : routeIndex;
        const hasRouteError = Boolean(result.error || result.routeError);
        if (!_benchmarkRouteWorkerState.failedRouteIndices) {
          _benchmarkRouteWorkerState.failedRouteIndices = new Set();
        }
        if (!_benchmarkRouteWorkerState.successfulRouteIndices) {
          _benchmarkRouteWorkerState.successfulRouteIndices = new Set();
        }
        if (hasRouteError) {
          _benchmarkRouteWorkerState.failedRouteIndices.add(routeKey);
          if (_benchmarkRouteWorkerState.successfulRouteIndices.has(routeKey)) {
            _benchmarkRouteWorkerState.successfulRouteIndices.delete(routeKey);
            _benchmarkRouteWorkerState.successfulRoutes = _benchmarkRouteWorkerState.successfulRouteIndices.size;
          }
        } else if (
          !_benchmarkRouteWorkerState.failedRouteIndices.has(routeKey) &&
          !_benchmarkRouteWorkerState.successfulRouteIndices.has(routeKey)
        ) {
          _benchmarkRouteWorkerState.successfulRouteIndices.add(routeKey);
          _benchmarkRouteWorkerState.successfulRoutes = _benchmarkRouteWorkerState.successfulRouteIndices.size;
        }
      }
    }

    const { active, target, current, pct } = getThresholdProgress(_benchmarkRouteWorkerState);
    // UI updates are throttled by the benchmark UI ticker.

    if (result && typeof result === 'object') {
      if (!_benchmarkSummaryState) {
        _benchmarkSummaryState = createBenchmarkSummaryState();
      }
      updateSummaryStateWithResult(_benchmarkSummaryState, result);
      // UI updates are throttled by the benchmark UI ticker.
      scheduleBenchmarkSummaryStatePersist();
    }
  }

function createAbortPromise(signal) {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('aborted', 'AbortError')), 
      { once: true }
    );
  });
}

function normalizeDbRow(row) {
  const result = row && row.result && typeof row.result === 'object' ? { ...row.result } : {};
  const normalized = {
    ...result,
    runId: row?.runId,
    passIndex: row?.passIndex,
    routeIndex: row?.routeIndex,
    _passIndex: result._passIndex ?? row?.passIndex,
    _insertedAt: result._insertedAt ?? row?.ts,
  };
  if (!Number.isFinite(Number(normalized._routeOrdinal)) && Number.isFinite(Number(normalized.routeIndex))) {
    normalized._routeOrdinal = Number(normalized.routeIndex) + 1;
  }
  // Remove heavy diagnostic / sampling payloads to avoid retaining large in-memory objects
  delete normalized.rawDiagnostics;
  delete normalized.samplesMs;
  delete normalized.sampleStats;
  delete normalized.timingRounds;
  return normalized;
}

function createBenchmarkSummaryState() {
  return {
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
  };
}

function updateSummaryStateWithResult(state, result) {
  if (!state || !result || typeof result !== 'object') return;
  state.totalRoutes += 1;

  const hasRouteError = Boolean(result.error || result.routeError || result.any_engine_error);
  if (hasRouteError) {
    state.routeErrorCount += 1;
  }

  const hasUnrecoveredEngineError = Boolean(result.any_engine_error) && !(result.error || result.routeError);
  if (hasUnrecoveredEngineError) {
    state.unrecoveredEngineErrorRouteCount += 1;
  }

  if (Number(result.winner_tied) === 1) {
    state.tieCount += 1;
  }

  if (result.winner && Object.prototype.hasOwnProperty.call(state.engineWins, result.winner)) {
    state.engineWins[result.winner] += 1;
  }

  const autoMatch = Number(result.auto_matches_winner) === 1;
  const autoEngine = result.auto_engine;
  const winner = result.winner;

  if (!hasRouteError && winner) {
    if (autoMatch) {
      if (autoEngine === winner) {
        state.autoSelector.exactHits += 1;
      } else {
        state.autoSelector.nearTieHits += 1;
      }
    } else {
      state.autoSelector.misses += 1;
    }
    state.autoSelector.coverage += 1;
  }
}

function deriveBenchmarkSummaryState(results) {
  const state = {
    totalRoutes: 0,
    tieCount: 0,
    routeErrorCount: 0,
    unrecoveredEngineErrorRouteCount: 0,
    engineWins: {
      'bidirectional-astar': 0,
      'adaptive-barrier': 0,
      'delta-stepping': 0,
      'ultra-dijkstra': 0,
    },
    autoSelector: {
      exactHits: 0,
      nearTieHits: 0,
      misses: 0,
      coverage: 0,
    },
  };
  if (Array.isArray(results)) {
    results.forEach((result) => updateSummaryStateWithResult(state, result));
  }
  return state;
}

function updateSummaryCardsFromState(state) {
  if (!state) return;

  const cards = [];
  cards.push(
    `<div class="card"><div class="card-val">${state.totalRoutes}</div><div class="card-lbl">Routes run</div></div>`
  );
  Object.entries(state.engineWins).forEach(([engine, count]) => {
    const className =
      engine === 'bidirectional-astar'
        ? 'engine-astar'
        : engine === 'adaptive-barrier'
          ? 'engine-barrier'
          : engine === 'delta-stepping'
            ? 'engine-delta'
            : engine === 'ultra-dijkstra'
              ? 'engine-dijkstra'
              : '';
    const engineNames = {
      'bidirectional-astar': 'A★',
      'adaptive-barrier': 'Barrier',
      'delta-stepping': 'Delta',
      'ultra-dijkstra': 'Dijkstra',
    };
    cards.push(`
      <div class="card ${className}">
        <div class="card-val">${count}</div>
        <div class="card-lbl">${engineNames[engine]} wins</div>
      </div>
    `);
  });
  if (state.tieCount > 0) {
    cards.push(
      `<div class="card gray"><div class="card-val">${state.tieCount}</div><div class="card-lbl">Near-ties</div></div>`
    );
  }
  if (state.routeErrorCount > 0) {
    cards.push(
      `<div class="card red"><div class="card-val">${state.routeErrorCount}</div><div class="card-lbl">Route errors</div></div>`
    );
  }
  if (state.unrecoveredEngineErrorRouteCount > 0) {
    cards.push(
      `<div class="card coral"><div class="card-val">${state.unrecoveredEngineErrorRouteCount}</div><div class="card-lbl">Routes with unrecovered engine errors</div></div>`
    );
  }

  if (summaryCardsEl) {
    try {
      // Clear safely and append built card nodes
      while (summaryCardsEl.firstChild) summaryCardsEl.removeChild(summaryCardsEl.firstChild);
      const frag = document.createDocumentFragment();
      const wrapper = document.createElement('div');
      cards.forEach((html) => {
        wrapper.innerHTML = html;
        while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
      });
      summaryCardsEl.appendChild(frag);
    } catch (e) {}
  }
  renderAutoSelectorSummaryFromState(state.autoSelector);
}

function renderAutoSelectorSummaryFromState(autoSelector) {
  if (!autoSelector || typeof autoSelector !== 'object') return;
  const summary = {
    exactHits: autoSelector.exactHits || 0,
    nearTieHits: autoSelector.nearTieHits || 0,
    misses: autoSelector.misses || 0,
    coverage: autoSelector.coverage || 0,
    exactPct: autoSelector.coverage ? (autoSelector.exactHits / autoSelector.coverage) * 100 : 0,
    nearPct: autoSelector.coverage ? (autoSelector.nearTieHits / autoSelector.coverage) * 100 : 0,
    missPct: autoSelector.coverage ? (autoSelector.misses / autoSelector.coverage) * 100 : 0,
  };

  if (summary.coverage === 0) {
    if (autoSelectorSummaryEl) autoSelectorSummaryEl.hidden = true;
    if (autoSelectorCardsEl) {
      try {
        autoSelectorCardsEl.textContent = '';
      } catch (e) {}
    }
    return;
  }

  if (autoSelectorSummaryEl) autoSelectorSummaryEl.hidden = false;
  if (autoSelectorCardsEl) {
    try {
      autoSelectorCardsEl.textContent = '';
      const frag = document.createDocumentFragment();
      const makeCard = (cls, value, title, text) => {
        const article = document.createElement('article');
        article.className = `mini-summary-card ${cls}`;
        const strong = document.createElement('strong');
        strong.textContent = value;
        const span = document.createElement('span');
        span.textContent = title;
        const p = document.createElement('p');
        p.textContent = text;
        article.appendChild(strong);
        article.appendChild(span);
        article.appendChild(p);
        return article;
      };
      frag.appendChild(
        makeCard(
          'exact',
          summary.exactHits,
          'Exact hits',
          `${summary.exactPct.toFixed(1)}% of routes where auto picked the unique fastest engine.`
        )
      );
      frag.appendChild(
        makeCard(
          'near',
          summary.nearTieHits,
          'Near-tie hits',
          `${summary.nearPct.toFixed(1)}% of routes where auto landed inside the timing tolerance band.`
        )
      );
      frag.appendChild(
        makeCard(
          'miss',
          summary.misses,
          'Real misses',
          `${summary.missPct.toFixed(1)}% of routes where auto was outside the winner tolerance band.`
        )
      );
      autoSelectorCardsEl.appendChild(frag);
    } catch (e) {}
  }
}

async function loadRunResultsFromDB(runId) {
  if (!runId) return [];
  try {
    const rows = await getRecordsForRun(runId);
    return rows.map((row) => normalizeDbRow(row));
  } catch (err) {
    console.error('[benchmark] Failed to load benchmark results from IndexedDB:', err);
    return [];
  }
}

 

function getSummaryGroupKey(result) {
  if (!result || !result.lengthCategory || !Number.isFinite(result.safeE)) return null;
  const safeE = Number(result.safeE);
  const sizeKey =
    safeE < 20_000 ? 'small' : safeE < 100_000 ? 'medium' : safeE < 500_000 ? 'large' : 'xlarge';
  return `${result.lengthCategory}-${sizeKey}`;
}

function buildSummaryGroupKeys(groupMap) {
  const lengthOrder = ['short', 'medium', 'long', 'xlong'];
  const sizeOrder = ['small', 'medium', 'large', 'xlarge'];
  const lengths = Array.from(groupMap.keys()).sort((a, b) => {
    const ai = lengthOrder.indexOf(a);
    const bi = lengthOrder.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
  const keys = [];
  lengths.forEach((lengthKey) => {
    const sizeKeys = Array.from(groupMap.get(lengthKey) || []).sort(
      (a, b) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b)
    );
    sizeKeys.forEach((sizeKey) => keys.push(`${lengthKey}-${sizeKey}`));
  });
  return keys;
}

async function deriveBenchmarkSummaryStateFromDb(runId) {
  const state = createBenchmarkSummaryState();
  if (!runId) return state;
  await streamRunRecords(runId, (row) => {
    const uiResult = normalizeDbRow(row);
    updateSummaryStateWithResult(state, uiResult);
  });
  return state;
}

async function loadRunSummaryStateFromDb(runId) {
  if (!runId) return createBenchmarkSummaryState();
  try {
    const metadata = await getRunMetadata(runId);
    if (metadata && metadata.summaryState && typeof metadata.summaryState === 'object') {
      return metadata.summaryState;
    }
  } catch (err) {
    console.warn('[benchmark] loadRunSummaryStateFromDb failed:', err);
  }
  return deriveBenchmarkSummaryStateFromDb(runId);
}

 

async function loadPerformanceSummaryFromDb(runId) {
  const engineKeys = {
    'A★ (Bidirectional)': 'bidirectional_astar_ms',
    'Barrier (Adaptive SSP)': 'adaptive_barrier_ms',
    'Delta-Stepping': 'delta_stepping_ms',
    'Dijkstra (Ultra)': 'ultra_dijkstra_ms',
  };
  const groupMap = new Map();
  const groupStats = new Map();
  const winCountsByLabel = Object.fromEntries(Object.keys(engineKeys).map((label) => [label, 0]));

  await streamRunRecords(runId, (row) => {
    const result = normalizeDbRow(row);
    const groupKey = getSummaryGroupKey(result);
    if (!groupKey) return;

    if (!groupStats.has(groupKey)) {
      groupStats.set(groupKey, {
        sums: Object.fromEntries(Object.keys(engineKeys).map((label) => [label, 0])),
        counts: Object.fromEntries(Object.keys(engineKeys).map((label) => [label, 0])),
      });
    }

    const [lengthCategory] = groupKey.split('-');
    const lengthSet = groupMap.get(lengthCategory) || new Set();
    lengthSet.add(groupKey.split('-')[1]);
    groupMap.set(lengthCategory, lengthSet);

    Object.entries(engineKeys).forEach(([label, field]) => {
      const metricValue = Number(result[field]);
      if (Number.isFinite(metricValue) && metricValue >= 0) {
        const stats = groupStats.get(groupKey);
        stats.sums[label] += metricValue;
        stats.counts[label] += 1;
      }
    });

    const winnerLabel =
      result.winner === 'bidirectional-astar'
        ? 'A★ (Bidirectional)'
        : result.winner === 'adaptive-barrier'
          ? 'Barrier (Adaptive SSP)'
          : result.winner === 'delta-stepping'
            ? 'Delta-Stepping'
            : result.winner === 'ultra-dijkstra'
              ? 'Dijkstra (Ultra)'
              : null;
    if (winnerLabel && Object.hasOwn(winCountsByLabel, winnerLabel)) {
      winCountsByLabel[winnerLabel] += 1;
    }
  });

  const groupKeys = buildSummaryGroupKeys(groupMap);
  const rows = Object.keys(engineKeys).map((engineLabel) => ({
    engine: engineLabel,
  }));

  groupKeys.forEach((groupKey) => {
    const stats = groupStats.get(groupKey);
    const values = rows.map((row) => {
      const count = stats?.counts[row.engine] || 0;
      return count > 0 ? stats.sums[row.engine] / count : null;
    });
    const minValue = values.filter((value) => Number.isFinite(value) && value > 0);
    const minAvg = minValue.length > 0 ? Math.min(...minValue) : null;

    rows.forEach((row) => {
      const avg = stats?.counts[row.engine] ? stats.sums[row.engine] / stats.counts[row.engine] : null;
      if (!Number.isFinite(avg) || avg <= 0 || minAvg === null) {
        row[groupKey] = null;
      } else {
        row[groupKey] = Math.max(1, Math.min(100, Math.round((minAvg / avg) * 100)));
      }
    });
  });

  return {
    groupKeys,
    rows,
    formatValue: (value) => (value === null ? '—' : `${value}%`),
    winCountsByLabel,
  };
}

async function loadCostSummaryFromDb(runId) {
  // Return empty cost summary
  return {
    groupKeys: [],
    rows: [],
    formatValue: (value) => (value === null ? '—' : String(value)),
    winCountsByLabel: {},
  };
}

 

async function getReportResults() {
  if (_currentRunId) {
    return await loadRunResultsFromDB(_currentRunId);
  }
  return [];
}

function resumePausedBenchmark() {
  const resolvers = _pauseResolvers.splice(0, _pauseResolvers.length);
  _paused = false;
  resolvers.forEach((resolve) => resolve());
  if (_benchmarkRouteScheduler) _benchmarkRouteScheduler();
  if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
  if (pauseStateEl) pauseStateEl.hidden = true;
}

function waitForBenchmarkResume(signal) {
  if (!_paused) return Promise.resolve();
  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = () => {
      if (signal?.removeEventListener) {
        signal.removeEventListener('abort', onAbort);
      }
    };
    const onDone = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      const idx = _pauseResolvers.indexOf(onDone);
      if (idx >= 0) _pauseResolvers.splice(idx, 1);
      resolve();
    };
    const onAbort = () => {
      onDone();
    };
    if (signal?.aborted) {
      resolve();
      return;
    }
    _pauseResolvers.push(onDone);
    if (signal?.addEventListener) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// ── Run button ────────────────────────────────────────────────────────────
if (runBtn) runBtn.addEventListener('click', async () => {
  const urlTemplate = urlInputEl.value.trim();
  if (!urlTemplate) {
    alert('Please enter a valid tile URL template.');
    return;
  }

  const mode = modeSelectEl.value;
  const zoom = 14; // hardcoded — z14 provides full road detail
  const nRuns = parseInt(runsInputEl.value, 10) || 10;
  const rawPauseMs = Number.isFinite(pauseInputEl?.valueAsNumber)
    ? pauseInputEl.valueAsNumber
    : Number.parseFloat(pauseInputEl?.value ?? '0');
  const routePauseMs = Math.max(0, Number.isFinite(rawPauseMs) ? Math.floor(rawPauseMs) : 0);
  const maxSuccessRoutes = Math.max(0, parseInt(successRoutesInput.value, 10) || 0);
  const routes = getSelectedRoutes();
  const selectedCategories = getCheckedValues(categoryFiltersEl);
  const selectedLengths = getCheckedValues(lengthFiltersEl);

  if (routes.length === 0) {
    alert('No routes selected. Check the category/length filters.');
    return;
  }

  _stopped = false;
  _savedArtifactsOnStop = false;
  _benchmarkRunComplete = false;
  benchmarkStartTime = performance.now();
  startBenchmarkStopwatch();
  const sharedArrayBufferSupported = typeof SharedArrayBuffer !== 'undefined';
  const benchmarkTimestamp = makeBenchmarkTimestamp(new Date());
  const baseRunContext = {
    generatedAt: new Date().toISOString(),
    mode,
    nRuns,
    routePauseMs,
    routesSelected: routes.length,
    selectedCategories,
    selectedLengths,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBufferSupported,
    benchmarkTimestamp,
  };
  const runPasses = sharedArrayBufferSupported
    ? [
        { parallelOrSerial: 'parallel', sharedArrayBuffer: true, forceSerialRouting: false },
        { parallelOrSerial: 'serial', sharedArrayBuffer: false, forceSerialRouting: true },
      ]
    : [{ parallelOrSerial: 'serial', sharedArrayBuffer: false, forceSerialRouting: false }];
  _abortController = new AbortController();
  _paused = false;
  _pauseResolvers = [];
  _routeCompletionTimes = [];
  _benchmarkSummaryState = createBenchmarkSummaryState();
  if (runBtn) runBtn.disabled = true;
  if (stopBtn) stopBtn.disabled = false;
  if (pauseBtn) pauseBtn.disabled = false;
  if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
  if (pauseStateEl) pauseStateEl.hidden = true;
  _reportSelection = '';
  if (progressSectionEl) progressSectionEl.hidden = false;
  if (resultsSectionEl) resultsSectionEl.hidden = false;
  if (resultsSectionHeaderEl) resultsSectionHeaderEl.hidden = true;
  if (actionRowEl) actionRowEl.hidden = true;
  if (summaryCardsEl) {
    try {
      summaryCardsEl.textContent = '';
    } catch (e) {}
  }
  if (autoSelectorSummaryEl) autoSelectorSummaryEl.hidden = true;
  if (autoSelectorCardsEl) {
    try {
      autoSelectorCardsEl.textContent = '';
    } catch (e) {}
  }
  

  const chosenRunMode = _pendingRunChoice;
  const runId = await selectRunIdForBenchmarkStart(benchmarkTimestamp, {
    explicitRunId: chosenRunMode === 'resume' ? _pendingRunRunId : undefined,
    forceNewRun: chosenRunMode === 'restart',
  });
  saveRunId(runId);
  setCurrentRunId(runId);
  await prepareForRun(runId, { clearAll: false, resume: chosenRunMode === 'resume' });
  _pendingRunChoice = null;
  _pendingRunMetadata = null;
  _pendingRunRunId = null;
  await saveRunMetadata(runId, {
    createdAt: Date.now(),
    benchmarkTimestamp,
    totalRoutes: routes.length,
    totalPasses: runPasses.length,
    completed: false,
    summaryState: createBenchmarkSummaryState(),
  });

  _passContexts = runPasses.map((pass, passIndex) => ({
    ...baseRunContext,
    runId,
    passIndex: passIndex + 1,
    totalPasses: runPasses.length,
    parallelOrSerial: pass.parallelOrSerial,
    sharedArrayBuffer: pass.sharedArrayBuffer,
    forceSerialRouting: pass.forceSerialRouting,
  }));

  try {
    const totalRoutes = routes.length;
    const totalTasks = totalRoutes;
    const maxRouteWorkerConcurrency = Math.max(1, Math.floor((navigator.hardwareConcurrency ?? 4) / 2));
    const successThreshold = maxSuccessRoutes > 0 ? maxSuccessRoutes : Infinity;
    const thresholdActive = Number.isFinite(successThreshold) && successThreshold > 0;

    _benchmarkRouteWorkerState = {
      totalTasks,
      totalRoutes,
      totalPasses: runPasses.length,
      completedTasks: 0,
      completedRoutes: 0,
      completedRouteIndices: new Set(),
      startedTasks: 0,
      lastStatus: null,
      successfulRoutes: 0,
      successThreshold,
      activeTasks: 0,
      ...(thresholdActive ? { successfulRouteIndices: new Set(), failedRouteIndices: new Set() } : {}),
    };

    const existingRunProgress = await loadExistingRunProgress(runId, runPasses.length);
    if (existingRunProgress) {
      _benchmarkRouteWorkerState.completedTasks = existingRunProgress.completedTasks;
      _benchmarkRouteWorkerState.completedRoutes = existingRunProgress.completedRoutes;
      _benchmarkRouteWorkerState.completedRouteIndices = existingRunProgress.completedRouteIndices;
      if (thresholdActive) {
        _benchmarkRouteWorkerState.successfulRouteIndices = existingRunProgress.successfulRouteIndices;
        _benchmarkRouteWorkerState.failedRouteIndices = existingRunProgress.failedRouteIndices;
      }
      _benchmarkSummaryState = await loadRunSummaryStateFromDb(runId);
      updateSummaryCardsFromState(_benchmarkSummaryState);
    }

    const worker = createBenchmarkRouteWorker();
    startBenchmarkUiTicker();
    const routeJobQueue = [];
    const routeResultPromises = [];

    const scheduleBenchmarkRouteJobs = () => {
      if (!_benchmarkRouteWorkerState || _stopped || _paused || routeJobQueue.length === 0) {
        return;
      }

      while (
        !_stopped &&
        !_paused &&
        _benchmarkRouteWorkerState.activeTasks < maxRouteWorkerConcurrency &&
        routeJobQueue.length > 0
      ) {
        const batchSize = Math.min(
          maxRouteWorkerConcurrency - _benchmarkRouteWorkerState.activeTasks,
          routeJobQueue.length
        );
        const queueLengthBefore = routeJobQueue.length;
        const batch = routeJobQueue.splice(0, batchSize);

        _benchmarkRouteDispatchStats.batchCount += 1;
        _benchmarkRouteDispatchStats.lastBatchSize = batchSize;
        _benchmarkRouteDispatchStats.lastQueueLength = queueLengthBefore;

        const dispatchResults = worker.postMessageBatch(
          batch.map((job) => ({ message: job.message, transfer: [] }))
        );

        if (!Array.isArray(dispatchResults)) {
          console.error('[benchmark] route worker dispatch gave unexpected result', dispatchResults);
          routeJobQueue.unshift(...batch);
          break;
        }

        const acceptedJobs = [];
        const rejectedJobs = [];
        dispatchResults.forEach((result, index) => {
          if (result === false) {
            rejectedJobs.push(batch[index]);
          } else {
            acceptedJobs.push(batch[index]);
          }
        });

        _benchmarkRouteDispatchStats.totalDispatched += batchSize;
        _benchmarkRouteDispatchStats.totalAccepted += acceptedJobs.length;
        _benchmarkRouteDispatchStats.totalRejected += rejectedJobs.length;
        _benchmarkRouteDispatchStats.lastDispatchResults = dispatchResults;

        if (rejectedJobs.length > 0) {
          __benchmarkLog.warn('[benchmark] route worker dispatch rejected one or more tasks', {
            dispatchResults,
            rejectedCount: rejectedJobs.length,
            acceptedCount: acceptedJobs.length,
          });
          routeJobQueue.unshift(...rejectedJobs);
        }

        if (acceptedJobs.length === 0) {
          __benchmarkLog.warn('[benchmark] route dispatch accepted zero tasks, breaking to avoid busy loop');
          if (
            _benchmarkRouteWorkerState &&
            _benchmarkRouteWorkerState.activeTasks === 0 &&
            routeJobQueue.length > 0 &&
            !_stopped &&
            !_paused
          ) {
            setTimeout(() => {
              if (!_stopped && !_paused) {
                _benchmarkRouteScheduler?.();
              }
            }, 100);
          }
          break;
        }

        acceptedJobs.forEach((job) => job.start?.());
        _benchmarkRouteWorkerState.activeTasks += acceptedJobs.length;
        _benchmarkRouteWorkerState.startedTasks += acceptedJobs.length;
      }
    };

    _benchmarkRouteScheduler = scheduleBenchmarkRouteJobs;

    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const routeDef = routes[routeIndex];
      const routeKey = `${runId}|${routeIndex}`;
      const routeLifecycle = {
        settled: false,
      };
      const routeState = _benchmarkRouteWorkerState;
      let resolveRoutePromise;
      let rejectRoutePromise;
      const routeResultPromise = new Promise((resolve, reject) => {
        resolveRoutePromise = resolve;
        rejectRoutePromise = reject;
        _pendingRoutePromises.set(routeKey, { resolve, reject });
      });
      routeResultPromise.catch(() => {});

      routeResultPromise.finally(() => {
        routeLifecycle.settled = true;
        if (routeState) {
          routeState.activeTasks = Math.max(0, routeState.activeTasks - 1);
        }
        _benchmarkRouteScheduler?.();
      });

      routeResultPromises.push(routeResultPromise);
      const existingPasses = existingRunProgress?.routePassCompletion?.get(routeIndex) ?? new Set();
      const routePasses = runPasses
        .map((pass, passIndex) => ({
          passIndex: passIndex + 1,
          parallelOrSerial: pass.parallelOrSerial,
          sharedArrayBuffer: pass.sharedArrayBuffer,
          forceSerialRouting: pass.forceSerialRouting,
        }))
        .filter((pass) => !existingPasses.has(pass.passIndex));

      if (routePasses.length > 0) {
        routeJobQueue.push({
          message: {
            type: 'routeJob',
            runId,
            routeIndex,
            routeDef,
            urlTemplate,
            mode,
            zoom,
            nRuns,
            costField: 'distance',
            engineRunTimeoutMs: 20_000,
            routePasses,
          },
          routeKey,
          start: () => {
            routeLifecycle.started = true;
          },
        });
      } else {
        resolveRoutePromise?.(null);
      }
      scheduleBenchmarkRouteJobs();

      if (routePauseMs > 0 && routeIndex + 1 < routes.length) {
        await waitForBenchmarkResume(_abortController.signal);
        if (_stopped) break;
        progressTextEl.textContent = `Pausing ${routePauseMs}ms before next route…`;
        await sleep(routePauseMs, _abortController.signal);
      }
    }

    scheduleBenchmarkRouteJobs();
    await Promise.race([
      Promise.all(routeResultPromises),
      createAbortPromise(_abortController.signal),
    ]);

    disposeBenchmarkRouteWorker();
    await waitForPendingWrites();
    const runResults = await getReportResults();
    _benchmarkRunComplete = true;
    if (runResults.length > 0) {
      _reportVariants = [];
      updateReportTypeControls();
    }
    await showResults(runResults);

    if (!_savedArtifactsOnStop) {
      try {
        const savedPaths = await saveRunArtifacts(runResults, { ...(_runContext ?? buildReportContext()), runId });
        _savedArtifactsOnStop = true;
        if (savedPaths.length > 0) {
          await markRunComplete(runId, { artifactPaths: savedPaths });
        } else {
          await markRunComplete(runId);
        }
      } catch (saveErr) {
        _savedArtifactsOnStop = false;
        console.error('[benchmark] Failed to save artifacts after benchmark completion:', saveErr);
        await markRunComplete(runId);
      }
    }

    if (runBtn) runBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
    _paused = false;
    resumePausedBenchmark();
    await disposeBenchDb();
    _abortController = null;
    _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
    resetBenchmarkRunState();
    disposeBenchmarkResources();
  } catch (err) {
    if (!_stopped && err?.name !== 'AbortError') console.error('Benchmark error:', err);
    if ((_stopped || err?.name === 'AbortError') && !_benchmarkRunComplete) {
      try {
        const runResults = await getReportResults();
        if (runResults.length > 0) {
          _benchmarkRunComplete = true;
          await showResults(runResults);
        }
      } catch (showErr) {
        console.error('[benchmark] Failed to render results after abort:', showErr);
      }
    }
  } finally {
    stopBenchmarkStopwatch();
    updateBenchmarkStopwatch();

    if (!_savedArtifactsOnStop && !_stopSaveInProgress && _currentRunId) {
      try {
        const runResults = await getReportResults();
        if (runResults.length > 0) {
          const savedPaths = await saveRunArtifacts(runResults, { ...(_runContext ?? buildReportContext()), runId });
          if (savedPaths.length > 0) {
            await markRunComplete(runId, { artifactPaths: savedPaths });
          } else {
            await markRunComplete(runId);
          }
        } else {
          await markRunComplete(runId);
        }
      } catch (saveErr) {
        console.error('[benchmark] Failed to save artifacts after benchmark completion:', saveErr);
        await markRunComplete(runId);
      }
    }

    if (runBtn) runBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
    _paused = false;
    resumePausedBenchmark();
    await disposeBenchDb();
    disposeBenchmarkRouteWorker();
    _abortController = null;
    _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
    clearSavedRunId();
    resetBenchmarkRunState();
    disposeBenchmarkResources();
  }
});

if (resumeRunBtn) {
  resumeRunBtn.addEventListener('click', () => choosePendingRunAction('resume'));
}
if (restartRunBtn) {
  restartRunBtn.addEventListener('click', () => choosePendingRunAction('restart'));
}

detectPendingRunMetadata();

if (stopBtn) {
  stopBtn.addEventListener('click', async () => {
  _stopped = true;
  _benchmarkRunComplete = true;
  _savedArtifactsOnStop = true;
  _stopSaveInProgress = true;
  if (stopBtn) stopBtn.disabled = true;
  resumePausedBenchmark();
  _abortController?.abort();

  if (_currentRunId) {
    await markRunComplete(_currentRunId);
  }

  await waitForPendingWrites();

  const runResults = await getReportResults();
  await showResults(runResults);
  const reportContext = {
    ...buildReportContext(),
    ..._runContext,
    runId: _currentRunId,
    benchmarkTimestamp: _runContext?.benchmarkTimestamp,
  };
  if (runResults.length > 0) {
    showReport(runResults, reportContext);
  }

  _savedArtifactsOnStop = true;
  try {
    const savedPaths = await saveRunArtifacts(runResults, reportContext);
    if (savedPaths.length > 0) {
      await markRunComplete(_currentRunId, { artifactPaths: savedPaths });
    } else if (_currentRunId) {
      await markRunComplete(_currentRunId);
    }
  } catch (err) {
    _savedArtifactsOnStop = false;
    _stopSaveInProgress = false;
    console.error('Failed to save report on stop:', err);
    if (_currentRunId) {
      await markRunComplete(_currentRunId);
    }
  } finally {
    _stopSaveInProgress = false;
  }
  });
}

// UI actions simplified
if (pauseBtn) {
  pauseBtn.addEventListener('click', () => {
    _paused = !_paused;
    if (_paused) {
      pauseBtn.textContent = '▶ Resume';
      if (pauseStateEl) pauseStateEl.hidden = false;
    } else {
      pauseBtn.textContent = '⏸ Pause';
      if (pauseStateEl) pauseStateEl.hidden = true;
      resumePausedBenchmark();
    }
  });
}


function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPageCount(totalRows) {
  return Math.max(1, Math.ceil((Number.isFinite(totalRows) ? totalRows : 0) / RESULTS_PAGE_SIZE));
}

function formatErrorDetails(r) {
  const lines = [];
  if (r.error) {
    lines.push(`Route error: ${r.error}`);
  }
  if (r.routeError) {
    lines.push(`Route error: ${r.routeError}`);
  }

  const engineErrors = [
    { key: 'bidirectional_astar_error', label: 'A★ error' },
    { key: 'bidirectional_astar_timed_error', label: 'A★ timed error' },
    { key: 'bidirectional_astar_warm_error', label: 'A★ warmup error' },
    { key: 'adaptive_barrier_error', label: 'Barrier error' },
    { key: 'adaptive_barrier_timed_error', label: 'Barrier timed error' },
    { key: 'adaptive_barrier_warm_error', label: 'Barrier warmup error' },
    { key: 'delta_stepping_error', label: 'Delta error' },
    { key: 'delta_stepping_timed_error', label: 'Delta timed error' },
    { key: 'delta_stepping_warm_error', label: 'Delta warmup error' },
    { key: 'ultra_dijkstra_error', label: 'Dijkstra error' },
    { key: 'ultra_dijkstra_timed_error', label: 'Dijkstra timed error' },
    { key: 'ultra_dijkstra_warm_error', label: 'Dijkstra warmup error' },
  ];
  engineErrors.forEach(({ key, label }) => {
    if (r[key]) {
      lines.push(`${label}: ${r[key]}`);
    }
  });

  if (lines.length === 0) {
    lines.push('No route or engine errors');
  }
  return lines;
}

 

function computeBenchmarkEstimatedTotalMs({ elapsedMs, completedRoutes, effectiveTotalRoutes }) {
  const elapsedSec = elapsedMs / 1000;
  const fullAverageRoutesPerSec = completedRoutes > 0 && elapsedSec > 0 ? completedRoutes / elapsedSec : 0;
  if (!effectiveTotalRoutes || fullAverageRoutesPerSec <= 0) return null;
  return Math.max(elapsedMs, Math.round((effectiveTotalRoutes / fullAverageRoutesPerSec) * 1000));
}

function updateBenchmarkStopwatch(endTime = performance.now()) {
  if (!benchmarkStopwatchEl || benchmarkStartTime == null) return;
  const elapsedMs = endTime - benchmarkStartTime;
  const completedRoutes = _benchmarkRouteWorkerState?.completedRoutes ?? 0;
  const totalRoutes = _benchmarkRouteWorkerState?.totalRoutes ?? _benchmarkRouteWorkerState?.totalTasks ?? null;
  const elapsedSec = elapsedMs / 1000;
  const fullAverageRoutesPerSec = completedRoutes > 0 && elapsedSec > 0 ? completedRoutes / elapsedSec : 0;
  let latestWindowRoutesPerSec;
  let latestWindowText = `latest ${Math.min(10, completedRoutes)} avg — routes/sec`;
  let latestWindowWarn = false;

  if (_routeCompletionTimes.length > 1) {
    const times = _routeCompletionTimes;
    const sampleSize = Math.min(10, times.length);
    const windowStartIndex = times.length - sampleSize;
    const windowDurationSec = (times[times.length - 1] - times[windowStartIndex]) / 1000;
    const effectiveWindowSec = Math.max(windowDurationSec, 0.001);
    latestWindowRoutesPerSec = sampleSize / effectiveWindowSec;
    latestWindowText = `latest ${sampleSize} avg ${latestWindowRoutesPerSec.toFixed(2)} routes/sec`;

    const rates = [];
    for (let i = windowStartIndex + 1; i < times.length; i += 1) {
      const intervalSec = Math.max((times[i] - times[i - 1]) / 1000, 0.001);
      rates.push(1 / intervalSec);
    }

    if (rates.length > 0) {
      const meanRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
      const variance = rates.reduce((sum, rate) => sum + (rate - meanRate) ** 2, 0) / rates.length;
      const stddev = Math.sqrt(variance);
      latestWindowWarn = latestWindowRoutesPerSec < fullAverageRoutesPerSec - 1.5 * stddev;
    }
  }

  const activeThreshold =
    _benchmarkRouteWorkerState && Number.isFinite(_benchmarkRouteWorkerState.successThreshold)
      ? _benchmarkRouteWorkerState.successThreshold
      : null;
  const effectiveTotalRoutes = activeThreshold && activeThreshold > 0 ? Math.min(totalRoutes ?? Infinity, activeThreshold) : totalRoutes;
  const estimatedTotalMs = computeBenchmarkEstimatedTotalMs({
    elapsedMs,
    completedRoutes,
    effectiveTotalRoutes,
  });
  const estimatedTotalText = estimatedTotalMs != null ? formatDuration(estimatedTotalMs) : 'estimating';

  benchmarkStopwatchEl.hidden = false;
  try {
    benchmarkStopwatchEl.textContent = '';
    const strong = document.createElement('strong');
    strong.textContent = `${formatDuration(elapsedMs)} out of ${estimatedTotalText}`;
    const spanAvg = document.createElement('span');
    spanAvg.textContent = `avg ${fullAverageRoutesPerSec.toFixed(2)} routes/sec`;
    const spanWindow = document.createElement('span');
    if (latestWindowWarn) spanWindow.className = 'metric--warn';
    spanWindow.textContent = latestWindowText;
    benchmarkStopwatchEl.appendChild(strong);
    benchmarkStopwatchEl.appendChild(spanAvg);
    benchmarkStopwatchEl.appendChild(spanWindow);
  } catch (e) {}
}

function startBenchmarkStopwatch() {
  if (_stopwatchRaf != null) return;
  function tick() {
    updateBenchmarkStopwatch();
    _stopwatchRaf = requestAnimationFrame(tick);
  }
  tick();
}

function stopBenchmarkStopwatch() {
  if (_stopwatchRaf == null) return;
  cancelAnimationFrame(_stopwatchRaf);
  _stopwatchRaf = null;
}

function engineShortName(engineId) {
  return engineId === 'bidirectional-astar'
    ? 'A★'
    : engineId === 'adaptive-barrier'
      ? 'Barrier'
      : engineId === 'delta-stepping'
        ? 'Delta'
        : engineId === 'ultra-dijkstra'
          ? 'Dijkstra'
          : engineId;
}
 

function formatDuration(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((totalMs % 1000) / 100);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }

  return `${seconds}.${tenths}s`;
}

function buildRunContextLabel(context) {
  if (!context || !context.parallelOrSerial) return '';

  const passSegment =
    Number.isFinite(context.passIndex) &&
    Number.isFinite(context.totalPasses) &&
    context.totalPasses > 1
      ? `Pass ${context.passIndex}/${context.totalPasses}`
      : null;
  const modeSegment = String(context.parallelOrSerial).toUpperCase();
  const sabSegment = context.sharedArrayBuffer ? 'SAB enabled' : 'SAB disabled';

  return [passSegment, modeSegment, sabSegment].filter(Boolean).join(' · ');
}

function buildReportWithContextHeader(report, context) {
  if (!report) return report;
  const label = buildRunContextLabel(context);
  return label ? `[${label}]\n\n${report}` : report;
}

function buildReportContext() {
  const rawPauseMs = Number.isFinite(pauseInputEl?.valueAsNumber)
    ? pauseInputEl.valueAsNumber
    : Number.parseFloat(pauseInputEl?.value ?? '0');
  const routePauseMs = Math.max(0, Number.isFinite(rawPauseMs) ? Math.floor(rawPauseMs) : 0);

  return {
    generatedAt: new Date().toISOString(),
    mode: modeSelectEl?.value ?? 'unknown',
    nRuns: Number.isFinite(runsInputEl?.valueAsNumber)
      ? runsInputEl.valueAsNumber
      : Number.parseInt(runsInputEl?.value ?? '0', 10) || 0,
    routePauseMs,
    routesSelected: getSelectedRoutes().length,
    selectedCategories: getCheckedValues(categoryFiltersEl),
    selectedLengths: getCheckedValues(lengthFiltersEl),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 'unknown',
    crossOriginIsolated: window.crossOriginIsolated ?? false,
    sharedArrayBuffer: Boolean(_runContext?.sharedArrayBuffer),
    parallelOrSerial: _runContext?.parallelOrSerial ?? 'serial',
    benchmarkTimestamp: _runContext?.benchmarkTimestamp,
    runId: _currentRunId,
  };
}

function showReport(results, context) {
  // Generate and return report; avoid writing to report UI in simplified benchmark
  if (!Array.isArray(results) || results.length === 0) return null;
  return buildReportWithContextHeader(generateCopilotReport(results, context), context);
}

function showReportVariant(variant) {
  // Return report text for the given variant without updating UI
  const results = Array.isArray(variant.results) ? variant.results : [];
  const context = variant.context || buildReportContext();
  if (!results.length) return null;
  return buildReportWithContextHeader(generateCopilotReport(results, context), context);
}

function updateRunContextLabels(context) {
  const label = buildRunContextLabel(context);

  if (!label) {
    if (resultsRunContextEl) {
      resultsRunContextEl.hidden = true;
      try {
        resultsRunContextEl.textContent = '';
      } catch (e) {}
    }
    return;
  }

  if (resultsRunContextEl) {
    resultsRunContextEl.hidden = false;
    try {
      resultsRunContextEl.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = label;
      resultsRunContextEl.appendChild(strong);
    } catch (e) {}
  }
}

function getOrCreateReportStatusEl() {
  let el = document.getElementById('report-status');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'report-status';
  if (document.body) {
    document.body.appendChild(el);
  }
  return el;
}

function setReportStatus(message) {
  const el = getOrCreateReportStatusEl();
  try {
    el.textContent = message;
  } catch (e) {
    /* ignore DOM write failures */
  }
}

async function showResults(results) {
  if (resultsSectionEl) resultsSectionEl.hidden = false;
  if (resultsSectionHeaderEl) resultsSectionHeaderEl.hidden = false;
  updateRunContextLabels(_runContext ?? {});
  setReportStatus('Report ready');
  _currentPage = 1;

  // Update summary cards only
  let summaryState;
  if (_currentRunId) {
    try {
      summaryState = await loadRunSummaryStateFromDb(_currentRunId);
    } catch (err) {
      summaryState = _benchmarkSummaryState ? _benchmarkSummaryState : deriveBenchmarkSummaryState(results);
    }
  } else {
    summaryState = _benchmarkSummaryState ? _benchmarkSummaryState : deriveBenchmarkSummaryState(results);
  }
  updateSummaryCardsFromState(summaryState);
  if (actionRowEl) actionRowEl.hidden = !_benchmarkRunComplete;
  updateBenchmarkStopwatch();
  if (suggestionWrapEl) suggestionWrapEl.hidden = true;
}

function deriveEngineWins(results) {
  const wins = {
    'bidirectional-astar': 0,
    'adaptive-barrier': 0,
    'delta-stepping': 0,
    'ultra-dijkstra': 0,
  };
  results.forEach((row) => {
    if (row?.winner && Object.hasOwn(wins, row.winner)) wins[row.winner] += 1;
  });
  return wins;
}

function summarizeAutoSelectorForArtifact(results) {
  const covered = results.filter((row) => !row.error && row.winner);
  const exactHits = covered.filter(
    (row) => Number(row.auto_matches_winner) === 1 && row.auto_engine === row.winner
  ).length;
  const nearTieHits = covered.filter(
    (row) => Number(row.auto_matches_winner) === 1 && row.auto_engine !== row.winner
  ).length;
  const misses = covered.filter((row) => Number(row.auto_matches_winner) === 0).length;
  const coverage = covered.length;
  return {
    coverage,
    exactHits,
    nearTieHits,
    misses,
    exactPct: coverage > 0 ? (exactHits / coverage) * 100 : 0,
    nearPct: coverage > 0 ? (nearTieHits / coverage) * 100 : 0,
    missPct: coverage > 0 ? (misses / coverage) * 100 : 0,
  };
}

function makeBenchmarkTimestamp(d = new Date()) {
  const pad = (v) => String(v).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    '_',
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join('');
}

function buildClusteringRows(results) {
  if (!Array.isArray(results)) return [];

  return results.flatMap((row) => {
    const diagnostics = row?.rawDiagnostics?.execution;
    const samplesByEngine = diagnostics?.timingSamplesMsByEngine ?? {};
    const statsByEngine = diagnostics?.timingSampleStatsByEngine ?? {};
    const engineIds = [
      'bidirectional-astar',
      'adaptive-barrier',
      'delta-stepping',
      'ultra-dijkstra',
    ];

    return engineIds.map((engineId) => {
      const key =
        engineId === 'bidirectional-astar'
          ? 'bidirectional_astar_ms'
          : engineId === 'adaptive-barrier'
            ? 'adaptive_barrier_ms'
            : engineId === 'delta-stepping'
              ? 'delta_stepping_ms'
              : 'ultra_dijkstra_ms';

      return {
        routeId: row?.id ?? null,
        routeName: row?.name ?? null,
        category: row?.category ?? null,
        lengthCategory: row?.lengthCategory ?? null,
        engineId,
        isWinner: Number(row?.winner === engineId),
        isCostWinner: Number(row?.costWinner === engineId),
        engineMedianMs: row?.[key] ?? null,
        engineSamplesMs: samplesByEngine?.[engineId] ?? [],
        engineSampleStats: statsByEngine?.[engineId] ?? null,
        routeError: row?.routeError ?? row?.error ?? null,
        engineError:
          engineId === 'bidirectional-astar'
            ? (row?.bidirectional_astar_error ?? row?.bidirectional_astar_timed_error ?? null)
            : engineId === 'adaptive-barrier'
              ? (row?.adaptive_barrier_error ?? row?.adaptive_barrier_timed_error ?? null)
              : engineId === 'delta-stepping'
                ? (row?.delta_stepping_error ?? row?.delta_stepping_timed_error ?? null)
                : (row?.ultra_dijkstra_error ?? row?.ultra_dijkstra_timed_error ?? null),
        engineWarmError:
          engineId === 'bidirectional-astar'
            ? (row?.bidirectional_astar_warm_error ?? null)
            : engineId === 'adaptive-barrier'
              ? (row?.adaptive_barrier_warm_error ?? null)
              : engineId === 'delta-stepping'
                ? (row?.delta_stepping_warm_error ?? null)
                : (row?.ultra_dijkstra_warm_error ?? null),
        engineTimedError:
          engineId === 'bidirectional-astar'
            ? (row?.bidirectional_astar_timed_error ?? null)
            : engineId === 'adaptive-barrier'
              ? (row?.adaptive_barrier_timed_error ?? null)
              : engineId === 'delta-stepping'
                ? (row?.delta_stepping_timed_error ?? null)
                : (row?.ultra_dijkstra_timed_error ?? null),
        engineResultSource:
          engineId === 'bidirectional-astar'
            ? (row?.bidirectional_astar_result_source ?? null)
            : engineId === 'adaptive-barrier'
              ? (row?.adaptive_barrier_result_source ?? null)
              : engineId === 'delta-stepping'
                ? (row?.delta_stepping_result_source ?? null)
                : (row?.ultra_dijkstra_result_source ?? null),
        engineStatus:
          engineId === 'bidirectional-astar'
            ? (row?.bidirectional_astar_status ?? null)
            : engineId === 'adaptive-barrier'
              ? (row?.adaptive_barrier_status ?? null)
              : engineId === 'delta-stepping'
                ? (row?.delta_stepping_status ?? null)
                : (row?.ultra_dijkstra_status ?? null),
        beelineM: row?.beelineM ?? null,
        N: row?.N ?? null,
        E: row?.E ?? null,
        radius: row?.radius ?? null,
        avgOutDegree: row?.avgOutDegree ?? null,
        edgesPerKmBeeline: row?.edgesPerKmBeeline ?? null,
        nodesPerKmBeeline: row?.nodesPerKmBeeline ?? null,
        autoEngine: row?.auto_engine ?? null,
        autoMatchesWinner: row?.auto_matches_winner ?? null,
        winnerTied: row?.winner_tied ?? null,
      };
    });
  });
}

const ENGINE_TIME_KEYS = {
  'bidirectional-astar': 'bidirectional_astar_ms',
  'adaptive-barrier': 'adaptive_barrier_ms',
  'delta-stepping': 'delta_stepping_ms',
  'ultra-dijkstra': 'ultra_dijkstra_ms',
};

const ENGINE_COST_KEYS = {
  'bidirectional-astar': 'bidirectional_astar_cost',
  'adaptive-barrier': 'adaptive_barrier_cost',
  'delta-stepping': 'delta_stepping_cost',
  'ultra-dijkstra': 'ultra_dijkstra_cost',
};

const ENGINE_ERROR_KEYS = {
  'bidirectional-astar': 'bidirectional_astar_error',
  'adaptive-barrier': 'adaptive_barrier_error',
  'delta-stepping': 'delta_stepping_error',
  'ultra-dijkstra': 'ultra_dijkstra_error',
};

const ENGINE_TIMED_ERROR_KEYS = {
  'bidirectional-astar': 'bidirectional_astar_timed_error',
  'adaptive-barrier': 'adaptive_barrier_timed_error',
  'delta-stepping': 'delta_stepping_timed_error',
  'ultra-dijkstra': 'ultra_dijkstra_timed_error',
};

const ENGINE_WARM_ERROR_KEYS = {
  'bidirectional-astar': 'bidirectional_astar_warm_error',
  'adaptive-barrier': 'adaptive_barrier_warm_error',
  'delta-stepping': 'delta_stepping_warm_error',
  'ultra-dijkstra': 'ultra_dijkstra_warm_error',
};

function round4(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function normalizeBenchmarkRow(row) {
  if (!row || typeof row !== 'object') return row;
  const normalizedRow = { ...row };

  const engineTimes = Object.fromEntries(
    Object.entries(ENGINE_TIME_KEYS).map(([engineId, key]) => [
      engineId,
      Number.isFinite(row[key]) ? row[key] : null,
    ])
  );
  const engineCosts = Object.fromEntries(
    Object.entries(ENGINE_COST_KEYS).map(([engineId, key]) => [
      engineId,
      Number.isFinite(row[key]) ? row[key] : null,
    ])
  );
  const engineErrors = Object.fromEntries(
    Object.entries(ENGINE_ERROR_KEYS).map(([engineId, key]) => [
      engineId,
      row[key] ?? row[ENGINE_TIMED_ERROR_KEYS[engineId]] ?? null,
    ])
  );

  const engineWarmErrors = Object.fromEntries(
    Object.entries(ENGINE_WARM_ERROR_KEYS).map(([engineId, key]) => [engineId, row[key] ?? null])
  );

  const nEnginesWarmErrors = Object.values(engineWarmErrors).filter(Boolean).length;
  const nEnginesTimedErrors = Object.values(ENGINE_TIMED_ERROR_KEYS).filter((key) =>
    Boolean(row[key])
  ).length;
  const anyEngineWarmError = Object.values(engineWarmErrors).some(Boolean);
  const anyEngineTimedError = Object.values(ENGINE_TIMED_ERROR_KEYS).some((key) =>
    Boolean(row[key])
  );

  const timeEntries = Object.entries(engineTimes)
    .filter(([, ms]) => Number.isFinite(ms))
    .sort(([, a], [, b]) => a - b);

  const fastestMs = timeEntries[0]?.[1] ?? null;
  const secondBestMs = timeEntries[1]?.[1] ?? null;
  const runnerUpEngine = timeEntries[1]?.[0] ?? null;
  const worstTimeMs = timeEntries.length > 0 ? timeEntries[timeEntries.length - 1][1] : null;
  const tolerance = Number.isFinite(fastestMs) ? Math.max(0.1, fastestMs * 0.05) : null;
  const winnerCandidates =
    tolerance == null
      ? []
      : timeEntries.filter(([, ms]) => ms <= fastestMs + tolerance).map(([engineId]) => engineId);

  const winnerMarginMs =
    secondBestMs != null && fastestMs != null ? Math.max(0, secondBestMs - fastestMs) : null;
  const winnerMarginPct =
    winnerMarginMs != null && fastestMs > 0 ? round4(winnerMarginMs / fastestMs) : null;
  const bestToWorstMs =
    fastestMs != null && worstTimeMs != null ? Math.max(0, worstTimeMs - fastestMs) : null;
  const bestToWorstPct =
    bestToWorstMs != null && fastestMs > 0 ? round4(bestToWorstMs / fastestMs) : null;
  const enginesWithin5Pct =
    fastestMs != null ? timeEntries.filter(([, ms]) => ms <= fastestMs * 1.05).length : null;
  const enginesWithin10Pct =
    fastestMs != null ? timeEntries.filter(([, ms]) => ms <= fastestMs * 1.1).length : null;

  const enginesFound =
    row.engines_found && typeof row.engines_found === 'object'
      ? Object.fromEntries(
          Object.keys(ENGINE_TIME_KEYS).map((engineId) => [
            engineId,
            Boolean(row.engines_found[engineId]),
          ])
        )
      : Object.fromEntries(
          Object.entries(engineTimes).map(([engineId, ms]) => [engineId, Number.isFinite(ms)])
        );

  const nEnginesFound = Object.values(enginesFound).filter(Boolean).length;
  const nEnginesTimed = Object.values(engineTimes).filter(Number.isFinite).length;
  const nEnginesCost = Object.values(engineCosts).filter(Number.isFinite).length;
  const allEnginesFound = Object.values(enginesFound).every(Boolean);
  const allEnginesTimed = Object.values(engineTimes).every((ms) => ms != null);
  const allEnginesCost = Object.values(engineCosts).every((cost) => cost != null);
  const anyEngineError = Boolean(
    row.error ||
    Object.values(engineErrors).some((value) => !!value) ||
    Object.values(row.errors ?? {}).some((value) => !!value) ||
    Object.values(ENGINE_TIMED_ERROR_KEYS).some((key) => Boolean(row[key]))
  );

  const costWinner =
    row.costWinner ??
    Object.entries(engineCosts)
      .filter(([, cost]) => Number.isFinite(cost))
      .sort(([, a], [, b]) => a - b)[0]?.[0] ??
    null;
  const costWinnerMs = costWinner ? engineTimes[costWinner] : null;
  const winnerVsCostPct =
    costWinnerMs != null && fastestMs != null && costWinnerMs > 0
      ? round4(((fastestMs - costWinnerMs) / costWinnerMs) * 100)
      : null;
  const winnerVsCostMs =
    costWinnerMs != null && fastestMs != null ? round4(fastestMs - costWinnerMs) : null;

  const winner = row.winner ?? winnerCandidates[0] ?? null;
  const autoMatchesWinner =
    row.auto_matches_winner != null
      ? row.auto_matches_winner
      : row.auto_engine && winner
        ? Number(row.auto_engine === winner)
        : null;

  const fill = {
    best_time_ms: fastestMs,
    second_best_ms: secondBestMs,
    runner_up_engine: runnerUpEngine,
    winner_margin_ms: winnerMarginMs,
    winner_margin_pct: winnerMarginPct,
    winner_candidate_count: winnerCandidates.length,
    winner_candidates: winnerCandidates,
    worst_time_ms: worstTimeMs,
    best_to_worst_ms: bestToWorstMs,
    best_to_worst_pct: bestToWorstPct,
    engines_within_5pct: enginesWithin5Pct,
    engines_within_10pct: enginesWithin10Pct,
    n_engines_found: nEnginesFound,
    n_engines_timed: nEnginesTimed,
    n_engines_cost: nEnginesCost,
    n_engines_warm_errors: nEnginesWarmErrors,
    n_engines_timed_errors: nEnginesTimedErrors,
    any_engine_warm_error: anyEngineWarmError,
    any_engine_timed_error: anyEngineTimedError,
    all_engines_found: allEnginesFound,
    all_engines_timed: allEnginesTimed,
    all_engines_cost: allEnginesCost,
    any_engine_error: anyEngineError,
    cost_winner_ms: costWinnerMs,
    winner_vs_cost_pct: winnerVsCostPct,
    winner_vs_cost_ms: winnerVsCostMs,
    winner_tied: Number(winnerCandidates.length > 1),
    auto_matches_winner: autoMatchesWinner,
    winner,
    costWinner,
    routeError: normalizedRow.routeError ?? normalizedRow.error ?? null,
    beelineM:
      normalizedRow.beelineM ??
      (Number.isFinite(normalizedRow.safeBeelineKm)
        ? Math.round(normalizedRow.safeBeelineKm * 1000)
        : null),
    N: normalizedRow.N ?? normalizedRow.safeN ?? null,
    E: normalizedRow.E ?? normalizedRow.safeE ?? null,
    edgesPerKmBeeline: normalizedRow.edgesPerKmBeeline ?? normalizedRow.edgesPerKm ?? null,
    nodesPerKmBeeline: normalizedRow.nodesPerKmBeeline ?? normalizedRow.nodesPerKm ?? null,
  };

  return {
    ...normalizedRow,
    ...Object.fromEntries(
      Object.entries(fill).map(([key, value]) => [key, normalizedRow[key] ?? value])
    ),
  };
}

function buildBenchmarkJsonPayload(results, context) {
  const normalizedResults = Array.isArray(results) ? results.map(normalizeBenchmarkRow) : [];
  const perfSummary = generatePerformanceSummary(normalizedResults);
  const costSummary = generateCostSummary(normalizedResults);
  const completed = normalizedResults.filter((row) => !row.error);
  const errored = normalizedResults.filter((row) => !!row.error);
  const tied = completed.filter((row) => Number(row.winner_tied) === 1);
  const clusteringRows = buildClusteringRows(normalizedResults);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    context: context ?? {},
    runtime: {
      sharedArrayBufferSupported: !!(
        context?.sharedArrayBufferSupported ?? context?.sharedArrayBuffer
      ),
      sharedArrayBufferEnabled: !!context?.sharedArrayBuffer,
      parallelOrSerial:
        context?.parallelOrSerial ?? (context?.sharedArrayBuffer ? 'parallel' : 'serial'),
    },
    overview: {
      mode: context?.mode ?? null,
      routesRun: normalizedResults.length,
      routesCompleted: completed.length,
      routeErrors: errored.length,
      nearTies: tied.length,
      winnerCounts: deriveEngineWins(normalizedResults),
      autoSelector: summarizeAutoSelectorForArtifact(normalizedResults),
    },
    summaries: {
      performance: {
        groupKeys: perfSummary.groupKeys,
        rows: perfSummary.rows,
      },
      cost: {
        groupKeys: costSummary.groupKeys,
        rows: costSummary.rows,
      },
    },
    clustering: {
      schemaVersion: 1,
      engines: ['bidirectional-astar', 'adaptive-barrier', 'delta-stepping', 'ultra-dijkstra'],
      rows: clusteringRows,
    },
    rawResults: normalizedResults,
  };
}

async function saveBenchmarkArtifact(results, context, { allowEmpty = false } = {}) {
  if (!Array.isArray(results) || results.length === 0) {
    if (!allowEmpty) return null;
  }

  const mode = (
    context?.mode || _runContext?.mode || modeSelectEl?.value || 'unknown'
  ).toLowerCase();
  const parallelOrSerial =
    context?.parallelOrSerial ?? (context?.sharedArrayBuffer ? 'parallel' : 'serial');
  const timestamp =
    typeof context?.benchmarkTimestamp === 'string' && context.benchmarkTimestamp
      ? context.benchmarkTimestamp
      : makeBenchmarkTimestamp(new Date());
  const filename = `${timestamp}_benchmark_${mode}_${parallelOrSerial}.json`;
  const payload = buildBenchmarkJsonPayload(results, context);

  // Guard network I/O: if `fetch` isn't available (tests without a mock or
  // environments that disable network), short-circuit with a synthetic
  // saved-path result. Tests that install a `fetch` mock will still receive
  // real fetch calls and can assert on them.
  const fetchFn = typeof fetch === 'function'
    ? fetch
    : typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
    ? globalThis.fetch
    : null;

  if (!fetchFn) {
    if (typeof process !== 'undefined' && process.env && process.env.VITEST) {
      __benchmarkLog.info('[benchmark] test env: skipping network save', filename);
      return { path: `/__benchmark/test/${filename}` };
    }
    if (typeof globalThis !== 'undefined' && globalThis.__benchmarkDisableNetwork) {
      __benchmarkLog.info('[benchmark] network disabled; skipping save', filename);
      return { path: `/__benchmark/disabled/${filename}` };
    }
    __benchmarkLog.warn('[benchmark] fetch not available; cannot save artifact');
    return null;
  }

  const response = await fetchFn('/__benchmark/save-results', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, payload }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => 'unknown_error');
    throw new Error(`save_failed:${response.status}:${details}`);
  }

  return response.json();
}

async function saveRunArtifacts(results, context) {
  const savedPaths = [];
  const passContexts = Array.isArray(_passContexts) ? _passContexts.slice() : [];
  let effectiveResults = results;
  const runId = context?.runId ?? _currentRunId;

  if (runId) {
    await waitForPendingWrites();
  }

  const contextsAreOneBased = isOneBasedPassContext(passContexts);
  let savedPassArtifactsFromDb = false;
  let loadedRunResultsFromDb = false;

  if (runId && typeof indexedDB !== 'undefined' && typeof IDBKeyRange !== 'undefined') {
    const persistedResults = await loadRunResultsFromDB(runId);
    if (Array.isArray(persistedResults) && persistedResults.length > 0) {
      effectiveResults = persistedResults;
      loadedRunResultsFromDb = true;
    }
  }

  const passIndexMode = determinePassIndexMode(effectiveResults, passContexts.length);
  const passGroups = groupResultsByPassVariant(effectiveResults);
  const passIndexGroups = groupResultsByPassIndex(effectiveResults);
  const hasSabGroups = passGroups.sab_on.length > 0 || passGroups.sab_off.length > 0;

  if (loadedRunResultsFromDb && Array.isArray(effectiveResults) && effectiveResults.length > 0) {
    if (Array.isArray(passContexts) && passContexts.length > 0) {
      for (let passIndex = 0; passIndex < passContexts.length; passIndex++) {
        const passContext = passContexts[passIndex];
        if (!passContext) continue;

        const contextPassIndex = Number.isFinite(Number(passContext.passIndex))
          ? passContext.passIndex
          : passIndex;
        const passKey = passContext.sharedArrayBuffer ? 'sab_on' : 'sab_off';
        const passResults = Array.isArray(effectiveResults)
          ? hasSabGroups && typeof passContext.sharedArrayBuffer === 'boolean'
            ? passGroups[passKey]
            : effectiveResults.filter((r) =>
                passIndexMatchesContext(r, contextPassIndex, contextsAreOneBased, passIndexMode)
              )
          : [];

        savedPassArtifactsFromDb = true;
        const reportContext = {
          ...passContext,
          ...getPassContextFromResults(passResults, passIndex),
        };
        try {
          const saveResult = await saveBenchmarkArtifact(passResults, reportContext, {
            allowEmpty: true,
          });
          if (saveResult?.path) savedPaths.push(saveResult.path);
          console.log('[benchmark] Saved pass artifacts:', saveResult?.path ?? saveResult);
        } catch (err) {
          console.error('[benchmark] Failed to save pass artifacts:', err);
        }
      }
    } else if (passIndexGroups.size > 0) {
      const passIndices = Array.from(passIndexGroups.keys()).sort((a, b) => a - b);
      for (let passPosition = 0; passPosition < passIndices.length; passPosition++) {
        const passIndex = passIndices[passPosition];
        const passResults = passIndexGroups.get(passIndex) || [];
        if (!Array.isArray(passResults) || passResults.length === 0) continue;

        savedPassArtifactsFromDb = true;
        const reportContext = getPassContextFromResults(passResults, passPosition);
        try {
          const saveResult = await saveBenchmarkArtifact(passResults, reportContext, {
            allowEmpty: true,
          });
          if (saveResult?.path) savedPaths.push(saveResult.path);
          console.log('[benchmark] Saved pass artifacts:', saveResult?.path ?? saveResult);
        } catch (err) {
          console.error('[benchmark] Failed to save pass artifacts:', err);
        }
      }
    } else if (hasSabGroups) {
      for (const key of ['sab_on', 'sab_off']) {
        const sharedArrayBuffer = key === 'sab_on';
        const passResults = passGroups[key];
        if (!Array.isArray(passResults) || passResults.length === 0) continue;
        const reportContext = {
          ...context,
          parallelOrSerial: sharedArrayBuffer ? 'parallel' : 'serial',
          sharedArrayBuffer,
        };
        savedPassArtifactsFromDb = true;
        try {
          const saveResult = await saveBenchmarkArtifact(passResults, reportContext, {
            allowEmpty: true,
          });
          if (saveResult?.path) savedPaths.push(saveResult.path);
          console.log('[benchmark] Saved pass artifacts:', saveResult?.path ?? saveResult);
        } catch (err) {
          console.error('[benchmark] Failed to save pass artifacts:', err);
        }
      }
    }
  }

  if (!savedPassArtifactsFromDb && !loadedRunResultsFromDb) {
    for (let passIndex = 0; passIndex < passContexts.length; passIndex++) {
      const passContext = passContexts[passIndex];
      const contextPassIndex = passContext?.passIndex ?? passIndex;
      const passKey = passContext?.sharedArrayBuffer ? 'sab_on' : 'sab_off';
      const passResults = Array.isArray(effectiveResults)
        ? hasSabGroups && typeof passContext?.sharedArrayBuffer === 'boolean'
          ? passGroups[passKey]
          : effectiveResults.filter((r) => passIndexMatchesContext(r, contextPassIndex, contextsAreOneBased, passIndexMode))
        : [];
      if (!passContext || !Array.isArray(passResults)) {
        continue;
      }
      const reportContext = {
        ...passContext,
        ...getPassContextFromResults(passResults, passIndex),
      };
      try {
        const saveResult = await saveBenchmarkArtifact(passResults, reportContext, {
          allowEmpty: true,
        });
        if (saveResult?.path) savedPaths.push(saveResult.path);
        console.log('[benchmark] Saved pass artifacts:', saveResult?.path ?? saveResult);
      } catch (err) {
        console.error('[benchmark] Failed to save pass artifacts:', err);
      }
    }
  }

  return savedPaths;
}

export function setCurrentRunId(runId) {
  _currentRunId = runId;
  _currentPageResults = [];
  _reportVariants = [];
}

export function setPassContexts(contexts) {
  _passContexts = Array.isArray(contexts) ? contexts : null;
}

export function _getBenchmarkRouteWorkerState() {
  return _benchmarkRouteWorkerState;
}

export function _setBenchmarkRouteWorkerState(state) {
  _benchmarkRouteWorkerState = state;
}

export function _handleBenchmarkRouteWorkerMessage(event) {
  return handleBenchmarkRouteWorkerMessage(event);
}

export function _getBenchmarkSummaryState() {
  return _benchmarkSummaryState;
}

export function _setBenchmarkSummaryState(state) {
  _benchmarkSummaryState = state;
}

export function _flushBenchmarkUi() {
  renderProgressFromState(_benchmarkRouteWorkerState, _benchmarkSummaryState);
}

export {
  getCheckedValues,
  getSelectedRoutes,
  updateRouteCount,
  getReportVariantLabel,
  getReportFilename,
  buildReportVariants,
  createReportVariants,
  updateReportTypeControls,
  getSelectedReportVariant,
  computeBenchmarkEstimatedTotalMs,
  
  getReportResults,
  saveRunArtifacts,
  markRunComplete,
  buildBenchmarkJsonPayload,
  showResults,
  round4,
  formatDuration,
};

