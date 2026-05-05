# Benchmark Workflow

This folder contains tools to benchmark routing engines and turn benchmark data into selector tuning rules that can be applied in the library.

## Target of this workflow

The benchmark + analysis flow is not just for "finding the fastest engine overall".
Its real target is to build a deployable selection policy that:
- chooses a good engine by route/graph profile (instead of one global winner),
- works for both sab_off (serial runtime) and sab_on (parallel-capable runtime),
- controls risk (regret and misses), not only average runtime,
- emits a ready-to-use tuning module for runtime selection in the library.

## What each script does

### benchmark/cli-runner.js (Node.js CLI runner)

**Purpose:**
- Standalone Node.js benchmark runner for automated, headless benchmarking.
- Runs routes and collects timing data without requiring a browser.
- Features tile caching to avoid redundant downloads and multi-core parallelization.
- Generates benchmark JSON artifacts compatible with Python analysis scripts.

**Usage:**

```bash
# Run full benchmark (all routes) with serial profile
npm run benchmark

# Run quick benchmark (100 routes only)
npm run benchmark:quick

# Run with parallelization (uses 75% of CPU cores, capped at 12)
node benchmark/cli-runner.js --routes 500 --workers 8 --verbose

# Use custom tile cache location
node benchmark/cli-runner.js --cache-dir /mnt/fast-ssd/tiles --workers 12

# See all options
node benchmark/cli-runner.js --help
```

**Key Features:**

1. **Tile Caching** — Persistent file-system cache prevents re-downloading tiles
   - Default cache location: `/tmp/omp-router-tiles`
   - Custom location: `--cache-dir /path/to/cache`
   - Cache stats included in output (hit rate, misses)

2. **Multi-Core Parallelization** — Distributes routes across worker threads
   - Automatically detects CPU cores (uses 75% of available, capped at 12)
   - Custom worker count: `--workers N`
   - Smart batch sizing for optimal throughput
   - On a 24-core machine: parallelizes with up to 12 workers

**Options:**
- `--profile serial|parallel` — Runtime profile (default: serial)
- `--routes N` — Number of routes to run (default: all 3,950)
- `--output FILE` — Custom output file path
- `--cache-dir DIR` — Tile cache directory (default: /tmp/omp-router-tiles)
- `--workers N` — Number of parallel workers (default: auto-detect, ~75% of cores)
- `--verbose` — Verbose console output
- `--help` — Show help

**Output:**
- Results saved to `benchmark/results/TIMESTAMP_benchmark_car_PROFILE.json`
- Includes cache stats and worker count metadata
- Same format as browser benchmark, compatible with Python analysis scripts

**Performance Tips:**
- Use `--workers 12` on a 24-core machine for ~12× speedup
- Cache is persistent across runs; first run populates it, subsequent runs hit cache
- For CI/CD, use `--cache-dir` on a fast volume (SSD, tmpfs) for best performance
- Monitor cache hit rate: high hit rate = lower time, lower I/O

**When to use:**
- Automated CI/CD benchmarking
- Quick smoke tests (use `--routes 100 --workers 4`)
- Batch running multiple profiles programmatically
- Large-scale benchmarks requiring parallelization

---

### benchmark/index.html + benchmark/benchmark.js (Browser UI)

Purpose:
- Runs route benchmarks across engine implementations used by the library.
- Collects route-level timing and winner data.
- Saves benchmark artifacts as JSON files in benchmark/results.

What you get:
- One JSON per run profile, typically serial and parallel variants.
- Files named like: YYYYMMDD_HHMMSS_benchmark_car_serial.json and YYYYMMDD_HHMMSS_benchmark_car_parallel.json.

### benchmark/cluster_engine_selector.py

