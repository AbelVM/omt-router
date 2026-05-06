import {
  ROUTES, GPU_MIN_EDGES, GPU_MIN_BEELINE_M,
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
  suggestThresholds,
  generatePerformanceSummary,
  generateCostSummary,
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
const suggestionWrapEl = root.getElementById('suggestion-wrap');
const resultsTableSortHeaders = root.querySelectorAll('#results-table thead th[data-col]');

const qs = new URLSearchParams(window.location.search);
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
  const thresholdText = successThreshold > 0
    ? `, ${successThreshold.toLocaleString()} selected`
    : '';
  routeCountEl.textContent = `${n.toLocaleString()} routes available${thresholdText}`;
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
let _cleanupTooltip = null;
let _chartScatter = null;
let _chartDensity = null;
let _chartHistogram = null;
let _chartBubble = null;
let _runContext = null;
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
    : [
        { parallelOrSerial: 'serial', sharedArrayBuffer: false, forceSerialRouting: false },
      ];
  _abortController = new AbortController();
  _pendingSummaryUpdate = false;
  _pendingChartRedraw = false;
  _updateScheduled = false;
  _results = [];
  window.__benchmarkResults = _results;
  runBtn.disabled = true;
  stopBtn.disabled = false;
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

  const passResults = runPasses.map(() => []);
  const passContexts = runPasses.map((pass, passIndex) => ({
    ...baseRunContext,
    passIndex: passIndex + 1,
    totalPasses: runPasses.length,
    parallelOrSerial: pass.parallelOrSerial,
    sharedArrayBuffer: pass.sharedArrayBuffer,
    forceSerialRouting: pass.forceSerialRouting,
  }));

  try {
    const totalRoutes = routes.length;
    const totalTasks = totalRoutes * runPasses.length;
    let completedTasks = 0;
    let startedTasks = 0;
    let successfulRouteCount = 0;
    let finishedEarly = false;
    const successThreshold = maxSuccessRoutes > 0 ? maxSuccessRoutes : Infinity;

    outerRouteLoop:
    for (let routeIndex = 0; routeIndex < totalRoutes; routeIndex++) {
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
            routePauseMs: 0,
            forceSerialRouting: pass.forceSerialRouting,
            clearCacheOnCategoryBoundary: false,
            clearCachesAfterEachRoute: false,
            pool: sharedPool,
            signal: _abortController.signal,
            onEngineStatus: (status) => {
              _engineWorkerStatus = status ?? { state: 'idle', engineId: null, running: false, lastError: null };
            },
            engineRunTimeoutMs: 20_000,
          },
          (progress) => {
            if (_stopped && !finishedEarly) throw new Error('Benchmark stopped by user');

            const { routeName, result, pauseMs, phase } = progress;
            const displayCompleted = completedTasks + (progress.done ? 1 : 0);
            const pct = totalTasks > 0 ? Math.round((displayCompleted / totalTasks) * 100) : 0;
            const statusSuffix = formatStatusSuffix(progress);
            const passPrefix = runPasses.length > 1
              ? `[${pass.parallelOrSerial} ${passIndex + 1}/${runPasses.length}] `
              : '';
            const activeTasks = Math.max(0, startedTasks - displayCompleted);

            progressBarEl.style.width = `${pct}%`;
            progressTextEl.textContent = progress.done
              ? `${passPrefix}${displayCompleted}/${totalTasks} runs finished — ${routeName ?? ''}${statusSuffix}`
              : phase === 'pausing'
                ? `${passPrefix}${completedTasks}/${totalTasks} finished, ${activeTasks} active — ${routeName ?? ''} complete. Pausing ${pauseMs}ms…${statusSuffix}`
                : `${passPrefix}${completedTasks}/${totalTasks} finished, ${activeTasks} active — ${routeName ?? ''}${statusSuffix}`;

            if (result) {
              passResults[passIndex].push(result);
              _results.push(result);
              if (!result.error) successfulRouteCount += 1;
              appendRow(result);
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

      if (routePauseMs > 0 && routeIndex < totalRoutes - 1) {
        await new Promise(resolve => setTimeout(resolve, routePauseMs));
      }
    }

    if (passResults.some((pass) => pass.length > 0)) {
      const combinedResults = runPasses.length === 1
        ? passResults[0]
        : passResults[0].concat(...passResults.slice(1));
      _results = combinedResults;
      showResults(_results);
    }

    for (let passIndex = 0; passIndex < runPasses.length; passIndex++) {
      if (passResults[passIndex].length > 0) {
        try {
          const saveResult = await saveBenchmarkArtifact(passResults[passIndex], passContexts[passIndex]);
          console.log('[benchmark] Results saved:', saveResult?.path ?? saveResult);
        } catch (saveErr) {
          console.error('[benchmark] Failed to auto-save JSON artifact:', saveErr);
        }
      }
    }

    clearBenchmarkCache();
  } catch (err) {
    if (!_stopped && err?.name !== 'AbortError') console.error('Benchmark error:', err);
  } finally {
    runBtn.disabled = false;
    stopBtn.disabled = true;
    _abortController = null;
    _engineWorkerStatus = { state: 'idle', engineId: null, running: false, lastError: null };
  }
});

stopBtn.addEventListener('click', () => {
  _stopped = true;
  _abortController?.abort();
});

