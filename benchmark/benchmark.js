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

import { buildCH, queryRoute, nearestNode } from '../src/chRouter.js';
import { buildGraphAsync } from '../src/graphBuilder.js';
import { getTilesAlongLine } from '../src/tilesManager.js';
import { interpolate, haversineDistance } from '../src/utils/misc.js';
import { PowerPool } from 'performance-helpers/powerPool';
import { PowerCache } from 'performance-helpers/powerCache';
import tilesWorker from '../src/workers/tilesWorker?worker&inline';

// ── Shared singletons (created once, reused across all routes) ────────────────
let _pool = null;
let _cache = null;

function getSharedPool() {
  if (!_pool) {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
    _pool = new PowerPool(tilesWorker, {
      size: hw, maxSize: hw, lazy: false,
      autoScale: true, idleTimeout: 600_000,
    });
  }
  return _pool;
}

function getSharedCache() {
  if (!_cache) {
    _cache = new PowerCache({ maxEntries: 10_000, defaultTTL: 600_000 });
  }
  return _cache;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function median(arr) {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round2(x) { return Math.round(x * 100) / 100; }

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
 * Run `nRuns` round-trips with a forced engine and return the median time (ms).
 * First call is a warm-up and is excluded from timing.
 *
 * @returns {{ medianMs: number, engine: string, found: boolean }}
 */
async function timeEngine(startId, endId, prepared, engine, nRuns) {
  // Warm-up — primes GPU field cache / JIT on the first call
  const warmResult = await queryRoute(startId, endId, prepared, { forceEngine: engine });

  const times = [];
  for (let i = 0; i < nRuns; i++) {
    const t0 = performance.now();
    await queryRoute(startId, endId, prepared, { forceEngine: engine });
    times.push(performance.now() - t0);
  }

  return { medianMs: round2(median(times)), engine: warmResult.engine, found: warmResult.found };
}

// ── Single route benchmark ─────────────────────────────────────────────────────

/**
 * Fetch tiles, build graph, time CPU and GPU for one route definition.
 *
 * @param {object} routeDef
 * @param {string} urlTemplate
 * @param {string} mode        - 'car' | 'pedestrian' | 'bicycle'
 * @param {number} zoom
 * @param {number} nRuns       - measurement repetitions (excluding warm-up)
 * @param {object} pool
 * @param {object} cache
 * @returns {object} result row
 */
async function benchmarkSingleRoute(routeDef, urlTemplate, mode, zoom, nRuns, pool, cache) {
  const { id, name, category, lengthCategory, start, end, forceRadius } = routeDef;

  const beelineM = Math.round(haversineDistance(start, end));
  const radius = forceRadius ?? computeRadius(start, end, zoom);

  // ── Fetch tiles & build graph ───────────────────────────────────────────────
  const tileList = getTilesAlongLine(start, end, zoom, radius);
  const tiles = tileList.map(t => ({
    ...t,
    url: interpolate(urlTemplate, { z: t.z, x: t.x, y: t.y }),
  }));

  const tFetch0 = performance.now();
  const graph = await buildGraphAsync(tiles, mode, { pool, cache });
  const fetchMs = round2(performance.now() - tFetch0);

  // Prepare (build CH / CSR structures)
  const prepared = buildCH(graph);
  const { N, E } = prepared;

  // Nearest nodes
  const startId = nearestNode(start, graph);
  const endId   = nearestNode(end, graph);

  if (startId === -1 || endId === -1) {
    return {
      id, name, category, lengthCategory,
      beelineM, N, E, radius,
      fetchMs,
      cpu_ms: null, gpu_ms: null,
      cpuFound: false, gpuFound: false,
      winner: null, speedup: null,
      error: 'no_node',
    };
  }

  // ── CPU timing ─────────────────────────────────────────────────────────────
  const cpu = await timeEngine(startId, endId, prepared, 'cpu', nRuns);

  // ── GPU timing ─────────────────────────────────────────────────────────────
  let gpuResult = null;
  let gpuError  = null;
  try {
    gpuResult = await timeEngine(startId, endId, prepared, 'gpu', nRuns);
    // If GPU fell back to CPU (WebGPU unavailable), mark it explicitly
    if (gpuResult.engine === 'cpu') gpuError = 'webgpu_unavailable';
  } catch (err) {
    gpuError = err.message ?? String(err);
  }

  const cpu_ms = cpu.medianMs;
  const gpu_ms = gpuResult && !gpuError ? gpuResult.medianMs : null;

  const winner = gpu_ms !== null
    ? (gpu_ms < cpu_ms ? 'gpu' : 'cpu')
    : 'cpu';

  const speedup = gpu_ms !== null
    ? round2(cpu_ms / gpu_ms)   // > 1 means GPU is faster
    : null;

  return {
    id, name, category, lengthCategory,
    beelineM, N, E, radius,
    fetchMs,
    cpu_ms,
    gpu_ms,
    cpuFound: cpu.found,
    gpuFound: gpuResult ? gpuResult.found : false,
    winner,
    speedup,
    gpuError,
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
 * @param {number}   config.nRuns       - Timing repetitions per engine (default 3)
 *
 * @param {function} onProgress         - Called after each route with progress info:
 *   { current, total, routeName, result, results }
 *
 * @returns {Promise<object[]>} Array of result rows
 */
export async function runBenchmark(config, onProgress = () => {}) {
  const { routes, urlTemplate, mode = 'car', zoom = 14, nRuns = 3 } = config;

  const pool  = getSharedPool();
  const cache = getSharedCache();
  const results = [];

  for (let i = 0; i < routes.length; i++) {
    const routeDef = routes[i];
    onProgress({ current: i, total: routes.length, routeName: routeDef.name, results });

    let result;
    try {
      result = await benchmarkSingleRoute(routeDef, urlTemplate, mode, zoom, nRuns, pool, cache);
    } catch (err) {
      result = {
        id: routeDef.id, name: routeDef.name,
        category: routeDef.category, lengthCategory: routeDef.lengthCategory,
        beelineM: Math.round(haversineDistance(routeDef.start, routeDef.end)),
        N: null, E: null, radius: null,
        fetchMs: null, cpu_ms: null, gpu_ms: null,
        cpuFound: false, gpuFound: false,
        winner: null, speedup: null,
        error: err.message ?? String(err),
      };
    }

    results.push(result);
    onProgress({ current: i + 1, total: routes.length, routeName: routeDef.name, result, results });
  }

  onProgress({ current: routes.length, total: routes.length, done: true, results });
  return results;
}

// ── CSV export ─────────────────────────────────────────────────────────────────

const CSV_COLS = [
  'id', 'name', 'category', 'lengthCategory',
  'beelineM', 'N', 'E', 'radius',
  'fetchMs', 'cpu_ms', 'gpu_ms',
  'cpuFound', 'gpuFound', 'winner', 'speedup', 'gpuError', 'error',
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

// ── Scatter plot renderer ──────────────────────────────────────────────────────

/**
 * Render a log–log scatter plot on a <canvas> element.
 *
 * X axis: E (edge count)  — log scale
 * Y axis: beeline_m       — log scale
 * Point color: speedup ratio (cpu_ms / gpu_ms)
 *   > 2      deep green   (GPU clearly wins)
 *   1 – 2    light green  (GPU slightly wins)
 *   0.5 – 1  light red    (CPU slightly wins)
 *   < 0.5    deep red     (CPU clearly wins)
 *   null     gray         (no GPU data)
 *
 * Reference lines drawn at gpuMinEdges and gpuMinBeelineM.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} results
 * @param {{ gpuMinEdges: number, gpuMinBeelineM: number }} thresholds
 */
export function drawScatter(canvas, results, { gpuMinEdges = 80_000, gpuMinBeelineM = 3_000 } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Layout margins
  const ML = 64, MR = 24, MT = 32, MB = 56;
  const PW = W - ML - MR, PH = H - MT - MB;

  // Log scale helpers
  const E_MIN   = 1_000,  E_MAX   = 1_000_000;
  const BL_MIN  = 50,     BL_MAX  = 60_000;
  const logX = v => (Math.log10(Math.max(E_MIN, v))  - Math.log10(E_MIN))  / (Math.log10(E_MAX)  - Math.log10(E_MIN));
  const logY = v => (Math.log10(Math.max(BL_MIN, v)) - Math.log10(BL_MIN)) / (Math.log10(BL_MAX) - Math.log10(BL_MIN));
  const toCanvasX = v => ML + logX(v) * PW;
  const toCanvasY = v => MT + PH - logY(v) * PH;   // Y inverted (top = large)

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ML, MT, PW, PH);

  // ── Grid lines ────────────────────────────────────────────────────────────
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;

  const xTicks = [1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];
  const yTicks = [50, 100, 500, 1_000, 5_000, 10_000, 50_000];

  xTicks.forEach(v => {
    const x = toCanvasX(v);
    ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, MT + PH); ctx.stroke();
  });
  yTicks.forEach(v => {
    const y = toCanvasY(v);
    ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + PW, y); ctx.stroke();
  });

  // ── Threshold reference lines ─────────────────────────────────────────────
  ctx.save();
  ctx.setLineDash([6, 3]);
  ctx.lineWidth = 1.5;

  // Vertical: E threshold
  ctx.strokeStyle = '#6366f1';
  const xTh = toCanvasX(gpuMinEdges);
  ctx.beginPath(); ctx.moveTo(xTh, MT - 8); ctx.lineTo(xTh, MT + PH); ctx.stroke();

  // Horizontal: beeline threshold
  ctx.strokeStyle = '#f59e0b';
  const yTh = toCanvasY(gpuMinBeelineM);
  ctx.beginPath(); ctx.moveTo(ML, yTh); ctx.lineTo(ML + PW + 8, yTh); ctx.stroke();

  ctx.restore();

  // Threshold labels
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#6366f1';
  ctx.fillText(`E=${(gpuMinEdges / 1000).toFixed(0)}k`, xTh + 4, MT + 14);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(`${(gpuMinBeelineM / 1000).toFixed(1)} km`, ML + PW + 10, yTh + 4);

  // ── Axes border ───────────────────────────────────────────────────────────
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(ML, MT, PW, PH);

  // ── Axis tick labels ──────────────────────────────────────────────────────
  ctx.fillStyle = '#64748b';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';

  xTicks.forEach(v => {
    const x = toCanvasX(v);
    const label = v >= 1_000_000 ? `${v/1_000_000}M`
                : v >= 1_000    ? `${v/1_000}k`
                : String(v);
    ctx.fillText(label, x, MT + PH + 16);
  });

  ctx.textAlign = 'right';
  yTicks.forEach(v => {
    const y = toCanvasY(v);
    const label = v >= 1_000 ? `${v/1_000}km` : `${v}m`;
    ctx.fillText(label, ML - 6, y + 4);
  });

  // Axis titles
  ctx.save();
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'center';
  ctx.fillText('Edges (E)', ML + PW / 2, H - 8);
  ctx.translate(16, MT + PH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Beeline (m)', 0, 0);
  ctx.restore();

  // ── Plot points ───────────────────────────────────────────────────────────
  const validResults = results.filter(r => r.E != null && r.beelineM != null);

  validResults.forEach(r => {
    const cx = toCanvasX(r.E);
    const cy = toCanvasY(r.beelineM);

    // Color by speedup
    let fill, stroke;
    if (r.speedup === null || r.gpuError) {
      fill = '#94a3b8'; stroke = '#64748b';   // gray — no GPU data
    } else if (r.speedup >= 3) {
      fill = '#16a34a'; stroke = '#15803d';   // deep green — GPU wins strongly
    } else if (r.speedup >= 1.2) {
      fill = '#4ade80'; stroke = '#22c55e';   // light green — GPU wins
    } else if (r.speedup >= 0.8) {
      fill = '#fbbf24'; stroke = '#f59e0b';   // yellow — roughly tied
    } else if (r.speedup >= 0.4) {
      fill = '#fb923c'; stroke = '#f97316';   // orange — CPU wins
    } else {
      fill = '#ef4444'; stroke = '#dc2626';   // red — CPU wins strongly
    }

    // Shape by category
    const R = 6;
    ctx.beginPath();
    if (r.category === 'city-center') {
      ctx.rect(cx - R, cy - R, R * 2, R * 2);         // square
    } else if (r.category === 'city-consolidated') {
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx + R, cy + R);
      ctx.lineTo(cx - R, cy + R);
      ctx.closePath();                                  // triangle
    } else if (r.category === 'suburban') {
      // Diamond
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx + R, cy);
      ctx.lineTo(cx, cy + R);
      ctx.lineTo(cx - R, cy);
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, R, 0, Math.PI * 2);              // circle (countryside)
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  });

  // ── Legend ────────────────────────────────────────────────────────────────
  const legendItems = [
    { shape: 'rect',     label: 'city-center',        fill: '#e2e8f0', stroke: '#64748b' },
    { shape: 'triangle', label: 'city-consolidated',  fill: '#e2e8f0', stroke: '#64748b' },
    { shape: 'diamond',  label: 'suburban',           fill: '#e2e8f0', stroke: '#64748b' },
    { shape: 'circle',   label: 'countryside',        fill: '#e2e8f0', stroke: '#64748b' },
    null,
    { shape: 'circle', label: 'GPU wins (3×+)',  fill: '#16a34a', stroke: '#15803d' },
    { shape: 'circle', label: 'GPU wins (1.2×)', fill: '#4ade80', stroke: '#22c55e' },
    { shape: 'circle', label: '~Tied',           fill: '#fbbf24', stroke: '#f59e0b' },
    { shape: 'circle', label: 'CPU wins',        fill: '#fb923c', stroke: '#f97316' },
    { shape: 'circle', label: 'CPU wins (2×+)',  fill: '#ef4444', stroke: '#dc2626' },
    { shape: 'circle', label: 'No GPU data',     fill: '#94a3b8', stroke: '#64748b' },
  ];

  const LX = ML + PW + MR + 4;
  if (LX + 110 <= W) {
    // Draw legend only if there's room
  }
  // Legend is rendered as a floating HTML overlay (see index.html) — skip canvas legend here
}

// ── Tooltip support ───────────────────────────────────────────────────────────

/**
 * Install a mousemove listener on `canvas` that shows a tooltip for the
 * nearest data point.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object[]} results
 * @param {HTMLElement} tooltipEl  - element to update with innerHTML
 * @returns {() => void}           - cleanup function (removes listener)
 */
export function installTooltip(canvas, results, tooltipEl) {
  const W = canvas.width, H = canvas.height;
  const ML = 64, MR = 24, MT = 32, MB = 56;
  const PW = W - ML - MR, PH = H - MT - MB;

  const E_MIN   = 1_000,  E_MAX   = 1_000_000;
  const BL_MIN  = 50,     BL_MAX  = 60_000;
  const logX = v => (Math.log10(Math.max(E_MIN, v))  - Math.log10(E_MIN))  / (Math.log10(E_MAX)  - Math.log10(E_MIN));
  const logY = v => (Math.log10(Math.max(BL_MIN, v)) - Math.log10(BL_MIN)) / (Math.log10(BL_MAX) - Math.log10(BL_MIN));
  const toCanvasX = v => ML + logX(v) * PW;
  const toCanvasY = v => MT + PH - logY(v) * PH;

  const validResults = results.filter(r => r.E != null && r.beelineM != null);

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top)  * (H / rect.height);

    let best = null, bestDist = Infinity;
    for (const r of validResults) {
      const dx = toCanvasX(r.E) - mx;
      const dy = toCanvasY(r.beelineM) - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; best = r; }
    }

    if (best && bestDist < 20) {
      const cpuLabel   = best.cpu_ms != null ? `${best.cpu_ms} ms` : '—';
      const gpuLabel   = best.gpu_ms != null ? `${best.gpu_ms} ms` : (best.gpuError ?? 'unavailable');
      const speedLabel = best.speedup != null ? `${best.speedup}×` : '—';
      tooltipEl.hidden = false;
      tooltipEl.innerHTML = `
        <strong>${best.name}</strong><br>
        ${best.category} · ${best.lengthCategory}<br>
        Beeline: ${best.beelineM} m &nbsp; E: ${best.E?.toLocaleString()} &nbsp; N: ${best.N?.toLocaleString()}<br>
        CPU: ${cpuLabel} &nbsp; GPU: ${gpuLabel} &nbsp; Speedup: ${speedLabel}<br>
        Winner: <strong>${best.winner ?? '—'}</strong>${best.error ? ` ⚠ ${best.error}` : ''}
      `;
      tooltipEl.style.left = `${e.clientX + 12}px`;
      tooltipEl.style.top  = `${e.clientY - 10}px`;
    } else {
      tooltipEl.hidden = true;
    }
  }

  canvas.addEventListener('mousemove', onMouseMove);
  return () => canvas.removeEventListener('mousemove', onMouseMove);
}

