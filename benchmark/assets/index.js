import {
  ROUTES,
  CATEGORIES, LENGTH_CATEGORIES,
  CATEGORY_LABELS, LENGTH_CATEGORY_LABELS,
} from './routes.js';
import {
  runBenchmark,
  clearBenchmarkCache,
  getSharedPool,
  downloadCSV,
  drawScatter,
  drawDensityScatter,
  drawFeatureHistogram,
  drawTimingBubble,
  installTooltip,
  generatePerformanceSummary,
  generateCostSummary,
  generateCopilotReport,
} from './benchmark.js';

const root = document;
const categoryFiltersEl = root.getElementById('category-filters');
const lengthFiltersEl = root.getElementById('length-filters');
const successRoutesInput = root.getElementById('success-routes-input');
const routeCountEl = root.getElementById('route-count');
const runBtn = root.getElementById('run-btn');
const stopBtn = root.getElementById('stop-btn');
const progressSectionEl = root.getElementById('progress-section');
const resultsSectionEl = root.getElementById('results-section');
const resultsTbodyEl = root.getElementById('results-tbody');
const summaryCardsEl = root.getElementById('summary-cards');
const summaryTbodyEl = root.getElementById('summary-tbody');
const summaryTheadEl = root.getElementById('summary-thead');
const costSummaryTbodyEl = root.getElementById('cost-summary-tbody');
const costSummaryTheadEl = root.getElementById('cost-summary-thead');
const autoSelectorSummaryEl = root.getElementById('auto-selector-summary');
const autoSelectorCardsEl = root.getElementById('auto-selector-cards');
const progressBarEl = root.getElementById('progress-bar');
const progressTextEl = root.getElementById('progress-text');
const resultsRunContextEl = root.getElementById('results-run-context');
const scatterEl = root.getElementById('scatter');
const densityEl = root.getElementById('density');
const histogramEl = root.getElementById('histogram');
const bubbleEl = root.getElementById('bubble');
const urlInputEl = root.getElementById('url-input');
const modeSelectEl = root.getElementById('mode-select');
const runsInputEl = root.getElementById('runs-input');
const pauseInputEl = root.getElementById('pause-input');
const downloadBtn = root.getElementById('download-btn');
const pauseBtn = root.getElementById('pause-btn');
const reportBtn = root.getElementById('report-btn');
const copyReportBtn = root.getElementById('copy-report-btn');
const reportPanelEl = root.getElementById('report-panel');
const reportTypeControlsEl = root.getElementById('report-type-controls');
const reportViewSelectEl = root.getElementById('report-view-select');
const reportStatusEl = root.getElementById('report-status');
const reportNoteEl = root.getElementById('report-note');
const reportOutputEl = root.getElementById('report-output');
const pauseStateEl = root.getElementById('pause-state');
if (pauseStateEl) pauseStateEl.hidden = true;
const suggestionWrapEl = root.getElementById('suggestion-wrap');
const resultsTableSortHeaders = root.querySelectorAll('#results-table thead th[data-col]');

fetch('https://tiles.openfreemap.org/planet')
  .then(r => r.json())
  .then(meta => {
    if (urlInputEl && !urlInputEl.value) urlInputEl.value = meta.tiles[0];
  })
  .catch(err => console.error('[benchmark] Failed to fetch tile URL:', err));

// ── Populate filter checkboxes from routes.js ────────────────────────────
(function buildFilters() {
  const catFragment = document.createDocumentFragment();
  CATEGORIES.forEach(val => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${val}" checked> ${CATEGORY_LABELS[val] ?? val}`;
    catFragment.appendChild(lbl);
  });
  categoryFiltersEl.appendChild(catFragment);

  const lenFragment = document.createDocumentFragment();
  LENGTH_CATEGORIES.forEach(val => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${val}" checked> ${LENGTH_CATEGORY_LABELS[val] ?? val}`;
    lenFragment.appendChild(lbl);
  });
  lengthFiltersEl.appendChild(lenFragment);
})();

// ── Route count indicator ─────────────────────────────────────────────────
function getCheckedValues(containerEl) {
  return Array.from(containerEl.querySelectorAll('input:checked'), (el) => el.value);
}

function getSelectedRoutes() {
  const cats = getCheckedValues(categoryFiltersEl);
  const lengths = getCheckedValues(lengthFiltersEl);
  return ROUTES.filter(r => cats.includes(r.category) && lengths.includes(r.lengthCategory));
}

function updateRouteCount() {
  const n = getSelectedRoutes().length;
  const successThreshold = Math.max(0, parseInt(successRoutesInput.value, 10) || 0);
  const selectedRoutes = successThreshold > 0 ? Math.min(n, successThreshold) : n;
  const thresholdText = successThreshold > 0
    ? `, ${selectedRoutes.toLocaleString()} selected`
    : '';
  routeCountEl.textContent = `${n.toLocaleString()} routes available${thresholdText}`;
}

function detectHardwareConcurrency() {
  return typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
}

function getBenchmarkRouteBatchConcurrency(routes) {
  const hw = detectHardwareConcurrency();
  // When engine worker pooling is enabled, each route still performs multiple
  // engine queries and may spawn internal algorithm workers. Keep route-level
  // concurrency conservative to avoid nested oversubscription.
  const defaultConcurrency = Math.max(1, Math.floor(hw / 4));
  return Math.min(routes.length, defaultConcurrency);
}

function getBenchmarkEngineWorkerMaxPoolSize(routes) {
  const hw = detectHardwareConcurrency();

  // Reserve one core for the main thread / browser, and reserve a small
  // fixed tile-worker footprint because the shared tile pool is also active
  // during graph build and may scale to multiple workers.
  const totalWorkerBudget = Math.max(1, hw - 1);
  const tileWorkerReserve = Math.min(2, totalWorkerBudget);
  const availableForEngine = Math.max(1, totalWorkerBudget - tileWorkerReserve);

  const targetPoolSize = Math.max(1, Math.min(8, availableForEngine));
  return targetPoolSize;
}

function getReportVariantLabel(key) {
  return key === 'sab_on' ? 'SAB On'
    : key === 'sab_off' ? 'SAB Off'
    : 'Combined';
}

function buildReportVariants() {
  if (!_reportVariants || _reportVariants.length === 0) {
    return createReportVariants();
  }
  return _reportVariants.slice();
}

function createReportVariants() {
  const combinedResults = Array.isArray(_passResults) && _passResults.length > 0
    ? _passResults[0].concat(..._passResults.slice(1))
    : _results;

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

  if (Array.isArray(_passResults) && Array.isArray(_passContexts)) {
    _passContexts.forEach((context, index) => {
      if (!context) return;
      const key = context.sharedArrayBuffer ? 'sab_on' : 'sab_off';
      variants.push({
        key,
        label: getReportVariantLabel(key),
        results: _passResults[index] ?? [],
        context: {
          ...context,
          parallelOrSerial: key,
        },
      });
    });
  }

  return variants;
}

