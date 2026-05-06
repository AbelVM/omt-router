# Benchmark Workflow

This folder contains tools to benchmark routing engines and turn benchmark data into selector tuning artifacts that can be applied in the library.

## Target of this workflow

The benchmark + analysis flow is not just for finding the fastest engine overall.
Its real target is to build a deployable selection policy that:
- chooses a good engine by route/graph profile instead of one global winner,
- supports both `sabOff` (serial runtime) and `sabOn` (parallel-capable runtime),
- controls risk (regret and misses), not only average runtime,
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
Due to model size
What it does:
- Loads exactly two benchmark JSON files from `benchmark/results` (one serial and one parallel).
- Parses route rows, features, and fastest-engine labels for each profile.
- Scores runs by quality, agreement, coverage, and recency.
- Trains a small 2-layer MLP classifier using sklearn and XGBoost.
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

``` bash
  npm run dev
``` 

Open in browser:

  http://localhost:5173/benchmark/index.html

Run the benchmark for both serial and parallel profiles and save the JSON artifacts into `benchmark/results`.

### 2) Train the runtime selector model

From repo root:

```bash
  python3 -m venv .venv
  .venv/bin/pip install numpy pandas scikit-learn xgboost m2cgen
  .venv/bin/python benchmark/train_engine_selector_ml.py --root .
```

Alternatively, if your Python environment is active, you can use the package scripts:

```bash
  npm run train:MLP
  npm run train:LR
  npm run train:XGBoost
```

The script reads paired benchmark JSON files in `benchmark/results` and generates a runtime-compatible JS model artifact at `src/tuning/model.js`.

Due to model size and inference performance concerns, only LR is supported for inference.

### 3) Apply the selector artifact in the library

Ensure `src/tuning/tuning.js` loads or imports the generated runtime model.
The current library expects the runtime selector payload to be available through `src/tuning/tuning.js` and `src/tuning/model.js`.

### 4) Inspect with analysis helpers

Use these scripts for validation or diagnostics:
- `benchmark/analyze_feature_importance.py`
- `benchmark/analyze_feature_transform_signal.py`
- `benchmark/compare_engine_selector_results.py`

## Prerequisites

- Node.js 18+
- Project dependencies installed (`npm install`)
- Python environment with analyzer dependencies:
  - `numpy`
  - `pandas`
  - `scikit-learn`
  - `xgboost`
  - `m2cgen`

Example environment setup from repo root:

  python3 -m venv .venv
  .venv/bin/pip install numpy pandas scikit-learn xgboost m2cgen

## Notes

- The benchmark training pipeline is centered on benchmark results generated under `benchmark/results`.
- `train_engine_selector_ml.py` expects one serial and one parallel JSON file to be present.
- The generated JS artifact is meant for runtime engine selection, not model training.

## Troubleshooting

- If no benchmark files are found, confirm `benchmark/results` contains JSON artifacts from the browser benchmark.
- If `train_engine_selector_ml.py` fails, verify the paired serial/parallel dataset naming pattern and required Python dependencies.
- The benchmark uses the actual source code, not the bundles. That's why you need to run it in vite with the provided script.