// ── Threshold suggestion ───────────────────────────────────────────────────────

/**
 * Given benchmark results, suggest new threshold values that minimize
 * misclassifications (routing to wrong engine).
 *
 * Strategy: sweep candidate E thresholds and beeline thresholds independently,
 * find the combination that maximizes correct decisions (true GPU wins / true
 * CPU wins) over measured data points.
 *
 * @param {object[]} results
 * @returns {{ suggestedE: number|null, suggestedBeelineM: number|null, stats: object }}
 */
export function suggestThresholds(results) {
  const valid = results.filter(r => r.speedup !== null && r.E != null && r.beelineM != null);
  if (valid.length === 0) return { suggestedE: null, suggestedBeelineM: null, stats: {} };

  const Es = [...new Set(valid.map(r => r.E))].sort((a, b) => a - b);
  const Bs = [...new Set(valid.map(r => r.beelineM))].sort((a, b) => a - b);

  // For each candidate threshold pair, count correct decisions:
  // "correct" = (rule says GPU AND speedup≥1) OR (rule says CPU AND speedup<1)
  // Rule: use GPU if E ≥ E_thresh AND beeline ≥ B_thresh
  let bestScore = -1, bestE = null, bestB = null;

  // Candidate thresholds: unique E/beeline values in data, plus some extras
  const eCandidates = [0, ...Es];
  const bCandidates = [0, ...Bs];

  for (const eT of eCandidates) {
    for (const bT of bCandidates) {
      let correct = 0;
      for (const r of valid) {
        const ruleGPU = r.E >= eT && r.beelineM >= bT;
        const actualGPU = r.speedup >= 1.0;   // GPU is faster or equal
        if (ruleGPU === actualGPU) correct++;
      }
      if (correct > bestScore) { bestScore = correct; bestE = eT; bestB = bT; }
    }
  }

  const gpuPoints  = valid.filter(r => r.speedup >= 1.0).length;
  const cpuPoints  = valid.filter(r => r.speedup < 1.0).length;

  return {
    suggestedE: bestE,
    suggestedBeelineM: bestB,
    stats: {
      totalPoints: valid.length,
      gpuWinsCount: gpuPoints,
      cpuWinsCount: cpuPoints,
      correctDecisions: bestScore,
      accuracy: Math.round((bestScore / valid.length) * 100),
    },
  };
}