function updateReportTypeControls() {
  if (!reportViewSelectEl || !reportTypeControlsEl) return;
  const variants = buildReportVariants();
  if (variants.length <= 1) {
    reportTypeControlsEl.hidden = true;
    _reportSelection = 'combined';
    return;
  }

  reportTypeControlsEl.hidden = false;
  reportViewSelectEl.innerHTML = '';
  variants.forEach(({ key, label }) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = label;
    reportViewSelectEl.appendChild(option);
  });

  if (!variants.some((variant) => variant.key === _reportSelection)) {
    _reportSelection = 'combined';
  }
  reportViewSelectEl.value = _reportSelection;
}

function getSelectedReportVariant() {
  const selection = (reportViewSelectEl?.value || _reportSelection || 'combined');
  _reportSelection = selection;
  const variants = buildReportVariants();
  return variants.find((variant) => variant.key === selection) ?? variants[0];
}

function getReportFilename(variant, mode) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const suffix = variant?.key && variant.key !== 'combined' ? `_${variant.key}` : '_combined';
  return `benchmark_${mode}${suffix}_${timestamp}.csv`;
}

categoryFiltersEl.addEventListener('change', updateRouteCount);
lengthFiltersEl.addEventListener('change', updateRouteCount);
successRoutesInput.addEventListener('input', updateRouteCount);
successRoutesInput.addEventListener('change', updateRouteCount);
successRoutesInput.addEventListener('keyup', updateRouteCount);
updateRouteCount();

// ── State ─────────────────────────────────────────────────────────────────
let _results = [];
let _sortCol = 'E';
let _sortAsc  = true;
let _stopped  = false;
let _paused = false;
let _pauseResolvers = [];
let _cleanupTooltip = null;
let _chartScatter = null;
let _chartDensity = null;
let _chartHistogram = null;
let _chartBubble = null;
let _runContext = null;
let _passResults = null;
let _passContexts = null;
let _reportVariants = [];
let _reportSelection = 'combined';
let _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
let _abortController = null;
let _updateScheduled = false;
let _pendingChartRedraw = false;
let _pendingSummaryUpdate = false;
window.__benchmarkResults = [];

function scheduleUIUpdate() {
  if (_updateScheduled) return;
  _updateScheduled = true;
  requestAnimationFrame(() => {
    _updateScheduled = false;
    if (_pendingSummaryUpdate) {
      updateSummary(_results);
      _pendingSummaryUpdate = false;
    }
    if (_pendingChartRedraw) {
      redrawCharts(_results);
      _pendingChartRedraw = false;
    }
  });
}

function resumePausedBenchmark() {
  const resolvers = _pauseResolvers.splice(0, _pauseResolvers.length);
  _paused = false;
  resolvers.forEach((resolve) => resolve());
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

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(resolve, ms);
    if (signal?.aborted) {
      clearTimeout(timeoutId);
      resolve();
      return;
    }
    if (signal?.addEventListener) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeoutId);
          resolve();
        },
        { once: true }
      );
    }
  });
}

function engineLabel(engineId) {
  switch (engineId) {
    case 'bidirectional-astar': return 'A*';
    case 'adaptive-barrier': return 'Barrier';
    case 'delta-stepping': return 'Delta';
    case 'ultra-dijkstra': return 'Dijkstra';
    default: return engineId || 'engine';
  }
}

function formatStatusSuffix(progress) {
  const phase = progress?.phase;
  const phaseInfo = progress?.phaseInfo ?? {};
  const state = _engineWorkerStatus?.state ?? 'idle';

  if (phase === 'pausing') {
    return ' [stage: route pause]';
  }

  if (phase === 'fetching-tiles') return ' [stage: fetching tile list]';
  if (phase === 'building-graph') {
    const tileNote = Number.isFinite(phaseInfo?.tileCount) ? `, ${phaseInfo.tileCount} tiles` : '';
    return ` [stage: building graph${tileNote}]`;
  }
  if (phase === 'preparing-graph') return ' [stage: preparing graph indices]';
  if (phase === 'warming-engines') return ' [stage: warming routing engines]';
  if (phase === 'warming-engine') {
    return ` [stage: warmup (${engineLabel(phaseInfo?.engineId)})]`;
  }
  if (phase === 'timing-engines') return ' [stage: timing engines]';
  if (phase === 'timing-round') {
    const round = Number.isFinite(phaseInfo?.round) ? phaseInfo.round : '?';
    const totalRounds = Number.isFinite(phaseInfo?.totalRounds) ? phaseInfo.totalRounds : '?';
    return ` [stage: timing round ${round}/${totalRounds}]`;
  }
  if (phase === 'timing-engine') {
    const round = Number.isFinite(phaseInfo?.round) ? phaseInfo.round : '?';
    const totalRounds = Number.isFinite(phaseInfo?.totalRounds) ? phaseInfo.totalRounds : '?';
    return ` [stage: timing ${engineLabel(phaseInfo?.engineId)} (${round}/${totalRounds})]`;
  }

  if (progress?.done) {
    return ' [stage: complete]';
  }

  if (state === 'running') {
    return ` [stage: routing (${engineLabel(_engineWorkerStatus?.engineId)})]`;
  }

  if (state === 'cancelling') {
    return ' [stage: cancelling route]';
  }

  if (state === 'error') {
    const reason = _engineWorkerStatus?.lastError ? `: ${_engineWorkerStatus.lastError}` : '';
    return ` [stage: engine error${reason}]`;
  }

  return ' [stage: preparing tiles/graph]';
}

