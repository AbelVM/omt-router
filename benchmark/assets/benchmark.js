/**
 * benchmark.js — CPU vs GPU routing benchmark core.
 *
 * Imports directly from src/ so it sees the unbuilt source (Vite dev mode).
 * This lets the benchmark call queryRoute with { forceEngine } to override
 * the automatic CPU/GPU threshold.
 *
 * Usage (from benchmark/index.html via <script type="module">):
 *
 *   import { runBenchmark } from './benchmark.js';
 *   const results = await runBenchmark(config, onProgress);
 */

import {
  queryRoute,
  prepareGraph,
  prepareRoutableGraph,
  selectBestEngine,
  validateRouteResult,
  getEngineWorkerStatus,
  onEngineWorkerStatusChange,
  cancelRunningEngine,
} from '../../src/engines/router.js';
import { buildGraphAsync } from '../../src/graphs/graphBuilder.js';
import {
  classifySelectorFeatures,
  getSelectorBins,
} from './benchmark-selector-features.js';
import { getTilesAlongLine } from '../../src/tiles/tilesManager.js';
import { interpolate, haversineDistance } from '../../src/utils/misc.js';
import { PowerPool } from 'performance-helpers/powerPool';
import { PowerCache } from 'performance-helpers/powerCache';
import tilesWorker from '../../src/tiles/tilesWorker?worker&inline';
import Chart from 'chart.js/auto';

const ENGINE_IDS = [
  'bidirectional-astar',
  'adaptive-barrier',
  'delta-stepping',
  'ultra-dijkstra',
];

// ── Shared singletons (created once, reused across all routes) ────────────────
let _pool = null;
let _cache = null;

export function getSharedPool() {
  if (!_pool) {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
    const poolMaxSize = Math.min(8, Math.max(1, hw - 1));
    const poolSize = Math.min(2, poolMaxSize);
    _pool = new PowerPool(tilesWorker, {
      size: poolSize, maxSize: poolMaxSize, lazy: false,
      autoScale: {
        // Bench runs are sustained and throughput-oriented; scale up quickly and avoid oscillation.
        intervalMs: 400,
        targetMs: 65,
        alpha: 0.25,
        cooldownMs: 1_500,
        hysteresis: 0.22,
        stepUp: 2,
        stepDown: 1,
        backoffFactor: 1.5,
        backoffMaxMultiplier: 6,
        backoffResetMs: 9_000,
      },
      idleTimeout: 600_000,
    });
  }
  return _pool;
}

const BENCHMARK_CACHE_TTL = 10_000;

export function getSharedCache() {
  if (!_cache) {
    _cache = new PowerCache({ maxEntries: 10_000, defaultTTL: BENCHMARK_CACHE_TTL });
  }
  return _cache;
}

export function clearBenchmarkCache() {
  if (_cache) {
    _cache.clear();
  }
}

export function disposeBenchmarkResources() {
  if (_pool) {
    try {
      _pool.shutdown();
    } catch (err) {
      console.warn('[benchmark] Failed to shutdown shared pool:', err);
    }
    _pool = null;
  }

  if (_cache) {
    try {
      _cache.clear();
    } catch (err) {
      console.warn('[benchmark] Failed to clear shared cache:', err);
    }
    _cache = null;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function median(arr) {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const WINNER_ABS_TOLERANCE_MS = 0.1;
const WINNER_REL_TOLERANCE = 0.05;
const WINNER_TIE_BREAK_ORDER = [
  'bidirectional-astar',
  'adaptive-barrier',
  'delta-stepping',
  'ultra-dijkstra',
];

function selectTimingWinner(times) {
  const entries = Object.entries(times)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => a[1] - b[1]);

  if (entries.length === 0) {
    return {
      fastestMs: null,
      winner: null,
      winnerTied: false,
      winnerCandidates: [],
    };
  }

  const fastestMs = entries[0][1];
  const secondBestMs = entries.length > 1 ? entries[1][1] : null;
  const runnerUpEngine = entries.length > 1 ? entries[1][0] : null;
  const worstMs = entries[entries.length - 1][1];
  const toleranceMs = Math.max(
    WINNER_ABS_TOLERANCE_MS,
    fastestMs * WINNER_REL_TOLERANCE,
  );
  const winnerCandidates = entries
    .filter(([, value]) => value <= fastestMs + toleranceMs)
    .map(([engineId]) => engineId);
  const engineCountWithin5Pct = entries
    .filter(([, value]) => value <= fastestMs * 1.05)
    .length;
  const engineCountWithin10Pct = entries
    .filter(([, value]) => value <= fastestMs * 1.10)
    .length;

  const winner = winnerCandidates
    .slice()
    .sort((left, right) => WINNER_TIE_BREAK_ORDER.indexOf(left) - WINNER_TIE_BREAK_ORDER.indexOf(right))[0];

  const winnerMarginMs = secondBestMs !== null ? Math.max(0, secondBestMs - fastestMs) : null;
  const winnerMarginPct = winnerMarginMs !== null && fastestMs > 0
    ? round4(winnerMarginMs / fastestMs)
    : null;
  const bestToWorstMs = Math.max(0, worstMs - fastestMs);
  const bestToWorstPct = fastestMs > 0 ? round4(bestToWorstMs / fastestMs) : null;

  return {
    fastestMs,
    winner,
    winnerTied: winnerCandidates.length > 1,
    winnerCandidates,
    winnerCandidateCount: winnerCandidates.length,
    secondBestMs,
    runnerUpEngine,
    worstMs,
    bestToWorstMs,
    bestToWorstPct,
    engineCountWithin5Pct,
    engineCountWithin10Pct,
    winnerMarginMs,
    winnerMarginPct,
  };
}

function round2(x) { return Math.round(x * 100) / 100; }
// Speedup can be very small (0.001) for GPU-on-tiny-graphs; preserve 4 sig figs.
function round4(x) { return Math.round(x * 10000) / 10000; }

function summarizeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      count: 0,
      minMs: null,
      maxMs: null,
      meanMs: null,
      medianMs: null,
      stdDevMs: null,
      p95Ms: null,
    };
  }

  const ordered = [...samples].sort((a, b) => a - b);
  const count = ordered.length;
  const minMs = ordered[0];
  const maxMs = ordered[count - 1];
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    sum += ordered[i];
  }
  const meanMs = sum / count;
  let variance = 0;
  for (let i = 0; i < count; i += 1) {
    const delta = ordered[i] - meanMs;
    variance += delta * delta;
  }
  const medianMs = median(ordered);
  const p95Index = Math.max(0, Math.ceil(0.95 * count) - 1);

  return {
    count,
    minMs,
    maxMs,
    meanMs,
    medianMs,
    stdDevMs: Math.sqrt(variance),
    p95Ms: ordered[p95Index],
  };
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const cleanup = () => {
      if (signal?.removeEventListener) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      resolve();
    };

    if (signal?.aborted) {
      clearTimeout(timer);
      resolve();
      return;
    }

    if (signal?.addEventListener) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function createAbortError(message = 'Benchmark aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function isAbortSignalAborted(signal) {
  return !!signal?.aborted;
}

function normalizeEngineErrorMessage(error) {
  if (!error) return 'unknown_error';
  return error.message ?? String(error);
}

function normalizeEngineErrorCode(error) {
  if (!error) return null;
  if (error.code) return String(error.code);
  if (error.name === 'AbortError') return 'aborted';
  return null;
}

function normalizeEngineError(error) {
  return normalizeEngineErrorMessage(error);
}

async function runEngineQuery(startId, endId, prepared, {
  engineId,
  costField,
  forceSerialRouting = false,
  signal,
  engineRunTimeoutMs = 0,
  allowFallback = false,
}) {
  if (isAbortSignalAborted(signal)) {
    cancelRunningEngine({ reason: 'benchmark_aborted' });
    throw createAbortError();
  }

  const routePromise = queryRoute(startId, endId, prepared, {
    engineId,
    costField,
    useCache: false,
    allowFallback,
    forceSerialRouting,
  });

  const guards = [routePromise];
  const cleanup = [];

  if (Number.isFinite(engineRunTimeoutMs) && engineRunTimeoutMs > 0) {
    guards.push(new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        cancelRunningEngine({ reason: 'benchmark_timeout', engineId });
        reject(new Error(`engine_timeout:${engineId}`));
      }, engineRunTimeoutMs);
      cleanup.push(() => clearTimeout(timeoutId));
    }));
  }

  if (signal) {
    guards.push(new Promise((_, reject) => {
      const abortHandler = () => {
        cancelRunningEngine({ reason: 'benchmark_aborted', engineId });
        reject(createAbortError());
      };
      signal.addEventListener('abort', abortHandler, { once: true });
      cleanup.push(() => signal.removeEventListener('abort', abortHandler));
    }));
  }

  try {
    return await Promise.race(guards);
  } finally {
    cleanup.forEach((fn) => fn());
    routePromise.catch(() => {});
  }
}

const SUMMARY_LENGTH_ORDER = ['extra-short', 'short', 'medium', 'long', 'extra-long', 'xxl'];
const SUMMARY_SIZE_ORDER = ['small', 'medium', 'large', 'xlarge'];
const REPORT_ENGINE_ORDER = [
  'bidirectional-astar',
  'adaptive-barrier',
  'delta-stepping',
  'ultra-dijkstra',
];
const REPORT_ENGINE_LABELS = {
  'bidirectional-astar': 'A*',
  'adaptive-barrier': 'Barrier',
  'delta-stepping': 'Delta',
  'ultra-dijkstra': 'Dijkstra',
};
const REPORT_ENGINE_TIME_KEYS = {
  'bidirectional-astar': 'bidirectional_astar_ms',
  'adaptive-barrier': 'adaptive_barrier_ms',
  'delta-stepping': 'delta_stepping_ms',
  'ultra-dijkstra': 'ultra_dijkstra_ms',
};

