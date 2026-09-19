#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "data/t10-regression-gate.json"
MASTER = ROOT / "data/master-plan.json"
OUT = ROOT / "artifacts/t10-full-regression-report.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_json(path: Path) -> dict:
    require(path.is_file(), f"T10 required JSON missing: {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    policy = load_json(POLICY)
    master = load_json(MASTER)

    require(policy.get("version") == 1, "T10 policy version drift")
    require(policy.get("task") == "T10", "T10 policy task drift")
    expected = [f"T{i:02d}" for i in range(1, 10)]
    require(policy.get("required_dependencies") == expected, "T10 dependency list drift")

    testing = next((g for g in master.get("gates", []) if g.get("id") == "TESTING"), None)
    require(testing is not None, "T10 TESTING gate missing from master plan")
    task_map = {t.get("id"): t for t in testing.get("tasks", [])}
    require(set(expected + ["T10"]) <= set(task_map), "T10 master-plan testing task set incomplete")

    dependency_states = {}
    for task_id in expected:
        task = task_map[task_id]
        status = task.get("status")
        evidence = str(task.get("evidence") or "").strip()
        require(status in {"green", "red", "yellow", "blocked"}, f"T10 invalid {task_id} status: {status}")
        require(evidence, f"T10 {task_id} evidence is empty")
        dependency_states[task_id] = {"status": status, "evidence": evidence}

    report_paths = policy.get("local_reports", {})
    loaded = {}
    for task_id, rel in report_paths.items():
        payload = load_json(ROOT / rel)
        require(payload.get("task") == task_id, f"T10 {task_id} report task mismatch")
        loaded[task_id] = payload

    require(loaded["T01"].get("all_required_areas_mapped") is True, "T10 T01 coverage incomplete")
    require(loaded["T01"].get("area_count") == 4, "T10 T01 area count drift")

    require(loaded["T02"].get("all_m04_m16_mapped") is True, "T10 T02 coverage incomplete")
    require(loaded["T02"].get("dependency_count") == 13, "T10 T02 dependency count drift")

    require(loaded["T03"].get("all_m17_m23_dependencies_mapped") is True, "T10 T03 coverage incomplete")
    require(loaded["T03"].get("executable_test_count", 0) >= 5, "T10 T03 executable test count too low")

    require(loaded["T04"].get("precursor_pass") is True, "T10 T04 precursor missing")
    require(loaded["T04"].get("final_acceptance", {}).get("pass") is False, "T10 T04 final state drift")

    t07_profiles = loaded["T07"].get("profiles", {})
    require(t07_profiles and all(p.get("pass") is True for p in t07_profiles.values()), "T10 T07 load profile failed")

    require(loaded["T08"].get("required_behaviors_covered") is True, "T10 T08 coverage incomplete")
    require(loaded["T08"].get("scenario_count", 0) >= 4, "T10 T08 scenario count too low")

    require(loaded["T09"].get("precursor_pass") is True, "T10 T09 precursor missing")
    require(loaded["T09"].get("surface_count") == 10, "T10 T09 surface count drift")
    require(loaded["T09"].get("final_acceptance", {}).get("pass") is False, "T10 T09 final state drift")

    visual = load_json(ROOT / "data/u07-visual-baseline.json")
    require(visual.get("status") == "approved_precursor", "T10 T05 visual baseline not approved")
    require(visual.get("review", {}).get("visual_review") == "pass", "T10 T05 visual review failed")
    require(len(visual.get("surfaces", {})) == 10, "T10 T05 visual surface count drift")

    cross_workflow = (ROOT / ".github/workflows/cross-browser.yml").read_text(encoding="utf-8")
    cross_test = (ROOT / "tests/browser/test_cross_browser.py").read_text(encoding="utf-8")
    for browser in ("chromium", "firefox", "webkit"):
        require(browser in cross_workflow, f"T10 T06 workflow missing {browser}")
    require("u06-cross-browser-report.json" in cross_workflow, "T10 T06 report upload missing")
    require("30/30" in dependency_states["T06"]["evidence"], "T10 T06 recorded matrix evidence missing")
    require("playwright" in cross_test.lower(), "T10 T06 browser test implementation missing")

    all_green = all(row["status"] == "green" for row in dependency_states.values())

    result = {
        "version": 1,
        "task": "T10",
        "mode": "clean_checkout_precursor",
        "precursor_pass": True,
        "dependencies": dependency_states,
        "local_reports": {k: {"path": v, "present": True} for k, v in report_paths.items()},
        "repository_evidence": {
            "T05": {
                "approved_visual_baseline": True,
                "surface_count": len(visual["surfaces"]),
                "source_run_id": visual.get("source_run_id")
            },
            "T06": {
                "workflow_matrix_present": True,
                "recorded_matrix": "30/30",
                "source": ".github/workflows/cross-browser.yml"
            }
        },
        "final_acceptance": {
            "all_t01_t09_green": all_green,
            "approved_release_ci_run": False,
            "pass": False
        },
        "statement": policy["claim_boundary"]
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "T10_FULL_REGRESSION_PRECURSOR_PASS: T01-T09 precursor evidence aggregates cleanly; "
        f"dependency_green={sum(1 for x in dependency_states.values() if x['status']=='green')}/9; "
        "final acceptance remains false"
    )


if __name__ == "__main__":
    main()
