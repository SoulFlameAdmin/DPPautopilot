#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 2, "usage: validate_import_demo.py <rendered-dom.html>")
    dom = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    required = {
        "sample loaded": 'data-import-loaded="true"',
        "eight mappings": 'data-mapped-count="8"',
        "two data rows": 'id="rowCount">2<',
        "eight columns": 'id="columnCount">8<',
        "model mapping": 'value="model.identification.model_id" selected',
        "item mapping": 'value="item.unique_identifier" selected',
        "synthetic row": "Northstar Demo Cells (Synthetic)",
        "first demo identifier": "urn:dpp:demo:battery:NSD-EV-82-DEMO:000001",
    }
    for label, marker in required.items():
        require(marker in dom, f"D03 missing rendered evidence: {label} ({marker})")
    require('class="status error"' not in dom, "D03 rendered an import error state")
    print("IMPORT_DEMO_PASS: sample CSV loaded, 8 columns previewed, 2 rows rendered, 8 canonical mappings selected")


if __name__ == "__main__":
    main()