// ── Run button ────────────────────────────────────────────────────────────
runBtn.addEventListener('click', async () => {
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
  const effectiveRoutes = maxSuccessRoutes > 0 ? routes.slice(0, maxSuccessRoutes) : routes;
  const routeBatchConcurrency = maxSuccessRoutes > 0 ? 1 : getBenchmarkRouteBatchConcurrency(effectiveRoutes);
  const engineWorkerMaxPoolSize = getBenchmarkEngineWorkerMaxPoolSize(effectiveRoutes);
  const selectedCategories = getCheckedValues(categoryFiltersEl);
  const selectedLengths = getCheckedValues(lengthFiltersEl);

  if (routes.length === 0) {
    alert('No routes selected. Check the category/length filters.');
    return;
  }

  _stopped = false;
  _results = [];
  const sharedArrayBufferSupported = typeof SharedArrayBuffer !== 'undefined';
  const benchmarkTimestamp = makeBenchmarkTimestamp(new Date());
  const baseRunContext = {
    generatedAt: new Date().toISOString(),
    mode,
    nRuns,
    routePauseMs,
    routeBatchConcurrency,
    engineWorkerMaxPoolSize,
    routesSelected: effectiveRoutes.length,
    selectedCategories,
    selectedLengths,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBufferSupported,
    benchmarkTimestamp,
  };
  const sharedPool = getSharedPool();
  const runPasses = sharedArrayBufferSupported
    ? [
        { parallelOrSerial: 'parallel', sharedArrayBuffer: true, forceSerialRouting: false },
        { parallelOrSerial: 'serial', sharedArrayBuffer: false, forceSerialRouting: true },
      ]
    : [
        { parallelOrSerial: 'serial', sharedArrayBuffer: false, forceSerialRouting: false },
      ];
  _abortController = new AbortController();
  _paused = false;
  _pauseResolvers = [];
  _pendingSummaryUpdate = false;
  _pendingChartRedraw = false;
  _updateScheduled = false;
  _results = [];
  window.__benchmarkResults = _results;
  runBtn.disabled = true;
  stopBtn.disabled = false;
  if (pauseBtn) pauseBtn.disabled = false;
  if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
  if (pauseStateEl) pauseStateEl.hidden = true;
  if (reportPanelEl) reportPanelEl.hidden = true;
  if (reportTypeControlsEl) reportTypeControlsEl.hidden = true;
  if (reportViewSelectEl) reportViewSelectEl.innerHTML = '';
  _reportSelection = 'combined';
  if (reportOutputEl) reportOutputEl.value = '';
  if (copyReportBtn) copyReportBtn.disabled = true;
  if (reportStatusEl) reportStatusEl.textContent = 'Report not generated';
  if (reportNoteEl) reportNoteEl.textContent = 'Generate a benchmark report for the current results.';
  progressSectionEl.hidden = false;
  resultsSectionEl.hidden = true;
  resultsTbodyEl.innerHTML = '';
  summaryCardsEl.innerHTML = '';
  summaryTbodyEl.innerHTML = '';
  summaryTheadEl.innerHTML = '';
  costSummaryTbodyEl.innerHTML = '';
  costSummaryTheadEl.innerHTML = '';
  autoSelectorSummaryEl.hidden = true;
  autoSelectorCardsEl.innerHTML = '';
  if (_chartScatter) { _chartScatter.destroy(); _chartScatter = null; }
  if (_chartDensity) { _chartDensity.destroy(); _chartDensity = null; }
  if (_cleanupTooltip) { _cleanupTooltip(); _cleanupTooltip = null; }

  _passResults = runPasses.map(() => []);
  _passContexts = runPasses.map((pass, passIndex) => ({
    ...baseRunContext,
    passIndex: passIndex + 1,
    totalPasses: runPasses.length,
    parallelOrSerial: pass.parallelOrSerial,
    sharedArrayBuffer: pass.sharedArrayBuffer,
    forceSerialRouting: pass.forceSerialRouting,
  }));

  try {
    const totalRoutes = effectiveRoutes.length;
    const totalTasks = totalRoutes * runPasses.length;
    let completedTasks = 0;

    for (let passIndex = 0; passIndex < runPasses.length; passIndex++) {
        if (_stopped) throw new Error('Benchmark stopped by user');
        const pass = runPasses[passIndex];
        _runContext = {
          ...baseRunContext,
          passIndex: passIndex + 1,
          totalPasses: runPasses.length,
          parallelOrSerial: pass.parallelOrSerial,
          sharedArrayBuffer: pass.sharedArrayBuffer,
          forceSerialRouting: pass.forceSerialRouting,
        };

        const baseCompletedTasks = completedTasks;

        const passPrefix = runPasses.length > 1
          ? `[${pass.parallelOrSerial} ${passIndex + 1}/${runPasses.length}] `
          : '';
        const handleProgress = (progress) => {
          if (_stopped) throw new Error('Benchmark stopped by user');

          const { routeName: progressRouteName, result, pauseMs, phase, current } = progress;
          const completedThisPass = Number.isFinite(current) ? current : 0;
          const displayCompleted = baseCompletedTasks + completedThisPass;
          const pct = totalTasks > 0 ? Math.round((displayCompleted / totalTasks) * 100) : 0;
          const statusSuffix = formatStatusSuffix(progress);
          const activeTasks = Math.max(0, totalTasks - displayCompleted);
          const pausedSuffix = _paused ? ' — paused' : '';

          progressBarEl.style.width = `${pct}%`;
          if (pauseStateEl) pauseStateEl.hidden = !_paused;
          progressTextEl.textContent = progress.done
            ? `${passPrefix}${displayCompleted}/${totalTasks} runs finished — ${progressRouteName ?? ''}${statusSuffix}`
            : phase === 'pausing'
              ? `${passPrefix}${displayCompleted}/${totalTasks} finished, ${activeTasks} active — ${progressRouteName ?? ''} complete. Pausing ${pauseMs}ms…${statusSuffix}${pausedSuffix}`
              : `${passPrefix}${displayCompleted}/${totalTasks} finished, ${activeTasks} active — ${progressRouteName ?? ''}${statusSuffix}${pausedSuffix}`;

          if (result) {
            const normalizedResult = normalizeBenchmarkRow(result);
            completedTasks = displayCompleted;
            _passResults[passIndex].push(normalizedResult);
            _results.push(normalizedResult);
            appendRow(normalizedResult);
            _pendingSummaryUpdate = true;
            _pendingChartRedraw = true;
            scheduleUIUpdate();
          }
        };

        await runBenchmark(
          {
            routes: effectiveRoutes,
            urlTemplate,
            mode,
            zoom,
            nRuns,
            routePauseMs,
            routeBatchConcurrency,
            engineWorkerMaxPoolSize,
            forceSerialRouting: pass.forceSerialRouting,
            clearCacheOnCategoryBoundary: false,
            clearCachesAfterEachRoute: false,
            pool: sharedPool,
            signal: _abortController.signal,
            pauseController: {
              isPaused: () => _paused,
              waitForResume: (signal) => waitForBenchmarkResume(signal),
            },
            onEngineStatus: (status) => {
              _engineWorkerStatus = status ?? { state: 'idle', engineId: null, running: false, lastError: null };
            },
            engineRunTimeoutMs: 20_000,
          },
          handleProgress
        );

        if (_stopped) break;

        if (routePauseMs > 0 && passIndex < runPasses.length - 1) {
          await waitForBenchmarkResume(_abortController.signal);
          handleProgress({
            current: completedTasks,
            total: totalTasks,
            routeName: '',
            pauseMs: routePauseMs,
            phase: 'pausing',
            done: false,
            results: _results,
          });
          await sleep(routePauseMs, _abortController.signal);
          await waitForBenchmarkResume(_abortController.signal);
        }
      }

    if (_passResults?.some((pass) => pass.length > 0)) {
      const combinedResults = runPasses.length === 1
        ? _passResults[0]
        : _results;
      _results = combinedResults;
      _reportVariants = createReportVariants();
      updateReportTypeControls();
      showResults(_results);
    }

    for (let passIndex = 0; passIndex < runPasses.length; passIndex++) {
      if (_passResults[passIndex].length > 0) {
        try {
          const saveResult = await saveBenchmarkArtifact(_passResults[passIndex], _passContexts[passIndex]);
          console.log('[benchmark] Results saved:', saveResult?.path ?? saveResult);
        } catch (saveErr) {
          console.error('[benchmark] Failed to auto-save JSON artifact:', saveErr);
        }
      }
    }

    clearBenchmarkCache();
    _passResults = null;
    _passContexts = null;
  } catch (err) {
    if (!_stopped && err?.name !== 'AbortError') console.error('Benchmark error:', err);
  } finally {
    runBtn.disabled = false;
    stopBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
    _paused = false;
    resumePausedBenchmark();
    _abortController = null;
    _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
  }
});