// ── Download ──────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (_results.length > 0) {
    const mode = modeSelectEl.value;
    downloadCSV(_results, `benchmark_${mode}_${new Date().toISOString().slice(0,10)}.csv`);
  }
});

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

function fmtMs(v, fallback) {
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

function winnerBadge(r) {
  if (r.error) return `<span class="badge badge-error" title="${r.error}">error</span>`;
  if (!r.winner) return `<span class="badge badge-na">—</span>`;

  const title = Number(r.winner_tied) === 1 && Array.isArray(r.winner_candidates) && r.winner_candidates.length > 1
    ? ` title="Within timing tolerance: ${r.winner_candidates.map(engineShortName).join(', ')}"`
    : '';
  const label = Number(r.winner_tied) === 1
    ? `${engineShortName(r.winner)} ≈`
    : engineShortName(r.winner);
  return `<span class="badge badge-cpu"${title}>${label}</span>`;
}

function speedupCell(r) {
  if (r.speedup == null) return '<span style="color:var(--muted)">—</span>';
  const cls = r.speedup >= 1 ? 'faster' : 'slower';
  const sign = r.speedup >= 1 ? '+' : '';
  const note = r.gpuFallback ? ' title="GPU time includes fallback to CPU A*"' : '';
  return `<span class="${cls}"${note}>${sign}${r.speedup}×</span>`;
}

function formatEngineErrors(r) {
  if (r.engine_errors) return r.engine_errors;
  const labels = [
    ['bidirectional_astar_error', 'A*'],
    ['adaptive_barrier_error', 'Barrier'],
    ['delta_stepping_error', 'Delta'],
    ['ultra_dijkstra_error', 'Dijkstra'],
  ];
  const failed = labels.filter(([key]) => !!r[key]).map(([, shortName]) => shortName);
  return failed.length > 0 ? failed.join(',') : '<span style="color:var(--muted)">—</span>';
}

function appendRow(r) {
  resultsSectionEl.hidden = false;
  const tr = document.createElement('tr');
  tr.innerHTML = buildRowHTML(r);
  resultsTbodyEl.appendChild(tr);
}

function buildRowHTML(r) {
  const barrierParallelFlag = r.adaptive_barrier_parallel ? '✓' : '—';
  const deltaParallelFlag = r.delta_stepping_parallel ? '✓' : '—';
  const autoEngineLabel = r.auto_engine ? engineShortName(r.auto_engine) : '—';
  const autoEqualsWinner = r.auto_engine && r.winner && r.auto_engine === r.winner;
  const autoVsWinner = r.auto_vs_winner_pct == null
    ? '<span style="color:var(--muted)">—</span>'
    : (() => {
        const delta = Number(r.auto_vs_winner_pct);
        const sign = delta > 0 ? '+' : '';
        const color = delta <= 0 ? 'var(--green)' : 'var(--red)';
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
    <td>${autoEngineLabel}</td>
    <td class="num">${fmtMs(r.auto_engine_ms)}</td>
    <td class="num">${autoVsWinner}</td>
    <td class="num">${autoMatchesWinner}</td>
    <td>${formatEngineErrors(r)}</td>
    <td>${winnerBadge(r)}</td>
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
  const done = results.filter(r => !r.error);
  const errCount = results.filter(r => r.error).length;
  const tieCount = done.filter(r => Number(r.winner_tied) === 1).length;
  
  // Count wins per engine
  const engineWins = {
    'bidirectional-astar': 0,
    'adaptive-barrier': 0,
    'delta-stepping': 0,
    'ultra-dijkstra': 0
  };
  
  done.forEach(r => {
    if (r.winner && engineWins.hasOwnProperty(r.winner)) {
      engineWins[r.winner]++;
    }
  });
  
  // Calculate median times per engine
  const engineMedians = {
    'bidirectional-astar': null,
    'adaptive-barrier': null,
    'delta-stepping': null,
    'ultra-dijkstra': null
  };
  
  Object.keys(engineMedians).forEach(engine => {
    const times = done.filter(r => r[engine + '_ms'] != null).map(r => r[engine + '_ms']).sort((a, b) => a - b);
    if (times.length > 0) {
      const m = Math.floor(times.length / 2);
      engineMedians[engine] = times.length % 2 ? times[m] : (times[m - 1] + times[m]) / 2;
    }
  });

  const engineNames = {
    'bidirectional-astar': 'A★',
    'adaptive-barrier': 'Barrier',
    'delta-stepping': 'Delta',
    'ultra-dijkstra': 'Dijkstra'
  };
  
  const colors = {
    'bidirectional-astar': '#3b82f6',
    'adaptive-barrier': '#8b5cf6',
    'delta-stepping': '#ec4899',
    'ultra-dijkstra': '#f59e0b'
  };

  summaryCardsEl.innerHTML = `
    <div class="card"><div class="card-val">${results.length}</div><div class="card-lbl">Routes run</div></div>
    ${Object.entries(engineWins).map(([engine, count]) => 
      `<div class="card"><div class="card-val">${count}</div><div class="card-lbl">${engineNames[engine]} wins</div></div>`
    ).join('')}
    ${tieCount > 0 ? `<div class="card"><div class="card-val">${tieCount}</div><div class="card-lbl">Near-ties</div></div>` : ''}
    ${errCount > 0 ? `<div class="card"><div class="card-val">${errCount}</div><div class="card-lbl">Errors</div></div>` : ''}
  `;
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
