#!/usr/bin/env python3
"""Train direct runtime-linear engine selectors and export a JS runtime model.

This pipeline learns two per-profile models:
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
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from statistics import median
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.linear_model import RidgeCV
from sklearn.metrics import make_scorer
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputRegressor


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
    "logAvgOutDegree",
    "edgesPerKm",
    "nodesPerKm",
    "sizeRatioEN",
    "beelinePerNode",
    "relativeDensity",
    "logRelativeDensity",
    "globalCoverage",
    "logGlobalCoverage",
    "emptyRatio",
    "logEmptyRatio",
    "sourceDegree",
    "logSourceDegree",
    "targetDegree",
    "logTargetDegree",
    "sourceCentrality",
    "logSourceCentrality",
    "targetCentrality",
    "logTargetCentrality",
    "sourceTargetDegreeRatio",
    "logSourceTargetDegreeRatio",
    "sourceTargetCentralityRatio",
    "logSourceTargetCentralityRatio",
    "graphDensity",
    "logGraphDensity",
    "avgBranchFactor",
    "logAvgBranchFactor",
    "logN",
    "logE",
    "logBeelineKm",
    "logEdgesPerKm",
    "logNodesPerKm",
    "logEoverN",
    "logBeelinePerNode",
    "densityBySize",
    "logDensityBySize",
    "coverageDensity",
    "logCoverageDensity",
    "degreeProduct",
    "logDegreeProduct",
    "centralityProduct",
    "logCentralityProduct",
    "coverageEmptyContrast",
    "logCoverageEmptyContrast",
    "safeBeelineKmOverSizeRatioEN",
    "globalCoverageTimesEmptyRatio",
    "avgOutDegreeTimesLogRelativeDensity",
    "beelinePerNodeTimesSourceTargetDegreeRatio",
    "coverageEmptyContrastTimesLogAvgBranchFactor",
    "densityBySizeTimesSourceCentrality",
]

FEATURE_SELECTION_PCT = [1.0, 0.75, 0.60, 0.45, 0.30]
REGRESSION_ALPHA_SEARCH = [0.02, 0.04, 0.06, 0.08, 0.1, 0.2]
REGRESSION_ALPHA_SEARCH_SABOFF = [0.06, 0.07, 0.08, 0.09, 0.1, 0.12]
REGRESSION_ALPHA_SEARCH_SABON = [0.02, 0.04, 0.06, 0.08, 0.1, 0.2]
PROFILE_REGRESSION_ALPHA_SEARCH = {
    "sabOff": REGRESSION_ALPHA_SEARCH_SABOFF,
    "sabOn": REGRESSION_ALPHA_SEARCH_SABON,
}
VALIDATION_FRACTION = 0.2
RANDOM_SPLITS = [42, 77, 99, 123, 202]
REGRET_TOLERANCE = 0.002
MARGIN_NORMALIZATION = 0.05
DEFAULT_FALLBACK_ENGINE = "ultra-dijkstra"


@dataclass
class TrainingConfig:
    good_enough_tolerance: float = 0.05
    min_good_enough_rate: float = 0.58
    min_hit_rate: float = 0.40
    alpha_grid: Optional[List[float]] = None
    cv_split_seeds: Tuple[int, ...] = tuple(RANDOM_SPLITS)
    regret_tail_weight: float = 0.75
    regret_percentile_weight: float = 0.25
    regret_percentile: float = 0.9
    use_holdout_splits: bool = True


PROFILE_OBJECTIVE_CONFIG = {
    "sabOff": {
        "min_good_enough_rate": 0.60,
        "min_hit_rate": 0.35,
    },
    "sabOn": {
        "min_good_enough_rate": 0.58,
        "min_hit_rate": 0.35,
    },
}


def profile_thresholds(profile: str, config: Optional[TrainingConfig] = None) -> Tuple[float, float]:
    profile_config = PROFILE_OBJECTIVE_CONFIG.get(profile, {})
    if config is None:
        return (
            profile_config.get("min_good_enough_rate", 0.58),
            profile_config.get("min_hit_rate", 0.40),
        )
    return (
        profile_config.get("min_good_enough_rate", config.min_good_enough_rate),
        profile_config.get("min_hit_rate", config.min_hit_rate),
    )


def safe_stratify(y: np.ndarray) -> Optional[np.ndarray]:
    """Return a stratify array only when each class has enough examples."""
    if y is None:
        return None

    counts = Counter(y.tolist())
    if len(counts) <= 1:
        return None
    if any(count < 2 for count in counts.values()):
        return None
    return y


def build_validation_splits(
    complete_items: List[dict],
    y_true: np.ndarray,
    training_config: TrainingConfig,
) -> List[Tuple[np.ndarray, np.ndarray]]:
    splits: List[Tuple[np.ndarray, np.ndarray]] = []
    file_indices = np.array(
        [item.get("benchmarkFileIndex", 0) for item in complete_items],
        dtype=np.int64,
    )
    unique_files = np.unique(file_indices)

    if training_config.use_holdout_splits and len(unique_files) == 2:
        for test_file in unique_files:
            train_idx = np.where(file_indices != test_file)[0]
            test_idx = np.where(file_indices == test_file)[0]
            if train_idx.size and test_idx.size:
                splits.append((train_idx, test_idx))

    for split_seed in training_config.cv_split_seeds:
        idx_all = np.arange(len(complete_items))
        stratify = safe_stratify(y_true)
        train_idx, test_idx = train_test_split(
            idx_all,
            test_size=VALIDATION_FRACTION,
            random_state=split_seed,
            shuffle=True,
            stratify=stratify,
        )
        splits.append((train_idx, test_idx))

    return splits


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
    log_global_coverage = math.log1p(max(0.0, global_coverage))
    log_empty_ratio = math.log1p(max(0.0, empty_ratio))
    log_source_degree = math.log1p(max(0.0, source_degree))
    log_target_degree = math.log1p(max(0.0, target_degree))
    log_source_centrality = math.log1p(max(0.0, source_centrality))
    log_target_centrality = math.log1p(max(0.0, target_centrality))
    log_source_target_degree_ratio = math.log1p(max(0.0, source_target_degree_ratio))
    log_source_target_centrality_ratio = math.log1p(max(0.0, source_target_centrality_ratio))
    log_edges_km = math.log1p(max(0.0, edges_per_km))
    log_nodes_km = math.log1p(max(0.0, nodes_per_km))
    log_e_over_n = math.log1p(max(0.0, size_ratio_en))
    log_beeline_per_node = math.log1p(max(0.0, beeline_per_node))
    log_avg_out = math.log1p(max(0.0, avg_out))
    log_relative_density = math.log1p(max(0.0, relative_density))
    log_graph_density = math.log1p(max(0.0, graph_density))
    log_avg_branch = math.log1p(max(0.0, avg_branch))
    density_by_size = relative_density * safe_n
    coverage_density = global_coverage * relative_density
    degree_product = source_degree * target_degree
    centrality_product = source_centrality * target_centrality
    coverage_empty_contrast = global_coverage * max(0.0, 1.0 - empty_ratio)
    safe_beeline_km_over_size_ratio_en = safe_beeline_km / max(0.25, size_ratio_en)
    global_coverage_times_empty_ratio = global_coverage * empty_ratio
    avg_out_degree_times_log_relative_density = avg_branch * log_relative_density
    beeline_per_node_times_source_target_degree_ratio = beeline_per_node * source_target_degree_ratio
    coverage_empty_contrast_times_log_avg_branch_factor = coverage_empty_contrast * log_avg_branch
    density_by_size_times_source_centrality = density_by_size * source_centrality

    log_density_by_size = math.log1p(max(0.0, density_by_size))
    log_coverage_density = math.log1p(max(0.0, coverage_density))
    log_degree_product = math.log1p(max(0.0, degree_product))
    log_centrality_product = math.log1p(max(0.0, centrality_product))
    log_coverage_empty_contrast = math.log1p(max(0.0, coverage_empty_contrast))

    return [
        safe_n,
        safe_e,
        safe_beeline_km,
        avg_out,
        log_avg_out,
        edges_per_km,
        nodes_per_km,
        size_ratio_en,
        beeline_per_node,
        relative_density,
        log_relative_density,
        global_coverage,
        log_global_coverage,
        empty_ratio,
        log_empty_ratio,
        source_degree,
        log_source_degree,
        target_degree,
        log_target_degree,
        source_centrality,
        log_source_centrality,
        target_centrality,
        log_target_centrality,
        source_target_degree_ratio,
        log_source_target_degree_ratio,
        source_target_centrality_ratio,
        log_source_target_centrality_ratio,
        graph_density,
        log_graph_density,
        avg_branch,
        log_avg_branch,
        logN,
        logE,
        log_beeline_km,
        log_edges_km,
        log_nodes_km,
        log_e_over_n,
        log_beeline_per_node,
        density_by_size,
        log_density_by_size,
        coverage_density,
        log_coverage_density,
        degree_product,
        log_degree_product,
        centrality_product,
        log_centrality_product,
        coverage_empty_contrast,
        log_coverage_empty_contrast,
        safe_beeline_km_over_size_ratio_en,
        global_coverage_times_empty_ratio,
        avg_out_degree_times_log_relative_density,
        beeline_per_node_times_source_target_degree_ratio,
        coverage_empty_contrast_times_log_avg_branch_factor,
        density_by_size_times_source_centrality,
    ]


def standardize_features(X: np.ndarray) -> Tuple[np.ndarray, List[float], List[float]]:
    means = np.mean(X, axis=0)
    scales = np.std(X, axis=0)
    scales = [float(s) if s > 1e-12 else 1.0 for s in scales]
    scaled = (X - means) / np.array(scales, dtype=np.float64)
    return scaled, means.tolist(), scales


def select_top_feature_indices(importance: dict, top_n: int) -> List[int]:
    ranked = [item.get("feature") for item in importance.get("featureRankings", [])]
    selected = []
    for feature_name in ranked[:top_n]:
        if feature_name in FEATURE_ORDER:
            selected.append(FEATURE_ORDER.index(feature_name))
    return selected


def embed_sparse_coefficients(full_size: int, selected_indices: List[int], sparse_coeffs: np.ndarray) -> List[float]:
    full_coeffs = [0.0] * full_size
    for idx, coeff in zip(selected_indices, sparse_coeffs.tolist()):
        full_coeffs[idx] = float(coeff)
    return full_coeffs


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


def winner_candidate_count(row: dict) -> int:
    candidates = row.get("winner_candidates")
    if isinstance(candidates, (list, tuple)):
        return max(1, len(candidates))
    return max(1, get_int(row, "winner_candidate_count", 1))


def is_good_enough_prediction(pred_engine: str, item: dict, tolerance: float = 0.05) -> bool:
    if pred_engine == item["winner"]:
        return True
    row = item["row"]
    candidates = row.get("winner_candidates")
    if isinstance(candidates, (list, tuple)) and pred_engine in candidates:
        return True
    return regret_for_prediction(pred_engine, item) <= tolerance


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
    winner_candidate_count_val = winner_candidate_count(row)
    winner_vs_cost_pct = row.get("winner_vs_cost_pct")

    quality_bonus = 0.22 + 0.72 * (run_quality ** 1.8)
    base = quality_bonus + min(0.16, winner_margin)
    clarity = 0.35 + min(1.0, winner_margin * 4.2) + min(1.0, spread * 5.0) + min(1.0, best_to_worst_pct * 1.8)

    ambiguity_penalty = 1.0 - min(
        0.92,
        engines_within_5pct * 0.18 + engines_within_10pct * 0.08 + max(0, winner_candidate_count_val - 1) * 0.12,
    )
    clarity *= max(0.18, ambiguity_penalty)

    if winner_margin < 0.05:
        clarity *= 0.75
    if winner_margin < 0.02:
        clarity *= 0.65
    if best_to_worst_pct < 0.05:
        clarity *= 0.80
    if tie:
        clarity *= 0.50
    if any_error:
        clarity *= 0.40
    if winner_vs_cost_pct is None:
        clarity *= 0.88

    completeness = 1.0
    if not all_engines_timed:
        completeness *= 0.60
    if not all_engines_found:
        completeness *= 0.55
    if not all_engines_cost:
        completeness *= 0.70

    regret_factor = 1.0 + min(1.8, max(0.0, winner_margin - 0.04) * 2.5 + max(0.0, best_to_worst_pct - 0.05) * 1.0)
    if winner_margin > 0.12 and winner_candidate_count_val == 1:
        regret_factor += 0.15
    if engines_within_5pct > 0:
        regret_factor += 0.08
    if tie:
        regret_factor += 0.05

    weight = base * max(0.16, clarity) * completeness * regret_factor
    return max(0.01, min(1.0, weight))


def regret_for_prediction(pred_engine: str, item: dict) -> float:
    times = item["times"]
    best = min(times.values())
    pred_t = times.get(pred_engine)
    if pred_t is None:
        return 1.0
    return max(0.0, (pred_t - best) / max(best, 1e-9))


def is_training_candidate(item: dict) -> bool:
    row = item["row"]
    if bool(row.get("any_engine_error")):
        return False
    if not bool(row.get("all_engines_found")) or not bool(row.get("all_engines_timed")):
        return False
    return True


def build_xy_for_profile(runs: List[DatasetRun], profile: str):
    profile_runs = [r for r in runs if r.profile == profile]
    if not profile_runs:
        return None

    X: List[List[float]] = []
    y: List[int] = []
    w: List[float] = []
    items: List[dict] = []

    class_idx = {engine: i for i, engine in enumerate(ENGINE_IDS)}

    filtered = 0
    total = 0
    for run_index, run in enumerate(profile_runs):
        for item in run.rows:
            total += 1
            if not is_training_candidate(item):
                filtered += 1
                continue
            item["benchmarkFileName"] = str(run.file_path.name)
            item["benchmarkFileIndex"] = run_index
            X.append(feature_vector(item["row"]))
            y.append(class_idx[item["winner"]])
            w.append(sample_weight(item, run.quality))
            items.append(item)
    if filtered:
        print(f"Profile {profile}: filtered {filtered} / {total} noisy or ambiguous routes from training data")

    if not X:
        return None

    return {
        "X": np.array(X, dtype=np.float64),
        "y": np.array(y, dtype=np.int64),
        "w": np.array(w, dtype=np.float64),
        "items": items,
        "runs": profile_runs,
    }


def fit_runtime_models(
    profile_data: dict,
    profile: str,
    use_feature_selection: bool = True,
    training_config: TrainingConfig = TrainingConfig(),
):
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

    validation_splits = build_validation_splits(complete_items, y_true, training_config)
    alpha_grid = training_config.alpha_grid or PROFILE_REGRESSION_ALPHA_SEARCH.get(profile, REGRESSION_ALPHA_SEARCH)
    alpha_search_results = []

    def evaluate_alpha(alpha: float, feature_indices: Optional[List[int]] = None) -> dict:
        scores = []
        regrets = []
        regret_tails = []
        regret_tail_squared = []
        regret_p90 = []
        hit_rates = []
        good_enough_rates = []
        confidences = []
        margins = []

        for split_index, (idx_train, idx_val) in enumerate(validation_splits):
            if feature_indices is None or len(feature_indices) == X_complete.shape[1]:
                X_train = X_complete[idx_train]
                X_val = X_complete[idx_val]
            else:
                X_train = X_complete[idx_train][:, feature_indices]
                X_val = X_complete[idx_val][:, feature_indices]

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
            split_good_enough = 0
            split_confidences = []
            split_margins = []

            for pos, sample_idx in enumerate(idx_val):
                pred_idx = int(np.argmin(preds[pos]))
                pred_engine = classes[pred_idx]
                split_regrets.append(regret_for_prediction(pred_engine, complete_items[sample_idx]))
                if pred_idx == y_val[pos]:
                    split_hit_rate += 1
                if is_good_enough_prediction(
                    pred_engine,
                    complete_items[sample_idx],
                    tolerance=training_config.good_enough_tolerance,
                ):
                    split_good_enough += 1

                sorted_p = np.sort(probs[pos])
                split_confidences.append(float(sorted_p[-1]))
                split_margins.append(
                    float(sorted_p[-1] - sorted_p[-2]) if len(sorted_p) > 1 else float(sorted_p[-1])
                )

            split_mean_regret = float(np.mean(split_regrets)) if split_regrets else 1.0
            split_regret_tail = float(
                np.mean([max(0.0, r - training_config.good_enough_tolerance) for r in split_regrets])
            ) if split_regrets else 0.0
            split_regret_tail_squared = float(
                np.mean([max(0.0, r - training_config.good_enough_tolerance) ** 2 for r in split_regrets])
            ) if split_regrets else 0.0
            split_regret_p90 = float(
                np.percentile(split_regrets, training_config.regret_percentile * 100)
            ) if split_regrets else 0.0
            split_hit_rate = float(split_hit_rate / len(idx_val)) if len(idx_val) else 0.0
            split_good_enough_rate = float(split_good_enough / len(idx_val)) if len(idx_val) else 0.0
            split_confidence_p50 = float(np.median(split_confidences)) if split_confidences else 0.5
            split_margin_p50 = float(np.median(split_margins)) if split_margins else 0.0
            split_score = (
                split_mean_regret
                + training_config.regret_tail_weight * split_regret_tail
                + training_config.regret_percentile_weight * split_regret_p90
                + 0.25 * split_regret_tail_squared
            )

            scores.append(split_score)
            regrets.append(split_mean_regret)
            regret_tails.append(split_regret_tail)
            regret_tail_squared.append(split_regret_tail_squared)
            regret_p90.append(split_regret_p90)
            hit_rates.append(split_hit_rate)
            good_enough_rates.append(split_good_enough_rate)
            confidences.extend(split_confidences)
            margins.extend(split_margins)

        return {
            "score": float(np.mean(scores)),
            "mean_regret": float(np.mean(regrets)),
            "regret_tail": float(np.mean(regret_tails)),
            "regret_tail_squared": float(np.mean(regret_tail_squared)),
            "regret_p90": float(np.mean(regret_p90)),
            "hit_rate": float(np.mean(hit_rates)),
            "good_enough_rate": float(np.mean(good_enough_rates)),
            "confidence_p50": float(np.median(confidences)) if confidences else 0.5,
            "margin_p50": float(np.median(margins)) if margins else 0.0,
        }

    def train_ridge(alpha: float, feature_indices: List[int], embed_full: bool = True) -> dict:
        regressors = {}
        X_subset = X_scaled[:, feature_indices] if len(feature_indices) != X_scaled.shape[1] else X_scaled
        for engine in classes:
            model = Ridge(alpha=alpha)
            model.fit(X_subset, y_by_engine[engine], sample_weight=w_complete)
            coefficients = model.coef_
            if embed_full and len(feature_indices) != X_scaled.shape[1]:
                coefficients = np.array(
                    embed_sparse_coefficients(X_scaled.shape[1], feature_indices, coefficients),
                    dtype=np.float64,
                )
            regressors[engine] = {
                "coefficients": [float(c) for c in coefficients],
                "intercept": float(model.intercept_),
            }
        return regressors

    def evaluate_best_alpha_for_subset(feature_indices: List[int]) -> dict:
        candidates = []
        for alpha in alpha_grid:
            try:
                result = evaluate_alpha(alpha, feature_indices)
            except Exception:
                continue
            candidates.append({
                "alpha": alpha,
                "score": result["score"],
                "mean_regret": result["mean_regret"],
                "regret_tail": result["regret_tail"],
                "regret_tail_squared": result["regret_tail_squared"],
                "regret_p90": result["regret_p90"],
                "hit_rate": result["hit_rate"],
                "good_enough_rate": result["good_enough_rate"],
                "confidence_p50": result["confidence_p50"],
                "margin_p50": result["margin_p50"],
            })
        if not candidates:
            raise RuntimeError(f"Feature subset evaluation failed for profile {profile}")
        best_result = choose_candidate(
            candidates,
            require_hit_rate=False,
            profile=profile,
            training_config=training_config,
        )
        return best_result

    X_scaled, means, scales = standardize_features(X_complete)

    def refine_alpha_candidates(best_alpha: float, alphas: List[float]) -> List[float]:
        sorted_alphas = sorted(set(alphas))
        if best_alpha not in sorted_alphas:
            return []
        idx = sorted_alphas.index(best_alpha)
        refined = []
        if idx > 0:
            lower = sorted_alphas[idx - 1]
            refined.extend(list(np.linspace(lower, best_alpha, num=5, endpoint=False))[1:])
        if idx < len(sorted_alphas) - 1:
            upper = sorted_alphas[idx + 1]
            refined.extend(list(np.linspace(best_alpha, upper, num=5, endpoint=False))[1:])
        if idx == 0 and len(sorted_alphas) > 1:
            step = sorted_alphas[1] - sorted_alphas[0]
            refined.append(max(sorted_alphas[0] - step / 2.0, 1e-6))
        if idx == len(sorted_alphas) - 1 and len(sorted_alphas) > 1:
            step = sorted_alphas[-1] - sorted_alphas[-2]
            refined.append(sorted_alphas[-1] + step / 2.0)
        return sorted(set(refined) - set(sorted_alphas))

    candidates = []
    for alpha in alpha_grid:
        try:
            result = evaluate_alpha(alpha)
        except Exception:
            continue
        candidate = {
            "alpha": alpha,
            "score": result["score"],
            "mean_regret": result["mean_regret"],
            "regret_tail": result["regret_tail"],
            "regret_tail_squared": result["regret_tail_squared"],
            "regret_p90": result["regret_p90"],
            "hit_rate": result["hit_rate"],
            "good_enough_rate": result["good_enough_rate"],
            "confidence_p50": result["confidence_p50"],
            "margin_p50": result["margin_p50"],
        }
        alpha_search_results.append({
            "alpha": alpha,
            "score": candidate["score"],
            "meanRegret": candidate["mean_regret"],
            "regretTail": candidate["regret_tail"],
            "regretP90": candidate["regret_p90"],
            "hitRate": candidate["hit_rate"],
            "goodEnoughRate": candidate["good_enough_rate"],
            "confidenceP50": candidate["confidence_p50"],
            "marginP50": candidate["margin_p50"],
        })
        candidates.append(candidate)

    if not candidates:
        raise RuntimeError(f"Runtime regression training failed for profile {profile}")

    best = choose_candidate(
        candidates,
        require_hit_rate=True,
        profile=profile,
        training_config=training_config,
    )

    refinement_alphas = refine_alpha_candidates(best["alpha"], alpha_grid)
    for alpha in refinement_alphas:
        try:
            result = evaluate_alpha(alpha)
        except Exception:
            continue
        candidate = {
            "alpha": alpha,
            "score": result["score"],
            "mean_regret": result["mean_regret"],
            "regret_tail": result["regret_tail"],
            "regret_tail_squared": result["regret_tail_squared"],
            "regret_p90": result["regret_p90"],
            "hit_rate": result["hit_rate"],
            "good_enough_rate": result["good_enough_rate"],
            "confidence_p50": result["confidence_p50"],
            "margin_p50": result["margin_p50"],
        }
        alpha_search_results.append({
            "alpha": alpha,
            "score": candidate["score"],
            "meanRegret": candidate["mean_regret"],
            "regretTail": candidate["regret_tail"],
            "regretP90": candidate["regret_p90"],
            "hitRate": candidate["hit_rate"],
            "goodEnoughRate": candidate["good_enough_rate"],
            "confidenceP50": candidate["confidence_p50"],
            "marginP50": candidate["margin_p50"],
        })
        candidates.append(candidate)

    if refinement_alphas:
        best = choose_candidate(
            candidates,
            require_hit_rate=True,
            profile=profile,
            training_config=training_config,
        )

    initial_regressors = train_ridge(best["alpha"], list(range(X_scaled.shape[1])))
    importance = compute_feature_importance({"regressors": initial_regressors}, FEATURE_ORDER)
    selected_indices = list(range(X_scaled.shape[1]))
    selected_feature_names = [FEATURE_ORDER[i] for i in selected_indices]
    selected_feature_count = X_scaled.shape[1]
    feature_selection_applied = False
    feature_selection_gain = 0.0
    feature_selection_candidates = []

    if use_feature_selection and X_scaled.shape[1] > 20:
        ranked_indices = select_top_feature_indices(importance, X_scaled.shape[1])
        candidate_counts = sorted(
            {len(FEATURE_ORDER)}.union(
                max(1, int(round(len(FEATURE_ORDER) * pct))) for pct in FEATURE_SELECTION_PCT
            ),
            reverse=True,
        )
        best_subset = {
            "indices": ranked_indices,
            "count": len(FEATURE_ORDER),
            "score": best["score"],
            "alpha": best["alpha"],
        }
        for count in candidate_counts:
            if count >= best_subset["count"]:
                continue
            candidate_indices = ranked_indices[:count]
            candidate = evaluate_best_alpha_for_subset(candidate_indices)
            feature_selection_candidates.append(
                {
                    "candidateCount": count,
                    "selectedFeatures": [FEATURE_ORDER[i] for i in candidate_indices],
                    "score": candidate["score"],
                    "scoreGain": round(best["score"] - candidate["score"], 6),
                    "alpha": candidate["alpha"],
                }
            )
            if candidate["score"] < best_subset["score"] - 1e-6 or (
                abs(candidate["score"] - best_subset["score"]) < 1e-6
                and count < best_subset["count"]
            ):
                best_subset = {
                    "indices": candidate_indices,
                    "count": count,
                    "score": candidate["score"],
                    "alpha": candidate["alpha"],
                }

        if best_subset["count"] < len(FEATURE_ORDER):
            selected_indices = best_subset["indices"]
            selected_feature_names = [FEATURE_ORDER[i] for i in selected_indices]
            selected_feature_count = best_subset["count"]
            feature_selection_applied = True
            feature_selection_gain = best["score"] - best_subset["score"]
            best["alpha"] = best_subset["alpha"]

        if len(best_subset["indices"]) > 20:
            current_indices = best_subset["indices"].copy()
            least_important_indices = [
                FEATURE_ORDER.index(item["feature"])
                for item in reversed(importance["featureRankings"])
                if item["feature"] in FEATURE_ORDER and FEATURE_ORDER.index(item["feature"]) in current_indices
            ]
            for removal_index in least_important_indices[:10]:
                subset_indices = [i for i in current_indices if i != removal_index]
                candidate = evaluate_best_alpha_for_subset(subset_indices)
                feature_selection_candidates.append(
                    {
                        "candidateCount": len(subset_indices),
                        "selectedFeatures": [FEATURE_ORDER[i] for i in subset_indices],
                        "removedFeature": FEATURE_ORDER[removal_index],
                        "method": "remove-least-important",
                        "score": candidate["score"],
                        "scoreGain": round(best["score"] - candidate["score"], 6),
                        "alpha": candidate["alpha"],
                    }
                )
                if candidate["score"] < best_subset["score"] - 1e-6 or (
                    abs(candidate["score"] - best_subset["score"]) < 1e-6
                    and len(subset_indices) < best_subset["count"]
                ):
                    best_subset = {
                        "indices": subset_indices,
                        "count": len(subset_indices),
                        "score": candidate["score"],
                        "alpha": candidate["alpha"],
                    }
                    current_indices = subset_indices
                    selected_indices = current_indices
                    selected_feature_names = [FEATURE_ORDER[i] for i in selected_indices]
                    selected_feature_count = len(selected_indices)
                    feature_selection_applied = True
                    feature_selection_gain = best["score"] - candidate["score"]
                    best["alpha"] = candidate["alpha"]

    regressors = train_ridge(best["alpha"], selected_indices, embed_full=True)
    runtime_regressors = (
        train_ridge(best["alpha"], selected_indices, embed_full=False)
        if len(selected_indices) != len(FEATURE_ORDER)
        else regressors
    )
    runtime_feature_order = [FEATURE_ORDER[i] for i in selected_indices] if len(selected_indices) != len(FEATURE_ORDER) else FEATURE_ORDER
    runtime_scaler_mean = [means[i] for i in selected_indices] if len(selected_indices) != len(FEATURE_ORDER) else means
    runtime_scaler_scale = [scales[i] for i in selected_indices] if len(selected_indices) != len(FEATURE_ORDER) else scales

    class_counts = Counter(item["winner"] for item in complete_items)
    fallback_engine = DEFAULT_FALLBACK_ENGINE if DEFAULT_FALLBACK_ENGINE in class_counts else class_counts.most_common(1)[0][0]
    min_conf = float(np.clip(best["confidence_p50"] * 0.94, 0.38, 0.90))
    min_margin = float(np.clip(best["margin_p50"] * 0.90, 0.05, 0.28))

    if best["good_enough_rate"] < 0.55:
        min_conf = float(np.clip(min_conf * 0.95, 0.36, 0.88))
        min_margin = float(np.clip(min_margin * 0.95, 0.04, 0.26))

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
        "selectedFeatureNames": selected_feature_names,
        "featureSelectionCandidates": feature_selection_candidates,
        "runtimeFeatureOrder": runtime_feature_order,
        "runtimeScalerMean": runtime_scaler_mean,
        "runtimeScalerScale": runtime_scaler_scale,
        "runtimeRegressors": runtime_regressors,
        "metrics": {
            "validationMeanRegret": best["mean_regret"],
            "validationRegretTail": best["regret_tail"],
            "validationRegretP90": best["regret_p90"],
            "validationHitRate": best["hit_rate"],
            "validationGoodEnoughRate": best["good_enough_rate"],
            "validationConfidenceP50": best["confidence_p50"],
            "validationMarginP50": best["margin_p50"],
            "chosenAlpha": best["alpha"],
            "selectedFeatureCount": selected_feature_count,
            "featureSelectionApplied": feature_selection_applied,
            "featureSelectionScoreGain": round(feature_selection_gain, 6),
            "samples": int(len(complete_items)),
            "validationSplitCount": len(validation_splits),
            "alphaSearchResults": alpha_search_results,
            "trainingConfig": {
                "goodEnoughTolerance": training_config.good_enough_tolerance,
                "minGoodEnoughRate": training_config.min_good_enough_rate,
                "minHitRate": training_config.min_hit_rate,
                "alphaGrid": alpha_grid,
                "regretTailWeight": training_config.regret_tail_weight,
                "regretPercentileWeight": training_config.regret_percentile_weight,
                "regretPercentile": training_config.regret_percentile,
                "useHoldoutSplits": training_config.use_holdout_splits,
            },
        },
    }


def candidate_regret_objective(candidate: dict, training_config: TrainingConfig) -> float:
    tail = candidate.get("regret_tail", 0.0)
    return (
        candidate["mean_regret"]
        + training_config.regret_tail_weight * tail
        + training_config.regret_percentile_weight * candidate.get("regret_p90", 0.0)
        + 0.25 * candidate.get("regret_tail_squared", 0.0)
    )


def choose_candidate(
    candidates: list,
    require_hit_rate: bool = False,
    profile: str | None = None,
    training_config: TrainingConfig = TrainingConfig(),
) -> dict:
    min_good_enough_rate, min_hit_rate = profile_thresholds(profile, training_config)
    if require_hit_rate:
        hit_candidates = [c for c in candidates if c["hit_rate"] >= min_hit_rate]
        if hit_candidates:
            candidates = hit_candidates

    eligible = [c for c in candidates if c["good_enough_rate"] >= min_good_enough_rate]
    if eligible:
        best_p90 = min(c.get("regret_p90", c.get("regret_tail", 0.0)) for c in eligible)
        p90_close = [
            c
            for c in eligible
            if c.get("regret_p90", c.get("regret_tail", 0.0)) <= best_p90 + REGRET_TOLERANCE
        ]
        best_tail = min(c.get("regret_tail", 0.0) for c in p90_close)
        tail_close = [
            c
            for c in p90_close
            if c.get("regret_tail", 0.0) <= best_tail + REGRET_TOLERANCE
        ]
        best_objective = min(
            candidate_regret_objective(c, training_config) for c in tail_close
        )
        close = [
            c
            for c in tail_close
            if candidate_regret_objective(c, training_config) <= best_objective + REGRET_TOLERANCE
        ]
        best_good_enough = max(c["good_enough_rate"] for c in close)
        finalists = [
            c
            for c in close
            if c["good_enough_rate"] >= best_good_enough - 0.01
        ]
        return min(
            finalists,
            key=lambda c: (
                c.get("regret_p90", c.get("regret_tail", 0.0)),
                c.get("regret_tail", 0.0),
                candidate_regret_objective(c, training_config),
                c["mean_regret"],
                -c["good_enough_rate"],
                -c["hit_rate"],
                -c["margin_p50"],
                -c["confidence_p50"],
                c["score"],
            ),
        )
    return min(candidates, key=lambda c: c["score"])


def fit_profile_model(
    profile_data: dict,
    profile: str,
    use_feature_selection: bool = True,
    training_config: TrainingConfig = TrainingConfig(),
):
    """Train the runtime-linear model for the given profile."""
    return fit_runtime_models(profile_data, profile, use_feature_selection, training_config)


def build_model_payload(
    runs: List[DatasetRun],
    root: Path,
    use_feature_selection: bool = True,
    training_config: TrainingConfig = TrainingConfig(),
) -> dict:
    compute_consensus_agreement(runs)

    by_profile = {
        "sabOff": build_xy_for_profile(runs, "sabOff"),
        "sabOn": build_xy_for_profile(runs, "sabOn"),
    }

    profiles = {}
    for profile_name, pdata in by_profile.items():
        if pdata is None:
            continue
        profiles[profile_name] = fit_profile_model(
            pdata,
            profile_name,
            use_feature_selection=use_feature_selection,
            training_config=training_config,
        )

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


def feature_category(feature: str) -> str:
    base_features = {
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
        "graphDensity",
        "avgBranchFactor",
    }
    if feature in base_features:
        return "base"
    if feature.startswith("log"):
        return "log"
    if any(term in feature for term in ["Times", "Over", "Product", "Contrast"]):
        return "interaction"
    if "Ratio" in feature or "Density" in feature or "PerNode" in feature:
        return "derived"
    return "other"


def compute_feature_importance(profile_data: dict, feature_order: list) -> dict:
    regressors = profile_data.get("regressors")
    if not regressors or not feature_order:
        return {}

    engines = list(regressors.keys())
    features = []
    for feature_index, feature_name in enumerate(feature_order):
        coeff_values = []
        for engine in engines:
            coeffs = regressors[engine].get("coefficients", [])
            coeff_values.append(float(coeffs[feature_index]) if feature_index < len(coeffs) else 0.0)

        abs_values = [abs(value) for value in coeff_values]
        mean_abs = float(np.mean(abs_values))
        max_abs = float(np.max(abs_values))
        best_engine = engines[int(np.argmax(abs_values))] if engines else None
        category = feature_category(feature_name)

        features.append(
            {
                "feature": feature_name,
                "category": category,
                "meanAbsCoefficient": mean_abs,
                "maxAbsCoefficient": max_abs,
                "bestEngine": best_engine,
                "coefficients": {engine: coeff for engine, coeff in zip(engines, coeff_values)},
            }
        )

    features.sort(key=lambda item: item["meanAbsCoefficient"], reverse=True)

    derived_features = [f for f in features if f["category"] != "base"]
    top_features = features[:20]
    top_derived = derived_features[:20]

    return {
        "topFeatures": top_features,
        "topDerivedFeatures": top_derived,
        "featureRankings": features,
    }


def add_feature_importance_to_report(report_payload: dict) -> None:
    feature_order = report_payload.get("featureOrder", [])
    profiles = report_payload.get("profiles", {})
    for profile_name, profile_data in profiles.items():
        profile_data.pop("featureImportance", None)
        if profile_data.get("modelType") == "runtime-linear":
            profile_data["featureImportance"] = compute_feature_importance(
                profile_data, feature_order
            )


def build_minimal_js_payload(payload: dict) -> dict:
    """Return only the fields required for runtime inference and tracing."""
    minimal_profiles = {}
    for profile_name, profile_data in payload.get("profiles", {}).items():
        if not isinstance(profile_data, dict):
            continue

        minimal_profile = {}
        for key in [
            "modelType",
            "runtimeFeatureOrder",
            "runtimeScalerMean",
            "runtimeScalerScale",
            "scaler_mean",
            "scaler_scale",
            "classes",
            "fallbackEngine",
            "minConfidence",
            "minMargin",
            "regressors",
            "runtimeRegressors",
            "scoreSource",
            "score",
        ]:
            if key in profile_data:
                minimal_profile[key] = profile_data[key]

        if minimal_profile:
            minimal_profiles[profile_name] = minimal_profile

    return {
        "generatedAt": payload.get("generatedAt"),
        "featureOrder": payload.get("featureOrder", []),
        "engines": payload.get("engines", []),
        "profiles": minimal_profiles,
    }


def write_js_model(payload: dict, out_file: Path) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    minimal_payload = build_minimal_js_payload(payload)

    profiles = minimal_payload.get("profiles", {})
    score_sources = {}
    for profile_name, profile_data in profiles.items():
        score_source = profile_data.pop("scoreSource", None)
        if score_source is None:
            continue

        score_name = f"score_{profile_name}"
        profile_data["score"] = f"__SCORE_FN__{score_name}__"
        score_sources[score_name] = score_source

    as_json = json.dumps(minimal_payload, indent=2)
    for score_name in score_sources:
        placeholder = f'"__SCORE_FN__{score_name}__"'
        as_json = as_json.replace(placeholder, score_name)

    model_js = "\n\n".join(score_sources.values())
    model_js += "\n\nexport const ROUTER_TUNING_ML_MODEL = Object.freeze(" + as_json + ");\n"
    out_file.write_text(model_js, encoding="utf-8")


def preserve_existing_report(out_file: Path) -> None:
    if out_file.exists():
        backup_name = (
            f"{out_file.stem}_baseline_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}{out_file.suffix}"
        )
        backup_path = out_file.with_name(backup_name)
        shutil.copy2(out_file, backup_path)
        print(f"Preserved previous report to {backup_path}")


def write_analysis_report(payload: dict, out_file: Path) -> None:
    out_file.parent.mkdir(parents=True, exist_ok=True)
    preserve_existing_report(out_file)
    report_payload = json.loads(json.dumps(payload))
    for profile_data in report_payload.get("profiles", {}).values():
        profile_data.pop("scoreSource", None)
        profile_data.pop("score", None)
    add_feature_importance_to_report(report_payload)
    out_file.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Train OMT Router ML engine selector")
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
        "--good-enough-tolerance",
        type=float,
        default=0.05,
        help="Regret tolerance used to count near-tie predictions as good enough",
    )
    parser.add_argument(
        "--min-good-enough-rate",
        type=float,
        default=0.58,
        help="Minimum validation good-enough rate required before choosing lower-regret configs",
    )
    parser.add_argument(
        "--min-hit-rate",
        type=float,
        default=0.40,
        help="Minimum validation exact-hit rate required before choosing lower-regret configs",
    )
    parser.add_argument(
        "--no-feature-selection",
        action="store_false",
        dest="use_feature_selection",
        help="Disable feature importance-based pruning for runtime-linear training.",
    )
    args = parser.parse_args()
    training_config = TrainingConfig(
        good_enough_tolerance=args.good_enough_tolerance,
        min_good_enough_rate=args.min_good_enough_rate,
        min_hit_rate=args.min_hit_rate,
    )

    root = Path(args.root)
    runs = load_runs(root)
    payload = build_model_payload(
        runs,
        root,
        use_feature_selection=args.use_feature_selection,
        training_config=training_config,
    )

    write_js_model(payload, root / args.out_js)
    write_analysis_report(payload, root / args.out_report)

    print(f"Trained engine selector and wrote model to {root / args.out_js}")
    print(f"Analysis report written to {root / args.out_report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