stopBtn.addEventListener('click', async () => {
  _stopped = true;
  if (stopBtn) stopBtn.disabled = true;
  resumePausedBenchmark();
  _abortController?.abort();

  if (_results.length > 0) {
    if (Array.isArray(_passResults) && Array.isArray(_passContexts)) {
      _reportVariants = createReportVariants();
      updateReportTypeControls();
    }

    showReport(_results, buildReportContext());
    const savedPaths = [];

    if (Array.isArray(_passResults) && Array.isArray(_passContexts)) {
      for (let passIndex = 0; passIndex < _passResults.length; passIndex++) {
        const passResults = _passResults[passIndex];
        const passContext = _passContexts[passIndex];
        if (passResults.length > 0) {
          try {
            const saveResult = await saveBenchmarkArtifact(passResults, passContext);
            if (saveResult?.path) savedPaths.push(saveResult.path);
            console.log('[benchmark] Stop requested; pass saved:', saveResult?.path ?? saveResult);
          } catch (err) {
            console.error('[benchmark] Failed to save JSON report on stop:', err);
            if (reportStatusEl) reportStatusEl.textContent = 'Report generated; JSON save failed';
          }
        }
      }
    }

    if (savedPaths.length > 0) {
      if (reportStatusEl) reportStatusEl.textContent = `Report saved: ${savedPaths.join(', ')}`;
    } else {
      try {
        const context = buildReportContext();
        const saveResult = await saveBenchmarkArtifact(_results, context);
        if (saveResult?.path) {
          if (reportStatusEl) reportStatusEl.textContent = `Report saved: ${saveResult.path}`;
        } else if (reportStatusEl) {
          reportStatusEl.textContent = 'Report ready';
        }
      } catch (err) {
        console.error('[benchmark] Failed to save JSON report on stop:', err);
        if (reportStatusEl) reportStatusEl.textContent = 'Report generated; JSON save failed';
      }
    }
  }
});

// ── Download ──────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (_results.length > 0) {
    const mode = modeSelectEl.value;
    const variant = getSelectedReportVariant();
    const resultsToDownload = Array.isArray(variant.results) && variant.results.length > 0
      ? variant.results
      : _results;
    downloadCSV(resultsToDownload, getReportFilename(variant, mode));
  }
});

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

if (reportBtn) {
  reportBtn.addEventListener('click', () => {
    updateReportTypeControls();
    showReportVariant(getSelectedReportVariant());
  });
}

if (reportViewSelectEl) {
  reportViewSelectEl.addEventListener('change', () => {
    _reportSelection = reportViewSelectEl.value;
    if (reportOutputEl?.value) {
      showReportVariant(getSelectedReportVariant());
    }
  });
}

if (copyReportBtn) {
  copyReportBtn.addEventListener('click', async () => {
    if (!reportOutputEl || !reportOutputEl.value) return;
    try {
      await navigator.clipboard.writeText(reportOutputEl.value);
      if (reportStatusEl) reportStatusEl.textContent = 'Report copied';
    } catch (err) {
      console.error('Failed to copy report:', err);
      if (reportStatusEl) reportStatusEl.textContent = 'Copy failed';
    }
  });
}

// ── Table sorting ─────────────────────────────────────────────────────────
resultsTableSortHeaders.forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (_sortCol === col) { _sortAsc = !_sortAsc; }
    else { _sortCol = col; _sortAsc = true; }
    resultsTableSortHeaders.forEach(t => t.classList.remove('sorted'));
    th.classList.add('sorted');
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (_sortAsc ? ' ▲' : ' ▼');
    renderTable(_results);
  });
});

// ── Rendering helpers ─────────────────────────────────────────────────────

function fmtMs(v) {
  if (v == null) return '<span style="color:var(--muted)">—</span>';
  const n = Number(v);
  if (!Number.isFinite(n)) return '<span style="color:var(--muted)">—</span>';
  return n.toExponential(3);
}

function fmtNum(v) {
  if (v == null) return '<span style="color:var(--muted)">—</span>';
  return Number(v).toLocaleString();
}

function engineShortName(engineId) {
  return engineId === 'bidirectional-astar' ? 'A★'
    : engineId === 'adaptive-barrier' ? 'Barrier'
    : engineId === 'delta-stepping' ? 'Delta'
    : engineId === 'ultra-dijkstra' ? 'Dijkstra'
    : engineId;
}

function engineBadgeClass(engineId) {
  return engineId === 'bidirectional-astar' ? 'badge-astar'
    : engineId === 'adaptive-barrier' ? 'badge-barrier'
    : engineId === 'delta-stepping' ? 'badge-delta'
    : engineId === 'ultra-dijkstra' ? 'badge-dijkstra'
    : 'badge-cpu';
}

function winnerBadge(r) {
  if (r.error) return `<span class="badge badge-error" title="${r.error}">error</span>`;
  if (!r.winner) return `<span class="badge badge-na">—</span>`;

  const className = engineBadgeClass(r.winner);
  const title = Number(r.winner_tied) === 1 && Array.isArray(r.winner_candidates) && r.winner_candidates.length > 1
    ? ` title="Within timing tolerance: ${r.winner_candidates.map(engineShortName).join(', ')}"`
    : '';
  const label = Number(r.winner_tied) === 1
    ? `${engineShortName(r.winner)} ≈`
    : engineShortName(r.winner);
  return `<span class="badge ${className}"${title}>${label}</span>`;
}

function autoPickBadge(r) {
  if (!r.auto_engine) return `<span class="badge badge-na">—</span>`;
  return `<span class="badge ${engineBadgeClass(r.auto_engine)}">${engineShortName(r.auto_engine)}</span>`;
}

