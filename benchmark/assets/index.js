import {
  ROUTES,
  CATEGORIES,
  LENGTH_CATEGORIES,
  CATEGORY_LABELS,
  LENGTH_CATEGORY_LABELS,
} from './routes.js';
import {
  runBenchmark,
  clearBenchmarkCache,
  disposeBenchmarkResources,
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
import {
  prepareForRun,
  saveResultToDB,
  getRecordsForRun,
  waitForPendingWrites,
  disposeBenchDb,
} from './bench-db.js';

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
const benchmarkStopwatchEl = root.getElementById('benchmark-stopwatch');
const scatterEl = root.getElementById('scatter');
const densityEl = root.getElementById('density');
const histogramEl = root.getElementById('histogram');
const bubbleEl = root.getElementById('bubble');
const urlInputEl = root.getElementById('url-input');
const paginationControlsEl = root.getElementById('pagination-controls');
const paginationInfoEl = root.getElementById('pagination-info');
const paginationPrevBtn = root.getElementById('pagination-prev');
const paginationNextBtn = root.getElementById('pagination-next');
const resultsTableEl = root.getElementById('results-table');
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
  .then((r) => r.json())
  .then((meta) => {
    if (urlInputEl && !urlInputEl.value) urlInputEl.value = meta.tiles[0];
  })
  .catch((err) => console.error('[benchmark] Failed to fetch tile URL:', err));

// ── Populate filter checkboxes from routes.js ────────────────────────────
(function buildFilters() {
  const catFragment = document.createDocumentFragment();
  CATEGORIES.forEach((val) => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" value="${val}" checked> ${CATEGORY_LABELS[val] ?? val}`;
    catFragment.appendChild(lbl);
  });
  categoryFiltersEl.appendChild(catFragment);

  const lenFragment = document.createDocumentFragment();
  LENGTH_CATEGORIES.forEach((val) => {
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
  return ROUTES.filter((r) => cats.includes(r.category) && lengths.includes(r.lengthCategory));
}

function updateRouteCount() {
  const n = getSelectedRoutes().length;
  const successThreshold = Math.max(0, parseInt(successRoutesInput.value, 10) || 0);
  const thresholdText =
    successThreshold > 0 ? `, ${successThreshold.toLocaleString()} selected` : '';
  routeCountEl.textContent = `${n.toLocaleString()} routes available${thresholdText}`;
}

function getReportVariantLabel(key) {
  return key === 'sab_on' ? 'SAB On' : key === 'sab_off' ? 'SAB Off' : 'Combined';
}

function buildReportVariants() {
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

  if (Array.isArray(_passContexts)) {
    _passContexts.forEach((context, index) => {
      if (!context) return;
      const key = context.sharedArrayBuffer ? 'sab_on' : 'sab_off';
      variants.push({
        key,
        label: getReportVariantLabel(key),
        results: results.filter((r) => r._passIndex === index),
        context: {
          ...context,
          parallelOrSerial: key,
        },
      });
    });
  }

  _reportVariants = variants;
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
  const selection = reportViewSelectEl?.value || _reportSelection || 'combined';
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
updateRouteCount();

// ── State ─────────────────────────────────────────────────────────────────
const RESULTS_PAGE_SIZE = 250;
let _currentResultCount = 0;
let _pendingResultBuffer = [];
let _currentRenderResults = [];
let _sortCol = '_insertedAt';
let _sortAsc = false;
let _currentPage = 1;
let _stopped = false;
let _paused = false;
let _pauseResolvers = [];
let benchmarkStartTime = null;
let _stopwatchRaf = null;
let _cleanupTooltip = null;
let _routeCompletionTimes = [];
let _chartScatter = null;
let _chartDensity = null;
let _chartHistogram = null;
let _chartBubble = null;
let _runContext = null;
let _passContexts = null;
let _reportVariants = [];
let _reportSelection = 'combined';
let _currentRunId = null;
let _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
let _abortController = null;
let _updateScheduled = false;
let _pendingChartRedraw = false;
let _pendingSummaryUpdate = false;

function resetBenchmarkRunState() {
  _runContext = null;
  _passContexts = null;
  _routeCompletionTimes = [];
  _currentResultCount = 0;
  _pendingResultBuffer = [];
  _currentRenderResults = [];
  _pendingSummaryUpdate = false;
  _pendingChartRedraw = false;
  _updateScheduled = false;
}

function createUIResultRow(result) {
  if (!result || typeof result !== 'object') return result;
  const row = { ...result };
  delete row.rawDiagnostics;
  delete row.samplesMs;
  delete row.sampleStats;
  delete row.timingRounds;
  return row;
}

async function loadRunResultsFromDB(runId) {
  if (!runId) return [];
  try {
    const rows = await getRecordsForRun(runId);
    return rows.map((row) => {
      const result = row.result && typeof row.result === 'object' ? row.result : {};
      return {
        ...result,
        runId: row.runId,
        passIndex: row.passIndex,
        routeIndex: row.routeIndex,
        _passIndex: result._passIndex ?? row.passIndex,
        _insertedAt: result._insertedAt ?? row.ts,
      };
    });
  } catch (err) {
    console.error('[benchmark] Failed to load benchmark results from IndexedDB:', err);
    return [];
  }
}

async function getCurrentRenderResults() {
  if (!_currentRunId) {
    return [];
  }

  if (_currentRenderResults.length > 0) {
    return _currentRenderResults.slice();
  }

  const results = await loadRunResultsFromDB(_currentRunId);
  _currentRenderResults = results.slice();
  return _currentRenderResults.slice();
}

async function getReportResults() {
  return _currentRenderResults.length > 0
    ? _currentRenderResults.slice()
    : await getCurrentRenderResults();
}

function scheduleUIUpdate() {
  if (_updateScheduled) return;
  _updateScheduled = true;
  requestAnimationFrame(async () => {
    _updateScheduled = false;
    if (_pendingSummaryUpdate || _pendingChartRedraw) {
      const results = await getCurrentRenderResults();
      if (_pendingSummaryUpdate) {
        updateSummary(results);
        _pendingSummaryUpdate = false;
      }
      if (_pendingChartRedraw) {
        redrawCharts(results);
        _pendingChartRedraw = false;
      }
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

function engineLabel(engineId) {
  switch (engineId) {
    case 'bidirectional-astar':
      return 'A*';
    case 'adaptive-barrier':
      return 'Barrier';
    case 'delta-stepping':
      return 'Delta';
    case 'ultra-dijkstra':
      return 'Dijkstra';
    default:
      return engineId || 'engine';
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
  const selectedCategories = getCheckedValues(categoryFiltersEl);
  const selectedLengths = getCheckedValues(lengthFiltersEl);

  if (routes.length === 0) {
    alert('No routes selected. Check the category/length filters.');
    return;
  }

  _stopped = false;
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
  const sharedPool = getSharedPool();
  const runPasses = sharedArrayBufferSupported
    ? [
        { parallelOrSerial: 'parallel', sharedArrayBuffer: true, forceSerialRouting: false },
        { parallelOrSerial: 'serial', sharedArrayBuffer: false, forceSerialRouting: true },
      ]
    : [{ parallelOrSerial: 'serial', sharedArrayBuffer: false, forceSerialRouting: false }];
  _abortController = new AbortController();
  _paused = false;
  _pauseResolvers = [];
  _pendingSummaryUpdate = false;
  _pendingChartRedraw = false;
  _updateScheduled = false;
  _currentResultCount = 0;
  _routeCompletionTimes = [];
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
  if (reportNoteEl)
    reportNoteEl.textContent = 'Generate a benchmark report for the current results.';
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
  if (_chartScatter) {
    _chartScatter.destroy();
    _chartScatter = null;
  }
  if (_chartDensity) {
    _chartDensity.destroy();
    _chartDensity = null;
  }
  if (_chartHistogram) {
    _chartHistogram.destroy();
    _chartHistogram = null;
  }
  if (_chartBubble) {
    _chartBubble.destroy();
    _chartBubble = null;
  }
  if (_cleanupTooltip) {
    _cleanupTooltip();
    _cleanupTooltip = null;
  }

  _passContexts = runPasses.map((pass, passIndex) => ({
    ...baseRunContext,
    passIndex: passIndex + 1,
    totalPasses: runPasses.length,
    parallelOrSerial: pass.parallelOrSerial,
    sharedArrayBuffer: pass.sharedArrayBuffer,
    forceSerialRouting: pass.forceSerialRouting,
  }));

  const runId = `${benchmarkTimestamp}-${Math.random().toString(36).slice(2, 10)}`;
  _currentRunId = runId;
  await prepareForRun(runId, { clearAll: false });

  try {
    const totalRoutes = routes.length;
    const totalTasks = totalRoutes * runPasses.length;
    let completedTasks = 0;
    let startedTasks = 0;
    let successfulRouteCount = 0;
    let finishedEarly = false;
    const successThreshold = maxSuccessRoutes > 0 ? maxSuccessRoutes : Infinity;

    // Benchmark nesting order:
    //   1) route
    //   2) shared-array-buffer / pass status (parallel vs serial)
    //   3) engine selection for that pass
    //   4) repeated run iterations per engine
    outerRouteLoop: for (let routeIndex = 0; routeIndex < totalRoutes; routeIndex++) {
      if (_stopped) throw new Error('Benchmark stopped by user');
      const routeDef = routes[routeIndex];

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

        startedTasks += 1;

        await runBenchmark(
          {
            routes: [routeDef],
            urlTemplate,
            mode,
            zoom,
            nRuns,
            routePauseMs,
            forceSerialRouting: pass.forceSerialRouting,
            clearCacheOnCategoryBoundary: false,
            clearCachesAfterEachRoute: true,
            pool: sharedPool,
            signal: _abortController.signal,
            pauseController: {
              isPaused: () => _paused,
              waitForResume: (signal) => waitForBenchmarkResume(signal),
            },
            onEngineStatus: (status) => {
              _engineWorkerStatus = status ?? {
                state: 'idle',
                engineId: null,
                running: false,
                lastError: null,
              };
              scheduleUIUpdate();
            },
            engineRunTimeoutMs: 20_000,
          },
          (progress) => {
            if (_stopped && !finishedEarly) throw new Error('Benchmark stopped by user');

            const { routeName, result, pauseMs, phase } = progress;
            const displayCompleted = completedTasks + (progress.done ? 1 : 0);
            const pct = totalTasks > 0 ? Math.round((displayCompleted / totalTasks) * 100) : 0;
            const statusSuffix = formatStatusSuffix(progress);
            const passPrefix =
              runPasses.length > 1
                ? `[${pass.parallelOrSerial} ${passIndex + 1}/${runPasses.length}] `
                : '';
            const activeTasks = Math.max(0, startedTasks - displayCompleted);
            const pausedSuffix = _paused ? ' — paused' : '';

            progressBarEl.style.width = `${pct}%`;
            if (pauseStateEl) pauseStateEl.hidden = !_paused;
            progressTextEl.textContent = progress.done
              ? `${passPrefix}${displayCompleted}/${totalTasks} runs finished — ${routeName ?? ''}${statusSuffix}`
              : phase === 'pausing'
                ? `${passPrefix}${completedTasks}/${totalTasks} finished, ${activeTasks} active — ${routeName ?? ''} complete. Pausing ${pauseMs}ms…${statusSuffix}${pausedSuffix}`
                : `${passPrefix}${completedTasks}/${totalTasks} finished, ${activeTasks} active — ${routeName ?? ''}${statusSuffix}${pausedSuffix}`;

            if (result) {
              result._routeOrdinal = routeIndex + 1;
              result._sab = Boolean(_runContext?.sharedArrayBuffer);
              result._passIndex = passIndex;
              result._insertedAt = performance.now();
              _pendingResultBuffer.push({
                passIndex: result._passIndex,
                routeIndex,
                _insertedAt: result._insertedAt,
              });
              _currentResultCount += 1;
              const savePromise = saveResultToDB(runId, passIndex, routeIndex, result);
              if (_currentRunId) {
                savePromise.finally(() => {
                  _pendingResultBuffer = _pendingResultBuffer.filter(
                    (pending) =>
                      pending.passIndex !== passIndex ||
                      pending.routeIndex !== routeIndex ||
                      pending._insertedAt !== result._insertedAt
                  );
                });
              }
              savePromise.catch((saveErr) => {
                console.warn('[benchmark] Failed to persist benchmark row:', saveErr);
              });
              _routeCompletionTimes.push(performance.now());
              if (!result.error) successfulRouteCount += 1;
              void appendRow(createUIResultRow(result));
              _pendingSummaryUpdate = true;
              _pendingChartRedraw = true;
              scheduleUIUpdate();
              if (successfulRouteCount >= successThreshold) {
                _stopped = true;
                finishedEarly = true;
              }
            }

            if (progress.done) {
              completedTasks += 1;
            }
          }
        );

        if (finishedEarly) break outerRouteLoop;
      }
    }

    const runResults = await getReportResults();
    if (runResults.length > 0) {
      _reportVariants = createReportVariants(runResults);
      updateReportTypeControls();
      showResults(runResults);
    }

    await waitForPendingWrites();
    await saveRunArtifacts(runResults, _runContext ?? buildReportContext());

    clearBenchmarkCache();
    _passContexts = null;
  } catch (err) {
    if (!_stopped && err?.name !== 'AbortError') console.error('Benchmark error:', err);
  } finally {
    stopBenchmarkStopwatch();
    updateBenchmarkStopwatch();
    runBtn.disabled = false;
    stopBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
    _paused = false;
    resumePausedBenchmark();
    await disposeBenchDb();
    _abortController = null;
    _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
    resetBenchmarkRunState();
    disposeBenchmarkResources();
  }
});

stopBtn.addEventListener('click', async () => {
  _stopped = true;
  if (stopBtn) stopBtn.disabled = true;
  resumePausedBenchmark();
  _abortController?.abort();
  await waitForPendingWrites();

  const runResults = await getReportResults();
  if (runResults.length > 0) {
    const combinedContext = { ...buildReportContext(), ..._runContext };
    showReport(runResults, combinedContext);

    const savedPaths = await saveRunArtifacts(runResults, combinedContext);

    if (savedPaths.length > 0) {
      if (reportStatusEl) reportStatusEl.textContent = `Report saved: ${savedPaths.join(', ')}`;
    } else {
      if (reportStatusEl) reportStatusEl.textContent = 'Report ready';
    }
  }
});

// ── Download ──────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', async () => {
  const runResults = await getReportResults();
  if (runResults.length > 0) {
    const mode = modeSelectEl.value;
    const variant = getSelectedReportVariant();
    const resultsToDownload =
      Array.isArray(variant.results) && variant.results.length > 0 ? variant.results : runResults;
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

async function refreshReportVariantsFromCurrentRun() {
  if (!_currentRunId) return;
  const runResults = await getReportResults();
  _reportVariants = createReportVariants(runResults);
}

if (reportBtn) {
  reportBtn.addEventListener('click', async () => {
    await refreshReportVariantsFromCurrentRun();
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
resultsTableSortHeaders.forEach((th) => {
  th.addEventListener('click', async () => {
    const col = th.dataset.col;
    if (_sortCol === col) {
      _sortAsc = !_sortAsc;
    } else {
      _sortCol = col;
      _sortAsc = true;
    }
    resultsTableSortHeaders.forEach((t) => t.classList.remove('sorted'));
    th.classList.add('sorted');
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (_sortAsc ? ' ▲' : ' ▼');
    renderTable(await getCurrentRenderResults());
  });
});
if (paginationPrevBtn) {
  paginationPrevBtn.addEventListener('click', async () => {
    if (_currentPage > 1) {
      _currentPage -= 1;
      renderTable(await getCurrentRenderResults());
    }
  });
}
if (paginationNextBtn) {
  paginationNextBtn.addEventListener('click', async () => {
    const currentResults = await getCurrentRenderResults();
    const pageCount = getPageCount(currentResults);
    if (_currentPage < pageCount) {
      _currentPage += 1;
      renderTable(currentResults);
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

function getPageCount(results) {
  return Math.max(1, Math.ceil((Array.isArray(results) ? results.length : 0) / RESULTS_PAGE_SIZE));
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

function showTooltip(text, event) {
  const tooltipEl = root.getElementById('tooltip');
  if (!tooltipEl) return;
  tooltipEl.hidden = false;
  tooltipEl.innerHTML = text.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
  const margin = 12;
  const x = event.clientX + margin;
  const y = event.clientY + margin;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
}

function hideTooltip() {
  const tooltipEl = root.getElementById('tooltip');
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
}

if (resultsTableEl) {
  resultsTableEl.addEventListener('pointerover', (event) => {
    const target = event.target.closest('[data-error-tooltip]');
    if (!target) return;
    const lines = target.dataset.errorTooltip ? JSON.parse(target.dataset.errorTooltip) : null;
    if (!lines) return;
    showTooltip(lines, event);
  });
  resultsTableEl.addEventListener('pointermove', (event) => {
    const target = event.target.closest('[data-error-tooltip]');
    if (!target) return;
    const tooltipEl = root.getElementById('tooltip');
    if (!tooltipEl || tooltipEl.hidden) return;
    const margin = 12;
    tooltipEl.style.left = `${event.clientX + margin}px`;
    tooltipEl.style.top = `${event.clientY + margin}px`;
  });
  resultsTableEl.addEventListener('pointerout', (event) => {
    if (event.target.closest('[data-error-tooltip]')) {
      hideTooltip();
    }
  });
}

function renderPaginationControls(results) {
  const pageCount = getPageCount(results);
  const totalRows = Array.isArray(results) ? results.length : 0;
  if (!paginationControlsEl || !paginationInfoEl) return;
  if (totalRows <= RESULTS_PAGE_SIZE) {
    paginationControlsEl.hidden = true;
    return;
  }
  paginationControlsEl.hidden = false;
  const start = (_currentPage - 1) * RESULTS_PAGE_SIZE + 1;
  const end = Math.min(totalRows, _currentPage * RESULTS_PAGE_SIZE);
  paginationInfoEl.textContent = `Showing ${start}–${end} of ${totalRows} routes — page ${_currentPage}/${pageCount}`;
  if (paginationPrevBtn) paginationPrevBtn.disabled = _currentPage <= 1;
  if (paginationNextBtn) paginationNextBtn.disabled = _currentPage >= pageCount;
}

function getVisiblePageRows(sortedRows) {
  const pageCount = getPageCount(sortedRows);
  if (_currentPage > pageCount) _currentPage = pageCount;
  const start = (_currentPage - 1) * RESULTS_PAGE_SIZE;
  return sortedRows.slice(start, start + RESULTS_PAGE_SIZE);
}

// ── Rendering helpers ─────────────────────────────────────────────────────

function fmtMs(v) {
  if (v == null) return '<span style="color:var(--muted)">—</span>';
  const n = Number(v);
  if (!Number.isFinite(n)) return '<span style="color:var(--muted)">—</span>';
  return n.toExponential(3);
}

function engineBadge(engineId, label) {
  if (!engineId) return '<span style="color:var(--muted)">—</span>';
  const className =
    engineId === 'bidirectional-astar'
      ? 'badge-astar'
      : engineId === 'adaptive-barrier'
        ? 'badge-barrier'
        : engineId === 'delta-stepping'
          ? 'badge-delta'
          : engineId === 'ultra-dijkstra'
            ? 'badge-dijkstra'
            : 'badge-cpu';
  return `<span class="badge ${className}">${label}</span>`;
}

function formatPickBadge(engineId) {
  return engineId
    ? engineBadge(engineId, engineShortName(engineId))
    : '<span style="color:var(--muted)">—</span>';
}

function formatHitIndicator(r) {
  if (r.auto_matches_winner == null) return '<span style="color:var(--muted)">—</span>';
  const hit =
    Number(r.auto_matches_winner) === 1
      ? Number(r.winner_tied) === 1 && r.auto_engine && r.auto_engine !== r.winner
        ? '≈'
        : '✓'
      : '✗';
  const color = hit === '✓' ? 'var(--green)' : hit === '✗' ? 'var(--red)' : 'var(--blue)';
  return `<span style="color:${color}">${hit}</span>`;
}

const GOOD_ENOUGH_REGRET_THRESHOLD_PCT = 10;
const WARNING_REGRET_THRESHOLD_PCT = 30;

function formatRegret(value) {
  if (value == null) return '<span style="color:var(--muted)">—</span>';
  const delta = Number(value);
  const sign = delta > 0 ? '+' : '';
  const color =
    delta <= 0
      ? 'var(--green)'
      : delta <= GOOD_ENOUGH_REGRET_THRESHOLD_PCT
        ? 'var(--blue)'
        : delta < WARNING_REGRET_THRESHOLD_PCT
          ? 'var(--orange)'
          : 'var(--red)';
  return `<span style="color:${color};font-weight:600">${sign}${delta.toFixed(1)}%</span>`;
}

function formatDuration(ms) {
  const totalMs = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((totalMs % 1000) / 100);
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }
  return `${seconds}.${tenths}s`;
}

function updateBenchmarkStopwatch(endTime = performance.now()) {
  if (!benchmarkStopwatchEl || benchmarkStartTime == null) return;
  const elapsedMs = endTime - benchmarkStartTime;
  const runCount = Math.max(0, _currentResultCount);
  const elapsedSec = elapsedMs / 1000;
  const fullAverageRoutesPerSec = runCount > 0 && elapsedSec > 0 ? runCount / elapsedSec : 0;
  let latestWindowRoutesPerSec;
  let latestWindowText = `latest ${Math.min(10, runCount)} avg — routes/sec`;
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
      latestWindowWarn = latestWindowRoutesPerSec > fullAverageRoutesPerSec + 1.5 * stddev;
    }
  }

  benchmarkStopwatchEl.hidden = false;
  benchmarkStopwatchEl.innerHTML = `
    <strong>${formatDuration(elapsedMs)}</strong>
    <span>avg ${fullAverageRoutesPerSec.toFixed(2)} routes/sec</span>
    <span class="${latestWindowWarn ? 'metric--warn' : ''}">${latestWindowText}</span>
  `;
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

function winnerBadge(r) {
  if (r.error) return `<span class="badge badge-error" title="${r.error}">error</span>`;
  if (!r.winner) return `<span class="badge badge-na">—</span>`;

  const title =
    Number(r.winner_tied) === 1 &&
    Array.isArray(r.winner_candidates) &&
    r.winner_candidates.length > 1
      ? ` title="Within timing tolerance: ${r.winner_candidates.map(engineShortName).join(', ')}"`
      : '';
  const label =
    Number(r.winner_tied) === 1 ? `${engineShortName(r.winner)} ≈` : engineShortName(r.winner);
  return `<span class="badge ${r.winner === 'bidirectional-astar' ? 'badge-astar' : r.winner === 'adaptive-barrier' ? 'badge-barrier' : r.winner === 'delta-stepping' ? 'badge-delta' : r.winner === 'ultra-dijkstra' ? 'badge-dijkstra' : 'badge-cpu'}"${title}>${label}</span>`;
}

async function appendRow(r) {
  resultsSectionEl.hidden = false;
  _currentPage = 1;
  _currentRenderResults.push(r);
  renderTable(_currentRenderResults);
}

function formatErrorColumn(r) {
  const hasError = Boolean(
    r.error ||
    r.routeError ||
    r.any_engine_error ||
    r.bidirectional_astar_error ||
    r.adaptive_barrier_error ||
    r.delta_stepping_error ||
    r.ultra_dijkstra_error ||
    r.bidirectional_astar_timed_error ||
    r.adaptive_barrier_timed_error ||
    r.delta_stepping_timed_error ||
    r.ultra_dijkstra_timed_error ||
    r.bidirectional_astar_warm_error ||
    r.adaptive_barrier_warm_error ||
    r.delta_stepping_warm_error ||
    r.ultra_dijkstra_warm_error
  );
  const icon = hasError ? '⚠' : '✓';
  const tooltipLines = hasError ? formatErrorDetails(r) : ['No route or engine errors'];
  return `
    <td class="error-bool ${hasError ? 'has-error' : 'no-error'}" data-error-tooltip='${escapeHtml(JSON.stringify(tooltipLines))}'>${icon}</td>
  `;
}

function formatSabColumn(r) {
  const hasSab = Boolean(r._sab);
  return `<td class="sab-bool ${hasSab ? 'has-sab' : 'no-sab'}">${hasSab ? '✓' : '—'}</td>`;
}

function buildRowHTML(r, ordinal) {
  const displayOrdinal = r._routeOrdinal ?? ordinal;
  const barrierParallelFlag = r.adaptive_barrier_parallel ? '✓' : '—';
  const deltaParallelFlag = r.delta_stepping_parallel ? '✓' : '—';
  const pickBadge = formatPickBadge(r.auto_engine);
  const winnerCell = winnerBadge(r);
  const hitIndicator = formatHitIndicator(r);
  const regretCell = formatRegret(r.auto_vs_winner_pct);
  return `
    <td class="num ordinal-col">${displayOrdinal}</td>
    ${formatSabColumn(r)}
    <td>${r.name}</td>
    <td>${r.category}</td>
    <td>${r.lengthCategory}</td>
    <td class="num">${fmtMs(r.bidirectional_astar_ms)}</td>
    <td class="num">${fmtMs(r.adaptive_barrier_ms)}</td>
    <td class="num">${barrierParallelFlag}</td>
    <td class="num">${fmtMs(r.delta_stepping_ms)}</td>
    <td class="num">${deltaParallelFlag}</td>
    <td class="num">${fmtMs(r.ultra_dijkstra_ms)}</td>
    <td>${pickBadge}</td>
    <td>${winnerCell}</td>
    <td class="num">${hitIndicator}</td>
    <td class="num">${regretCell}</td>
    ${formatErrorColumn(r)}
  `;
}

function summarizeAutoSelector(results) {
  const done = results.filter((r) => !r.error && r.winner);
  const exactHits = done.filter(
    (r) => Number(r.auto_matches_winner) === 1 && r.auto_engine === r.winner
  ).length;
  const nearTieHits = done.filter(
    (r) => Number(r.auto_matches_winner) === 1 && r.auto_engine !== r.winner
  ).length;
  const misses = done.filter((r) => Number(r.auto_matches_winner) === 0).length;
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
  };
}

function showReport(results, context) {
  if (!Array.isArray(results) || results.length === 0) {
    if (reportStatusEl) reportStatusEl.textContent = 'No results to report';
    if (reportNoteEl)
      reportNoteEl.textContent = 'Run some benchmark routes before generating a report.';
    if (reportPanelEl) reportPanelEl.hidden = false;
    if (reportOutputEl) reportOutputEl.value = '';
    if (copyReportBtn) copyReportBtn.disabled = true;
    return null;
  }

  const report = buildReportWithContextHeader(generateCopilotReport(results, context), context);
  if (reportPanelEl) reportPanelEl.hidden = false;
  if (reportOutputEl) reportOutputEl.value = report;
  if (reportStatusEl) reportStatusEl.textContent = 'Report ready';
  if (reportNoteEl)
    reportNoteEl.textContent = 'Use the generated report with other benchmark artifacts.';
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
  if (reportNoteEl)
    reportNoteEl.textContent = `Use the ${variant.label.toLowerCase()} benchmark report with other benchmark artifacts.`;
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
  const visibleRows = getVisiblePageRows(sorted);
  resultsTbodyEl.innerHTML = visibleRows
    .map(
      (r, index) =>
        `<tr>${buildRowHTML(r, (_currentPage - 1) * RESULTS_PAGE_SIZE + index + 1)}</tr>`
    )
    .join('');
  renderPaginationControls(results);
}

function updateSummary(results) {
  const routeErrorCount = results.filter((r) => r.error || r.routeError).length;
  const completed = results.filter((r) => !r.error && !r.routeError);
  const unrecoveredEngineErrorRouteCount = results.filter(
    (r) => !(r.error || r.routeError) && r.any_engine_error
  ).length;
  const tieCount = completed.filter((r) => Number(r.winner_tied) === 1).length;

  const engineWins = {
    'bidirectional-astar': 0,
    'adaptive-barrier': 0,
    'delta-stepping': 0,
    'ultra-dijkstra': 0,
  };
  completed.forEach((r) => {
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
  cards.push(
    `<div class="card"><div class="card-val">${results.length}</div><div class="card-lbl">Routes run</div></div>`
  );
  Object.entries(engineWins).forEach(([engine, count]) => {
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
    cards.push(`
      <div class="card ${className}">
        <div class="card-val">${count}</div>
        <div class="card-lbl">${engineNames[engine]} wins</div>
      </div>
    `);
  });
  if (tieCount > 0) {
    cards.push(
      `<div class="card gray"><div class="card-val">${tieCount}</div><div class="card-lbl">Near-ties</div></div>`
    );
  }
  if (routeErrorCount > 0) {
    cards.push(
      `<div class="card red"><div class="card-val">${routeErrorCount}</div><div class="card-lbl">Route errors</div></div>`
    );
  }
  if (unrecoveredEngineErrorRouteCount > 0) {
    cards.push(
      `<div class="card coral"><div class="card-val">${unrecoveredEngineErrorRouteCount}</div><div class="card-lbl">Routes with unrecovered engine errors</div></div>`
    );
  }

  summaryCardsEl.innerHTML = cards.join('');
  renderAutoSelectorSummary(results);
}

function redrawCharts(results) {
  _chartScatter = drawScatter(scatterEl, results, {}, _chartScatter);
  _chartDensity = drawDensityScatter(densityEl, results, {}, _chartDensity);
  _chartHistogram = drawFeatureHistogram(histogramEl, results, {}, _chartHistogram);
  _chartBubble = drawTimingBubble(bubbleEl, results, {}, _chartBubble);
  if (_cleanupTooltip) {
    _cleanupTooltip();
  }
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
  updateBenchmarkStopwatch();

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

  const mode = (context?.mode || 'unknown').toLowerCase();
  const parallelOrSerial =
    context?.parallelOrSerial ?? (context?.sharedArrayBuffer ? 'parallel' : 'serial');
  const timestamp =
    typeof context?.benchmarkTimestamp === 'string' && context.benchmarkTimestamp
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

async function saveRunArtifacts(results, context) {
  const savedPaths = [];
  const passContexts = Array.isArray(_passContexts) ? _passContexts.slice() : [];
  let effectiveResults = results;
  const runId = context?.runId ?? _currentRunId;

  // Artifact generation should use persisted benchmark rows whenever a runId is available.
  if (runId && typeof indexedDB !== 'undefined' && typeof IDBKeyRange !== 'undefined') {
    effectiveResults = await loadRunResultsFromDB(runId);
  }

  for (let passIndex = 0; passIndex < passContexts.length; passIndex++) {
    const passResults = Array.isArray(effectiveResults)
      ? effectiveResults.filter((r) => r._passIndex === passIndex || r.passIndex === passIndex)
      : [];
    const passContext = passContexts[passIndex];
    if (passContext) {
      try {
        const saveResult = await saveBenchmarkArtifact(passResults, passContext, {
          allowEmpty: true,
        });
        if (saveResult?.path) savedPaths.push(saveResult.path);
        console.log('[benchmark] Saved pass artifacts:', saveResult?.path ?? saveResult);
      } catch (err) {
        console.error('[benchmark] Failed to save pass artifacts:', err);
      }
    }
  }

  if (savedPaths.length === 0 && Array.isArray(effectiveResults) && effectiveResults.length > 0) {
    try {
      const saveResult = await saveBenchmarkArtifact(effectiveResults, context);
      if (saveResult?.path) savedPaths.push(saveResult.path);
      console.log('[benchmark] Saved combined artifacts:', saveResult?.path ?? saveResult);
    } catch (err) {
      console.error('[benchmark] Failed to save combined artifacts:', err);
    }
  }

  return savedPaths;
}

export function setCurrentRunId(runId) {
  _currentRunId = runId;
}

export function setPassContexts(contexts) {
  _passContexts = Array.isArray(contexts) ? contexts : null;
}

export {
  getCheckedValues,
  getSelectedRoutes,
  updateRouteCount,
  getReportVariantLabel,
  buildReportVariants,
  createReportVariants,
  updateReportTypeControls,
  getSelectedReportVariant,
  getReportFilename,
  createUIResultRow,
  getReportResults,
  saveRunArtifacts,
  buildBenchmarkJsonPayload,
  showResults,
  round4,
};

function renderCostSummaryTable(results) {
  const { groupKeys, rows, formatValue } = generateCostSummary(results);
  const winCountsByLabel = Object.fromEntries(rows.map((row) => [row.engine, 0]));
  results.forEach((r) => {
    const winnerLabel =
      r.costWinner === 'bidirectional-astar'
        ? 'A★ (Bidirectional)'
        : r.costWinner === 'adaptive-barrier'
          ? 'Barrier (Adaptive SSP)'
          : r.costWinner === 'delta-stepping'
            ? 'Delta-Stepping'
            : r.costWinner === 'ultra_dijkstra'
              ? 'Dijkstra (Ultra)'
              : r.costWinner === 'ultra-dijkstra'
                ? 'Dijkstra (Ultra)'
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
  groupKeys.forEach((gk) => {
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
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="padding: 8px 10px; font-weight: 500;">${row.engine}</td>`;
    const winsTd = document.createElement('td');
    winsTd.className = 'num';
    winsTd.style.padding = '8px 10px';
    winsTd.style.fontWeight = '600';
    winsTd.textContent = String(winCountsByLabel[row.engine] ?? 0);
    tr.appendChild(winsTd);
    groupKeys.forEach((gk) => {
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
  const winCountsByLabel = Object.fromEntries(rows.map((row) => [row.engine, 0]));
  results.forEach((r) => {
    const winnerLabel =
      r.winner === 'bidirectional-astar'
        ? 'A★ (Bidirectional)'
        : r.winner === 'adaptive-barrier'
          ? 'Barrier (Adaptive SSP)'
          : r.winner === 'delta-stepping'
            ? 'Delta-Stepping'
            : r.winner === 'ultra-dijkstra'
              ? 'Dijkstra (Ultra)'
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
  groupKeys.forEach((gk) => {
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
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="padding: 8px 10px; font-weight: 500;">${row.engine}</td>`;
    const winsTd = document.createElement('td');
    winsTd.className = 'num';
    winsTd.style.padding = '8px 10px';
    winsTd.style.fontWeight = '600';
    winsTd.textContent = String(winCountsByLabel[row.engine] ?? 0);
    tr.appendChild(winsTd);
    groupKeys.forEach((gk) => {
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
