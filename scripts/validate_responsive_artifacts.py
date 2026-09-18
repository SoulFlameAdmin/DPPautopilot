#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

VIEWPORTS = ("phone", "tablet", "desktop")
SURFACES = ("dashboard", "import", "model", "item", "passport", "qr", "completeness", "separation")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 2, "usage: validate_responsive_artifacts.py <artifact-dir>")
    root = Path(sys.argv[1])
    missing = []
    too_small = []
    for viewport in VIEWPORTS:
        for surface in SURFACES:
            path = root / f"d12-{viewport}-{surface}.png"
            if not path.exists():
                missing.append(path.name)
                continue
            if path.stat().st_size < 4000:
                too_small.append((path.name, path.stat().st_size))

    require(not missing, f"D12 screenshots missing: {missing}")
    require(not too_small, f"D12 screenshots unexpectedly small: {too_small}")
    print(f"RESPONSIVE_PASS: {len(VIEWPORTS) * len(SURFACES)} phone/tablet/desktop screenshots created for core demo surfaces")


if __name__ == "__main__":
    main()