function formatEngineErrors(r) {
  const engines = [
    { id: 'bidirectional-astar', label: 'A★', errorKey: 'bidirectional_astar_error', warmKey: 'bidirectional_astar_warm_error', timedKey: 'bidirectional_astar_timed_error', resultSourceKey: 'bidirectional_astar_result_source' },
    { id: 'adaptive-barrier', label: 'Barrier', errorKey: 'adaptive_barrier_error', warmKey: 'adaptive_barrier_warm_error', timedKey: 'adaptive_barrier_timed_error', resultSourceKey: 'adaptive_barrier_result_source' },
    { id: 'delta-stepping', label: 'Delta', errorKey: 'delta_stepping_error', warmKey: 'delta_stepping_warm_error', timedKey: 'delta_stepping_timed_error', resultSourceKey: 'delta_stepping_result_source' },
    { id: 'ultra-dijkstra', label: 'Dijkstra', errorKey: 'ultra_dijkstra_error', warmKey: 'ultra_dijkstra_warm_error', timedKey: 'ultra_dijkstra_timed_error', resultSourceKey: 'ultra_dijkstra_result_source' },
  ];

  const routeUnrecoverable = Boolean(r.error || r.routeError);

  const failures = engines.flatMap((engine) => {
    const entries = [];
    const recoveredWarmError = r[engine.warmKey] && r[engine.resultSourceKey] === 'timed';
    const hasHardError = Boolean(r[engine.errorKey]);
    const hasTimedError = Boolean(r[engine.timedKey]);
    const hasWarmError = Boolean(r[engine.warmKey] && !recoveredWarmError);
    const errorClass = routeUnrecoverable ? 'danger' : 'warning';

    if (hasHardError) entries.push(`<span class="error-chip ${errorClass}">${engine.label}</span>`);
    if (hasTimedError) entries.push(`<span class="error-chip ${errorClass}">${engine.label} (timed)</span>`);
    if (hasWarmError) entries.push(`<span class="error-chip ${errorClass}">${engine.label} (warm)</span>`);
    return entries;
  });

  if (failures.length === 0) {
    return '<span style="color:var(--muted)">—</span>';
  }

  return failures.join('');
}

function appendRow(r) {
  const normalizedRow = normalizeBenchmarkRow(r);
  resultsSectionEl.hidden = false;
  const tr = document.createElement('tr');
  tr.innerHTML = buildRowHTML(normalizedRow);
  resultsTbodyEl.appendChild(tr);
}

function buildRowHTML(r) {
  const barrierParallelFlag = r.adaptive_barrier_parallel ? '✓' : '—';
  const deltaParallelFlag = r.delta_stepping_parallel ? '✓' : '—';
  const autoEqualsWinner = r.auto_engine && r.winner && r.auto_engine === r.winner;
  const autoVsWinner = r.auto_vs_winner_pct == null
    ? '<span style="color:var(--muted)">—</span>'
    : (() => {
        const delta = Number(r.auto_vs_winner_pct);
        const sign = delta > 0 ? '+' : '';
        const color = delta <= 0
          ? 'var(--green)'
          : delta > 30
            ? 'var(--red)'
            : 'orange';
        return `<span style="color:${color};font-weight:600">${sign}${delta.toFixed(1)}%</span>`;
      })();
  const autoMatchesWinner = r.auto_matches_winner == null
    ? '<span style="color:var(--muted)">—</span>'
    : (Number(r.auto_matches_winner) === 1
      ? (Number(r.winner_tied) === 1 && !autoEqualsWinner ? '≈' : '✓')
      : '✗');
  return `
    <td>${r.name}</td>
    <td>${r.category}</td>
    <td>${r.lengthCategory}</td>
    <td class="num">${r.beelineM != null ? r.beelineM.toLocaleString() + ' m' : '—'}</td>
    <td class="num">${fmtNum(r.E)}</td>
    <td class="num">${fmtNum(r.N)}</td>
    <td class="num">${r.radius ?? '—'}</td>
    <td class="num">${r.nRuns ?? '—'}</td>
    <td class="num">${fmtMs(r.bidirectional_astar_ms)}</td>
    <td class="num">${fmtMs(r.adaptive_barrier_ms)}</td>
    <td class="num">${barrierParallelFlag}</td>
    <td class="num">${fmtMs(r.delta_stepping_ms)}</td>
    <td class="num">${deltaParallelFlag}</td>
    <td class="num">${fmtMs(r.ultra_dijkstra_ms)}</td>
    <td class="num">${fmtMs(r.auto_engine_ms)}</td>
    <td>${autoPickBadge(r)}</td>
    <td>${winnerBadge(r)}</td>
    <td class="num">${autoMatchesWinner}</td>
    <td class="num">${autoVsWinner}</td>
    <td>${formatEngineErrors(r)}</td>
  `;
}

function summarizeAutoSelector(results) {
  const done = results.filter(r => !r.error && r.winner);
  const exactHits = done.filter(r => Number(r.auto_matches_winner) === 1 && r.auto_engine === r.winner).length;
  const nearTieHits = done.filter(r => Number(r.auto_matches_winner) === 1 && r.auto_engine !== r.winner).length;
  const misses = done.filter(r => Number(r.auto_matches_winner) === 0).length;
  const coverage = done.length;
  const exactPct = coverage > 0 ? (exactHits / coverage) * 100 : 0;
  const nearPct = coverage > 0 ? (nearTieHits / coverage) * 100 : 0;
  const missPct = coverage > 0 ? (misses / coverage) * 100 : 0;
  return { coverage, exactHits, nearTieHits, misses, exactPct, nearPct, missPct };
}

function renderAutoSelectorSummary(results) {
  const summary = summarizeAutoSelector(results);
  const wrap = autoSelectorSummaryEl;
  const cards = autoSelectorCardsEl;
  if (summary.coverage === 0) {
    wrap.hidden = true;
    cards.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  cards.innerHTML = `
    <article class="mini-summary-card exact">
      <strong>${summary.exactHits}</strong>
      <span>Exact hits</span>
      <p>${summary.exactPct.toFixed(1)}% of routes where auto picked the unique fastest engine.</p>
    </article>
    <article class="mini-summary-card near">
      <strong>${summary.nearTieHits}</strong>
      <span>Near-tie hits</span>
      <p>${summary.nearPct.toFixed(1)}% of routes where auto landed inside the timing tolerance band.</p>
    </article>
    <article class="mini-summary-card miss">
      <strong>${summary.misses}</strong>
      <span>Real misses</span>
      <p>${summary.missPct.toFixed(1)}% of routes where auto was outside the winner tolerance band.</p>
    </article>
  `;
}

function buildRunContextLabel(context) {
  if (!context || !context.parallelOrSerial) return '';

  const passSegment = Number.isFinite(context.passIndex) && Number.isFinite(context.totalPasses) && context.totalPasses > 1
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
    nRuns: Number.isFinite(runsInputEl?.valueAsNumber) ? runsInputEl.valueAsNumber : Number.parseInt(runsInputEl?.value ?? '0', 10) || 0,
    routePauseMs,
    routesSelected: getSelectedRoutes().length,
    selectedCategories: getCheckedValues(categoryFiltersEl),
    selectedLengths: getCheckedValues(lengthFiltersEl),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? 'unknown',
    crossOriginIsolated: window.crossOriginIsolated ?? false,
    sharedArrayBuffer: Boolean(_runContext?.sharedArrayBuffer),
    parallelOrSerial: _runContext?.parallelOrSerial ?? 'serial',
  };
}

