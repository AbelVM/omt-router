# Benchmark Workflow

This folder contains tools to benchmark routing engines and turn benchmark data into selector tuning artifacts that can be applied in the library.

## Target of this workflow

The benchmark + analysis flow is not just for finding the fastest engine overall.
Its real target is to build a deployable selection policy that:

- chooses a good engine by route/graph profile instead of one global winner,
- supports both `sabOff` (serial runtime) and `sabOn` (parallel-capable runtime),
- controls risk (regret and misses), not only average runtime,
- handles noisy benchmark data and near-tie cases explicitly,
- emits a ready-to-use runtime tuning artifact consumed by `src/tuning/tuning.js`.

## Available benchmark tools

### benchmark/index.html

Purpose:

- Browser-based benchmark UI for running route comparisons across engines.
- Produces JSON benchmark artifacts to `benchmark/results`.

What it produces:

- `benchmark/results/YYYYMMDD_HHMMSS_benchmark_car_serial.json`
- `benchmark/results/YYYYMMDD_HHMMSS_benchmark_car_parallel.json`

These artifacts are the input for selector training and model generation.

### benchmark/train_engine_selector_ml.py

Purpose:

- Trains direct ML engine selectors from paired benchmark outputs.
- Learns two route-level models: `sabOff` for serial runtime, `sabOn` for parallel runtime.
- Exports a dependency-free JS model artifact consumable by `src/tuning/tuning.js`.

What it does:

- Loads exactly two benchmark JSON files from `benchmark/results` (one serial and one parallel).
- Parses route rows, features, and fastest-engine labels for each profile.
- Scores runs by quality, agreement, coverage, and recency.
- Down-weights noisy or drifted benchmark runs and preserves near-tie signals.
- Trains the runtime-linear selector using sklearn Ridge regression.
- Writes a generated JS model artifact and a JSON analysis report.

Output:

- `src/tuning/model.js` by default (configurable via `--out-js`)
- `benchmark/results/analysis/engine_selector_ml_latest.json` by default (configurable via `--out-report`)

### benchmark/analyze_feature_importance.py

Purpose:

- Analyze feature importance from selector training and benchmark datasets.
- Helps identify which route/graph features matter most for engine choice.

### benchmark/analyze_feature_transform_signal.py

Purpose:

- Validate feature transforms and signal behavior across benchmark route data.
- Helps ensure engineered features remain stable and informative.

### benchmark/compare_engine_selector_results.py

Purpose:

- Compare alternative engine selection policies or model outputs.
- Useful for validating new selector artifacts against baseline behavior.

## Recommended workflow

### 1) Generate benchmark data

From repo root:

```bash
  npm run dev
```

Open in browser:

http://localhost:5173/benchmark/index.html

Run the benchmark for both serial and parallel profiles and save the JSON artifacts into `benchmark/results`.

### 2) Train the runtime selector model

From repo root:

```bash
  python3 -m venv .venv
  .venv/bin/pip install numpy pandas scikit-learn
  .venv/bin/python benchmark/train_engine_selector_ml.py --root .
```

Alternatively, if your Python environment is active, you can use the package script:

```bash
  npm run train:LR
```

The script reads paired benchmark JSON files in `benchmark/results` and generates a runtime-compatible JS model artifact at `src/tuning/model.js`.

### 3) Apply the selector artifact in the library

Ensure `src/tuning/tuning.js` loads or imports the generated runtime model.
The current library expects the runtime selector payload to be available through `src/tuning/tuning.js` and `src/tuning/model.js`.

### 4) Inspect with analysis helpers

Use these scripts for validation or diagnostics:

- `benchmark/analyze_feature_importance.py`
- `benchmark/analyze_feature_transform_signal.py`
- `benchmark/compare_engine_selector_results.py`
- `benchmark/analyze_benchmark_errors.py` — checks the benchmark JSON schema for warm-up vs timed engine failure semantics and reports any mismatches between top-level error flags and diagnostics.

## Benchmark error schema

The benchmark output now preserves separate route-level, engine warm-up, and engine timed error signals.
This makes the final route row more precise:

- a route can still be considered successfully benchmarked even if one or more engines experienced recoverable warm-up failures;
- timed execution failures are treated as engine-level faults rather than route-level route failures when possible;
- warm-up diagnostics are preserved for analysis even when the timed phase later succeeds, so these recoveries are visible without being treated as final route failures.

### Route-level errors

- `routeError` / `error`: top-level route failure reason when the benchmark could not complete the route itself.
- Common route failures include graph or tile build failures, missing tiles, invalid route validation, or other route preparation problems.
- If a route-level failure exists, engine results may be missing or only partially populated.
- Route-level failure is orthogonal to engine diagnostics: route errors describe the benchmark outcome for the whole route, not individual engine execution issues.

### Engine-level diagnostics

- `<engine>_warm_error`: the engine failed during the warm-up run.
- `<engine>_timed_error`: the engine failed during the timed sampling phase.
- `any_engine_warm_error`: at least one engine had a warm-up failure.
- `any_engine_timed_error`: at least one engine had a timed execution failure.
- `any_engine_error`: a broad final indicator that the route or its engine execution was not clean.
  - This is typically true for route-level failures and timed engine failures.
  - It is not set for recoverable warm-up failures that were fixed by later successful timed execution.

### Final engine result semantics

- `<engine>_result_source`: one of `timed`, `warm`, or `none`.
  - `timed`: the final engine result came from successful timed samples.
  - `warm`: the timed phase failed, so the benchmark fell back to the warm-up result.
  - `none`: no usable engine result was produced.
- `<engine>_status`: one of:
  - `ok`: warm-up and timed execution completed cleanly.
  - `warm_error`: warm-up failed and no timed samples were available.
  - `warm_error_recovered`: warm-up failed, but timed execution succeeded and produced the final result.
  - `timed_error`: timed execution failed and the engine has no final timed result.

### Route vs engine error relationship

- `routeError` / `error` describes whether the route benchmark itself failed to complete.
- Engine-level error fields describe individual engine execution health within a route that was otherwise benchmarked.
- A route with `routeError` set may still contain engine diagnostic metadata, but those engine measurements are not the primary route outcome.
- A successful route row (`routeError` unset) can still have engine-specific problems, such as warm-up failures or timed engine failures.
- Recovered warm-up failures are recorded via `<engine>_warm_error` and `<engine>_status === 'warm_error_recovered'`, but they do not set `any_engine_error`.

### Diagnostic payload

The benchmark also includes a raw diagnostics payload in `rawDiagnostics.execution`:

- `warmupErrorsByEngine`
- `timedErrorsByEngine`
- `warmupErrorMessagesByEngine`
- `timedErrorMessagesByEngine`
- `finalResultSourceByEngine`
- `finalEngineStatusByEngine`

### Analyzer support

The analyzer script `benchmark/analyze_benchmark_errors.py` now reports:

- rows with warm-up only failures,
- rows with timed failures,
- rows where warm-up errors were recovered by valid timed execution,
- rows where `any_engine_error` is inconsistent with recorded diagnostics,
- rows where recoverable warm-up-only routes are incorrectly flagged as `any_engine_error`,
- and rows where route-level failures are missing diagnostic payloads.

## Prerequisites

- Node.js 18+
- Project dependencies installed (`npm install`)
- Python environment with training dependencies:
  - `numpy`
  - `pandas`
  - `scikit-learn`

Example environment setup from repo root:

python3 -m venv .venv
.venv/bin/pip install numpy pandas scikit-learn

## Notes

- The benchmark training pipeline is centered on benchmark results generated under `benchmark/results`.
- `train_engine_selector_ml.py` expects one serial and one parallel JSON file to be present.
- The generated JS artifact is meant for runtime engine selection, not model training.

## Troubleshooting

- If no benchmark files are found, confirm `benchmark/results` contains JSON artifacts from the browser benchmark.
- If `train_engine_selector_ml.py` fails, verify the paired serial/parallel dataset naming pattern and required Python dependencies.
- The benchmark uses the actual source code, not the bundles. That's why you need to run it in vite with the provided script.
