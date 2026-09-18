#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
requirements = (ROOT / "requirements-ci.txt").read_text(encoding="utf-8").splitlines()
doc = (ROOT / "docs/R14_SUPPLY_CHAIN.md").read_text(encoding="utf-8")

EXPECTED = {
    "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-python": "a26af69be951a213d495a4c3e4e4022e16d87065",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
}

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

uses = re.findall(r"^\s*uses:\s*([^\s#]+)", workflow, flags=re.MULTILINE)
require(uses, "R14 workflow has no external action references")

for ref in uses:
    require("@" in ref, f"R14 malformed action reference: {ref}")
    action, revision = ref.rsplit("@", 1)
    require(re.fullmatch(r"[0-9a-f]{40}", revision) is not None, f"R14 action is not immutable-SHA pinned: {ref}")
    if action in EXPECTED:
        require(revision == EXPECTED[action], f"R14 unexpected pin for {action}: {revision}")

for action, sha in EXPECTED.items():
    require(f"{action}@{sha}" in workflow, f"R14 expected action pin missing: {action}@{sha}")

pins = [line.strip() for line in requirements if line.strip() and not line.lstrip().startswith("#")]
require(pins, "R14 requirements-ci.txt is empty")
for line in pins:
    require("==" in line, f"R14 Python dependency must use exact == pin: {line}")
    name, version = line.split("==", 1)
    require(name.strip() and version.strip(), f"R14 malformed requirement pin: {line}")

require("pip-audit==2.10.1" in pins, "R14 pinned pip-audit dependency missing")
require("qrcode[pil]==8.2" in pins, "R14 pinned QR dependency missing")
require("python -m pip_audit -r requirements-ci.txt" in workflow, "R14 CI dependency audit step missing")
require("immutable" in doc.lower() and "known vulnerability" in doc.lower(), "R14 documentation incomplete")

print(f"R14_SUPPLY_CHAIN_PASS: {len(uses)} GitHub Action references are immutable-SHA pinned and {len(pins)} Python CI dependencies are exact-version pinned with pip-audit enforcement")