function summaryGroupSizeCategory(safeE) {
  if (!Number.isFinite(safeE) || safeE < 0) return null;
  if (safeE < 20_000) return 'small';
  if (safeE < 100_000) return 'medium';
  if (safeE < 500_000) return 'large';
  return 'xlarge';
}

function buildSummaryGroups(results) {
  const groups = {};
  const lengthToSizes = new Map();

  results.forEach((r) => {
    if (!r || !r.lengthCategory) return;
    const sizeKey = summaryGroupSizeCategory(r.safeE);
    if (!sizeKey) return;
    const groupKey = `${r.lengthCategory}-${sizeKey}`;
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(r);
    if (!lengthToSizes.has(r.lengthCategory)) {
      lengthToSizes.set(r.lengthCategory, new Set());
    }
    lengthToSizes.get(r.lengthCategory).add(sizeKey);
  });

  const orderedLengths = [
    ...SUMMARY_LENGTH_ORDER.filter((key) => lengthToSizes.has(key)),
    ...Array.from(lengthToSizes.keys()).filter((key) => !SUMMARY_LENGTH_ORDER.includes(key)).sort(),
  ];

  const groupKeys = [];
  orderedLengths.forEach((lengthKey) => {
    SUMMARY_SIZE_ORDER.forEach((sizeKey) => {
      const groupKey = `${lengthKey}-${sizeKey}`;
      if (lengthToSizes.get(lengthKey)?.has(sizeKey)) {
        groupKeys.push(groupKey);
      }
    });
  });

  return { groups, groupKeys };
}

function hasReferenceCostMismatch(cost, referenceCost) {
  if (!Number.isFinite(cost) || !Number.isFinite(referenceCost)) return false;
  const tolerance = Math.max(1, Math.max(Math.abs(cost), Math.abs(referenceCost)) * 0.02);
  return Math.abs(cost - referenceCost) > tolerance;
}

function normalizeBenchmarkResult(engineId, result, prepared, referenceCost = null) {
  if (!result || result.error) return result;
  if (!result.found) {
    return {
      ...result,
      cost: null,
      error: 'no_path',
    };
  }

  const validation = validateRouteResult(result, prepared);
  if (!validation.valid) {
    return {
      ...result,
      found: false,
      cost: null,
      error: validation.reason,
    };
  }

  if (
    engineId !== 'bidirectional-astar' &&
    Number.isFinite(referenceCost) &&
    hasReferenceCostMismatch(validation.actualCost, referenceCost)
  ) {
    return {
      ...result,
      found: false,
      cost: null,
      error: 'reference_cost_mismatch',
    };
  }

  return {
    ...result,
    cost: validation.actualCost,
  };
}

function summarizeEngineErrors(errors) {
  const labels = [
    ['bidirectional_astar_error', 'A*'],
    ['adaptive_barrier_error', 'Barrier'],
    ['delta_stepping_error', 'Delta'],
    ['ultra_dijkstra_error', 'Dijkstra'],
  ];

  const failed = labels
    .filter(([key]) => !!errors[key])
    .map(([, shortName]) => shortName);

  if (failed.length === 0) return null;
  return failed.join(',');
}

/**
 * Compute the auto-radius for a route (mirrors src/index.js computeRadius).
 */
function computeRadius(start, end, zoom) {
  const midLat = (start[1] + end[1]) / 2;
  const tileWidthM = (2 * Math.PI * 6_371_000 * Math.cos(midLat * Math.PI / 180)) / (2 ** zoom);
  const beelineM = haversineDistance(start, end);
  const bufferM = Math.max(600, beelineM * 0.15);
  return Math.min(3, Math.max(1, Math.ceil(bufferM / tileWidthM)));
}

// ── Single engine timing ───────────────────────────────────────────────────────

/**
 * Run `nRuns` round-trips with a specific engine and return the median time (ms).
 * First call is a warm-up and is excluded from timing.
 *
 * @param {string} engineId - 'bidirectional-astar', 'adaptive-barrier', 'delta-stepping', 'ultra-dijkstra'
 * @returns {{ medianMs: number, engine: string, found: boolean, parallelUsed?: boolean }}
 */
// timeEngine is superseded by the interleaved timing in benchmarkSingleRoute.
// Kept for reference only — do not call directly.

// ── Single route benchmark ─────────────────────────────────────────────────────

/**
 * Fetch tiles, build graph, time all 4 engines for one route definition.
 * Delta-stepping always runs; it uses parallel workers when SharedArrayBuffer
 * is available and a serial fallback otherwise.
 *
 * @param {object} routeDef
 * @param {string} urlTemplate
 * @param {string} mode        - 'car' | 'pedestrian' | 'bicycle'
 * @param {number} zoom
 * @param {number} nRuns       - measurement repetitions (excluding warm-up)
 * @param {object} pool
 * @param {object} cache
 * @returns {object} result row with timings for all 4 engines
 */
