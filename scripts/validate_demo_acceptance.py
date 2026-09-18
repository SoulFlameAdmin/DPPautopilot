#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    require(len(sys.argv) == 2, "usage: validate_demo_acceptance.py <dom>")
    dom = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    for marker in [
        'data-acceptance-ready="true"',
        'data-acceptance-pass="true"',
        'data-runtime-errors="0"',
        'data-steps-passed="4"',
        'DEMO ACCEPTANCE PASS',
    ]:
        require(marker in dom, f"D14 missing acceptance marker: {marker}")
    for step in ["Create / import", "Validate required data", "Public passport", "QR carrier"]:
        require(step in dom, f"D14 missing journey step: {step}")
    print("DEMO_ACCEPTANCE_PASS: import -> validate -> public passport -> QR completed in browser with zero runtime errors")

if __name__ == "__main__":
    main()
