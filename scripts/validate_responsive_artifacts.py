#!/usr/bin/env python3
from __future__ import annotations

import struct
import sys
from pathlib import Path

VIEWPORTS = {
    "phone": (390, 844),
    "tablet": (768, 1024),
    "desktop": (1440, 1000),
}
SURFACES = ("dashboard", "import", "model", "item", "passport", "qr", "completeness", "separation")
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def png_dimensions(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    require(len(data) >= 24, f"D12 truncated PNG: {path.name}")
    require(data[:8] == PNG_SIGNATURE, f"D12 invalid PNG signature: {path.name}")
    require(data[12:16] == b"IHDR", f"D12 missing IHDR: {path.name}")
    return struct.unpack(">II", data[16:24])


def main() -> None:
    require(len(sys.argv) == 2, "usage: validate_responsive_artifacts.py <artifact-dir>")
    root = Path(sys.argv[1])
    missing = []
    invalid = []
    for viewport, expected in VIEWPORTS.items():
        for surface in SURFACES:
            path = root / f"d12-{viewport}-{surface}.png"
            if not path.exists():
                missing.append(path.name)
                continue
            try:
                dims = png_dimensions(path)
                if dims != expected or path.stat().st_size < 1024:
                    invalid.append((path.name, dims, path.stat().st_size))
            except AssertionError as exc:
                invalid.append((path.name, str(exc), path.stat().st_size))

    require(not missing, f"D12 screenshots missing: {missing}")
    require(not invalid, f"D12 screenshots invalid/dimension-mismatched: {invalid}")
    print(
        f"RESPONSIVE_PASS: {len(VIEWPORTS) * len(SURFACES)} real PNG screenshots "
        "have the requested phone/tablet/desktop dimensions"
    )


if __name__ == "__main__":
    main()