async function benchmarkSingleRoute(
  routeDef,
  urlTemplate,
  mode,
  zoom,
  nRuns,
  pool,
  cache,
  costField = 'distance',
  {
    signal,
    engineRunTimeoutMs = 0,
    forceSerialRouting = false,
    onPhase,
  } = {},
) {
  const { id, name, category, lengthCategory, start, end, forceRadius } = routeDef;

  const radius = forceRadius ?? computeRadius(start, end, zoom);

  // ── Fetch tiles & build graph ───────────────────────────────────────────────
  onPhase?.({ phase: 'fetching-tiles' });
  const tileList = getTilesAlongLine(start, end, zoom, radius);
  const tiles = tileList.map(t => ({
    ...t,
    url: interpolate(urlTemplate, { z: t.z, x: t.x, y: t.y }),
  }));

  onPhase?.({ phase: 'building-graph', tileCount: tiles.length });
  const tFetch0 = performance.now();
  const graph = await buildGraphAsync(tiles, mode, { pool, cache });
  const fetchMs = round2(performance.now() - tFetch0);

  // Prepare (build CH / CSR structures), including snapped route endpoints.
  onPhase?.({ phase: 'preparing-graph' });

  const routeSetup = prepareRoutableGraph(graph, start, end);
  const { graph: routedGraph, startId, endId } = routeSetup;

  const prepared = await prepareGraph(routedGraph, costField, {}, startId, endId, { mode });
  const selectorMetrics = prepared.metrics;
  const selectorFeatures = classifySelectorFeatures(selectorMetrics);

  if (startId === -1 || endId === -1) {
    return {
      id, name, category, lengthCategory,
      ...selectorFeatures,
      radius,
      fetchMs,
      bidirectional_astar_ms: null,
      adaptive_barrier_ms: null,
      adaptive_barrier_parallel: null,
      delta_stepping_parallel: null,
      delta_stepping_ms: null,
      ultra_dijkstra_ms: null,
      winner: null,
      error: 'no_node',
    };
  }

  // ── Engine timing results ──────────────────────────────────────────────────
  const engineIds = ENGINE_IDS;

  // Warm up all available engines before timing starts.
  // This primes JIT, field caches, and CSR hot paths for every engine equally,
  // so no single engine benefits from being measured "after" another.
  onPhase?.({ phase: 'warming-engines' });
  const warmResults = {};
  const warmTimingsMs = {};
  const warmErrors = {};
  for (const engineId of engineIds) {
    onPhase?.({ phase: 'warming-engine', engineId });
    const warmStart = performance.now();
    try {
      warmResults[engineId] = await runEngineQuery(startId, endId, prepared, {
        engineId,
        costField,
        forceSerialRouting,
        signal,
        engineRunTimeoutMs,
        // Warm-up must exercise each engine without algorithm fallback so
        // benchmark results reflect the engine's own path correctness.
        allowFallback: false,
      });
      warmTimingsMs[engineId] = performance.now() - warmStart;
      warmErrors[engineId] = null;
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      const message = normalizeEngineErrorMessage(err);
      warmResults[engineId] = { error: message, errorCode: normalizeEngineErrorCode(err) };
      warmTimingsMs[engineId] = performance.now() - warmStart;
      warmErrors[engineId] = { message, code: normalizeEngineErrorCode(err) };
    }
  }

  // Interleaved timing: each round runs one rep of every engine in order.
  // Any transient effects (GC pause, OS scheduler, JIT recompilation) hit all
  // engines in the same round, so they cancel out in the median rather than
  // systematically skewing whichever engine happened to run at that moment.
  const timesMap = Object.fromEntries(ENGINE_IDS.map((engineId) => [engineId, []]));
  const engineRunErrors = {};
  const timedResults = {};
  const timedErrorCounts = Object.fromEntries(ENGINE_IDS.map((engineId) => [engineId, 0]));
  const timedRounds = [];

  onPhase?.({ phase: 'timing-engines', nRuns });
  for (let i = 0; i < nRuns; i++) {
    onPhase?.({ phase: 'timing-round', round: i + 1, totalRounds: nRuns });
    const roundRecord = {
      round: i + 1,
      engines: {},
    };
    for (const engineId of engineIds) {
      if (engineRunErrors[engineId]) {
        roundRecord.engines[engineId] = {
          elapsedMs: null,
          error: engineRunErrors[engineId],
          skipped: true,
        };
        continue;
      }
      onPhase?.({ phase: 'timing-engine', engineId, round: i + 1, totalRounds: nRuns });
      try {
        const t0 = performance.now();
        const timedResult = await runEngineQuery(startId, endId, prepared, {
          engineId,
          costField,
          forceSerialRouting,
          signal,
          engineRunTimeoutMs,
          allowFallback: false,
        });
        let elapsedMs = performance.now() - t0;

        // Timer resolution fallback: if elapsed is exactly 0 ms, run a short
        // batch and divide to get a sub-resolution estimate.
        if (elapsedMs === 0) {
          const batchRuns = 16;
          const tb0 = performance.now();
          for (let j = 0; j < batchRuns; j++) {
            await runEngineQuery(startId, endId, prepared, {
              engineId,
              costField,
              forceSerialRouting,
              signal,
              engineRunTimeoutMs,
              allowFallback: false,
            });
          }
          elapsedMs = (performance.now() - tb0) / batchRuns;
        }

        if (!timedResults[engineId]) {
          timedResults[engineId] = timedResult;
        }

        timesMap[engineId].push(elapsedMs);
        roundRecord.engines[engineId] = {
          elapsedMs,
          error: null,
          skipped: false,
        };
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        const message = normalizeEngineErrorMessage(err);
        engineRunErrors[engineId] = { message, code: normalizeEngineErrorCode(err) };
        timedErrorCounts[engineId] += 1;
        roundRecord.engines[engineId] = {
          elapsedMs: null,
          error: message,
          skipped: false,
        };
      }
    }
    timedRounds.push(roundRecord);
  }

  // Assemble results
  const canonicalWarm = normalizeBenchmarkResult(
    'bidirectional-astar',
    warmResults['bidirectional-astar'],
    prepared,
  );
  const referenceCost = canonicalWarm?.found ? canonicalWarm.cost : null;

  const results = {};
  for (const engineId of engineIds) {
    const rawWarm = engineId === 'bidirectional-astar'
      ? canonicalWarm
      : normalizeBenchmarkResult(engineId, warmResults[engineId], prepared, referenceCost);
    const rawTimed = timedResults[engineId]
      ? normalizeBenchmarkResult(engineId, timedResults[engineId], prepared, referenceCost)
      : null;
    const warm = rawWarm ?? {};
    const hasTimedSamples = (timesMap[engineId] ?? []).length > 0;
    const useTimedResult = rawTimed && !rawTimed.error;
    const result = useTimedResult ? rawTimed : rawWarm ?? {};
    const runErr = engineRunErrors[engineId] ?? null;
    const warmErr = warm.error ?? null;
    const warmErrCode = warm.errorCode ?? null;
    const timedErrMessage = runErr?.message ?? rawTimed?.error ?? null;
    const timedErrCode = runErr?.code ?? rawTimed?.errorCode ?? null;
    const resultSource = useTimedResult ? 'timed' : (rawWarm ? 'warm' : 'none');
    const status = runErr
      ? 'timed_error'
      : useTimedResult
        ? (warmErr ? 'warm_error_recovered' : 'ok')
        : rawTimed?.error
          ? 'timed_error'
          : warmErr
            ? 'warm_error'
            : 'ok';
    const samples = timesMap[engineId] ?? [];

    results[engineId] = {
      medianMs: hasTimedSamples ? median(samples) : null,
      samplesMs: [...samples],
      sampleStats: summarizeSamples(samples),
      warmupMs: Number.isFinite(warmTimingsMs[engineId]) ? warmTimingsMs[engineId] : null,
      found: result.found ?? false,
      parallelUsed: result.parallelUsed ?? false,
      cost: result.cost ?? null,
      error: runErr ? timedErrMessage : (useTimedResult ? null : (rawTimed?.error ?? warmErr ?? null)),
      warmError: warmErr ?? null,
      warmErrorCode: warmErrCode,
      timedError: timedErrMessage,
      timedErrorCode: timedErrCode,
      resultSource,
      status,
    };
  }

  // Determine winner (lowest time, excluding nulls)
  const times = {};
  for (const engineId of engineIds) {
    if (results[engineId].medianMs !== null) {
      times[engineId] = results[engineId].medianMs;
    }
  }
  const timingWinner = selectTimingWinner(times);
  const winner = timingWinner.winner;

  // Real-world route() does not provide benchmark route labels (category),
  // so auto-engine evaluation relies on prepared selector metrics only.
  const autoEngine = selectBestEngine(prepared.metrics);
  const autoEngineMs = {
    'bidirectional-astar': results['bidirectional-astar'].medianMs,
    'adaptive-barrier': results['adaptive-barrier'].medianMs,
    'delta-stepping': results['delta-stepping'].medianMs,
    'ultra-dijkstra': results['ultra-dijkstra'].medianMs,
  }[autoEngine] ?? null;
  const fastestMs = timingWinner.fastestMs;
  // Compare auto against the declared winner's time, not the absolute fastest.
  // This way auto_vs_winner_pct is 0 when auto selects the winner engine,
  // even if that winner won via tie-break and is slightly above fastestMs.
  const winnerMs = winner != null ? (results[winner]?.medianMs ?? fastestMs) : fastestMs;
  const autoVsWinnerPct =
    Number.isFinite(autoEngineMs) && Number.isFinite(winnerMs) && winnerMs > 0
      ? round2(((autoEngineMs - winnerMs) / winnerMs) * 100)
      : null;

  // Determine cost winner (lowest route cost, excluding nulls / not-found)
  const costs = {};
  for (const engineId of engineIds) {
    const r = results[engineId];
    if (r.cost != null && r.found && !r.error) costs[engineId] = r.cost;
  }
  const costWinner = Object.keys(costs).length > 0
    ? Object.entries(costs).reduce((a, b) => a[1] < b[1] ? a : b)[0]
    : null;

  return {
    id, name, category, lengthCategory,
    start,
    end,
    ...selectorFeatures,
    graph: {
      ...prepared.metrics,
      radius,
      startNodeId: startId,
      endNodeId: endId,
    },
    radius,
    nRuns,
    fetchMs,
    best_time_ms: timingWinner.fastestMs,
    bidirectional_astar_ms: results['bidirectional-astar'].medianMs,
    adaptive_barrier_ms: results['adaptive-barrier'].medianMs,
    adaptive_barrier_parallel: results['adaptive-barrier'].parallelUsed ? 1 : 0,
    delta_stepping_parallel: results['delta-stepping'].parallelUsed ? 1 : 0,
    delta_stepping_ms: results['delta-stepping'].medianMs,
    ultra_dijkstra_ms: results['ultra-dijkstra'].medianMs,
    bidirectional_astar_delta_ms: Number.isFinite(results['bidirectional-astar'].medianMs)
      ? round4(results['bidirectional-astar'].medianMs - timingWinner.fastestMs)
      : null,
    adaptive_barrier_delta_ms: Number.isFinite(results['adaptive-barrier'].medianMs)
      ? round4(results['adaptive-barrier'].medianMs - timingWinner.fastestMs)
      : null,
    delta_stepping_delta_ms: Number.isFinite(results['delta-stepping'].medianMs)
      ? round4(results['delta-stepping'].medianMs - timingWinner.fastestMs)
      : null,
    ultra_dijkstra_delta_ms: Number.isFinite(results['ultra-dijkstra'].medianMs)
      ? round4(results['ultra-dijkstra'].medianMs - timingWinner.fastestMs)
      : null,
    bidirectional_astar_cost: results['bidirectional-astar'].cost,
    adaptive_barrier_cost: results['adaptive-barrier'].cost,
    delta_stepping_cost: results['delta-stepping'].cost,
    ultra_dijkstra_cost: results['ultra-dijkstra'].cost,
    n_engines_found: Object.values(results).filter((r) => r.found).length,
    n_engines_timed: Object.values(results).filter((r) => Number.isFinite(r.medianMs)).length,
    n_engines_cost: Object.values(results).filter((r) => r.cost != null).length,
    n_engines_warm_errors: Object.values(results).filter((r) => Boolean(r.warmError)).length,
    n_engines_timed_errors: Object.values(results).filter((r) => Boolean(r.timedError)).length,
    any_engine_warm_error: Object.values(results).some((r) => Boolean(r.warmError)),
    any_engine_timed_error: Object.values(results).some((r) => Boolean(r.timedError)),
    all_engines_found: Object.values(results).every((r) => r.found),
    all_engines_timed: Object.values(results).every((r) => Number.isFinite(r.medianMs)),
    all_engines_cost: Object.values(results).every((r) => r.cost != null),
    any_engine_error: Object.values(results).some((r) => Boolean(r.error || r.timedError)),
    cost_winner_ms: costWinner ? results[costWinner]?.medianMs ?? null : null,
    winner_vs_cost_pct: costWinner && Number.isFinite(results[costWinner]?.medianMs)
      ? round2((timingWinner.fastestMs - results[costWinner].medianMs) / results[costWinner].medianMs * 100)
      : null,
    winner_vs_cost_ms: costWinner && Number.isFinite(results[costWinner]?.medianMs)
      ? round4(timingWinner.fastestMs - results[costWinner].medianMs)
      : null,
    auto_engine: autoEngine,
    auto_engine_ms: autoEngineMs,
    auto_vs_winner_pct: autoVsWinnerPct,
    auto_matches_winner: timingWinner.winnerCandidates.length > 0
      ? Number(timingWinner.winnerCandidates.includes(autoEngine))
      : null,
    auto_is_winner: autoEngine === winner,
    winner_tied: Number(timingWinner.winnerTied),
    winner_candidates: timingWinner.winnerCandidates,
    winner_candidate_count: timingWinner.winnerCandidateCount,
    winner_margin_ms: timingWinner.winnerMarginMs,
    winner_margin_pct: timingWinner.winnerMarginPct,
    second_best_ms: timingWinner.secondBestMs,
    runner_up_engine: timingWinner.runnerUpEngine,
    worst_time_ms: timingWinner.worstMs,
    best_to_worst_ms: timingWinner.bestToWorstMs,
    best_to_worst_pct: timingWinner.bestToWorstPct,
    engines_within_5pct: timingWinner.engineCountWithin5Pct,
    engines_within_10pct: timingWinner.engineCountWithin10Pct,
    winner_is_cost_winner: winner !== null && winner === costWinner,
    costWinner,
    winner,
    engines_found: {
      bidirectional_astar: results['bidirectional-astar'].found,
      adaptive_barrier: results['adaptive-barrier'].found,
      delta_stepping: results['delta-stepping'].found,
      ultra_dijkstra: results['ultra-dijkstra'].found,
    },
    errors: {
      bidirectional_astar_error: results['bidirectional-astar'].error ?? results['bidirectional-astar'].timedError,
      adaptive_barrier_error: results['adaptive-barrier'].error ?? results['adaptive-barrier'].timedError,
      delta_stepping_error: results['delta-stepping'].error ?? results['delta-stepping'].timedError,
      ultra_dijkstra_error: results['ultra-dijkstra'].error ?? results['ultra-dijkstra'].timedError,
    },
    bidirectional_astar_error: results['bidirectional-astar'].error ?? results['bidirectional-astar'].timedError,
    adaptive_barrier_error: results['adaptive-barrier'].error ?? results['adaptive-barrier'].timedError,
    delta_stepping_error: results['delta-stepping'].error ?? results['delta-stepping'].timedError,
    ultra_dijkstra_error: results['ultra-dijkstra'].error ?? results['ultra-dijkstra'].timedError,
    bidirectional_astar_warm_error: results['bidirectional-astar'].warmError,
    adaptive_barrier_warm_error: results['adaptive-barrier'].warmError,
    delta_stepping_warm_error: results['delta-stepping'].warmError,
    ultra_dijkstra_warm_error: results['ultra-dijkstra'].warmError,
    bidirectional_astar_warm_error_code: results['bidirectional-astar'].warmErrorCode,
    adaptive_barrier_warm_error_code: results['adaptive-barrier'].warmErrorCode,
    delta_stepping_warm_error_code: results['delta-stepping'].warmErrorCode,
    ultra_dijkstra_warm_error_code: results['ultra-dijkstra'].warmErrorCode,
    bidirectional_astar_result_source: results['bidirectional-astar'].resultSource,
    adaptive_barrier_result_source: results['adaptive-barrier'].resultSource,
    delta_stepping_result_source: results['delta-stepping'].resultSource,
    ultra_dijkstra_result_source: results['ultra-dijkstra'].resultSource,
    bidirectional_astar_status: results['bidirectional-astar'].status,
    adaptive_barrier_status: results['adaptive-barrier'].status,
    delta_stepping_status: results['delta-stepping'].status,
    ultra_dijkstra_status: results['ultra-dijkstra'].status,
    bidirectional_astar_timed_error: results['bidirectional-astar'].timedError,
    adaptive_barrier_timed_error: results['adaptive-barrier'].timedError,
    delta_stepping_timed_error: results['delta-stepping'].timedError,
    ultra_dijkstra_timed_error: results['ultra-dijkstra'].timedError,
    bidirectional_astar_timed_error_code: results['bidirectional-astar'].timedErrorCode,
    adaptive_barrier_timed_error_code: results['adaptive-barrier'].timedErrorCode,
    delta_stepping_timed_error_code: results['delta-stepping'].timedErrorCode,
    ultra_dijkstra_timed_error_code: results['ultra-dijkstra'].timedErrorCode,
    bidirectional_astar_error_code: results['bidirectional-astar'].warmErrorCode ?? results['bidirectional-astar'].timedErrorCode,
    adaptive_barrier_error_code: results['adaptive-barrier'].warmErrorCode ?? results['adaptive-barrier'].timedErrorCode,
    delta_stepping_error_code: results['delta-stepping'].warmErrorCode ?? results['delta-stepping'].timedErrorCode,
    ultra_dijkstra_error_code: results['ultra-dijkstra'].warmErrorCode ?? results['ultra-dijkstra'].timedErrorCode,
    engine_errors: summarizeEngineErrors({
      bidirectional_astar_error: results['bidirectional-astar'].error ?? results['bidirectional-astar'].timedError,
      adaptive_barrier_error: results['adaptive-barrier'].error ?? results['adaptive-barrier'].timedError,
      delta_stepping_error: results['delta-stepping'].error ?? results['delta-stepping'].timedError,
      ultra_dijkstra_error: results['ultra-dijkstra'].error ?? results['ultra-dijkstra'].timedError,
    }),
    rawDiagnostics: {
      forceSerialRouting,
      routeDefinition: {
        id,
        name,
        category,
        lengthCategory,
        start,
        end,
        forceRadius: forceRadius ?? null,
      },
      graph: {
        nodeCount: prepared.N,
        edgeCount: prepared.E,
        fetchMs,
        radius,
        startNodeId: startId,
        endNodeId: endId,
      },
      execution: {
        nRunsRequested: nRuns,
        engineOrder: [...engineIds],
        warmupMsByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          Number.isFinite(warmTimingsMs[engineId]) ? warmTimingsMs[engineId] : null,
        ])),
        warmupErrorMessagesByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          warmErrors[engineId]?.message ?? null,
        ])),
        warmupErrorCodesByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          warmErrors[engineId]?.code ?? null,
        ])),
        warmupErrorsByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          warmErrors[engineId] ? 1 : 0,
        ])),
        timedErrorMessagesByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          engineRunErrors[engineId]?.message ?? null,
        ])),
        timedErrorCodesByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          engineRunErrors[engineId]?.code ?? null,
        ])),
        timedErrorsByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          timedErrorCounts[engineId] ?? 0,
        ])),
        finalResultSourceByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          results[engineId]?.resultSource ?? null,
        ])),
        finalEngineStatusByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          results[engineId]?.status ?? null,
        ])),
        timingSamplesMsByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          [...(timesMap[engineId] ?? [])],
        ])),
        timingSampleStatsByEngine: Object.fromEntries(engineIds.map((engineId) => [
          engineId,
          summarizeSamples(timesMap[engineId] ?? []),
        ])),
        timingRounds: timedRounds,
      },
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run the full benchmark suite.
 *
 * @param {object} config
 * @param {object[]} config.routes      - Array of route definitions (from routes.js)
 * @param {string}   config.urlTemplate - Tile URL with {z}/{x}/{y} placeholders
 * @param {string}   config.mode        - 'car' | 'pedestrian' | 'bicycle'
 * @param {number}   config.zoom        - Tile zoom level (default 14)
 * @param {number}   config.nRuns       - Timing repetitions per engine (default 10)
 * @param {number}   config.routePauseMs - Pause between routes in milliseconds (default 0)
 *
 * @param {function} onProgress         - Called after each route with progress info:
 *   { current, total, routeName, result, results }
 *
 * @returns {Promise<object[]>} Array of result rows
 */