function showReport(results, context) {
  if (!Array.isArray(results) || results.length === 0) {
    if (reportStatusEl) reportStatusEl.textContent = 'No results to report';
    if (reportNoteEl) reportNoteEl.textContent = 'Run some benchmark routes before generating a report.';
    if (reportPanelEl) reportPanelEl.hidden = false;
    if (reportOutputEl) reportOutputEl.value = '';
    if (copyReportBtn) copyReportBtn.disabled = true;
    return null;
  }

  const report = buildReportWithContextHeader(generateCopilotReport(results, context), context);
  if (reportPanelEl) reportPanelEl.hidden = false;
  if (reportOutputEl) reportOutputEl.value = report;
  if (reportStatusEl) reportStatusEl.textContent = 'Report ready';
  if (reportNoteEl) reportNoteEl.textContent = 'Use the generated report with other benchmark artifacts.';
  if (copyReportBtn) copyReportBtn.disabled = false;
  return report;
}

function showReportVariant(variant) {
  updateReportTypeControls();
  const results = Array.isArray(variant.results) ? variant.results : [];
  const context = variant.context || buildReportContext();
  if (!results.length) {
    if (reportStatusEl) reportStatusEl.textContent = `${variant.label} report not available`;
    if (reportNoteEl) reportNoteEl.textContent = 'Run a benchmark to generate this report.';
    if (reportPanelEl) reportPanelEl.hidden = false;
    if (reportOutputEl) reportOutputEl.value = '';
    if (copyReportBtn) copyReportBtn.disabled = true;
    return null;
  }

  const report = buildReportWithContextHeader(generateCopilotReport(results, context), context);
  if (reportPanelEl) reportPanelEl.hidden = false;
  if (reportOutputEl) reportOutputEl.value = report;
  if (reportStatusEl) reportStatusEl.textContent = `${variant.label} report ready`;
  if (reportNoteEl) reportNoteEl.textContent = `Use the ${variant.label.toLowerCase()} benchmark report with other benchmark artifacts.`;
  if (copyReportBtn) copyReportBtn.disabled = false;
  return report;
}

function updateRunContextLabels(context) {
  const label = buildRunContextLabel(context);

  if (!label) {
    resultsRunContextEl.hidden = true;
    resultsRunContextEl.innerHTML = '';
    return;
  }

  const formatted = `<strong>${label}</strong>`;
  resultsRunContextEl.hidden = false;
  resultsRunContextEl.innerHTML = formatted;
}

function renderTable(results) {
  const sorted = [...results].sort((a, b) => {
    const va = a[_sortCol] ?? -Infinity;
    const vb = b[_sortCol] ?? -Infinity;
    if (typeof va === 'string') return _sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    return _sortAsc ? va - vb : vb - va;
  });
  resultsTbodyEl.innerHTML = sorted.map(r => `<tr>${buildRowHTML(r)}</tr>`).join('');
}

function updateSummary(results) {
  const routeErrorCount = results.filter((r) => r.error || r.routeError).length;
  const completed = results.filter((r) => !r.error && !r.routeError);
  const unrecoveredEngineErrorRouteCount = results.filter((r) => (
    !(r.error || r.routeError) && r.any_engine_error
  )).length;
  const tieCount = completed.filter(r => Number(r.winner_tied) === 1).length;
  
  const engineWins = {
    'bidirectional-astar': 0,
    'adaptive-barrier': 0,
    'delta-stepping': 0,
    'ultra-dijkstra': 0,
  };
  completed.forEach(r => {
    if (r.winner && Object.prototype.hasOwnProperty.call(engineWins, r.winner)) {
      engineWins[r.winner]++;
    }
  });

  const engineNames = {
    'bidirectional-astar': 'A★',
    'adaptive-barrier': 'Barrier',
    'delta-stepping': 'Delta',
    'ultra-dijkstra': 'Dijkstra',
  };

  const cards = [];
  cards.push(`<div class="card"><div class="card-val">${results.length}</div><div class="card-lbl">Routes run</div></div>`);
  Object.entries(engineWins).forEach(([engine, count]) => {
    const className = engine === 'bidirectional-astar' ? 'engine-astar'
      : engine === 'adaptive-barrier' ? 'engine-barrier'
      : engine === 'delta-stepping' ? 'engine-delta'
      : engine === 'ultra-dijkstra' ? 'engine-dijkstra'
      : '';
    cards.push(`
      <div class="card ${className}">
        <div class="card-val">${count}</div>
        <div class="card-lbl">${engineNames[engine]} wins</div>
      </div>
    `);
  });
  if (tieCount > 0) {
    cards.push(`<div class="card gray"><div class="card-val">${tieCount}</div><div class="card-lbl">Near-ties</div></div>`);
  }
  if (routeErrorCount > 0) {
    cards.push(`<div class="card red"><div class="card-val">${routeErrorCount}</div><div class="card-lbl">Route errors</div></div>`);
  }
  if (unrecoveredEngineErrorRouteCount > 0) {
    cards.push(`<div class="card coral"><div class="card-val">${unrecoveredEngineErrorRouteCount}</div><div class="card-lbl">Routes with unrecovered engine errors</div></div>`);
  }

  summaryCardsEl.innerHTML = cards.join('');
  renderAutoSelectorSummary(results);
}

function redrawCharts(results) {
  _chartScatter = drawScatter(scatterEl, results, {}, _chartScatter);
  _chartDensity = drawDensityScatter(densityEl, results, {}, _chartDensity);
  _chartHistogram = drawFeatureHistogram(histogramEl, results, {}, _chartHistogram);
  _chartBubble = drawTimingBubble(bubbleEl, results, {}, _chartBubble);
  if (_cleanupTooltip) { _cleanupTooltip(); }
  _cleanupTooltip = installTooltip(null, results, null);
}

