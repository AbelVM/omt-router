#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


def load_report(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Report not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse JSON report {path}: {exc}")


def find_latest_baseline(report_dir: Path) -> Path:
    baseline_files = sorted(report_dir.glob("engine_selector_ml_latest_baseline_*.json"))
    if not baseline_files:
        raise SystemExit(f"No baseline report found in {report_dir}")
    return baseline_files[-1]


def format_delta(new_value: Any, base_value: Any) -> str:
    if isinstance(new_value, (int, float)) and isinstance(base_value, (int, float)):
        delta = new_value - base_value
        sign = "+" if delta >= 0 else "-"
        return f"{new_value:.6f} vs {base_value:.6f} ({sign}{abs(delta):.6f})"
    return f"{new_value} vs {base_value}"


def compare_metrics(new_metrics: Dict[str, Any], base_metrics: Dict[str, Any]) -> List[str]:
    rows: List[str] = []
    all_keys = sorted(set(new_metrics) | set(base_metrics))
    for key in all_keys:
        new_value = new_metrics.get(key)
        base_value = base_metrics.get(key)
        if new_value is None:
            rows.append(f"  {key}: missing in new report")
            continue
        if base_value is None:
            rows.append(f"  {key}: {new_value} (missing in baseline)")
            continue
        if isinstance(new_value, float) or isinstance(base_value, float):
            try:
                new_num = float(new_value)
                base_num = float(base_value)
                delta = new_num - base_num
                sign = "+" if delta >= 0 else "-"
                rows.append(
                    f"  {key}: {new_num:.6f} vs {base_num:.6f} ({sign}{abs(delta):.6f})"
                )
                continue
            except (TypeError, ValueError):
                pass
        if new_value == base_value:
            rows.append(f"  {key}: {new_value}")
        else:
            rows.append(f"  {key}: {new_value} vs {base_value}")
    return rows


def regression_warning(new_metrics: Dict[str, Any], base_metrics: Dict[str, Any]) -> str | None:
    try:
        new_hit = float(new_metrics.get("validationHitRate", 0.0))
        base_hit = float(base_metrics.get("validationHitRate", 0.0))
        new_regret = float(new_metrics.get("validationMeanRegret", 0.0))
        base_regret = float(base_metrics.get("validationMeanRegret", 0.0))
        new_good = float(new_metrics.get("validationGoodEnoughRate", 0.0))
        base_good = float(base_metrics.get("validationGoodEnoughRate", 0.0))
    except (TypeError, ValueError):
        return None

    hit_delta = new_hit - base_hit
    regret_delta = base_regret - new_regret
    good_delta = new_good - base_good

    if hit_delta < -0.002 and regret_delta < 0.001:
        return (
            "REGRESSION WARNING: validationHitRate dropped more than 0.002 "
            "without a significant validationMeanRegret improvement."
        )
    if good_delta < -0.002 and regret_delta < 0.001:
        return (
            "REGRESSION WARNING: validationGoodEnoughRate dropped more than 0.002 "
            "without a significant validationMeanRegret improvement."
        )
    return None


def compare_reports(new_report: Dict[str, Any], base_report: Dict[str, Any]) -> None:
    new_profiles = new_report.get("profiles", {})
    base_profiles = base_report.get("profiles", {})
    profile_names = sorted(set(new_profiles) | set(base_profiles))
    if not profile_names:
        raise SystemExit("No profiles found in either report")

    for profile in profile_names:
        print(f"Profile: {profile}")
        new_metrics = new_profiles.get(profile, {}).get("metrics", {})
        base_metrics = base_profiles.get(profile, {}).get("metrics", {})
        if not new_metrics:
            print("  missing metrics in newest report")
            continue
        if not base_metrics:
            print("  missing metrics in baseline report")
            continue
        for line in compare_metrics(new_metrics, base_metrics):
            print(line)
        warning = regression_warning(new_metrics, base_metrics)
        if warning:
            print(f"  {warning}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare the newest engine selector report with the latest baseline and print results to stdout."
    )
    parser.add_argument(
        "--new-report",
        default="benchmark/results/analysis/engine_selector_ml_latest.json",
        help="Path to the newest engine selector report.",
    )
    parser.add_argument(
        "--baseline-report",
        default=None,
        help="Optional path to a baseline report. If omitted, the latest baseline JSON file is used.",
    )
    args = parser.parse_args()

    new_report_path = Path(args.new_report)
    baseline_report_path = (
        Path(args.baseline_report)
        if args.baseline_report
        else find_latest_baseline(new_report_path.parent)
    )

    print(f"Newest report: {new_report_path}")
    print(f"Baseline report: {baseline_report_path}")
    print()

    new_report = load_report(new_report_path)
    baseline_report = load_report(baseline_report_path)
    compare_reports(new_report, baseline_report)


if __name__ == "__main__":
    main()
