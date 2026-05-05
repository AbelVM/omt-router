#!/usr/bin/env python3
"""Train direct ML engine selectors with XGBoost and export JS runtime model.

This pipeline learns two multinomial models:
- sabOff: serial runtime (SharedArrayBuffer disabled)
- sabOn: parallel runtime (SharedArrayBuffer enabled)

It auto-scores benchmark datasets for quality and recency, down-weights noisy/drifted
runs, and exports a dependency-free artifact consumed by src/tuning.js.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from statistics import median
from typing import Dict, Iterable, List, Tuple

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier
import m2cgen as m2c


ENGINE_IDS = [
    "bidirectional-astar",
    "adaptive-barrier",
    "delta-stepping",
    "ultra-dijkstra",
]

ENGINE_TIME_FIELDS = {
    "bidirectional-astar": "bidirectional_astar_ms",
    "adaptive-barrier": "adaptive_barrier_ms",
    "delta-stepping": "delta_stepping_ms",
    "ultra-dijkstra": "ultra_dijkstra_ms",
}

FEATURE_ORDER = [
    "safeN",
    "safeE",
    "safeBeelineKm",
    "avgOutDegree",
    "edgesPerKm",
    "nodesPerKm",
    "sizeRatioEN",
    "beelinePerNode",
    "relativeDensity",
    "globalCoverage",
    "emptyRatio",
    "sourceDegree",
    "targetDegree",
    "sourceCentrality",
    "targetCentrality",
    "sourceTargetDegreeRatio",
    "sourceTargetCentralityRatio",
    "graphDensity",
    "avgBranchFactor",
    "logN",
    "logE",
    "logBeelineKm",
    "logEdgesPerKm",
    "logNodesPerKm",
    "logEoverN",
    "logBeelinePerNode",
]

HYPERPARAMETER_SEARCH = {
    "max_depth": [3, 4, 5],
    "n_estimators": [25, 50, 75],
    "learning_rate": [0.05, 0.1, 0.2],
}
REGRESSION_ALPHA_SEARCH = [0.01, 0.1, 1.0, 5.0]
VALIDATION_FRACTION = 0.2
RANDOM_SPLITS = [42, 77, 99]


@dataclass
class DatasetRun:
    file_path: Path
    timestamp: str
    profile: str
    rows: List[dict]
    payload: dict = field(default_factory=dict)
    quality: float = 0.0
    agreement: float = 0.0
    coverage: float = 0.0
    recency: float = 0.0


def parse_timestamp_from_name(name: str) -> str:
    base = name
    if base.endswith(".json"):
        base = base[:-5]
    parts = base.split("_")
    for part in parts:
        if len(part) == 15 and part.isdigit() and "_" not in part:
            return part
    # expected format: 20260504_200518
    if len(parts) >= 4 and len(parts[1]) == 8 and len(parts[2]) == 6:
        return f"{parts[1]}_{parts[2]}"
    return "19700101_000000"


def timestamp_to_dt(ts: str) -> datetime:
    try:
        return datetime.strptime(ts, "%Y%m%d_%H%M%S")
    except ValueError:
        return datetime(1970, 1, 1)


def detect_profile(payload: dict, file_name: str) -> str:
    ctx = payload.get("context") or {}
    runtime = payload.get("runtime") or {}
    if bool(ctx.get("forceSerialRouting")):
        return "sabOff"
    if bool(ctx.get("sharedArrayBuffer")) or bool(runtime.get("sharedArrayBufferEnabled")):
        return "sabOn"
    if "parallel" in file_name:
        return "sabOn"
    return "sabOff"


def list_candidate_files(root: Path) -> List[Path]:
    # Train only from the current benchmark pair in benchmark/results (top-level).
    # Ignore historical datasets (e.g., benchmark/results/old) and fail fast if the
    # expected pair is not present.
    candidates = [
        p
        for p in (root / "benchmark" / "results").glob("*_benchmark_car_*.json")
        if p.is_file()
    ]
    candidates.sort(key=lambda p: p.name)

    if len(candidates) != 2:
        names = ", ".join(p.name for p in candidates) if candidates else "<none>"
        raise SystemExit(
            "Expected exactly 2 benchmark JSON files in benchmark/results "
            f"(one serial + one parallel). Found {len(candidates)}: {names}"
        )

    return candidates


def load_runs(root: Path) -> List[DatasetRun]:
    runs: List[DatasetRun] = []
    profiles_found: Counter = Counter()
    for p in list_candidate_files(root):
        try:
            payload = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue

        raw_rows = payload.get("rawResults") or []
        profile = detect_profile(payload, p.name)
        ts = parse_timestamp_from_name(p.name)

        rows = []
        for row in raw_rows:
            winner = row.get("winner")
            if winner not in ENGINE_IDS:
                continue
            times = {}
            for engine in ENGINE_IDS:
                val = row.get(ENGINE_TIME_FIELDS[engine])
                if isinstance(val, (int, float)) and val > 0:
                    times[engine] = float(val)
            if winner not in times:
                continue
            rows.append({"row": row, "winner": winner, "times": times})

        if rows:
            runs.append(
                DatasetRun(
                    file_path=p,
                    timestamp=ts,
                    profile=profile,
                    rows=rows,
                    payload=payload,
                )
            )
            profiles_found[profile] += 1

    if len(runs) != 2:
        names = ", ".join(r.file_path.name for r in runs) if runs else "<none>"
        raise SystemExit(
            "Expected 2 valid benchmark datasets (one per profile), "
            f"but parsed {len(runs)}: {names}"
        )

    if profiles_found.get("sabOff", 0) != 1 or profiles_found.get("sabOn", 0) != 1:
        profile_summary = ", ".join(f"{k}={v}" for k, v in sorted(profiles_found.items())) or "<none>"
        raise SystemExit(
            "Expected exactly one serial (sabOff) and one parallel (sabOn) dataset. "
            f"Found: {profile_summary}"
        )

    return runs


def compute_consensus_agreement(runs: List[DatasetRun]) -> None:
    if not runs:
        return

    route_votes: Dict[str, Counter] = defaultdict(Counter)
    route_total: Counter = Counter()
    for run in runs:
        for item in run.rows:
            route = item["row"].get("name") or item["row"].get("id")
            if not route:
                continue
            route_votes[route][item["winner"]] += 1
            route_total[route] += 1

    majority_by_route = {}
    for route, votes in route_votes.items():
        if route_total[route] < 2:
            continue
        majority_by_route[route] = votes.most_common(1)[0][0]

    all_dts = [timestamp_to_dt(r.timestamp) for r in runs]
    min_dt = min(all_dts)
    max_dt = max(all_dts)
    dt_span = max((max_dt - min_dt).total_seconds(), 1.0)

    max_rows = max(len(r.rows) for r in runs)

    for run in runs:
        agree_hits = 0
        agree_total = 0
        for item in run.rows:
            route = item["row"].get("name") or item["row"].get("id")
            if route in majority_by_route:
                agree_total += 1
                if item["winner"] == majority_by_route[route]:
                    agree_hits += 1

        run.agreement = (agree_hits / agree_total) if agree_total else 0.6
        run.coverage = len(run.rows) / max_rows if max_rows else 0.0

        cur_dt = timestamp_to_dt(run.timestamp)
        run.recency = (cur_dt - min_dt).total_seconds() / dt_span

        # Balanced quality objective: stable labels, broad coverage, and recency.
        run.quality = 0.5 * run.agreement + 0.25 * run.coverage + 0.25 * run.recency


def summarize_route_quality(rows: List[dict]) -> dict:
    if not rows:
        return {
            "samples": 0,
            "winnerTiedRate": 0.0,
            "nearTieRate": 0.0,
            "completeTimeRate": 0.0,
            "meanBestSecondGap": 0.0,
            "medianBestSecondGap": 0.0,
            "engineCounts": {},
            "featureFields": [],
        }

    gaps = []
    tied = 0
    complete = 0
    errors = 0
    complete_cost = 0
    cost_mismatch = 0
    engine_counts = Counter()
    within5_counts = []
    within10_counts = []
    candidate_counts = []
    winner_margin_values = []
    best_to_worst = []
    winner_vs_cost = []
    feature_names = set()
    all_engines_found_count = 0
    all_engines_timed_count = 0

    for item in rows:
        row = item["row"]
        feature_names.update(row.keys())
        engine_counts[item["winner"]] += 1

        if bool(row.get("winner_tied")):
            tied += 1

        if bool(row.get("any_engine_error")):
            errors += 1

        if bool(row.get("all_engines_cost")):
            complete_cost += 1
        if bool(row.get("all_engines_found")):
            all_engines_found_count += 1
        if bool(row.get("all_engines_timed")):
            all_engines_timed_count += 1

        if row.get("winner_is_cost_winner") is False and row.get("costWinner") is not None:
            cost_mismatch += 1

        within5_counts.append(get_int(row, "engines_within_5pct", 0))
        within10_counts.append(get_int(row, "engines_within_10pct", 0))
        candidate_counts.append(get_int(row, "winner_candidate_count", 0))
        winner_margin_values.append(winner_margin_pct(row))

        if row.get("best_to_worst_pct") is not None:
            try:
                best_to_worst.append(float(row.get("best_to_worst_pct")))
            except (TypeError, ValueError):
                pass

        if row.get("winner_vs_cost_pct") is not None:
            try:
                winner_vs_cost.append(float(row.get("winner_vs_cost_pct")))
            except (TypeError, ValueError):
                pass

        times = [
            float(row.get(field))
            for field in ENGINE_TIME_FIELDS.values()
            if isinstance(row.get(field), (int, float)) and row.get(field) > 0
        ]
        if len(times) >= 2:
            ordered = sorted(times)
            best = ordered[0]
            second = ordered[1]
            gap = max(0.0, (second - best) / max(best, 1e-9))
            gaps.append(gap)
        if len(times) == len(ENGINE_TIME_FIELDS):
            complete += 1

    gaps_array = np.array(gaps, dtype=np.float64) if gaps else np.array([], dtype=np.float64)
    mean_gap = float(np.mean(gaps_array)) if gaps_array.size else 0.0
    median_gap = float(np.median(gaps_array)) if gaps_array.size else 0.0
    near_ties = float(np.mean(gaps_array < 0.05)) if gaps_array.size else 0.0

    best_to_worst_array = np.array(best_to_worst, dtype=np.float64) if best_to_worst else np.array([], dtype=np.float64)
    winner_vs_cost_array = np.array(winner_vs_cost, dtype=np.float64) if winner_vs_cost else np.array([], dtype=np.float64)
    winner_margin_array = np.array(winner_margin_values, dtype=np.float64) if winner_margin_values else np.array([], dtype=np.float64)
    within10_array = np.array(within10_counts, dtype=np.float64) if within10_counts else np.array([], dtype=np.float64)
    candidate_count_array = np.array(candidate_counts, dtype=np.float64) if candidate_counts else np.array([], dtype=np.float64)

    return {
        "samples": len(rows),
        "winnerTiedRate": tied / len(rows),
        "nearTieRate": near_ties,
        "completeTimeRate": complete / len(rows),
        "allEnginesFoundRate": all_engines_found_count / len(rows),
        "allEnginesTimedRate": all_engines_timed_count / len(rows),
        "allEnginesCostRate": complete_cost / len(rows),
        "anyEngineErrorRate": errors / len(rows),
        "winnerCostMismatchRate": cost_mismatch / len(rows),
        "meanBestSecondGap": mean_gap,
        "medianBestSecondGap": median_gap,
        "meanBestToWorstPct": float(np.mean(best_to_worst_array)) if best_to_worst_array.size else 0.0,
        "medianBestToWorstPct": float(np.median(best_to_worst_array)) if best_to_worst_array.size else 0.0,
        "meanWinnerMarginPct": float(np.mean(winner_margin_array)) if winner_margin_array.size else 0.0,
        "medianWinnerMarginPct": float(np.median(winner_margin_array)) if winner_margin_array.size else 0.0,
        "meanWinnerVsCostPct": float(np.mean(winner_vs_cost_array)) if winner_vs_cost_array.size else 0.0,
        "medianWinnerVsCostPct": float(np.median(winner_vs_cost_array)) if winner_vs_cost_array.size else 0.0,
        "meanEnginesWithin5Pct": float(np.mean(within5_counts)) if within5_counts else 0.0,
        "medianEnginesWithin5Pct": float(np.median(within5_counts)) if within5_counts else 0.0,
        "meanEnginesWithin10Pct": float(np.mean(within10_array)) if within10_array.size else 0.0,
        "medianEnginesWithin10Pct": float(np.median(within10_array)) if within10_array.size else 0.0,
        "meanWinnerCandidateCount": float(np.mean(candidate_count_array)) if candidate_count_array.size else 0.0,
        "medianWinnerCandidateCount": float(np.median(candidate_count_array)) if candidate_count_array.size else 0.0,
        "engineCounts": dict(sorted(engine_counts.items(), key=lambda item: item[1], reverse=True)),
        "featureFields": sorted(feature_names),
    }


def summarize_clustering(payload: dict) -> dict:
    clustering = payload.get("clustering") or {}
    rows = clustering.get("rows") or []
    result = {
        "schemaVersion": clustering.get("schemaVersion"),
        "engines": clustering.get("engines"),
        "rows": len(rows),
        "routeCount": 0,
        "routeErrorRate": 0.0,
        "autoMatchesWinnerRate": 0.0,
        "autoWinsByEngine": {},
        "winnerCountsByEngine": {},
        "costWinnerCountsByEngine": {},
    }
    if not rows:
        return result

    route_data = {}
    winner_counts = Counter()
    cost_winner_counts = Counter()
    auto_win_counts = Counter()

    for row in rows:
        route_id = row.get("routeId") or row.get("name") or row.get("id")
        if route_id is None:
            continue

        if route_id not in route_data:
            route_data[route_id] = {
                "routeError": False,
                "autoMatchesWinner": False,
                "autoEngine": None,
                "winnerEngine": None,
                "costWinnerEngine": None,
            }

        if row.get("routeError") or row.get("engineError"):
            route_data[route_id]["routeError"] = True
        if row.get("autoMatchesWinner"):
            route_data[route_id]["autoMatchesWinner"] = True
        if row.get("autoEngine"):
            route_data[route_id]["autoEngine"] = row.get("autoEngine")
        if row.get("isWinner"):
            route_data[route_id]["winnerEngine"] = row.get("engineId")
        if row.get("isCostWinner"):
            route_data[route_id]["costWinnerEngine"] = row.get("engineId")

        if row.get("isWinner") and row.get("engineId"):
            winner_counts[row.get("engineId")] += 1
        if row.get("isCostWinner") and row.get("engineId"):
            cost_winner_counts[row.get("engineId")] += 1

    for route_id, info in route_data.items():
        if info["autoMatchesWinner"] and info["autoEngine"]:
            auto_win_counts[info["autoEngine"]] += 1

    total_routes = len(route_data)
    match_rate = sum(1 for info in route_data.values() if info["autoMatchesWinner"]) / total_routes
    route_errors = sum(1 for info in route_data.values() if info["routeError"]) / total_routes

    result.update(
        {
            "routeCount": total_routes,
            "routeErrorRate": route_errors,
            "autoMatchesWinnerRate": match_rate,
            "autoWinsByEngine": dict(sorted(auto_win_counts.items(), key=lambda item: item[1], reverse=True)),
            "winnerCountsByEngine": dict(sorted(winner_counts.items(), key=lambda item: item[1], reverse=True)),
            "costWinnerCountsByEngine": dict(sorted(cost_winner_counts.items(), key=lambda item: item[1], reverse=True)),
        }
    )
    return result


def summarize_benchmark_run(run: DatasetRun) -> dict:
    return {
        "file": str(run.file_path.name),
        "profile": run.profile,
        "rows": len(run.rows),
        "quality": round(run.quality, 4),
        "agreement": round(run.agreement, 4),
        "coverage": round(run.coverage, 4),
        "recency": round(run.recency, 4),
        "routeSummary": summarize_route_quality(run.rows),
        "overview": run.payload.get("overview", {}),
        "clusteringSummary": summarize_clustering(run.payload),
    }


def summarize_dataset(runs: List[DatasetRun]) -> dict:
    all_rows = [item for run in runs for item in run.rows]
    overall = summarize_route_quality(all_rows)
    profile_breakdown = {
        run.profile: summarize_route_quality(run.rows) for run in runs
    }
    return {
        "totalRuns": len(runs),
        "overall": overall,
        "profiles": profile_breakdown,
    }


def feature_vector(row: dict) -> List[float]:
    E = max(1.0, float(row.get("E") or 0.0))
    N = max(1.0, float(row.get("N") or 0.0))
    beeline_m = max(1.0, float(row.get("beelineM") or 0.0))
    safe_e = max(1.0, E)
    safe_n = max(1.0, N)
    safe_beeline_km = max(0.25, beeline_m / 1000.0)

    avg_out = float(row.get("avgOutDegree") or (safe_e / safe_n))
    edges_per_km = float(row.get("edgesPerKmBeeline") or (safe_e / safe_beeline_km))
    nodes_per_km = float(row.get("nodesPerKmBeeline") or (safe_n / safe_beeline_km))
    beeline_per_node = float(row.get("beelinePerNode") or (safe_beeline_km / safe_n))
    avg_branch = float(row.get("avgBranchFactor") or (safe_e / safe_n))
    size_ratio_en = float(row.get("sizeRatioEN") or (safe_e / safe_n))
    relative_density = float(row.get("relativeDensity") or 0.0)
    global_coverage = float(row.get("globalCoverage") or 0.0)
    empty_ratio = float(row.get("emptyRatio") or 1.0)

    source_degree = float(
        row.get("sourceDegree")
        or row.get("nodeDegreeSource")
        or 0.0
    )
    target_degree = float(
        row.get("targetDegree")
        or row.get("nodeDegreeTarget")
        or 0.0
    )
    source_centrality = float(
        row.get("sourceCentrality")
        or row.get("nodeCentralitySource")
        or 0.0
    )
    target_centrality = float(
        row.get("targetCentrality")
        or row.get("nodeCentralityTarget")
        or 0.0
    )
    source_target_degree_ratio = float(
        row.get("sourceTargetDegreeRatio")
        or (source_degree / max(1.0, target_degree))
    )
    source_target_centrality_ratio = float(
        row.get("sourceTargetCentralityRatio")
        or (source_centrality / max(1.0, target_centrality))
    )
    graph_density = float(row.get("graphDensity") or relative_density)

    logE = math.log1p(safe_e)
    logN = math.log1p(safe_n)
    log_beeline_km = math.log1p(safe_beeline_km)
    log_edges_km = math.log1p(max(0.0, edges_per_km))
    log_nodes_km = math.log1p(max(0.0, nodes_per_km))
    log_e_over_n = math.log1p(max(0.0, size_ratio_en))
    log_beeline_per_node = math.log1p(max(0.0, beeline_per_node))

    return [
        safe_n,
        safe_e,
        safe_beeline_km,
        avg_out,
        edges_per_km,
        nodes_per_km,
        size_ratio_en,
        beeline_per_node,
        relative_density,
        global_coverage,
        empty_ratio,
        source_degree,
        target_degree,
        source_centrality,
        target_centrality,
        source_target_degree_ratio,
        source_target_centrality_ratio,
        graph_density,
        avg_branch,
        logN,
        logE,
        log_beeline_km,
        log_edges_km,
        log_nodes_km,
        log_e_over_n,
        log_beeline_per_node,
    ]


def standardize_features(X: np.ndarray) -> Tuple[np.ndarray, List[float], List[float]]:
    means = np.mean(X, axis=0)
    scales = np.std(X, axis=0)
    scales = [float(s) if s > 1e-12 else 1.0 for s in scales]
    scaled = (X - means) / np.array(scales, dtype=np.float64)
    return scaled, means.tolist(), scales


def softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exp_values = np.exp(shifted)
    total = np.sum(exp_values)
    if not np.isfinite(total) or total <= 0:
        return np.full_like(values, 1.0 / len(values))
    return exp_values / total


def get_float(row: dict, key: str, default: float = 0.0) -> float:
    value = row.get(key)
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def get_int(row: dict, key: str, default: int = 0) -> int:
    value = row.get(key)
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def winner_margin_pct(row: dict) -> float:
    if row.get("winner_margin_pct") is not None:
        return get_float(row, "winner_margin_pct", 0.0)
    if row.get("best_time_ms") is not None and row.get("second_best_ms") is not None:
        best = get_float(row, "best_time_ms", 0.0)
        second = get_float(row, "second_best_ms", 0.0)
        if best > 0.0:
            return max(0.0, (second - best) / best)
    times = [
        get_float(row, field, 0.0)
        for field in ENGINE_TIME_FIELDS.values()
        if get_float(row, field, 0.0) > 0.0
    ]
    if len(times) < 2:
        return 0.0
    times.sort()
    return max(0.0, (times[1] - times[0]) / max(times[0], 1e-9))


def has_complete_engine_times(item: dict) -> bool:
    return all(engine in item.get("times", {}) for engine in ENGINE_IDS)


def sample_weight(item: dict, run_quality: float) -> float:
    row = item["row"]
    times = item["times"]
    ordered = sorted(times.values())
    best = ordered[0]
    second = ordered[1] if len(ordered) > 1 else best
    spread = (second - best) / max(best, 1e-9)

    tie = bool(row.get("winner_tied"))
    any_error = bool(row.get("any_engine_error"))
    all_engines_found = bool(row.get("all_engines_found"))
    all_engines_timed = bool(row.get("all_engines_timed"))
    all_engines_cost = bool(row.get("all_engines_cost"))

    winner_margin = winner_margin_pct(row)
    best_to_worst_pct = get_float(row, "best_to_worst_pct", 0.0)
    engines_within_5pct = get_int(row, "engines_within_5pct", 0)
    engines_within_10pct = get_int(row, "engines_within_10pct", 0)
    winner_candidate_count = max(1, get_int(row, "winner_candidate_count", 1))
    winner_vs_cost_pct = row.get("winner_vs_cost_pct")

    base = 0.35 + 0.65 * run_quality
    clarity = 0.4 + min(1.0, winner_margin * 3.0) + min(1.0, spread * 4.0) + min(1.0, best_to_worst_pct * 1.2)
    ambiguity_penalty = 1.0 - min(
        0.8,
        engines_within_5pct * 0.12 + engines_within_10pct * 0.06 + max(0, winner_candidate_count - 1) * 0.08,
    )
    clarity *= max(0.25, ambiguity_penalty)

    if tie:
        clarity *= 0.65
    if any_error:
        clarity *= 0.55
    if winner_vs_cost_pct is None:
        clarity *= 0.92

    completeness = 1.0
    if not all_engines_timed:
        completeness *= 0.75
    if not all_engines_found:
        completeness *= 0.8
    if not all_engines_cost:
        completeness *= 0.9

    weight = base * max(0.2, clarity) * completeness
    return max(0.03, min(1.0, weight))


def regret_for_prediction(pred_engine: str, item: dict) -> float:
    times = item["times"]
    best = min(times.values())
    pred_t = times.get(pred_engine)
    if pred_t is None:
        return 1.0
    return max(0.0, (pred_t - best) / max(best, 1e-9))


def build_xy_for_profile(runs: List[DatasetRun], profile: str):
    profile_runs = [r for r in runs if r.profile == profile]
    if not profile_runs:
        return None

    X: List[List[float]] = []
    y: List[int] = []
    w: List[float] = []
    items: List[dict] = []

    class_idx = {engine: i for i, engine in enumerate(ENGINE_IDS)}

    for run in profile_runs:
        for item in run.rows:
            X.append(feature_vector(item["row"]))
            y.append(class_idx[item["winner"]])
            w.append(sample_weight(item, run.quality))
            items.append(item)

    if not X:
        return None

    return {
        "X": np.array(X, dtype=np.float64),
        "y": np.array(y, dtype=np.int64),
        "w": np.array(w, dtype=np.float64),
        "items": items,
        "runs": profile_runs,
    }


def fit_runtime_models(profile_data: dict, profile: str):
    """Train a per-engine runtime regressor and export a small runtime model."""
    X = profile_data["X"]
    w = profile_data["w"]
    items = profile_data["items"]
    classes = ENGINE_IDS

    complete_indices = [
        i for i, item in enumerate(items) if has_complete_engine_times(item)
    ]
    if not complete_indices:
        raise RuntimeError(f"No complete runtime items found for profile {profile}")

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
        [ENGINE_IDS.index(item["winner"]) for item in complete_items],
        dtype=np.int64,
    )

    def evaluate_alpha(alpha):
        scores = []
        regrets = []
        hit_rates = []
        confidences = []
        margins = []

        for split_seed in RANDOM_SPLITS:
            idx_all = np.arange(len(complete_items))
            stratify = y_true if len(set(y_true.tolist())) > 1 else None
            idx_train, idx_val = train_test_split(
                idx_all,
                test_size=VALIDATION_FRACTION,
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
                model.fit(
                    X_train_scaled,
                    y_by_engine[engine][idx_train],
                    sample_weight=w_train,
                )
                engine_models[engine] = model

            preds = np.column_stack(
                [engine_models[engine].predict(X_val_scaled) for engine in classes]
            )
            probs = np.exp(-preds - np.max(-preds, axis=1, keepdims=True))
            probs = probs / np.sum(probs, axis=1, keepdims=True)

            split_regrets = []
            split_hit_rate = 0

            for pos, sample_idx in enumerate(idx_val):
                pred_idx = int(np.argmin(preds[pos]))
                pred_engine = classes[pred_idx]
                split_regrets.append(regret_for_prediction(pred_engine, complete_items[sample_idx]))
                if pred_idx == y_val[pos]:
                    split_hit_rate += 1

                sorted_p = np.sort(probs[pos])
                confidences.append(float(sorted_p[-1]))
                margins.append(float(sorted_p[-1] - sorted_p[-2]) if len(sorted_p) > 1 else float(sorted_p[-1]))

            split_mean_regret = float(np.mean(split_regrets)) if split_regrets else 1.0
            split_hit_rate = float(split_hit_rate / len(idx_val)) if len(idx_val) else 0.0
            split_score = split_mean_regret - 0.15 * split_hit_rate

            scores.append(split_score)
            regrets.append(split_mean_regret)
            hit_rates.append(split_hit_rate)

        return {
            "score": float(np.mean(scores)),
            "mean_regret": float(np.mean(regrets)),
            "hit_rate": float(np.mean(hit_rates)),
            "confidence_p50": float(median(confidences)) if confidences else 0.5,
            "margin_p50": float(median(margins)) if margins else 0.0,
        }

    best = None
    for alpha in REGRESSION_ALPHA_SEARCH:
        try:
            result = evaluate_alpha(alpha)
            if best is None or result["score"] < best["score"]:
                best = {
                    "score": result["score"],
                    "alpha": alpha,
                    "mean_regret": result["mean_regret"],
                    "hit_rate": result["hit_rate"],
                    "confidence_p50": result["confidence_p50"],
                    "margin_p50": result["margin_p50"],
                }
        except Exception:
            continue

    if best is None:
        raise RuntimeError(f"Runtime regression training failed for profile {profile}")

    X_scaled, means, scales = standardize_features(X_complete)
    regressors = {}
    for engine in classes:
        model = Ridge(alpha=best["alpha"])
        model.fit(X_scaled, y_by_engine[engine], sample_weight=w_complete)
        regressors[engine] = {
            "coefficients": [float(c) for c in model.coef_],
            "intercept": float(model.intercept_),
        }

    class_counts = Counter(item["winner"] for item in complete_items)
    fallback_engine = class_counts.most_common(1)[0][0]
    min_conf = max(0.38, min(0.92, best["confidence_p50"] * 0.95))
    min_margin = max(0.04, min(0.32, best["margin_p50"] * 0.9))

    return {
        "profile": profile,
        "modelType": "runtime-linear",
        "classes": classes,
        "fallbackEngine": fallback_engine,
        "minConfidence": float(min_conf),
        "minMargin": float(min_margin),
        "regressors": regressors,
        "scaler_mean": means,
        "scaler_scale": scales,
        "metrics": {
            "validationMeanRegret": best["mean_regret"],
            "validationHitRate": best["hit_rate"],
            "chosenAlpha": best["alpha"],
            "samples": int(len(complete_items)),
        },
    }


def fit_xgboost_model(profile_data: dict, profile: str):
    """Train an XGBoost multi-class selector and export it as JS via m2cgen."""
    X = profile_data["X"]
    y = profile_data["y"]
    w = profile_data["w"]
    items = profile_data["items"]
    classes = ENGINE_IDS

    def evaluate_config(max_depth, n_estimators, learning_rate):
        scores = []
        regrets = []
        hit_rates = []
        confidences = []
        margins = []

        for split_seed in RANDOM_SPLITS:
            idx_all = np.arange(len(y))
            stratify = y if len(set(y.tolist())) > 1 else None
            idx_train, idx_val = train_test_split(
                idx_all,
                test_size=VALIDATION_FRACTION,
                random_state=split_seed,
                shuffle=True,
                stratify=stratify,
            )

            model = XGBClassifier(
                objective="multi:softprob",
                use_label_encoder=False,
                eval_metric="mlogloss",
                num_class=len(classes),
                max_depth=max_depth,
                learning_rate=learning_rate,
                n_estimators=n_estimators,
                num_parallel_tree=1,
                base_score=0.5,
                verbosity=0,
                n_jobs=-1,
                random_state=split_seed,
            )
            model.fit(X[idx_train], y[idx_train], sample_weight=w[idx_train])

            proba = model.predict_proba(X[idx_val])
            pred = np.argmax(proba, axis=1)

            split_regrets = []
            split_confidences = []
            split_margins = []
            for pos, sample_idx in enumerate(idx_val):
                pred_engine = classes[pred[pos]]
                split_regrets.append(regret_for_prediction(pred_engine, items[sample_idx]))
                sorted_p = np.sort(proba[pos])
                split_confidences.append(float(sorted_p[-1]))
                split_margins.append(float(sorted_p[-1] - sorted_p[-2]) if len(sorted_p) > 1 else float(sorted_p[-1]))

            split_mean_regret = float(np.mean(split_regrets)) if split_regrets else 1.0
            split_hit_rate = float(np.mean(pred == y[idx_val])) if len(idx_val) else 0.0
            split_score = split_mean_regret - 0.15 * split_hit_rate

            scores.append(split_score)
            regrets.append(split_mean_regret)
            hit_rates.append(split_hit_rate)
            confidences.extend(split_confidences)
            margins.extend(split_margins)

        return {
            "score": float(np.mean(scores)),
            "mean_regret": float(np.mean(regrets)),
            "hit_rate": float(np.mean(hit_rates)),
            "confidence_p50": float(median(confidences)) if confidences else 0.5,
            "margin_p50": float(median(margins)) if margins else 0.0,
        }

    best = None
    for max_depth in HYPERPARAMETER_SEARCH["max_depth"]:
        for n_estimators in HYPERPARAMETER_SEARCH["n_estimators"]:
            for learning_rate in HYPERPARAMETER_SEARCH["learning_rate"]:
                try:
                    result = evaluate_config(max_depth, n_estimators, learning_rate)
                    if best is None or result["score"] < best["score"]:
                        best = {
                            "score": result["score"],
                            "max_depth": max_depth,
                            "n_estimators": n_estimators,
                            "learning_rate": learning_rate,
                            "mean_regret": result["mean_regret"],
                            "hit_rate": result["hit_rate"],
                            "confidence_p50": result["confidence_p50"],
                            "margin_p50": result["margin_p50"],
                        }
                except Exception:
                    continue

    if best is None:
        raise RuntimeError(f"XGBoost training failed for profile {profile}")

    final_model = XGBClassifier(
        objective="multi:softprob",
        use_label_encoder=False,
        eval_metric="mlogloss",
        num_class=len(classes),
        max_depth=best["max_depth"],
        learning_rate=best["learning_rate"],
        n_estimators=best["n_estimators"],
        num_parallel_tree=1,
        base_score=0.5,
        verbosity=0,
        n_jobs=-1,
        random_state=42,
    )
    final_model.fit(X, y, sample_weight=w)

    class_counts = Counter(y.tolist())
    fallback_idx = class_counts.most_common(1)[0][0]
    fallback_engine = classes[fallback_idx]

    min_conf = max(0.38, min(0.72, best["confidence_p50"] * 0.95))
    min_margin = max(0.04, min(0.28, best["margin_p50"] * 0.9))

    score_source = m2c.export_to_javascript(
        final_model,
        function_name=f"score_{profile}",
    )

    return {
        "profile": profile,
        "modelType": "xgboost",
        "classes": classes,
        "fallbackEngine": fallback_engine,
        "minConfidence": float(min_conf),
        "minMargin": float(min_margin),
        "scoreSource": score_source,
        "metrics": {
            "validationMeanRegret": best["mean_regret"],
            "validationHitRate": best["hit_rate"],
            "chosenMaxDepth": best["max_depth"],
            "chosenNEstimators": best["n_estimators"],
            "chosenLearningRate": best["learning_rate"],
            "samples": int(len(y)),
        },
    }


def fit_profile_model(profile_data: dict, profile: str, model_type: str = "runtime-linear"):
    """Wrapper that trains the requested model type for the profile."""
    if model_type == "xgboost":
        return fit_xgboost_model(profile_data, profile)
    return fit_runtime_models(profile_data, profile)


def build_model_payload(runs: List[DatasetRun], root: Path, model_type: str) -> dict:
    compute_consensus_agreement(runs)

    by_profile = {
        "sabOff": build_xy_for_profile(runs, "sabOff"),
        "sabOn": build_xy_for_profile(runs, "sabOn"),
    }

    profiles = {}
    for profile_name, pdata in by_profile.items():
        if pdata is None:
            continue
        profiles[profile_name] = fit_profile_model(pdata, profile_name, model_type)

    if "sabOff" not in profiles and profiles:
        profiles["sabOff"] = next(iter(profiles.values()))
    if "sabOn" not in profiles and profiles:
        profiles["sabOn"] = next(iter(profiles.values()))

    selected_runs = sorted(
        [
            summarize_benchmark_run(r)
            for r in runs
            if r.quality >= 0.45
        ],
        key=lambda x: x["quality"],
        reverse=True,
    )

    return {
        "generatedAt": datetime.now(UTC).isoformat(),
        "featureOrder": FEATURE_ORDER,
        "engines": ENGINE_IDS,
        "benchmarkSummary": summarize_dataset(runs),
        "profiles": profiles,
        "selectedRuns": selected_runs,
    }


def write_js_model(payload: dict, out_file: Path) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)

    profiles = payload.get("profiles", {})
    score_sources = {}
    for profile_name, profile_data in profiles.items():
        score_source = profile_data.pop("scoreSource", None)
        if score_source is None:
            continue

        score_name = f"score_{profile_name}"
        profile_data["score"] = f"__SCORE_FN__{score_name}__"
        score_sources[score_name] = score_source

    as_json = json.dumps(payload, indent=2)
    for score_name in score_sources:
        placeholder = f'"__SCORE_FN__{score_name}__"'
        as_json = as_json.replace(placeholder, score_name)

    model_js = "\n\n".join(score_sources.values())
    model_js += "\n\nexport const ROUTER_TUNING_ML_MODEL = Object.freeze(" + as_json + ");\n"
    out_file.write_text(model_js, encoding="utf-8")


def write_analysis_report(payload: dict, out_file: Path) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    report_payload = json.loads(json.dumps(payload))
    for profile_data in report_payload.get("profiles", {}).values():
        profile_data.pop("scoreSource", None)
        profile_data.pop("score", None)
    out_file.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Train OMP Router ML engine selector")
    parser.add_argument("--root", default=".", help="Repository root")
    parser.add_argument(
        "--out-js",
        default="src/tuning/model.js",
        help="Path to generated JS model artifact",
    )
    parser.add_argument(
        "--out-report",
        default="benchmark/results/analysis/engine_selector_ml_latest.json",
        help="Path to analysis report",
    )
    parser.add_argument(
        "--model-type",
        default="runtime-linear",
        choices=["runtime-linear", "xgboost"],
        help="Which model architecture to train",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    runs = load_runs(root)
    if not runs:
        raise SystemExit("No benchmark runs found to train model.")

    payload = build_model_payload(runs, root, args.model_type)
    if not payload.get("profiles"):
        raise SystemExit("Model training failed: no profiles were trained.")

    write_js_model(payload, root / args.out_js)
    write_analysis_report(payload, root / args.out_report)

    print("ML model trained successfully")
    print(f"Profiles: {', '.join(sorted(payload['profiles'].keys()))}")
    print(f"Model file: {args.out_js}")
    print(f"Report file: {args.out_report}")
    print(f"Selected runs: {len(payload.get('selectedRuns') or [])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