function showResults(results) {
  resultsSectionEl.hidden = false;
  updateRunContextLabels(_runContext ?? {});
  updateSummary(results);
  renderTable(results);
  redrawCharts(results);
  renderSummaryTable(results);
  renderCostSummaryTable(results);
  
  // Hide threshold suggestion (no longer relevant for multi-engine comparison)
  suggestionWrapEl.hidden = true;
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
    (row) => Number(row.auto_matches_winner) === 1 && row.auto_engine === row.winner,
  ).length;
  const nearTieHits = covered.filter(
    (row) => Number(row.auto_matches_winner) === 1 && row.auto_engine !== row.winner,
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
    const engineIds = ['bidirectional-astar', 'adaptive-barrier', 'delta-stepping', 'ultra-dijkstra'];

    return engineIds.map((engineId) => {
      const key = engineId === 'bidirectional-astar'
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
        engineError: engineId === 'bidirectional-astar'
          ? row?.bidirectional_astar_error ?? row?.bidirectional_astar_timed_error ?? null
          : engineId === 'adaptive-barrier'
            ? row?.adaptive_barrier_error ?? row?.adaptive_barrier_timed_error ?? null
            : engineId === 'delta-stepping'
              ? row?.delta_stepping_error ?? row?.delta_stepping_timed_error ?? null
              : row?.ultra_dijkstra_error ?? row?.ultra_dijkstra_timed_error ?? null,
        engineWarmError: engineId === 'bidirectional-astar'
          ? row?.bidirectional_astar_warm_error ?? null
          : engineId === 'adaptive-barrier'
            ? row?.adaptive_barrier_warm_error ?? null
            : engineId === 'delta-stepping'
              ? row?.delta_stepping_warm_error ?? null
              : row?.ultra_dijkstra_warm_error ?? null,
        engineTimedError: engineId === 'bidirectional-astar'
          ? row?.bidirectional_astar_timed_error ?? null
          : engineId === 'adaptive-barrier'
            ? row?.adaptive_barrier_timed_error ?? null
            : engineId === 'delta-stepping'
              ? row?.delta_stepping_timed_error ?? null
              : row?.ultra_dijkstra_timed_error ?? null,
        engineResultSource: engineId === 'bidirectional-astar'
          ? row?.bidirectional_astar_result_source ?? null
          : engineId === 'adaptive-barrier'
            ? row?.adaptive_barrier_result_source ?? null
            : engineId === 'delta-stepping'
              ? row?.delta_stepping_result_source ?? null
              : row?.ultra_dijkstra_result_source ?? null,
        engineStatus: engineId === 'bidirectional-astar'
          ? row?.bidirectional_astar_status ?? null
          : engineId === 'adaptive-barrier'
            ? row?.adaptive_barrier_status ?? null
            : engineId === 'delta-stepping'
              ? row?.delta_stepping_status ?? null
              : row?.ultra_dijkstra_status ?? null,
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
    ]),
  );
  const engineCosts = Object.fromEntries(
    Object.entries(ENGINE_COST_KEYS).map(([engineId, key]) => [
      engineId,
      Number.isFinite(row[key]) ? row[key] : null,
    ]),
  );
  const engineErrors = Object.fromEntries(
    Object.entries(ENGINE_ERROR_KEYS).map(([engineId, key]) => [
      engineId,
      row[key] ?? row[ENGINE_TIMED_ERROR_KEYS[engineId]] ?? null,
    ]),
  );

  const engineWarmErrors = Object.fromEntries(
    Object.entries(ENGINE_WARM_ERROR_KEYS).map(([engineId, key]) => [
      engineId,
      row[key] ?? null,
    ]),
  );

  const nEnginesWarmErrors = Object.values(engineWarmErrors).filter(Boolean).length;
  const nEnginesTimedErrors = Object.values(ENGINE_TIMED_ERROR_KEYS).filter((key) => Boolean(row[key])).length;
  const anyEngineWarmError = Object.values(engineWarmErrors).some(Boolean);
  const anyEngineTimedError = Object.values(ENGINE_TIMED_ERROR_KEYS).some((key) => Boolean(row[key]));

  const timeEntries = Object.entries(engineTimes)
    .filter(([, ms]) => Number.isFinite(ms))
    .sort(([, a], [, b]) => a - b);

  const fastestMs = timeEntries[0]?.[1] ?? null;
  const secondBestMs = timeEntries[1]?.[1] ?? null;
  const runnerUpEngine = timeEntries[1]?.[0] ?? null;
  const worstTimeMs = timeEntries.length > 0 ? timeEntries[timeEntries.length - 1][1] : null;
  const tolerance = Number.isFinite(fastestMs) ? Math.max(0.1, fastestMs * 0.05) : null;
  const winnerCandidates = tolerance == null
    ? []
    : timeEntries.filter(([, ms]) => ms <= fastestMs + tolerance).map(([engineId]) => engineId);

  const winnerMarginMs = secondBestMs != null && fastestMs != null
    ? Math.max(0, secondBestMs - fastestMs)
    : null;
  const winnerMarginPct = winnerMarginMs != null && fastestMs > 0
    ? round4(winnerMarginMs / fastestMs)
    : null;
  const bestToWorstMs = fastestMs != null && worstTimeMs != null
    ? Math.max(0, worstTimeMs - fastestMs)
    : null;
  const bestToWorstPct = bestToWorstMs != null && fastestMs > 0
    ? round4(bestToWorstMs / fastestMs)
    : null;
  const enginesWithin5Pct = fastestMs != null
    ? timeEntries.filter(([, ms]) => ms <= fastestMs * 1.05).length
    : null;
  const enginesWithin10Pct = fastestMs != null
    ? timeEntries.filter(([, ms]) => ms <= fastestMs * 1.10).length
    : null;

  const enginesFound = row.engines_found && typeof row.engines_found === 'object'
    ? Object.fromEntries(Object.keys(ENGINE_TIME_KEYS).map((engineId) => [engineId, Boolean(row.engines_found[engineId])]))
    : Object.fromEntries(Object.entries(engineTimes).map(([engineId, ms]) => [engineId, Number.isFinite(ms)]));

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
    Object.values(ENGINE_TIMED_ERROR_KEYS).some((key) => Boolean(row[key])),
  );

  const costWinner = row.costWinner ?? Object.entries(engineCosts)
    .filter(([, cost]) => Number.isFinite(cost))
    .sort(([, a], [, b]) => a - b)[0]?.[0] ?? null;
  const costWinnerMs = costWinner ? engineTimes[costWinner] : null;
  const winnerVsCostPct = costWinnerMs != null && fastestMs != null && costWinnerMs > 0
    ? round4(((fastestMs - costWinnerMs) / costWinnerMs) * 100)
    : null;
  const winnerVsCostMs = costWinnerMs != null && fastestMs != null
    ? round4(fastestMs - costWinnerMs)
    : null;

  const winner = row.winner ?? winnerCandidates[0] ?? null;
  const autoMatchesWinner = row.auto_matches_winner != null
    ? row.auto_matches_winner
    : (row.auto_engine && winner ? Number(row.auto_engine === winner) : null);

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
    beelineM: normalizedRow.beelineM ?? (Number.isFinite(normalizedRow.safeBeelineKm)
      ? Math.round(normalizedRow.safeBeelineKm * 1000)
      : null),
    N: normalizedRow.N ?? normalizedRow.safeN ?? null,
    E: normalizedRow.E ?? normalizedRow.safeE ?? null,
    edgesPerKmBeeline: normalizedRow.edgesPerKmBeeline ?? normalizedRow.edgesPerKm ?? null,
    nodesPerKmBeeline: normalizedRow.nodesPerKmBeeline ?? normalizedRow.nodesPerKm ?? null,
  };

  return {
    ...normalizedRow,
    ...Object.fromEntries(Object.entries(fill).map(([key, value]) => [key, normalizedRow[key] ?? value])),
  };
}

