#!/usr/bin/env python3
"""Analyze the latest engine selector ML report and surface the highest-impact features."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def load_report(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Report not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse JSON report {path}: {exc}")


def format_feature_line(rank: int, feature: Dict[str, Any]) -> str:
    coeffs = ", ".join(
        f"{engine}:{value:.4f}" for engine, value in feature["coefficients"].items()
    )
    return (
        f"{rank:2d}. {feature['feature']:<46} "
        f"{feature['category']:<11} "
        f"meanAbs={feature['meanAbsCoefficient']:.5f} "
        f"maxAbs={feature['maxAbsCoefficient']:.5f} "
        f"best={feature['bestEngine']} "
        f"[{coeffs}]"
    )


def compute_feature_importance(profile_data: Dict[str, Any], feature_order: List[str]) -> Dict[str, Any]:
    regressors = profile_data.get("regressors")
    if not feature_order or not regressors:
        return {}

    engines = list(regressors.keys())
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

    features = []
    for idx, feature_name in enumerate(feature_order):
        coeff_values = []
        for engine in engines:
            coeffs = regressors[engine].get("coefficients", [])
            coeff_values.append(float(coeffs[idx]) if idx < len(coeffs) else 0.0)

        abs_values = [abs(value) for value in coeff_values]
        mean_abs = sum(abs_values) / len(abs_values) if abs_values else 0.0
        max_abs = max(abs_values) if abs_values else 0.0
        best_engine = engines[int(abs_values.index(max_abs))] if abs_values else None
        if feature_name in base_features:
            category = "base"
        elif feature_name.startswith("log"):
            category = "log"
        elif any(term in feature_name for term in ["Times", "Over", "Product", "Contrast"]):
            category = "interaction"
        else:
            category = "derived"

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
    derived = [f for f in features if f["category"] != "base"]
    return {
        "topFeatures": features[:20],
        "topDerivedFeatures": derived[:20],
        "featureRankings": features,
    }


def profile_importance_summary(profile_name: str, profile_data: Dict[str, Any], feature_order: List[str]) -> str:
    lines: List[str] = [f"Profile: {profile_name}"]

    importance = profile_data.get("featureImportance")
    if not importance and feature_order and profile_data.get("regressors"):
        importance = compute_feature_importance(profile_data, feature_order)

    if not importance:
        return "\n".join(lines + ["  No runtime-linear feature importance found in report."])

    top_features = importance.get("topFeatures", [])
    top_derived = importance.get("topDerivedFeatures", [])

    lines.append("  Top features by average absolute coefficient:")
    for idx, feature in enumerate(top_features[:10], start=1):
        lines.append(format_feature_line(idx, feature))

    if top_derived:
        lines.append("\n  Top derived terms (logs, ratios, interactions):")
        for idx, feature in enumerate(top_derived[:10], start=1):
            lines.append(format_feature_line(idx, feature))

    candidates = profile_data.get("featureSelectionCandidates") or []
    if candidates:
        lines.append("\n  Feature selection candidate impact:")
        for candidate in candidates[:5]:
            label = f"{candidate['candidateCount']} features"
            removed = f" removed={candidate.get('removedFeature')}" if candidate.get('removedFeature') else ""
            method = f" method={candidate.get('method')}" if candidate.get('method') else ""
            lines.append(
                f"    {label:<11} score={candidate['score']:.6f} gain={candidate['scoreGain']:.6f} alpha={candidate['alpha']:.3f}{removed}{method}"
            )

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Analyze engine selector feature importance from the latest ML report."
    )
    parser.add_argument(
        "--report",
        default="benchmark/results/analysis/engine_selector_ml_latest.json",
        help="Path to the engine selector report JSON.",
    )
    parser.add_argument(
        "--out-json",
        default=None,
        help="Optional path to write a summarized feature importance JSON file.",
    )
    args = parser.parse_args()

    report_path = Path(args.report)
    report = load_report(report_path)

    output: Dict[str, Any] = {
        "reportPath": str(report_path),
        "generatedAt": report.get("generatedAt"),
        "profiles": {},
    }

    profiles = report.get("profiles", {})
    feature_order = report.get("featureOrder", [])
    if not profiles:
        raise SystemExit("No profiles found in report")

    for profile_name, profile_data in profiles.items():
        importance = profile_data.get("featureImportance")
        if not importance and feature_order and profile_data.get("regressors"):
            importance = compute_feature_importance(profile_data, feature_order)
        output_profile = {
            "topFeatures": (importance or {}).get("topFeatures", [])[:20],
            "topDerivedFeatures": (importance or {}).get("topDerivedFeatures", [])[:20],
        }
        if profile_data.get("featureSelectionCandidates"):
            output_profile["featureSelectionCandidates"] = profile_data["featureSelectionCandidates"]
        output["profiles"][profile_name] = output_profile

    print(f"Analyzing feature importance from {report_path}")
    print()
    for profile_name, profile_data in profiles.items():
        print(profile_importance_summary(profile_name, profile_data, feature_order))
        print()

    if args.out_json:
        out_path = Path(args.out_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
        print(f"Summary JSON written to {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