export async function runBenchmark(config, onProgress = () => {}) {
  const {
    routes,
    urlTemplate,
    mode = 'car',
    zoom = 14,
    nRuns = 10,
    costField = 'distance',
    routePauseMs = 0,
    forceSerialRouting = false,
    clearCachesAfterEachRoute = false,
    clearCacheOnCategoryBoundary = true,
    signal,
    pauseController,
    onEngineStatus,
    engineRunTimeoutMs = 20_000,
    pool: suppliedPool,
    cache: suppliedCache,
    graphCache = null,
  } = config;

  const normalizedPauseMs = Math.max(0, Math.floor(routePauseMs));
  const mutedPhases = new Set([
    'warming-engine',
    'timing-engine',
  ]);

  const shouldClearCachesAfterEachRoute = Boolean(clearCachesAfterEachRoute);
  const shouldClearCachesOnCategoryBoundary = Boolean(clearCacheOnCategoryBoundary) && !shouldClearCachesAfterEachRoute;

  const pool = suppliedPool ?? getSharedPool();
  const cache = suppliedCache ?? getSharedCache();
  const graphCacheInstance = graphCache || null; // allow passing a graph cache if needed
  const results = [];
  const emitEngineStatus = (status) => {
    if (typeof onEngineStatus === 'function') {
      onEngineStatus(status);
    }
  };
  const unsubscribeEngineStatus = onEngineWorkerStatusChange((status) => {
    emitEngineStatus(status);
  });
  emitEngineStatus(getEngineWorkerStatus());

  // Group routes by city/category
  let prevCategory = null;

  const waitForResumeIfPaused = async () => {
    if (!pauseController?.isPaused?.() || isAbortSignalAborted(signal)) return;
    await pauseController.waitForResume(signal);
  };

  try {
    for (let i = 0; i < routes.length; i++) {
      if (isAbortSignalAborted(signal)) {
        cancelRunningEngine({ reason: 'benchmark_aborted' });
        throw createAbortError();
      }
      await waitForResumeIfPaused();

      const routeDef = routes[i];
      onProgress({ current: i, total: routes.length, routeName: routeDef.name, results });

      let result;
      try {
        result = await benchmarkSingleRoute(routeDef, urlTemplate, mode, zoom, nRuns, pool, cache, costField, {
          signal,
          engineRunTimeoutMs,
          forceSerialRouting,
          onPhase: (phaseInfo) => {
            if (mutedPhases.has(phaseInfo?.phase)) return;
            onProgress({
              current: i,
              total: routes.length,
              routeName: routeDef.name,
              phase: phaseInfo?.phase,
              phaseInfo,
              results,
            });
          },
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw err;
        }
        result = {
          id: routeDef.id, name: routeDef.name,
          category: routeDef.category, lengthCategory: routeDef.lengthCategory,
          ...classifySelectorFeatures({
            nodeCount: null,
            edgeCount: null,
            haversineDistance: Math.round(haversineDistance(routeDef.start, routeDef.end)),
            sourceId: -1,
            targetId: -1,
            prepared: null,
            graph: null,
          }),
          radius: null,
          nRuns,
          fetchMs: null,
          bidirectional_astar_ms: null,
          adaptive_barrier_ms: null,
          adaptive_barrier_parallel: null,
          delta_stepping_parallel: null,
          delta_stepping_ms: null,
          ultra_dijkstra_ms: null,
          bidirectional_astar_cost: null,
          adaptive_barrier_cost: null,
          delta_stepping_cost: null,
          ultra_dijkstra_cost: null,
          auto_engine: null,
          auto_engine_ms: null,
          auto_vs_winner_pct: null,
          auto_matches_winner: null,
          costWinner: null,
          winner: null,
          error: normalizeEngineError(err),
        };
      }

      results.push(result);
      onProgress({ current: i + 1, total: routes.length, routeName: routeDef.name, result, results });

      const nextCategory = (routes[i + 1]?.category) ?? null;
      if (shouldClearCachesAfterEachRoute) {
        cache.clear();
        if (graphCacheInstance && typeof graphCacheInstance.clear === 'function') graphCacheInstance.clear();
      } else if (shouldClearCachesOnCategoryBoundary) {
        if (routeDef.category !== prevCategory && prevCategory !== null) {
          // Defensive: should not happen, but just in case
          cache.clear();
          if (graphCacheInstance && typeof graphCacheInstance.clear === 'function') graphCacheInstance.clear();
        }
        if (routeDef.category !== nextCategory) {
          // Last route of this category
          cache.clear();
          if (graphCacheInstance && typeof graphCacheInstance.clear === 'function') graphCacheInstance.clear();
        }
      }
      prevCategory = routeDef.category;

      if (normalizedPauseMs > 0 && i < routes.length - 1) {
        await waitForResumeIfPaused();
        onProgress({
          current: i + 1,
          total: routes.length,
          routeName: routeDef.name,
          pauseMs: normalizedPauseMs,
          phase: 'pausing',
          results,
        });
        await sleep(normalizedPauseMs, signal);
        await waitForResumeIfPaused();
      }
    }

    onProgress({ current: routes.length, total: routes.length, done: true, results });
    return results;
  } finally {
    try {
      if (cache && typeof cache.clear === 'function') cache.clear();
      if (graphCacheInstance && typeof graphCacheInstance.clear === 'function') {
        graphCacheInstance.clear();
      }
    } catch (err) {
      console.warn('[benchmark] Failed to clear benchmark caches on exit:', err);
    }

    unsubscribeEngineStatus?.();
    emitEngineStatus(getEngineWorkerStatus());
  }
}

// ── Performance Summary Table ─────────────────────────────────────────────────
/**
 * Generate a performance summary table showing engines as rows and length-graph-size
 * combinations as columns, with values as percentage of fastest speed (fastest = 100%).
 * 
 * @param {object[]} results - benchmark results
 * @returns {object} { headers, rows, formatValue }
 */
export function generatePerformanceSummary(results) {
  const engines = [
    'bidirectional-astar',
    'adaptive-barrier',
    'delta-stepping',
    'ultra-dijkstra'
  ];
  
  const engineNames = {
    'bidirectional-astar': 'A★ (Bidirectional)',
    'adaptive-barrier': 'Barrier (Adaptive SSP)',
    'delta-stepping': 'Delta-Stepping',
    'ultra-dijkstra': 'Dijkstra (Ultra)'
  };

  const engineResultKeys = {
    'bidirectional-astar': 'bidirectional_astar_ms',
    'adaptive-barrier': 'adaptive_barrier_ms',
    'delta-stepping': 'delta_stepping_ms',
    'ultra-dijkstra': 'ultra_dijkstra_ms'
  };

  // Rounded timings can hit 0.000ms; clamp to a tiny floor for stable ratios.
  const normalizeTiming = (t) => {
    if (!Number.isFinite(t) || t < 0) return null;
    return Math.max(t, 0.001);
  };
  
  const { groups, groupKeys } = buildSummaryGroups(results);
  
  // Build summary table: engines × groups
  const rows = engines.map(engine => {
    const row = { engine: engineNames[engine] };
    groupKeys.forEach(groupKey => {
      const resultsInGroup = groups[groupKey];
      const timings = resultsInGroup
        .map(r => normalizeTiming(r[engineResultKeys[engine]]))
        .filter(t => t != null);
      
      if (timings.length === 0) {
        row[groupKey] = null;
      } else {
        const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
        row[groupKey] = { avg: avgTime, count: timings.length };
      }
    });
    return row;
  });
  
  // Convert to percentages relative to fastest in each group
  groupKeys.forEach(groupKey => {
    const groupAvgs = rows
      .map(r => r[groupKey])
      .filter(v => v != null)
      .map(v => v.avg)
      .filter(v => Number.isFinite(v) && v > 0);

    if (groupAvgs.length === 0) {
      rows.forEach(row => { row[groupKey] = null; });
      return;
    }

    const minTime = Math.min(...groupAvgs);
    rows.forEach(row => {
      const cell = row[groupKey];
      if (cell == null || !Number.isFinite(cell.avg) || cell.avg <= 0) {
        row[groupKey] = null;
        return;
      }

      const percentage = Math.round((minTime / cell.avg) * 100);
      row[groupKey] = Number.isFinite(percentage)
        ? Math.max(1, Math.min(100, percentage))
        : null;
    });
  });
  
  return {
    groupKeys,
    rows,
    formatValue: (v) => v === null ? '—' : `${v}%`
  };
}

export function generateCostSummary(results) {
  const engines = [
    'bidirectional-astar',
    'adaptive-barrier',
    'delta-stepping',
    'ultra-dijkstra'
  ];

  const engineNames = {
    'bidirectional-astar': 'A★ (Bidirectional)',
    'adaptive-barrier': 'Barrier (Adaptive SSP)',
    'delta-stepping': 'Delta-Stepping',
    'ultra-dijkstra': 'Dijkstra (Ultra)'
  };

  const engineCostKeys = {
    'bidirectional-astar': 'bidirectional_astar_cost',
    'adaptive-barrier': 'adaptive_barrier_cost',
    'delta-stepping': 'delta_stepping_cost',
    'ultra-dijkstra': 'ultra_dijkstra_cost'
  };

  const { groups, groupKeys } = buildSummaryGroups(results);

  const rows = engines.map(engine => {
    const row = { engine: engineNames[engine] };
    groupKeys.forEach(groupKey => {
      const costs = groups[groupKey]
        .map(r => r[engineCostKeys[engine]])
        .filter(cost => Number.isFinite(cost) && cost >= 0);

      if (costs.length === 0) {
        row[groupKey] = null;
      } else {
        const avgCost = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
        row[groupKey] = { avg: avgCost, count: costs.length };
      }
    });
    return row;
  });

  groupKeys.forEach(groupKey => {
    const groupAvgs = rows
      .map(r => r[groupKey])
      .filter(v => v != null)
      .map(v => v.avg)
      .filter(v => Number.isFinite(v) && v >= 0);

    if (groupAvgs.length === 0) {
      rows.forEach(row => { row[groupKey] = null; });
      return;
    }

    const minCost = Math.min(...groupAvgs);
    rows.forEach(row => {
      const cell = row[groupKey];
      if (cell == null || !Number.isFinite(cell.avg) || cell.avg < 0) {
        row[groupKey] = null;
        return;
      }

      if (minCost === 0) {
        row[groupKey] = cell.avg === 0 ? 100 : null;
        return;
      }

      const percentage = Math.round((minCost / cell.avg) * 100);
      row[groupKey] = Number.isFinite(percentage)
        ? Math.max(1, Math.min(100, percentage))
        : null;
    });
  });

  return {
    groupKeys,
    rows,
    formatValue: (v) => v === null ? '—' : `${v}%`
  };
}

function formatReportValue(value, fractionDigits = 1) {
  if (!Number.isFinite(value)) return 'n/a';
  return Number(value).toFixed(fractionDigits);
}

function formatReportPercent(value, fractionDigits = 1) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${Number(value).toFixed(fractionDigits)}%`;
}

function formatReportCount(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : 'n/a';
}

function truncateReportText(value, max = 96) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toMarkdownCell(value) {
  const text = String(value ?? '');
  return text
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function summarizeAutoSelectorReport(results) {
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

function buildTimingSummary(row) {
  return REPORT_ENGINE_ORDER
    .map((engineId) => {
      const key = REPORT_ENGINE_TIME_KEYS[engineId];
      const value = row[key];
      return `${REPORT_ENGINE_LABELS[engineId]}=${formatReportValue(value, 3)}ms`;
    })
    .join(', ');
}

function formatSelectorBins(row) {
  if (row?.signature) return row.signature;
  const bins = getSelectorBins({
    edgeCount: Number.isFinite(row.safeE) ? row.safeE : 0,
    nodeCount: Number.isFinite(row.safeN) ? row.safeN : 1,
    haversineDistance: Number.isFinite(row.safeBeelineKm) ? row.safeBeelineKm * 1000 : 0,
  });
  return bins.signature;
}

export function generateCopilotReport(results, context = {}) {
  const safeResults = Array.isArray(results) ? results : [];
  const validResults = safeResults.filter((row) => !row.error && row.winner);
  const errorResults = safeResults.filter((row) => row.error);
  const selector = summarizeAutoSelectorReport(safeResults);

  const winnerCounts = REPORT_ENGINE_ORDER.reduce((counts, engineId) => {
    counts[engineId] = validResults.filter((row) => row.winner === engineId).length;
    return counts;
  }, {});

  const barrierParallelUsed = validResults.filter((row) => Number(row.adaptive_barrier_parallel) === 1).length;
  const deltaParallelUsed = validResults.filter((row) => Number(row.delta_stepping_parallel) === 1).length;

  const missRows = validResults
    .filter((row) => Number(row.auto_matches_winner) === 0)
    .sort((left, right) => {
      const leftPct = Number.isFinite(left.auto_vs_winner_pct) ? left.auto_vs_winner_pct : -Infinity;
      const rightPct = Number.isFinite(right.auto_vs_winner_pct) ? right.auto_vs_winner_pct : -Infinity;
      return rightPct - leftPct;
    });

  const missGroupMap = new Map();
  missRows.forEach((row) => {
    const sizeKey = summaryGroupSizeCategory(row.safeE);
    const groupKey = `${row.category} / ${row.lengthCategory} / ${sizeKey}`;
    const existing = missGroupMap.get(groupKey) ?? {
      count: 0,
      totalPenalty: 0,
      winners: new Set(),
      autos: new Set(),
    };
    existing.count += 1;
    existing.totalPenalty += Number.isFinite(row.auto_vs_winner_pct) ? row.auto_vs_winner_pct : 0;
    if (row.winner) existing.winners.add(REPORT_ENGINE_LABELS[row.winner] ?? row.winner);
    if (row.auto_engine) existing.autos.add(REPORT_ENGINE_LABELS[row.auto_engine] ?? row.auto_engine);
    missGroupMap.set(groupKey, existing);
  });

  const missGroups = Array.from(missGroupMap.entries())
    .map(([groupKey, stats]) => ({
      groupKey,
      count: stats.count,
      avgPenalty: stats.count > 0 ? stats.totalPenalty / stats.count : 0,
      winners: Array.from(stats.winners).sort(),
      autos: Array.from(stats.autos).sort(),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.avgPenalty - left.avgPenalty;
    });

  const missBinMap = new Map();
  missRows.forEach((row) => {
    const binKey = formatSelectorBins(row);
    const existing = missBinMap.get(binKey) ?? {
      count: 0,
      totalPenalty: 0,
      winners: new Set(),
      autos: new Set(),
    };
    existing.count += 1;
    existing.totalPenalty += Number.isFinite(row.auto_vs_winner_pct) ? row.auto_vs_winner_pct : 0;
    if (row.winner) existing.winners.add(REPORT_ENGINE_LABELS[row.winner] ?? row.winner);
    if (row.auto_engine) existing.autos.add(REPORT_ENGINE_LABELS[row.auto_engine] ?? row.auto_engine);
    missBinMap.set(binKey, existing);
  });

  const missBins = Array.from(missBinMap.entries())
    .map(([binKey, stats]) => ({
      binKey,
      count: stats.count,
      avgPenalty: stats.count > 0 ? stats.totalPenalty / stats.count : 0,
      winners: Array.from(stats.winners).sort(),
      autos: Array.from(stats.autos).sort(),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.avgPenalty - left.avgPenalty;
    });

  const lines = [];
  lines.push('# OMT Router Benchmark Report');
  lines.push('');
  lines.push('## Run Context');
  lines.push(`- generated_at: ${context.generatedAt ?? new Date().toISOString()}`);
  lines.push(`- mode: ${context.mode ?? 'unknown'}`);
  lines.push(`- runs_per_route: ${context.nRuns ?? 'unknown'}`);
  lines.push(`- routes_selected: ${context.routesSelected ?? safeResults.length}`);
  if (Array.isArray(context.selectedCategories) && context.selectedCategories.length > 0) {
    lines.push(`- categories: ${context.selectedCategories.join(', ')}`);
  }
  if (Array.isArray(context.selectedLengths) && context.selectedLengths.length > 0) {
    lines.push(`- lengths: ${context.selectedLengths.join(', ')}`);
  }
  lines.push('');
  lines.push('## Environment');
  lines.push(`- user_agent: ${context.userAgent ?? 'unknown'}`);
  lines.push(`- hardware_concurrency: ${context.hardwareConcurrency ?? 'unknown'}`);
  lines.push(`- cross_origin_isolated: ${String(context.crossOriginIsolated ?? false)}`);
  lines.push(`- shared_array_buffer: ${String(context.sharedArrayBuffer ?? false)}`);
  lines.push(`- barrier_parallel_used: ${barrierParallelUsed}/${validResults.length}`);
  lines.push(`- delta_parallel_used: ${deltaParallelUsed}/${validResults.length}`);
  lines.push('');
  lines.push('## Auto Selector');
  lines.push(`- coverage: ${selector.coverage}/${safeResults.length}`);
  lines.push(`- exact_hits: ${selector.exactHits} (${formatReportPercent(selector.exactPct)})`);
  lines.push(`- near_tie_hits: ${selector.nearTieHits} (${formatReportPercent(selector.nearPct)})`);
  lines.push(`- real_misses: ${selector.misses} (${formatReportPercent(selector.missPct)})`);
  lines.push('');
  lines.push('## Winner Counts');
  REPORT_ENGINE_ORDER.forEach((engineId) => {
    lines.push(`- ${REPORT_ENGINE_LABELS[engineId]}: ${winnerCounts[engineId]}`);
  });

  if (missGroups.length > 0) {
    lines.push('');
    lines.push('## Miss Pockets');
    missGroups.slice(0, 8).forEach((group) => {
      lines.push(
        `- ${group.groupKey}: ${group.count} misses, avg auto_vs_winner=${formatReportPercent(group.avgPenalty)}, auto=${group.autos.join('/') || 'n/a'}, winner=${group.winners.join('/') || 'n/a'}`,
      );
    });
  }

  if (missBins.length > 0) {
    lines.push('');
    lines.push('## Selector Bin Miss Pockets');
    lines.push('- bin format: sizeBand|beelineBand|densityBand|branchBand');
    missBins.slice(0, 8).forEach((bin) => {
      lines.push(
        `- ${bin.binKey}: ${bin.count} misses, avg auto_vs_winner=${formatReportPercent(bin.avgPenalty)}, auto=${bin.autos.join('/') || 'n/a'}, winner=${bin.winners.join('/') || 'n/a'}`,
      );
    });
  }

  lines.push('');
  lines.push('## Misses Table');
  lines.push('- includes all real misses (auto selector outside winner tolerance band)');
  lines.push('| route | category | length | size | selector_bin | radius | safeE | safeN | auto | winner | candidates | auto_vs_winner | timings |');
  lines.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: | --- |');
  if (missRows.length === 0) {
    lines.push('| none | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |');
  } else {
    missRows.forEach((row) => {
      const sizeKey = summaryGroupSizeCategory(row.safeE);
      const selectorBin = formatSelectorBins(row);
      const winnerCandidates = Array.isArray(row.winner_candidates) && row.winner_candidates.length > 0
        ? row.winner_candidates.map((engineId) => REPORT_ENGINE_LABELS[engineId] ?? engineId).join('/')
        : 'n/a';
      const cells = [
        truncateReportText(row.name, 40),
        row.category,
        row.lengthCategory,
        sizeKey,
        selectorBin,
        formatReportCount(row.radius),
        formatReportCount(row.safeE),
        formatReportCount(row.safeN),
        REPORT_ENGINE_LABELS[row.auto_engine] ?? row.auto_engine ?? 'n/a',
        REPORT_ENGINE_LABELS[row.winner] ?? row.winner ?? 'n/a',
        winnerCandidates,
        formatReportPercent(row.auto_vs_winner_pct),
        buildTimingSummary(row),
      ].map(toMarkdownCell);
      lines.push(`| ${cells.join(' | ')} |`);
    });
  }

  if (errorResults.length > 0) {
    lines.push('');
    lines.push('## Errors');
    errorResults.slice(0, 12).forEach((row) => {
      lines.push(`- ${truncateReportText(row.name, 48)}: ${truncateReportText(row.error, 140)}`);
    });
  }

  return lines.join('\n');
}

// ── CSV export ─────────────────────────────────────────────────────────────────

const CSV_COLS = [
  'id', 'name', 'category', 'lengthCategory',
  'radius',
  'safeN', 'safeE', 'safeBeelineKm',
  'avgOutDegree', 'edgesPerKm', 'nodesPerKm',
  'sizeRatioEN', 'beelinePerNode', 'relativeDensity', 'globalCoverage', 'emptyRatio',
  'sourceDegree', 'targetDegree', 'sourceCentrality', 'targetCentrality',
  'sourceTargetDegreeRatio', 'sourceTargetCentralityRatio', 'graphDensity', 'avgBranchFactor',
  'logN', 'logE', 'logBeelineKm', 'logEdgesPerKm', 'logNodesPerKm', 'logEoverN', 'logBeelinePerNode',
  'sizeBand', 'beelineBand', 'densityBand', 'coverageBand', 'emptyBand', 'branchBand',
  'signature', 'signatureExpanded',
  'fetchMs',
  'bidirectional_astar_ms', 'adaptive_barrier_ms', 'adaptive_barrier_parallel',
  'delta_stepping_ms', 'ultra_dijkstra_ms',
  'bidirectional_astar_cost', 'adaptive_barrier_cost', 'delta_stepping_cost', 'ultra_dijkstra_cost',
  'bidirectional_astar_error', 'adaptive_barrier_error', 'delta_stepping_error', 'ultra_dijkstra_error',
  'engine_errors',
  'auto_engine', 'auto_engine_ms', 'auto_vs_winner_pct', 'auto_matches_winner',
  'costWinner',
  'winner', 'error',
];

function escapeCSV(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Convert result rows to a CSV string.
 * @param {object[]} results
 * @returns {string}
 */
export function toCSV(results) {
  const header = CSV_COLS.join(',');
  const rows = results.map(r => CSV_COLS.map(k => escapeCSV(r[k])).join(','));
  return [header, ...rows].join('\n');
}

/**
 * Trigger a browser download of the CSV.
 * @param {object[]} results
 * @param {string} [filename]
 */
export function downloadCSV(results, filename = 'benchmark_results.csv') {
  const csv  = toCSV(results);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Chart.js scatter charts ───────────────────────────────────────────────────

const _ENGINE_CHART_META = [
  { id: 'bidirectional-astar', label: 'A★ (Bidirectional)', bg: 'rgba(59,130,246,0.75)',  border: '#1e40af' },
  { id: 'adaptive-barrier',    label: 'Barrier (SSP)',       bg: 'rgba(139,92,246,0.75)', border: '#5b21b6' },
  { id: 'delta-stepping',      label: 'Delta-Stepping',      bg: 'rgba(236,72,153,0.75)', border: '#831843' },
  { id: 'ultra-dijkstra',      label: 'Dijkstra (Ultra)',    bg: 'rgba(245,158,11,0.75)', border: '#92400e' },
];

function _fmtMsChart(v) {
  if (v == null || !Number.isFinite(v)) return '\u2014';
  if (v < 1)   return `${v.toFixed(3)}ms`;
  if (v < 10)  return `${v.toFixed(2)}ms`;
  if (v < 100) return `${v.toFixed(1)}ms`;
  return `${Math.round(v)}ms`;
}

function _buildTooltipLines(r) {
  const short = { 'bidirectional-astar': 'A★', 'adaptive-barrier': 'Barrier', 'delta-stepping': 'Delta', 'ultra-dijkstra': 'Dijkstra' };
  return [
    `${r.category} · ${r.lengthCategory}`,
    `radius: ${Number.isFinite(r.radius) ? r.radius : 'n/a'}  signature: ${r.signature ?? 'n/a'}`,
    `safeE: ${Number.isFinite(r.safeE) ? r.safeE.toLocaleString() : 'n/a'}  safeN: ${Number.isFinite(r.safeN) ? r.safeN.toLocaleString() : 'n/a'}`,
    `edges/km: ${Number.isFinite(r.edgesPerKm) ? r.edgesPerKm.toFixed(2) : 'n/a'}  avgBranch: ${Number.isFinite(r.avgBranchFactor) ? r.avgBranchFactor.toFixed(2) : 'n/a'}`,
    `A★: ${_fmtMsChart(r.bidirectional_astar_ms)}  Barrier: ${_fmtMsChart(r.adaptive_barrier_ms)}  Delta: ${_fmtMsChart(r.delta_stepping_ms)}  Dijkstra: ${_fmtMsChart(r.ultra_dijkstra_ms)}`,
    `Winner: ${short[r.winner] ?? 'n/a'}${r.engine_errors ? `  ⚠ ${r.engine_errors}` : ''}`,
  ];
}

const _SELECTOR_FEATURE_SCALES = [
  {
    xKey: 'coverageDensity',
    xLabel: 'Coverage density',
    yKey: 'coverageEmptyContrastTimesLogAvgBranchFactor',
    yLabel: 'Coverage-empty contrast × log avg branch',
  },
  {
    xKey: 'globalCoverageTimesEmptyRatio',
    xLabel: 'Global coverage × empty ratio',
    yKey: 'logGlobalCoverage',
    yLabel: 'Log global coverage',
  },
];

const _TIMING_BUBBLE_FEATURE = {
  xKey: 'coverageDensity',
  xLabel: 'Coverage density',
  yKey: 'logAvgBranchFactor',
  yLabel: 'Log avg branch factor',
};

function _getSelectorFeatureRow(row) {
  if (row._selectorFeatures) return row._selectorFeatures;
  const selectorMetrics = {
    edgeCount: Number.isFinite(row.safeE) ? row.safeE : Number.isFinite(row.E) ? row.E : 0,
    nodeCount: Number.isFinite(row.safeN) ? row.safeN : Number.isFinite(row.N) ? row.N : 1,
    haversineDistance: Number.isFinite(row.safeBeelineKm) ? row.safeBeelineKm * 1000 : null,
    averageNodeDegree: Number.isFinite(row.avgOutDegree) ? row.avgOutDegree : null,
    relativeDensity: Number.isFinite(row.relativeDensity) ? row.relativeDensity : null,
    globalCoverage: Number.isFinite(row.globalCoverage) ? row.globalCoverage : null,
    emptyRatio: Number.isFinite(row.emptyRatio) ? row.emptyRatio : null,
    nodeDegreeSource: Number.isFinite(row.sourceDegree) ? row.sourceDegree : null,
    nodeDegreeTarget: Number.isFinite(row.targetDegree) ? row.targetDegree : null,
    nodeCentralitySource: Number.isFinite(row.sourceCentrality) ? row.sourceCentrality : null,
    nodeCentralityTarget: Number.isFinite(row.targetCentrality) ? row.targetCentrality : null,
    sourceTargetDegreeRatio: Number.isFinite(row.sourceTargetDegreeRatio) ? row.sourceTargetDegreeRatio : null,
  };
  return row._selectorFeatures = classifySelectorFeatures(selectorMetrics);
}

function _featureForRow(row, key) {
  if (Number.isFinite(row[key])) return row[key];
  const features = _getSelectorFeatureRow(row);
  return Number.isFinite(features?.[key]) ? features[key] : null;
}

function _buildScatterDatasets(validResults, xKey, yKey) {
  const sets = _ENGINE_CHART_META.map(e => ({
    label: e.label,
    data: validResults
      .map((r) => ({
        x: _featureForRow(r, xKey),
        y: _featureForRow(r, yKey),
        route: r,
      }))
      .filter((pt) => pt.x != null && pt.y != null && pt.route.winner === e.id),
    backgroundColor: e.bg,
    borderColor: e.border,
    borderWidth: 1,
    pointRadius: 2,
    pointHoverRadius: 4,
  }));
  const errDs = {
    label: 'Error / N.A.',
    data: validResults
      .map((r) => ({
        x: _featureForRow(r, xKey),
        y: _featureForRow(r, yKey),
        route: r,
      }))
      .filter((pt) => pt.x != null && pt.y != null && !pt.route.winner),
    backgroundColor: 'rgba(148,163,184,0.5)',
    borderColor: '#64748b',
    borderWidth: 1,
    pointRadius: 2,
    pointHoverRadius: 4,
  };
  if (errDs.data.length > 0) sets.push(errDs);
  return sets.filter(ds => ds.data.length > 0);
}

const _TOOLTIP_OPTS = {
  mode: 'nearest',
  intersect: true,
  callbacks: {
    title(items) { return items[0]?.raw?.route?.name ?? ''; },
    label(item) {
      const r = item.raw?.route;
      return r ? _buildTooltipLines(r) : [];
    },
    labelColor(item) {
      return { borderColor: item.dataset.borderColor, backgroundColor: item.dataset.backgroundColor };
    },
  },
  bodyFont: { size: 11 },
  titleFont: { size: 12, weight: 'bold' },
  padding: 10,
  backgroundColor: 'rgba(15,23,42,0.92)',
  titleColor: '#f1f5f9',
  bodyColor: '#cbd5e1',
};

function _logAxis(title, tickFn) {
  return {
    type: 'logarithmic',
    title: { display: true, text: title, font: { weight: '600', size: 12 }, color: '#475569' },
    ticks: { callback: tickFn, color: '#64748b', font: { size: 11 } },
    grid: { color: '#e2e8f0' },
  };
}

function _linearAxis(title, tickFn) {
  return {
    type: 'linear',
    min: 0,
    title: { display: true, text: title, font: { weight: '600', size: 12 }, color: '#475569' },
    ticks: { callback: tickFn, color: '#64748b', font: { size: 11 } },
    grid: { color: '#e2e8f0' },
  };
}

function _upsertScatter(canvas, datasets, xScale, yScale, existingChart) {
  if (existingChart) {
    existingChart.data.datasets = datasets;
    existingChart.update('none');
    return existingChart;
  }
  return new Chart(canvas, {
    type: 'scatter',
    data: { datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      scales: { x: xScale, y: yScale },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
        tooltip: _TOOLTIP_OPTS,
      },
    },
  });
}

function _buildHistogramBins(values, binCount = 12) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ min, max, label: `${Number(min.toPrecision(3))}` }];
  }
  const step = (max - min) / binCount;
  return Array.from({ length: binCount }, (_, idx) => {
    const low = min + idx * step;
    const high = idx === binCount - 1 ? max : low + step;
    const lowLabel = Number(low.toPrecision(3));
    const highLabel = Number(high.toPrecision(3));
    return {
      min: low,
      max: high,
      label: idx === binCount - 1 ? `${lowLabel}–${highLabel}` : `${lowLabel}–${highLabel}`,
    };
  });
}

function _buildHistogramDatasets(results, featureKey, binCount = 12) {
  const valid = results.filter((r) => _featureForRow(r, featureKey) != null);
  const values = valid.map((r) => _featureForRow(r, featureKey));
  const bins = _buildHistogramBins(values, binCount);
  const binLabels = bins.map((bin) => bin.label);
  const allBuckets = new Map([
    ..._ENGINE_CHART_META.map((engine) => [engine.id, Array.from({ length: bins.length }, () => 0)]),
    [null, Array.from({ length: bins.length }, () => 0)],
  ]);

  valid.forEach((row) => {
    const value = _featureForRow(row, featureKey);
    const bucket = bins.findIndex((bin, index) => (index === bins.length - 1 ? value <= bin.max : value < bin.max) && value >= bin.min);
    const winner = row.winner && allBuckets.has(row.winner) ? row.winner : null;
    if (bucket >= 0) {
      allBuckets.get(winner)[bucket] += 1;
    }
  });

  const datasets = [..._ENGINE_CHART_META, { id: null, label: 'No winner / error', bg: 'rgba(148,163,184,0.7)', border: '#64748b' }]
    .map((engine) => ({
      label: engine.label,
      data: allBuckets.get(engine.id),
      backgroundColor: engine.bg,
      borderColor: engine.border,
      borderWidth: 1,
    }))
    .filter((ds) => ds.data.some((count) => count > 0));

  return { labels: binLabels, datasets };
}

function _upsertBar(canvas, labels, datasets, xLabel, yLabel, existingChart) {
  if (existingChart) {
    existingChart.data.labels = labels;
    existingChart.data.datasets = datasets;
    existingChart.update('none');
    return existingChart;
  }
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: {
          title: { display: true, text: xLabel, font: { weight: '600', size: 12 }, color: '#475569' },
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { color: '#e2e8f0' },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: yLabel, font: { weight: '600', size: 12 }, color: '#475569' },
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { color: '#e2e8f0' },
        },
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
        tooltip: {
          callbacks: {
            label(item) {
              return `${item.dataset.label}: ${item.parsed.y.toLocaleString()} routes`;
            },
          },
        },
      },
    },
  });
}

function _routeTimingMetrics(row) {
  const timeKeys = [
    'bidirectional_astar_ms',
    'adaptive_barrier_ms',
    'delta_stepping_ms',
    'ultra_dijkstra_ms',
  ];
  const times = timeKeys
    .map((key) => Number.isFinite(row[key]) ? row[key] : null)
    .filter(Number.isFinite);
  if (!times.length) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const fastestMs = sorted[0];
  const secondBestMs = sorted.length > 1 ? sorted[1] : null;
  const winnerMarginMs = secondBestMs != null ? Math.max(0, secondBestMs - fastestMs) : null;
  const winnerMarginPct = winnerMarginMs != null && fastestMs > 0 ? round4(winnerMarginMs / fastestMs) : null;
  return { fastestMs, winnerMarginMs, winnerMarginPct };
}

function _bubbleRadiusForFastestMs(fastestMs) {
  if (!Number.isFinite(fastestMs)) return 4;
  return Math.min(12, Math.max(4, Math.sqrt(fastestMs) * 0.9));
}

function _bubbleRadiusForWinnerMarginPct(winnerMarginPct) {
  if (!Number.isFinite(winnerMarginPct)) return 4;
  return Math.min(14, Math.max(4, 4 + winnerMarginPct * 18));
}

function _buildBubbleDatasets(validResults, xKey, yKey) {
  const sets = _ENGINE_CHART_META.map((engine) => ({
    label: engine.label,
    data: validResults
      .map((r) => {
        const timing = _routeTimingMetrics(r);
        const x = _featureForRow(r, xKey);
        const y = _featureForRow(r, yKey);
        return timing && x != null && y != null
          ? { x, y, r: _bubbleRadiusForWinnerMarginPct(timing.winnerMarginPct), route: r, timing }
          : null;
      })
      .filter((pt) => pt && pt.route.winner === engine.id),
    backgroundColor: engine.bg.replace(/0\.75\)$/, '0.2)'),
    borderColor: engine.border,
    borderWidth: 1,
  }));
  const errData = validResults
    .map((r) => {
      const timing = _routeTimingMetrics(r);
      const x = _featureForRow(r, xKey);
      const y = _featureForRow(r, yKey);
      return timing && x != null && y != null
        ? { x, y, r: _bubbleRadiusForWinnerMarginPct(timing.winnerMarginPct), route: r, timing }
        : null;
    })
    .filter((pt) => pt && !pt.route.winner);
  if (errData.length > 0) {
    sets.push({
      label: 'No winner / error',
      data: errData,
      backgroundColor: 'rgba(148,163,184,0.2)',
      borderColor: '#64748b',
      borderWidth: 1,
    });
  }
  return sets.filter((ds) => ds.data.length > 0);
}

function _upsertBubble(canvas, datasets, xScale, yScale, existingChart) {
  if (existingChart) {
    existingChart.data.datasets = datasets;
    existingChart.update('none');
    return existingChart;
  }
  return new Chart(canvas, {
    type: 'bubble',
    data: { datasets },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      scales: { x: xScale, y: yScale },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
        tooltip: {
          callbacks: {
            title(items) {
              return items[0]?.raw?.route?.name ?? '';
            },
            label(item) {
              const route = item.raw?.route;
              const timing = item.raw?.timing;
              const valueX = Number(item.raw?.x);
              const valueY = Number(item.raw?.y);
              if (!route || !timing) return [];
              return [
                `${route.category} · ${route.lengthCategory}`,
                `x: ${Number.isFinite(valueX) ? Number(valueX.toPrecision(3)) : 'n/a'}`,
                `y: ${Number.isFinite(valueY) ? Number(valueY.toPrecision(3)) : 'n/a'}`,
                `fastest: ${_fmtMsChart(timing.fastestMs)}`,
                `margin: ${timing.winnerMarginPct != null ? `${Math.round(timing.winnerMarginPct * 100)}%` : 'n/a'}`,
              ];
            },
          },
        },
      },
    },
  });
}

/**
 * Create or update a Chart.js scatter plot of Edges vs Beeline distance.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} results
 * @param {object} [_opts]           - unused, kept for API compatibility
 * @param {Chart|null} [existingChart] - pass previous instance to update in-place
 * @returns {Chart}
 */
export function drawScatter(canvas, results, _opts = {}, existingChart = null) {
  const feature = _SELECTOR_FEATURE_SCALES[0];
  const valid = results.filter((r) => _featureForRow(r, feature.xKey) != null && _featureForRow(r, feature.yKey) != null);
  const datasets = _buildScatterDatasets(valid, feature.xKey, feature.yKey);
  const xScale = _linearAxis(feature.xLabel, (v) => (Number.isFinite(v) ? Number(v.toPrecision(3)) : ''));
  const yScale = _linearAxis(feature.yLabel, (v) => (Number.isFinite(v) ? Number(v.toPrecision(3)) : ''));
  return _upsertScatter(canvas, datasets, xScale, yScale, existingChart);
}

/**
 * Create or update a Chart.js scatter plot of Edges/km vs Avg out-degree.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} results
 * @param {object} [_opts]             - unused
 * @param {Chart|null} [existingChart] - pass previous instance to update in-place
 * @returns {Chart}
 */
export function drawDensityScatter(canvas, results, _opts = {}, existingChart = null) {
  const feature = _SELECTOR_FEATURE_SCALES[1];
  const valid = results.filter((r) => _featureForRow(r, feature.xKey) != null && _featureForRow(r, feature.yKey) != null);
  const datasets = _buildScatterDatasets(valid, feature.xKey, feature.yKey);
  const xScale = _linearAxis(feature.xLabel, (v) => (Number.isFinite(v) ? Number(v.toPrecision(3)) : ''));
  const yScale = _linearAxis(feature.yLabel, (v) => (Number.isFinite(v) ? Number(v.toPrecision(3)) : ''));
  return _upsertScatter(canvas, datasets, xScale, yScale, existingChart);
}

export function drawFeatureHistogram(canvas, results, _opts = {}, existingChart = null) {
  const feature = _SELECTOR_FEATURE_SCALES[0];
  const { labels, datasets } = _buildHistogramDatasets(results, feature.xKey, 14);
  return _upsertBar(canvas, labels, datasets, feature.xLabel, 'Routes', existingChart);
}

export function drawTimingBubble(canvas, results, _opts = {}, existingChart = null) {
  const feature = _TIMING_BUBBLE_FEATURE;
  const valid = results.filter((r) => _featureForRow(r, feature.xKey) != null && _featureForRow(r, feature.yKey) != null && _routeTimingMetrics(r));
  const datasets = _buildBubbleDatasets(valid, feature.xKey, feature.yKey);
  const xScale = _linearAxis(feature.xLabel, (v) => (Number.isFinite(v) ? Number(v.toPrecision(3)) : ''));
  const yScale = _linearAxis(feature.yLabel, (v) => (Number.isFinite(v) ? Number(v.toPrecision(3)) : ''));
  return _upsertBubble(canvas, datasets, xScale, yScale, existingChart);
}

/**
 * @deprecated Chart.js handles tooltips natively. Retained for API compatibility.
 * @returns {() => void} no-op cleanup
 */
export function installTooltip(_canvas, _results, _tooltipEl) {
  return () => {};
}

// ── Threshold suggestion ───────────────────────────────────────────────────────

/**
 * Legacy function stub for backward compatibility.
 * Multi-engine threshold suggestion is not applicable.
 * @param {object[]} results
 * @returns {{ suggestedE: null, suggestedBeelineM: null, stats: object }}
 */
export function suggestThresholds(_results) {
  // Multi-engine comparison doesn't use threshold-based dispatch
  return { suggestedE: null, suggestedBeelineM: null, stats: {} };
}