Purpose:
- Loads benchmark JSON files (default: benchmark/results/*.json).
- Builds route-level features and clusters route families.
- Produces tuned selector recommendations for sab_off and sab_on profiles.
- Produces a generated tuning module that can be copied into src/tuning.js.

What you get (default output directory: benchmark/results/analysis):
- engine_selector_clustering_TIMESTAMP.json
- engine_selector_clustering_TIMESTAMP.md
- tuning_TIMESTAMP.js

How it works (logic and algorithms):
1. Ingest and normalize benchmark rows.
- Reads benchmark JSONs and extracts route-level rows from clustering data.
- Splits analysis by runtime profile: sab_off and sab_on.

2. Build feature space for route families.
- Uses graph and route descriptors such as beeline distance, node/edge counts, density-like features, and branch factor.
- Applies scaling and optional PCA (default target variance is configured in CLI).

3. Discover clusters with unsupervised models.
- Explores clustering configurations and model families (KMeans, GMM, Bayesian GMM).
- Filters out invalid clusterings (for example, tiny clusters below minimum size).
- Uses a model-quality objective that balances cluster quality metrics (silhouette, Davies-Bouldin) with deployability goals.

4. Choose a recommended engine per cluster.
- Computes regret-based stats per engine inside each cluster.
- Supports multiple selection objectives:
  - risk_constrained: minimize risk score with a hard real-miss constraint.
  - balanced: keep near-best regret engines, then maximize winner-set coverage.
  - regret_first: prioritize lowest mean regret.
  - coverage_first: prioritize winner-set hit rate.

5. Convert clusters into selector rules.
- Trains a decision-tree surrogate over the engineered features.
- Exports explicit if/then rules plus fallback behavior.
- This is the bridge from offline clusters to online routing decisions.

6. Produce library-consumable tuning payload.
- Writes JSON and Markdown reports for inspection.
- Writes tuning_TIMESTAMP.js containing selector constants/rules and parallelization policy constants.
- This file is intended to be copied into the library tuning module.

Important interpretation:
- "Winner" means fastest engine for a route row.
- "Winner-set" means engines within tolerance of the fastest row time.
- "Regret" is percent overhead versus row best time.
- "Real miss" means recommended engine is outside the winner-set.

### benchmark/train_engine_selector_ml.py

Purpose:
- Trains direct ML engine selectors from paired benchmark outputs.
- Learns two route-level models: sabOff for serial runtime, sabOn for parallel runtime.
- Exports a dependency-free JS model artifact that can be consumed by `src/tuning.js`.

What it does:
- Loads exactly two benchmark JSON files from `benchmark/results` (one serial, one parallel).
- Parses route rows, features, and fastest-engine labels for each profile.
- Scores each run by quality, agreement, coverage, and recency.
- Trains a 2-layer MLP classifier for each profile using weighted route examples.
- Selects conservative confidence and margin thresholds for safer runtime fallback.
- Writes both a generated JS model artifact and a JSON analysis report.

Output:
- `src/tuning/model.js` by default (configurable with `--out-js`).
- `benchmark/results/analysis/engine_selector_ml_latest.json` by default (configurable with `--out-report`).

Usage:

```bash
cd /data/projects/omp-router
.venv/bin/python benchmark/train_engine_selector_ml.py --root .
```

If you run from `benchmark/` instead, use:

```bash
cd /data/projects/omp-router/benchmark
../.venv/bin/python train_engine_selector_ml.py --root ..
```

Important notes:
- The script expects a matching serial/parallell dataset pair in `benchmark/results`.
- It uses 10 engineered route features and a small 2-layer neural network.
- The generated JS artifact is meant for runtime engine selection, not model training.

### benchmark/run_selector_sweep.py

Purpose:
- Runs a parameter sweep around the analyzer objective knobs.
- Prints progress, diagnostics, and best candidate parameters to stdout.
- Supports early stop when no new score appears for many combinations.

Notes:
- This script does not write final tuning output itself.
- Use the selected params to rerun cluster_engine_selector.py and produce a tuning_TIMESTAMP.js artifact.

How it works (logic and algorithms):
1. Runs a diagnostic baseline using current default analyzer knobs.
- Prints sab_off and sab_on auto vs rules deltas (runtime, regret, tail regret, miss).

2. Grid-searches analyzer objective parameters.
- Sweeps combinations of:
  - cluster-risk-beta
  - cluster-miss-penalty
  - cluster-tail-penalty
  - cluster-max-real-miss-pct
  - cluster-confidence-margin-pct

3. Scores each parameter tuple with a composite score.
- Combines per-profile improvements with weighted terms:
  - runtime savings,
  - mean regret improvement,
  - tail regret improvement,
  - real-miss reduction.
- Applies feasibility gates to reject unsafe regressions.

4. Stops early on low-information search tails.
- If no new unique score appears for N combinations, sweep terminates early.
- This avoids spending time on repetitive outcomes.

5. Reports best candidate.
- BEST_FEASIBLE: best tuple that passed constraints.
- BEST_AVAILABLE: best score even when no tuple is feasible.

Important interpretation:
- If Feasible combos is 0, constraints/objective are too strict for current benchmark data.
- In that case use BEST_AVAILABLE as a baseline, then relax constraints and re-run if strict feasibility is required.

## Prerequisites

- Node.js 18+
- Project dependencies installed (npm install)
- Python environment with analyzer dependencies available (numpy, pandas, scikit-learn)

Example environment setup from repo root:

  python3 -m venv .venv
  .venv/bin/pip install numpy pandas scikit-learn

## How to run

### 1) Run benchmark UI and generate benchmark/results/*.json

From repo root:

  npm run dev

Open in browser:
- http://localhost:5173/benchmark/index.html

In the UI:
- Choose mode, route categories, length categories, and samples.
- Click Run Benchmark.
- At the end, artifacts are auto-saved under benchmark/results.

Tip:
- Run both serial and parallel profiles for the same scenario set so analyzer can tune both sab_off and sab_on.

### 1b) Alternative: Run headless CLI benchmark

From repo root, if you prefer automated/scripted benchmarking without a browser:

```bash
# Quick test (100 routes, serial profile)
npm run benchmark:quick

# Full benchmark (all routes, serial profile)
npm run benchmark

# Custom options
node benchmark/cli-runner.js --profile serial --routes 3950 --verbose
```

The CLI runner generates the same JSON format as the browser UI, so results can be immediately fed into the Python analysis pipeline. Use this for:
- Continuous integration / automated testing
- Batch benchmark runs
- Programmatic result collection
- Scenarios where a browser is unavailable

### 2) Run clustering analysis and generate tuning module

From repo root:

  .venv/bin/python benchmark/cluster_engine_selector.py \
    --input-glob "benchmark/results/*benchmark_car_*.json" \
    --output-dir benchmark/results/analysis

Optional objective tuning flags:

  --cluster-objective risk_constrained \
  --cluster-risk-beta 0.35 \
  --cluster-miss-penalty 2.0 \
  --cluster-tail-penalty 0.6 \
  --cluster-tail-quantile 0.95 \
  --cluster-max-real-miss-pct 5.0 \
  --cluster-confidence-margin-pct 0.20

The script prints created files, including the generated tuning module path.

### 3) Optional: sweep objective parameters first

From repo root:

  SWEEP_MAX_COMBOS=0 SWEEP_EARLY_STOP_PATIENCE=200 \
  .venv/bin/python benchmark/run_selector_sweep.py

The sweep script currently uses an internal benchmark glob and fixed search ranges.
If you need a different dataset window or search space, edit the script constants first.

Useful environment variables:
- SWEEP_MAX_COMBOS: limit search size (0 means full configured grid)
- SWEEP_EARLY_STOP_PATIENCE: stop when no new unique score appears for N combos

After sweep:
- Read BEST_FEASIBLE or BEST_AVAILABLE params from stdout.
- Rerun cluster_engine_selector.py with those selected values.
- Regenerate reports and a new tuning_TIMESTAMP.js artifact.

### 4) Apply generated tuning to library code

Copy the generated artifact into src/tuning.js:

  cp benchmark/results/analysis/tuning_TIMESTAMP.js src/tuning.js

Replace TIMESTAMP with the generated one.

### 5) Validate

Run tests from repo root:

  npm run test

## Troubleshooting

- No benchmark files found:
  - Verify benchmark/results contains JSON artifacts from the UI run.
  - Check your --input-glob pattern.

- Sweep appears long-running:
  - Use SWEEP_MAX_COMBOS to cap the search.
  - Use SWEEP_EARLY_STOP_PATIENCE to stop earlier on repetitive score landscapes.

- Sweep reports Feasible combos: 0:
  - Constraints are too strict for current data/objective.
  - Use BEST_AVAILABLE as a baseline, or relax miss/regret constraints and rerun.
  - Typical first relaxations: increase --cluster-max-real-miss-pct and/or reduce --cluster-miss-penalty.

- Parallel profile quality is unstable:
  - Ensure your benchmark run includes a real sab_on profile and consistent scenario sampling.
