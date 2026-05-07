#!/usr/bin/env python3
"""Analyze benchmark error categories and engine diagnostics.

This helper summarizes route-level failures, engine-related warmup/timed errors,
and diagnostic consistency across benchmark JSON artifacts.
It also tracks recoverable warm-up failures separately from timed execution faults.
These recovered warm-up failures are visible for diagnostics, but they do not mean
that the underlying warm-up causes have been fixed.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional

ENGINE_IDS = [
    "bidirectional-astar",
    "adaptive-barrier",
    "delta-stepping",
    "ultra-dijkstra",
]

ENGINE_KEY_PREFIX = {
    "bidirectional-astar": "bidirectional_astar",
    "adaptive-barrier": "adaptive_barrier",
    "delta-stepping": "delta_stepping",
    "ultra-dijkstra": "ultra_dijkstra",
}

ERROR_CODE_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_\-]*):\s*(.*)$')

DEFAULT_RESULT_GLOB = "benchmark/results/*_benchmark_car_*.json"


@dataclass
class EngineErrorStats:
    warmup_error_rows: int = 0
    timed_error_rows: int = 0
    warmup_errors: int = 0
    timed_errors: int = 0
    error_messages: Counter[str] = field(default_factory=Counter)
    error_codes: Counter[str] = field(default_factory=Counter)


@dataclass
class FileSummary:
    file_path: Path
    rows: int = 0
    route_errors: int = 0
    route_error_breakdown: Counter[str] = field(default_factory=Counter)
    diagnostics_rows: int = 0
    missing_diagnostics_rows: int = 0
    route_failure_missing_diagnostics_rows: int = 0
    valid_route_missing_diagnostics_rows: int = 0
    route_failure_with_diagnostics_rows: int = 0
    engine_error_rows: int = 0
    top_level_any_engine_error_rows: int = 0
    inconsistent_any_engine_error_rows: int = 0
    warmup_error_rows: int = 0
    timed_error_rows: int = 0
    engine_stats_by_engine: Dict[str, EngineErrorStats] = field(default_factory=lambda: {engine: EngineErrorStats() for engine in ENGINE_IDS})
    engine_error_rows_by_engine: Counter[str] = field(default_factory=Counter)
    found_counts: Counter[int] = field(default_factory=Counter)
    timed_counts: Counter[int] = field(default_factory=Counter)
    cost_counts: Counter[int] = field(default_factory=Counter)
    rows_with_all_cost_missing: int = 0
    rows_with_partial_found: int = 0
    rows_with_partial_cost: int = 0
    rows_with_warmup_errors_only: int = 0
    rows_with_timed_errors_only: int = 0
    rows_with_both_warmup_and_timed_errors: int = 0
    rows_with_any_top_level_engine_error: int = 0
    any_engine_warm_error_rows: int = 0
    any_engine_timed_error_rows: int = 0
    rows_with_warm_error_recovered: int = 0
    rows_with_warm_error_recovered_and_any_engine_error: int = 0

    def to_dict(self) -> dict:
        return {
            "file": str(self.file_path.name),
            "rows": self.rows,
            "routeErrors": self.route_errors,
            "routeErrorBreakdown": dict(self.route_error_breakdown),
            "diagnosticsRows": self.diagnostics_rows,
            "missingDiagnosticsRows": self.missing_diagnostics_rows,
            "engineErrorRows": self.engine_error_rows,
            "topLevelAnyEngineErrorRows": self.top_level_any_engine_error_rows,
            "inconsistentAnyEngineErrorRows": self.inconsistent_any_engine_error_rows,
            "warmupErrorRows": self.warmup_error_rows,
            "timedErrorRows": self.timed_error_rows,
            "rowsWithAllCostMissing": self.rows_with_all_cost_missing,
            "rowsWithPartialFound": self.rows_with_partial_found,
            "rowsWithPartialCost": self.rows_with_partial_cost,
            "rowsWithWarmupErrorsOnly": self.rows_with_warmup_errors_only,
            "rowsWithTimedErrorsOnly": self.rows_with_timed_errors_only,
            "rowsWithBothWarmupAndTimedErrors": self.rows_with_both_warmup_and_timed_errors,
            "rowsWithAnyTopLevelEngineError": self.rows_with_any_top_level_engine_error,
            "anyEngineWarmErrorRows": self.any_engine_warm_error_rows,
            "anyEngineTimedErrorRows": self.any_engine_timed_error_rows,
            "rowsWithWarmErrorRecovered": self.rows_with_warm_error_recovered,
            "rowsWithWarmErrorRecoveredAndAnyEngineError": self.rows_with_warm_error_recovered_and_any_engine_error,
            "engineErrorRowsByEngine": dict(self.engine_error_rows_by_engine),
            "foundCounts": dict(self.found_counts),
            "timedCounts": dict(self.timed_counts),
            "costCounts": dict(self.cost_counts),
            "routeFailureMissingDiagnosticsRows": self.route_failure_missing_diagnostics_rows,
            "validRouteMissingDiagnosticsRows": self.valid_route_missing_diagnostics_rows,
            "routeFailureWithDiagnosticsRows": self.route_failure_with_diagnostics_rows,
            "engineStatsByEngine": {
                engine: {
                    "warmupErrors": stats.warmup_errors,
                    "timedErrors": stats.timed_errors,
                    "warmupErrorRows": stats.warmup_error_rows,
                    "timedErrorRows": stats.timed_error_rows,
                    "errorMessages": dict(stats.error_messages.most_common(10)),
                    "errorCodes": dict(stats.error_codes.most_common(10)),
                }
                for engine, stats in self.engine_stats_by_engine.items()
            },
        }


def get_candidate_files(paths: Optional[List[str]]) -> List[Path]:
    if paths:
        files = [Path(p) for p in paths]
    else:
        files = list(Path(".").glob(DEFAULT_RESULT_GLOB))
    result = []
    for file_path in files:
        if file_path.is_file():
            result.append(file_path)
        else:
            print(f"Warning: skipped missing path {file_path}")
    result.sort()
    return result


def get_file_group(file_path: Path) -> str:
    name = file_path.name.lower()
    if "_serial" in name or name.startswith("serial") or "-serial" in name or "serial_" in name:
        return "serial"
    if "_parallel" in name or name.startswith("parallel") or "-parallel" in name or "parallel_" in name:
        return "parallel"
    if "serial" in name:
        return "serial"
    if "parallel" in name:
        return "parallel"
    return "other"


def resolve_out_path(out_json: str, group: str, group_count: int) -> Path:
    candidate = Path(out_json)
    if group_count > 1:
        if candidate.suffix == ".json":
            return candidate.with_name(f"{candidate.stem}_{group}{candidate.suffix}")
        return candidate / f"benchmark_error_analysis_{group}.json"
    if candidate.suffix == ".json":
        return candidate
    return candidate / "benchmark_error_analysis.json"


def split_engine_error_code_and_message(error: object) -> tuple[Optional[str], Optional[str]]:
    if error is None:
        return None, None

    if isinstance(error, dict):
        code = error.get("code")
        message = error.get("message") or error.get("msg") or error.get("error")
        if message is None:
            message = json.dumps(error, sort_keys=True, ensure_ascii=False)
        return (str(code), str(message)) if code is not None else (None, str(message))

    if isinstance(error, str):
        match = ERROR_CODE_RE.match(error)
        if match:
            code, message = match.groups()
            return code, message or None
        return None, error

    return None, str(error)


def normalize_engine_error_label(error: object) -> Optional[str]:
    code, message = split_engine_error_code_and_message(error)
    if code:
        return code
    return message


def collect_engine_error_statistics(engine_stats: EngineErrorStats, error: object) -> None:
    code, message = split_engine_error_code_and_message(error)
    label = code or message
    if label:
        engine_stats.error_messages[label] += 1
    if code:
        engine_stats.error_codes[code] += 1


def normalize_engine_error_field(row: dict, engine_id: str) -> Optional[str]:
    prefix = ENGINE_KEY_PREFIX[engine_id]
    top_level_error = row.get("errors", {}).get(f"{prefix}_error")
    if top_level_error:
        return normalize_engine_error_label(top_level_error)
    raw_error = (
        row.get(f"{prefix}_error")
        or row.get(f"{prefix}_timed_error")
        or row.get(f"{prefix}_warm_error")
        or row.get(f"{prefix}_error_code")
        or row.get(f"{prefix}_timed_error_code")
        or row.get(f"{prefix}_warm_error_code")
    )
    return normalize_engine_error_label(raw_error)


def row_has_engine_errors(row: dict) -> bool:
    diagnostics = row.get("rawDiagnostics") or {}
    execution = diagnostics.get("execution") or {}
    warmup_counts = execution.get("warmupErrorsByEngine") or {}
    timed_counts = execution.get("timedErrorsByEngine") or {}
    warmup_codes = execution.get("warmupErrorCodesByEngine") or {}
    timed_codes = execution.get("timedErrorCodesByEngine") or {}
    has_diagnostic_errors = any(
        int(warmup_counts.get(engine, 0)) > 0
        or int(timed_counts.get(engine, 0)) > 0
        or bool(warmup_codes.get(engine))
        or bool(timed_codes.get(engine))
        for engine in ENGINE_IDS
    )
    has_top_level_errors = any(
        bool(normalize_engine_error_field(row, engine))
        for engine in ENGINE_IDS
    )
    return has_diagnostic_errors or has_top_level_errors


def collect_row_summary(row: dict, summary: FileSummary) -> None:
    summary.rows += 1

    route_error_kind = row.get("routeError") or row.get("error")
    route_failure = bool(route_error_kind)
    if route_failure:
        summary.route_errors += 1
        summary.route_error_breakdown[str(route_error_kind)] += 1

    if row.get("any_engine_error"):
        summary.top_level_any_engine_error_rows += 1
    if row.get("any_engine_warm_error"):
        summary.any_engine_warm_error_rows += 1
    if row.get("any_engine_timed_error"):
        summary.any_engine_timed_error_rows += 1

    diagnostics = row.get("rawDiagnostics")
    if diagnostics:
        summary.diagnostics_rows += 1
        if route_failure:
            summary.route_failure_with_diagnostics_rows += 1
        execution = diagnostics.get("execution") or {}
        warmup_counts = execution.get("warmupErrorsByEngine") or {}
        timed_counts = execution.get("timedErrorsByEngine") or {}
        warmup_messages = execution.get("warmupErrorMessagesByEngine") or {}
        timed_messages = execution.get("timedErrorMessagesByEngine") or {}

        found = int(row.get("n_engines_found") or 0)
        timed = int(row.get("n_engines_timed") or 0)
        cost = int(row.get("n_engines_cost") or 0)
        summary.found_counts[found] += 1
        summary.timed_counts[timed] += 1
        summary.cost_counts[cost] += 1

        if cost == 0:
            summary.rows_with_all_cost_missing += 1
        if found < len(ENGINE_IDS):
            summary.rows_with_partial_found += 1
        if cost < len(ENGINE_IDS):
            summary.rows_with_partial_cost += 1

        any_warm_error_recovered = any(
            execution.get("finalEngineStatusByEngine", {}).get(engine_id) == "warm_error_recovered"
            for engine_id in ENGINE_IDS
        )
        if any_warm_error_recovered:
            summary.rows_with_warm_error_recovered += 1

        if any_warm_error_recovered and row.get("any_engine_error"):
            # A recovered warm-up failure should not be surfaced as a final any_engine_error
            if not any(
                int(timed_counts.get(engine_id) or 0) > 0
                or execution.get("timedErrorMessagesByEngine", {}).get(engine_id)
                or execution.get("timedErrorCodesByEngine", {}).get(engine_id)
                or normalize_engine_error_field(row, engine_id)
                for engine_id in ENGINE_IDS
            ):
                summary.rows_with_warm_error_recovered_and_any_engine_error += 1

        if not route_failure:
            any_warmup = False
            any_timed = False
            any_top_level_errors = False
            for engine_id in ENGINE_IDS:
                warmup_count = int(warmup_counts.get(engine_id) or 0)
                timed_count = int(timed_counts.get(engine_id) or 0)
                warmup_message = warmup_messages.get(engine_id)
                timed_message = timed_messages.get(engine_id)
                top_level_error = normalize_engine_error_field(row, engine_id)

                warmup_code = execution.get("warmupErrorCodesByEngine", {}).get(engine_id)
                timed_code = execution.get("timedErrorCodesByEngine", {}).get(engine_id)
                warmup_present = warmup_count > 0 or warmup_message is not None or warmup_code is not None
                timed_present = timed_count > 0 or timed_message is not None or timed_code is not None

                if warmup_present:
                    any_warmup = True
                    summary.warmup_error_rows += 1
                    engine_stats = summary.engine_stats_by_engine[engine_id]
                    engine_stats.warmup_error_rows += 1
                    engine_stats.warmup_errors += warmup_count
                    if warmup_message is not None:
                        collect_engine_error_statistics(engine_stats, warmup_message)
                    elif warmup_code is not None:
                        collect_engine_error_statistics(engine_stats, warmup_code)
                if timed_present:
                    any_timed = True
                    summary.timed_error_rows += 1
                    engine_stats = summary.engine_stats_by_engine[engine_id]
                    engine_stats.timed_error_rows += 1
                    engine_stats.timed_errors += timed_count
                    if timed_message is not None:
                        collect_engine_error_statistics(engine_stats, timed_message)
                    elif timed_code is not None:
                        collect_engine_error_statistics(engine_stats, timed_code)
                if top_level_error:
                    any_top_level_errors = True
                    summary.engine_error_rows_by_engine[engine_id] += 1
                    engine_stats = summary.engine_stats_by_engine[engine_id]
                    collect_engine_error_statistics(engine_stats, top_level_error)

            if any_top_level_errors:
                summary.rows_with_any_top_level_engine_error += 1

            if any_warmup and any_timed:
                summary.rows_with_both_warmup_and_timed_errors += 1
            elif any_warmup:
                summary.rows_with_warmup_errors_only += 1
            elif any_timed:
                summary.rows_with_timed_errors_only += 1

            if row_has_engine_errors(row):
                summary.engine_error_rows += 1
    else:
        summary.missing_diagnostics_rows += 1
        if route_failure:
            summary.route_failure_missing_diagnostics_rows += 1
        else:
            summary.valid_route_missing_diagnostics_rows += 1
        if any(normalize_engine_error_field(row, engine_id) for engine_id in ENGINE_IDS):
            summary.rows_with_any_top_level_engine_error += 1

    if not route_failure and row.get("any_engine_error") and not row_has_engine_errors(row):
        summary.inconsistent_any_engine_error_rows += 1


def summarize_files(files: Iterable[Path]) -> dict:
    summaries = []
    aggregate = {
        "files": [],
        "totalRows": 0,
        "routeErrors": 0,
        "routeErrorBreakdown": Counter(),
        "diagnosticsRows": 0,
        "missingDiagnosticsRows": 0,
        "routeFailureMissingDiagnosticsRows": 0,
        "validRouteMissingDiagnosticsRows": 0,
        "routeFailureWithDiagnosticsRows": 0,
        "engineErrorRows": 0,
        "topLevelAnyEngineErrorRows": 0,
        "anyEngineWarmErrorRows": 0,
        "anyEngineTimedErrorRows": 0,
        "rowsWithWarmErrorRecovered": 0,
        "rowsWithWarmErrorRecoveredAndAnyEngineError": 0,
        "inconsistentAnyEngineErrorRows": 0,
        "warmupErrorRows": 0,
        "timedErrorRows": 0,
        "rowsWithAllCostMissing": 0,
        "rowsWithPartialFound": 0,
        "rowsWithPartialCost": 0,
    }

    for file_path in files:
        with file_path.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        rows = payload.get("rawResults") or []
        summary = FileSummary(file_path=file_path)
        for row in rows:
            collect_row_summary(row, summary)
        summaries.append(summary)

        aggregate["files"].append(summary.to_dict())
        aggregate["totalRows"] += summary.rows
        aggregate["routeErrors"] += summary.route_errors
        aggregate["routeErrorBreakdown"].update(summary.route_error_breakdown)
        aggregate["diagnosticsRows"] += summary.diagnostics_rows
        aggregate["missingDiagnosticsRows"] += summary.missing_diagnostics_rows
        aggregate["engineErrorRows"] += summary.engine_error_rows
        aggregate["topLevelAnyEngineErrorRows"] += summary.top_level_any_engine_error_rows
        aggregate["anyEngineWarmErrorRows"] += summary.any_engine_warm_error_rows
        aggregate["anyEngineTimedErrorRows"] += summary.any_engine_timed_error_rows
        aggregate["rowsWithWarmErrorRecovered"] += summary.rows_with_warm_error_recovered
        aggregate["rowsWithWarmErrorRecoveredAndAnyEngineError"] += summary.rows_with_warm_error_recovered_and_any_engine_error
        aggregate["inconsistentAnyEngineErrorRows"] += summary.inconsistent_any_engine_error_rows
        aggregate["warmupErrorRows"] += summary.warmup_error_rows
        aggregate["timedErrorRows"] += summary.timed_error_rows
        aggregate["rowsWithAllCostMissing"] += summary.rows_with_all_cost_missing
        aggregate["rowsWithPartialFound"] += summary.rows_with_partial_found
        aggregate["rowsWithPartialCost"] += summary.rows_with_partial_cost
        aggregate["routeFailureMissingDiagnosticsRows"] += summary.route_failure_missing_diagnostics_rows
        aggregate["validRouteMissingDiagnosticsRows"] += summary.valid_route_missing_diagnostics_rows
        aggregate["routeFailureWithDiagnosticsRows"] += summary.route_failure_with_diagnostics_rows

    aggregate["routeErrorBreakdown"] = dict(aggregate["routeErrorBreakdown"])
    return aggregate


def format_summary(text: str, summary: dict) -> str:
    lines = [
        text,
        "",
        f"Total routes: {summary['totalRows']}",
        f"Route errors: {summary['routeErrors']}",
        f"Rows with diagnostics: {summary['diagnosticsRows']}",
        f"Missing diagnostics rows: {summary['missingDiagnosticsRows']}",
        f"Route failures missing diagnostics: {summary.get('routeFailureMissingDiagnosticsRows', 0)}",
        f"Valid routes missing diagnostics: {summary.get('validRouteMissingDiagnosticsRows', 0)}",
        f"Route failures with diagnostics: {summary.get('routeFailureWithDiagnosticsRows', 0)}",
        f"Engine-related rows: {summary['engineErrorRows']}",
        f"Rows with any_engine_error flag: {summary['topLevelAnyEngineErrorRows']}",
        f"Rows with any_engine_warm_error flag: {summary.get('anyEngineWarmErrorRows', 0)}",
        f"Rows with any_engine_timed_error flag: {summary.get('anyEngineTimedErrorRows', 0)}",
        f"Rows with warm_error_recovered status: {summary.get('rowsWithWarmErrorRecovered', 0)}",
        f"Rows with recovered warmup-only routes incorrectly flagged as any_engine_error: {summary.get('rowsWithWarmErrorRecoveredAndAnyEngineError', 0)}",
        f"Inconsistent any_engine_error flag rows: {summary['inconsistentAnyEngineErrorRows']}",
        f"Warmup error rows: {summary['warmupErrorRows']}",
        f"Timed error rows: {summary['timedErrorRows']}",
        f"Rows with all cost missing: {summary['rowsWithAllCostMissing']}",
        f"Rows with partial found: {summary['rowsWithPartialFound']}",
        f"Rows with partial cost: {summary['rowsWithPartialCost']}",
        "",
    ]
    if summary["routeErrors"]:
        lines.append("Route error breakdown:")
        for kind, count in sorted(summary.get("routeErrorBreakdown", {}).items(), key=lambda item: item[1], reverse=True):
            lines.append(f"  - {kind}: {count}")
        lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze benchmark error classifications.")
    parser.add_argument(
        "--files",
        nargs="*",
        help="Benchmark JSON files to analyze. If omitted, scans benchmark/results/*.json.",
    )
    parser.add_argument(
        "--out-json",
        help=(
            "Write a JSON report to this file or directory. "
            "When analyzing both serial and parallel benchmarks, "
            "grouped reports are written as separate files."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = get_candidate_files(args.files)
    if not files:
        print("No benchmark files found. Provide --files or place JSON in benchmark/results.")
        return 1

    grouped_files: dict[str, list[Path]] = {}
    for file_path in files:
        group = get_file_group(file_path)
        grouped_files.setdefault(group, []).append(file_path)

    group_count = len(grouped_files)
    for group, group_files in sorted(grouped_files.items()):
        report = summarize_files(group_files)
        print(format_summary(f"Benchmark error analysis for {len(group_files)} file(s) [{group}]", report))
        if args.out_json:
            out_path = resolve_out_path(args.out_json, group, group_count)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with out_path.open("w", encoding="utf-8") as handle:
                json.dump(report, handle, indent=2)
            print(f"Wrote JSON report to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
