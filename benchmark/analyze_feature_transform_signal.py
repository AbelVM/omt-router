#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split

SCRIPT_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_ROOT.parent
MODULE_PATH = PROJECT_ROOT / "benchmark" / "train_engine_selector_ml.py"


def load_module():
    spec = importlib.util.spec_from_file_location(
        "train_engine_selector_ml", MODULE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def standardize_features(X: np.ndarray):
    means = np.mean(X, axis=0)
    scales = np.std(X, axis=0)
    scales = [float(s) if s > 1e-12 else 1.0 for s in scales]
    scaled = (X - means) / np.array(scales, dtype=np.float64)
    return scaled, means.tolist(), scales


def evaluate_runtime_model(module, profile_data, feature_indices):
    classes = module.ENGINE_IDS
    X = profile_data["X"][:, feature_indices]
    items = profile_data["items"]
    w = profile_data["w"]

    complete_indices = [
        i for i, item in enumerate(items) if module.has_complete_engine_times(item)
    ]
    X_complete = X[complete_indices]
    w_complete = w[complete_indices]
    complete_items = [items[i] for i in complete_indices]
    y_by_engine = {
        engine: np.array(
            [math.log1p(item["times"][engine]) for item in complete_items],
            dtype=np.float64,
        )
        for engine in classes
    }
    y_true = np.array(
        [module.ENGINE_IDS.index(item["winner"]) for item in complete_items],
        dtype=np.int64,
    )

    def evaluate_alpha(alpha):
        scores = []
        regrets = []
        hit_rates = []
        good_enough_rates = []
        confidences = []
        margins = []

        for split_seed in module.RANDOM_SPLITS:
            idx_all = np.arange(len(complete_items))
            stratify = y_true if len(set(y_true.tolist())) > 1 else None
            idx_train, idx_val = train_test_split(
                idx_all,
                test_size=module.VALIDATION_FRACTION,
                random_state=split_seed,
                shuffle=True,
                stratify=stratify,
            )
            X_train = X_complete[idx_train]
            X_val = X_complete[idx_val]
            w_train = w_complete[idx_train]
            y_val = y_true[idx_val]
            X_train_scaled, mean, scale = standardize_features(X_train)
            X_val_scaled = (X_val - mean) / np.array(scale, dtype=np.float64)

            engine_models = {}
            for engine in classes:
                model = Ridge(alpha=alpha)
                model.fit(X_train_scaled, y_by_engine[engine][idx_train], sample_weight=w_train)
                engine_models[engine] = model

            preds = np.column_stack(
                [engine_models[engine].predict(X_val_scaled) for engine in classes]
            )
            probs = np.exp(-preds - np.max(-preds, axis=1, keepdims=True))
            probs = probs / np.sum(probs, axis=1, keepdims=True)

            split_regrets = []
            split_hit_rate = 0
            split_good_enough = 0
            split_confidences = []
            split_margins = []

            for pos, sample_idx in enumerate(idx_val):
                pred_idx = int(np.argmin(preds[pos]))
                pred_engine = classes[pred_idx]
                split_regrets.append(module.regret_for_prediction(pred_engine, complete_items[sample_idx]))
                if pred_idx == y_val[pos]:
                    split_hit_rate += 1
                if module.is_good_enough_prediction(
                    pred_engine, complete_items[sample_idx], tolerance=module.GOOD_ENOUGH_TOLERANCE
                ):
                    split_good_enough += 1

                sorted_p = np.sort(probs[pos])
                split_confidences.append(float(sorted_p[-1]))
                split_margins.append(float(sorted_p[-1] - sorted_p[-2]) if len(sorted_p) > 1 else float(sorted_p[-1]))

            split_mean_regret = float(np.mean(split_regrets)) if split_regrets else 1.0
            split_hit_rate = float(split_hit_rate / len(idx_val)) if len(idx_val) else 0.0
            split_good_enough_rate = float(split_good_enough / len(idx_val)) if len(idx_val) else 0.0
            split_score = (
                module.REGRET_WEIGHT * split_mean_regret
                - module.HIT_WEIGHT * split_hit_rate
                - module.GOOD_ENOUGH_WEIGHT * split_good_enough_rate
            )

            scores.append(split_score)
            regrets.append(split_mean_regret)
            hit_rates.append(split_hit_rate)
            good_enough_rates.append(split_good_enough_rate)
            confidences.extend(split_confidences)
            margins.extend(split_margins)

        return {
            "score": float(np.mean(scores)),
            "alpha": alpha,
            "mean_regret": float(np.mean(regrets)),
            "hit_rate": float(np.mean(hit_rates)),
            "good_enough_rate": float(np.mean(good_enough_rates)) if good_enough_rates else 0.0,
            "confidence_p50": float(np.median(confidences)) if confidences else 0.5,
            "margin_p50": float(np.median(margins)) if margins else 0.0,
        }

    results = []
    for alpha in module.REGRESSION_ALPHA_SEARCH:
        try:
            results.append(evaluate_alpha(alpha))
        except Exception:
            continue
    if not results:
        raise RuntimeError("No regression results for feature subset")

    best = min(results, key=lambda item: item["score"])
    return best


def build_variant_indices(module, raw_name: str, log_name: str) -> dict:
    all_indices = list(range(len(module.FEATURE_ORDER)))
    raw_idx = module.FEATURE_ORDER.index(raw_name)
    log_idx = module.FEATURE_ORDER.index(log_name)
    return {
        "raw-only": [i for i in all_indices if i != log_idx],
        "log-only": [i for i in all_indices if i != raw_idx],
        "raw+log": all_indices,
    }


def build_augmented_log_matrix(X: np.ndarray, feature_indices: list[int]) -> np.ndarray:
    extra_cols = []
    for idx in feature_indices:
        col = X[:, idx]
        extra_cols.append(np.log1p(np.maximum(col, 0.0)))
    if not extra_cols:
        return X
    return np.concatenate([X, np.column_stack(extra_cols)], axis=1)


def build_augmented_raw_only_log_matrix(X, raw_only_feature_names, module):
    feature_indices = [module.FEATURE_ORDER.index(name) for name in raw_only_feature_names]
    return build_augmented_log_matrix(X, feature_indices)


def main():
    parser = argparse.ArgumentParser(description="Analyze raw/log feature transform signal for runtime-linear model.")
    parser.add_argument(
        "--test-raw-with-log",
        action="store_true",
        help="Add log versions of raw-only features and compare against the full model.",
    )
    args = parser.parse_args()

    module = load_module()
    runs = module.load_runs(PROJECT_ROOT)
    profiles = ["sabOff", "sabOn"]

    raw_indices = [i for i, name in enumerate(module.FEATURE_ORDER) if not name.startswith("log")]
    log_indices = [i for i, name in enumerate(module.FEATURE_ORDER) if name.startswith("log")]
    assert len(raw_indices) + len(log_indices) == len(module.FEATURE_ORDER)

    raw_log_pairs = [
        ("safeN", "logN"),
        ("safeE", "logE"),
        ("safeBeelineKm", "logBeelineKm"),
        ("edgesPerKm", "logEdgesPerKm"),
        ("nodesPerKm", "logNodesPerKm"),
        ("sizeRatioEN", "logEoverN"),
        ("globalCoverage", "logGlobalCoverage"),
        ("emptyRatio", "logEmptyRatio"),
        ("sourceDegree", "logSourceDegree"),
        ("targetDegree", "logTargetDegree"),
        ("sourceCentrality", "logSourceCentrality"),
        ("targetCentrality", "logTargetCentrality"),
        ("sourceTargetDegreeRatio", "logSourceTargetDegreeRatio"),
        ("sourceTargetCentralityRatio", "logSourceTargetCentralityRatio"),
        ("beelinePerNode", "logBeelinePerNode"),
        ("avgOutDegree", "logAvgOutDegree"),
        ("relativeDensity", "logRelativeDensity"),
        ("graphDensity", "logGraphDensity"),
        ("avgBranchFactor", "logAvgBranchFactor"),
    ]
    raw_only_feature_names = [
        name for name in module.FEATURE_ORDER
        if not name.startswith("log") and name not in {raw for raw, _ in raw_log_pairs}
    ]

    raw_only_feature_indices = [module.FEATURE_ORDER.index(name) for name in raw_only_feature_names]

    def build_augmented_raw_only_log_matrix(X):
        return build_augmented_log_matrix(X, raw_only_feature_indices)

    print("Feature transform signal analysis")
    print("==============================")

    for profile in profiles:
        profile_data = module.build_xy_for_profile(runs, profile)
        if profile_data is None:
            print(f"Skipping missing profile {profile}")
            continue

        print(f"\nProfile: {profile}")
        print("------------------------------")

        full_metrics = evaluate_runtime_model(module, profile_data, list(range(len(module.FEATURE_ORDER))))
        raw_metrics = evaluate_runtime_model(module, profile_data, raw_indices)
        log_metrics = evaluate_runtime_model(module, profile_data, log_indices)

        print("Metrics")
        print("  full   : mean_regret={:.4f}, hit_rate={:.4f}, good_enough_rate={:.4f}".format(
            full_metrics["mean_regret"], full_metrics["hit_rate"], full_metrics["good_enough_rate"]
        ))
        print("  raw-only: mean_regret={:.4f}, hit_rate={:.4f}, good_enough_rate={:.4f}".format(
            raw_metrics["mean_regret"], raw_metrics["hit_rate"], raw_metrics["good_enough_rate"]
        ))
        print("  log-only: mean_regret={:.4f}, hit_rate={:.4f}, good_enough_rate={:.4f}".format(
            log_metrics["mean_regret"], log_metrics["hit_rate"], log_metrics["good_enough_rate"]
        ))

        if full_metrics["score"] <= raw_metrics["score"] and full_metrics["score"] <= log_metrics["score"]:
            print("  -> full feature set is best by score")
        elif raw_metrics["score"] <= full_metrics["score"] and raw_metrics["score"] <= log_metrics["score"]:
            print("  -> raw-only is best by score")
        else:
            print("  -> log-only is best by score")

        print("\nPer-pair best variant")
        for raw_name, log_name in raw_log_pairs:
            variant_indices = build_variant_indices(module, raw_name, log_name)
            raw_variant = evaluate_runtime_model(module, profile_data, variant_indices["raw-only"])
            log_variant = evaluate_runtime_model(module, profile_data, variant_indices["log-only"])
            both_variant = evaluate_runtime_model(module, profile_data, variant_indices["raw+log"])
            best_variant = min(
                [
                    ("raw-only", raw_variant),
                    ("log-only", log_variant),
                    ("raw+log", both_variant),
                ],
                key=lambda item: item[1]["score"],
            )
            print(
                f"  {raw_name}/{log_name}: best={best_variant[0]}, "
                f"raw={raw_variant['score']:.6f}, log={log_variant['score']:.6f}, both={both_variant['score']:.6f}"
            )

        if raw_only_feature_names:
            print("\nRaw-only features with no explicit log counterpart")
            for name in raw_only_feature_names:
                print(f"  {name}")

        # fit full model once to compute coefficients for each feature index.
        X = profile_data["X"]
        complete_indices = [
            i for i, item in enumerate(profile_data["items"]) if module.has_complete_engine_times(item)
        ]
        X_complete = X[complete_indices]
        y_by_engine = {
            engine: np.array(
                [math.log1p(profile_data["items"][i]["times"][engine]) for i in complete_indices],
                dtype=np.float64,
            )
            for engine in module.ENGINE_IDS
        }
        X_scaled, _, _ = standardize_features(X_complete)
        coeff_by_feature = {name: 0.0 for name in module.FEATURE_ORDER}
        alpha_for_coefficients = full_metrics.get("alpha", module.REGRESSION_ALPHA_SEARCH[0])
        for engine in module.ENGINE_IDS:
            model = Ridge(alpha=alpha_for_coefficients)
            model.fit(X_scaled, y_by_engine[engine], sample_weight=profile_data["w"][complete_indices])
            for i, name in enumerate(module.FEATURE_ORDER):
                coeff_by_feature[name] += abs(model.coef_[i])

        print("\nFeature signal strength")
        print("feature,raw_abs,log_abs,best")
        for raw_name, log_name in raw_log_pairs:
            raw_val = coeff_by_feature[raw_name]
            log_val = coeff_by_feature[log_name]
            stronger = "raw" if raw_val >= log_val else "log"
            print(
                f"  {raw_name}/{log_name}: raw={raw_val:.4f}, log={log_val:.4f}, stronger={stronger}"
            )

        print("\nTop absolute coefficient sums")
        for name, value in sorted(coeff_by_feature.items(), key=lambda item: item[1], reverse=True)[:8]:
            print(f"  {name}: {value:.4f}")

        if args.test_raw_with_log:
            X_extra = build_augmented_raw_only_log_matrix(profile_data["X"])
            extra_metrics = evaluate_runtime_model(
                module,
                {**profile_data, "X": X_extra},
                list(range(X_extra.shape[1])),
            )
            print("\nRaw-only + generated log features")
            print("  mean_regret={:.4f}, hit_rate={:.4f}, good_enough_rate={:.4f}".format(
                extra_metrics["mean_regret"], extra_metrics["hit_rate"], extra_metrics["good_enough_rate"]
            ))
            delta = extra_metrics["score"] - full_metrics["score"]
            print(f"  score delta vs full = {delta:.6f}")

            print("\nSingle raw-only feature log augmentation")
            for name in raw_only_feature_names:
                idx = module.FEATURE_ORDER.index(name)
                X_feature_extra = build_augmented_log_matrix(profile_data["X"], [idx])
                feature_metrics = evaluate_runtime_model(
                    module,
                    {**profile_data, "X": X_feature_extra},
                    list(range(X_feature_extra.shape[1])),
                )
                delta_feature = feature_metrics["score"] - full_metrics["score"]
                print(
                    f"  {name}: score={feature_metrics['score']:.6f}, "
                    f"delta_vs_full={delta_feature:.6f}"
                )


if __name__ == "__main__":
    main()
