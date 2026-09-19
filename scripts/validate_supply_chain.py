#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow_dir = ROOT / ".github" / "workflows"
workflow_paths = sorted(workflow_dir.glob("*.yml"))
requirement_paths = [
    ROOT / "requirements-ci.txt",
    ROOT / "requirements-browser.txt",
]
doc = (ROOT / "docs/R14_SUPPLY_CHAIN.md").read_text(encoding="utf-8")

EXPECTED = {
    "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-python": "a26af69be951a213d495a4c3e4e4022e16d87065",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
}

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

require(workflow_paths, "R14 workflow inventory is empty")
workflow_texts={path:path.read_text(encoding="utf-8") for path in workflow_paths}
combined_workflows="\n".join(workflow_texts.values())
uses = re.findall(r"^\s*uses:\s*([^\s#]+)", combined_workflows, flags=re.MULTILINE)
require(uses, "R14 workflows have no external action references")

for ref in uses:
    require("@" in ref, f"R14 malformed action reference: {ref}")
    action, revision = ref.rsplit("@", 1)
    require(re.fullmatch(r"[0-9a-f]{40}", revision) is not None, f"R14 action is not immutable-SHA pinned: {ref}")
    if action in EXPECTED:
        require(revision == EXPECTED[action], f"R14 unexpected pin for {action}: {revision}")

for action, sha in EXPECTED.items():
    require(f"{action}@{sha}" in combined_workflows, f"R14 expected action pin missing: {action}@{sha}")

all_pins=[]
for path in requirement_paths:
    require(path.is_file(), f"R14 requirements file missing: {path.name}")
    lines=path.read_text(encoding="utf-8").splitlines()
    pins=[line.strip() for line in lines if line.strip() and not line.lstrip().startswith("#")]
    require(pins, f"R14 {path.name} is empty")
    for line in pins:
        require("==" in line, f"R14 Python dependency must use exact == pin in {path.name}: {line}")
        name, version = line.split("==", 1)
        require(name.strip() and version.strip(), f"R14 malformed requirement pin in {path.name}: {line}")
    all_pins.extend(pins)

require("pip-audit==2.10.1" in all_pins, "R14 pinned pip-audit dependency missing")
require("qrcode[pil]==8.2" in all_pins, "R14 pinned QR dependency missing")
require("playwright==1.63.0" in all_pins, "R14 pinned U06 Playwright dependency missing")
require("python -m pip_audit -r requirements-ci.txt" in combined_workflows, "R14 CI dependency audit step missing")
require("python -m pip_audit -r requirements-browser.txt" in combined_workflows, "R14 browser dependency audit step missing")
require("python -m playwright install --with-deps chromium firefox webkit" in combined_workflows,
        "R14 U06 browser install contract missing")
require("immutable" in doc.lower() and "known vulnerability" in doc.lower(), "R14 documentation incomplete")

print(
    f"R14_SUPPLY_CHAIN_PASS: {len(uses)} action references across {len(workflow_paths)} workflows "
    f"are immutable-SHA pinned and {len(all_pins)} exact Python pins across {len(requirement_paths)} "
    "requirements files are dependency-audited"
)