function buildBenchmarkJsonPayload(results, context) {
  const normalizedResults = Array.isArray(results)
    ? results.map(normalizeBenchmarkRow)
    : [];
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
      sharedArrayBufferSupported: !!(context?.sharedArrayBufferSupported ?? context?.sharedArrayBuffer),
      sharedArrayBufferEnabled: !!context?.sharedArrayBuffer,
      parallelOrSerial: context?.parallelOrSerial ?? (context?.sharedArrayBuffer ? 'parallel' : 'serial'),
    },
    overview: {
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

async function saveBenchmarkArtifact(results, context) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const mode = (context?.mode || 'unknown').toLowerCase();
  const parallelOrSerial = context?.parallelOrSerial ?? (context?.sharedArrayBuffer ? 'parallel' : 'serial');
  const timestamp = typeof context?.benchmarkTimestamp === 'string' && context.benchmarkTimestamp
    ? context.benchmarkTimestamp
    : makeBenchmarkTimestamp(new Date());
  const filename = `${timestamp}_benchmark_${mode}_${parallelOrSerial}.json`;
  const payload = buildBenchmarkJsonPayload(results, context);

  const response = await fetch('/__benchmark/save-results', {
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

function renderCostSummaryTable(results) {
  const { groupKeys, rows, formatValue } = generateCostSummary(results);
  const winCountsByLabel = Object.fromEntries(rows.map(row => [row.engine, 0]));
  results.forEach(r => {
    const winnerLabel = r.costWinner === 'bidirectional-astar' ? 'A★ (Bidirectional)'
      : r.costWinner === 'adaptive-barrier' ? 'Barrier (Adaptive SSP)'
      : r.costWinner === 'delta-stepping' ? 'Delta-Stepping'
      : r.costWinner === 'ultra_dijkstra' ? 'Dijkstra (Ultra)'
      : r.costWinner === 'ultra-dijkstra' ? 'Dijkstra (Ultra)'
      : null;
    if (winnerLabel && Object.hasOwn(winCountsByLabel, winnerLabel)) {
      winCountsByLabel[winnerLabel]++;
    }
  });

  const thead = costSummaryTheadEl;
  thead.innerHTML = '';
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th style="text-align: left; padding: 8px 10px;">Engine</th>';
  const winsHeader = document.createElement('th');
  winsHeader.className = 'num';
  winsHeader.style.padding = '8px 10px';
  winsHeader.textContent = 'Wins';
  headerRow.appendChild(winsHeader);
  groupKeys.forEach(gk => {
    const th = document.createElement('th');
    th.className = 'num';
    th.style.padding = '8px 10px';
    th.style.whiteSpace = 'normal';
    th.textContent = gk;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = costSummaryTbodyEl;
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="padding: 8px 10px; font-weight: 500;">${row.engine}</td>`;
    const winsTd = document.createElement('td');
    winsTd.className = 'num';
    winsTd.style.padding = '8px 10px';
    winsTd.style.fontWeight = '600';
    winsTd.textContent = String(winCountsByLabel[row.engine] ?? 0);
    tr.appendChild(winsTd);
    groupKeys.forEach(gk => {
      const td = document.createElement('td');
      td.className = 'num';
      td.style.padding = '8px 10px';
      const val = row[gk];
      if (val === null) {
        td.textContent = '—';
        td.style.color = 'var(--muted)';
      } else {
        td.textContent = formatValue(val);
        if (val >= 100) {
          td.style.color = 'var(--green)';
          td.style.fontWeight = '600';
        } else if (val < 70) {
          td.style.color = 'var(--red)';
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderSummaryTable(results) {
  const { groupKeys, rows } = generatePerformanceSummary(results);
  const winCountsByLabel = Object.fromEntries(rows.map(row => [row.engine, 0]));
  results.forEach(r => {
    const winnerLabel = r.winner === 'bidirectional-astar' ? 'A★ (Bidirectional)'
      : r.winner === 'adaptive-barrier' ? 'Barrier (Adaptive SSP)'
      : r.winner === 'delta-stepping' ? 'Delta-Stepping'
      : r.winner === 'ultra-dijkstra' ? 'Dijkstra (Ultra)'
      : null;
    if (winnerLabel && Object.hasOwn(winCountsByLabel, winnerLabel)) {
      winCountsByLabel[winnerLabel]++;
    }
  });
  
  // Build header
  const thead = summaryTheadEl;
  thead.innerHTML = '';
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th style="text-align: left; padding: 8px 10px;">Engine</th>';
  const winsHeader = document.createElement('th');
  winsHeader.className = 'num';
  winsHeader.style.padding = '8px 10px';
  winsHeader.textContent = 'Wins';
  headerRow.appendChild(winsHeader);
  groupKeys.forEach(gk => {
    const th = document.createElement('th');
    th.className = 'num';
    th.style.padding = '8px 10px';
    th.style.whiteSpace = 'normal';
    th.textContent = gk;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  
  // Build body
  const tbody = summaryTbodyEl;
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="padding: 8px 10px; font-weight: 500;">${row.engine}</td>`;
    const winsTd = document.createElement('td');
    winsTd.className = 'num';
    winsTd.style.padding = '8px 10px';
    winsTd.style.fontWeight = '600';
    winsTd.textContent = String(winCountsByLabel[row.engine] ?? 0);
    tr.appendChild(winsTd);
    groupKeys.forEach(gk => {
      const td = document.createElement('td');
      td.className = 'num';
      td.style.padding = '8px 10px';
      const val = row[gk];
      if (val === null) {
        td.textContent = '—';
        td.style.color = 'var(--muted)';
      } else {
        td.textContent = `${val}%`;
        // Color code: 100 = green, <70 = red
        if (val >= 100) {
          td.style.color = 'var(--green)';
          td.style.fontWeight = '600';
        } else if (val < 70) {
          td.style.color = 'var(--red)';
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}
