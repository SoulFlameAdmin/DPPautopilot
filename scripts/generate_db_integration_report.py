#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MATRIX=ROOT/"data/db-integration-coverage-matrix.json"
OUTPUT=ROOT/"artifacts/t02-db-integration-report.json"

matrix=json.loads(MATRIX.read_text(encoding="utf-8"))
assert matrix.get("version")==1
assert matrix.get("task")=="T02"
assert matrix.get("status")=="partial"
assert matrix.get("coverage_type")=="database_acceptance_coverage"

deps=matrix.get("dependencies",[])
expected=[f"M{i:02d}" for i in range(4,17)]
assert [d["id"] for d in deps]==expected, f"T02 dependency coverage drift: {[d['id'] for d in deps]!r}"
assert matrix.get("required_partial_blockers")==["M05","M10","M12","M13"]

resolved=[]
for dep in deps:
    checks=dep.get("checks",[])
    assert checks, f"T02 {dep['id']} has no executable/contract checks"
    resolved_checks=[]
    for ref in checks:
        if ref.startswith("ci::"):
            resolved_checks.append({"ref":ref,"kind":"ci_step","verified":"declared"})
            continue
        parts=ref.split("::",1)
        path=ROOT/parts[0]
        assert path.is_file(), f"T02 check file missing: {parts[0]}"
        text=path.read_text(encoding="utf-8")
        marker=parts[1] if len(parts)==2 else None
        if marker:
            assert marker in text, f"T02 marker missing: {ref}"
        resolved_checks.append({"ref":ref,"kind":"file_marker" if marker else "file_contract","verified":"present"})
    resolved.append({
        "id":dep["id"],
        "dependency_state":dep["state"],
        "behavior":dep["behavior"],
        "check_count":len(resolved_checks),
        "checks":resolved_checks
    })

report={
    "task":"T02",
    "coverage_type":"database_acceptance_coverage",
    "dependency_count":len(resolved),
    "dependencies":resolved,
    "all_m04_m16_mapped":len(resolved)==13,
    "partial_blockers":matrix["required_partial_blockers"],
    "green_blocker":matrix["green_blocker"]
}
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(f"T02_DB_INTEGRATION_REPORT_PASS: {report['dependency_count']} M04-M16 dependencies mapped to executable PostgreSQL/contract checks; partial blockers={','.join(report['partial_blockers'])}; report={OUTPUT.relative_to(ROOT)}")
