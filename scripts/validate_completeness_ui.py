#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 3, "usage: validate_completeness_ui.py <complete-dom> <missing-dom>")
    complete = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    missing = Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace")

    for marker in ['data-completeness-ready="true"', 'data-score="100"', 'data-missing-count="0"', 'No required fields missing']:
        require(marker in complete, f"D09 complete UI missing marker: {marker}")

    for marker in [
        'data-completeness-ready="true"',
        'data-missing-count="1"',
        'data-missing-field="model.identification.manufacturer.contact"',
        'Complete: modelForm.manufacturerContact',
        'Action required',
    ]:
        require(marker in missing, f"D10 missing warning UI missing marker: {marker}")
    require('data-score="100"' not in missing, "D10 missing-field state incorrectly scores 100")

    print("COMPLETENESS_UI_PASS: complete fixture renders 100%; missing manufacturer contact lowers score and exposes one actionable warning")


if __name__ == "__main__":
    main()
