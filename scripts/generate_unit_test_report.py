#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MATRIX=ROOT/"data/unit-test-coverage-matrix.json"
OUTPUT=ROOT/"artifacts/t01-unit-coverage.json"

matrix=json.loads(MATRIX.read_text(encoding="utf-8"))
assert matrix.get("version")==1
assert matrix.get("task")=="T01"
assert matrix.get("status")=="partial"
assert matrix.get("coverage_type")=="acceptance_rule_coverage"
assert "not statement/branch line-coverage" in matrix.get("note","")

areas=matrix.get("areas",[])
assert [a["id"] for a in areas]==["identifiers","scoring","validation","errors"]

parsed={}
def methods_for(path: Path) -> dict[str,set[str]]:
    key=str(path.relative_to(ROOT))
    if key in parsed:
        return parsed[key]
    tree=ast.parse(path.read_text(encoding="utf-8"), filename=key)
    classes={}
    for node in tree.body:
        if isinstance(node,ast.ClassDef):
            classes[node.name]={n.name for n in node.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name.startswith("test_")}
    parsed[key]=classes
    return classes

seen=set()
resolved=[]
for area in areas:
    tests=area.get("tests",[])
    assert tests, f"T01 area {area['id']} has no tests"
    area_resolved=[]
    for ref in tests:
        parts=ref.split("::")
        assert len(parts)==3, f"invalid T01 test ref {ref}"
        file_name,class_name,method=parts
        assert ref not in seen, f"duplicate T01 test ref {ref}"
        seen.add(ref)
        path=ROOT/file_name
        assert path.is_file(), f"T01 test file missing: {file_name}"
        classes=methods_for(path)
        assert class_name in classes, f"T01 class missing: {ref}"
        assert method in classes[class_name], f"T01 method missing: {ref}"
        area_resolved.append(ref)
    resolved.append({
        "id":area["id"],
        "acceptance":area["acceptance"],
        "test_count":len(area_resolved),
        "tests":area_resolved
    })

report={
    "task":"T01",
    "coverage_type":"acceptance_rule_coverage",
    "areas":resolved,
    "area_count":len(resolved),
    "mapped_test_count":sum(x["test_count"] for x in resolved),
    "all_required_areas_mapped":True,
    "dependency_blocker":matrix["green_blocker"]
}
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(f"T01_UNIT_COVERAGE_REPORT_PASS: {report['area_count']} acceptance areas mapped to {report['mapped_test_count']} concrete unittest methods; report={OUTPUT.relative_to(ROOT)}")
