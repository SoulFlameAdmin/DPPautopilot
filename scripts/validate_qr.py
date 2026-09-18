#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 4, "usage: validate_qr.py <decoded.txt> <expected-url> <qr-dom.html>")
    decoded = Path(sys.argv[1]).read_text(encoding="utf-8").strip()
    expected = sys.argv[2]
    dom = Path(sys.argv[3]).read_text(encoding="utf-8", errors="replace")

    require(decoded == expected, f"QR decoded URL mismatch: {decoded!r} != {expected!r}")
    require('data-qr-ready="true"' in dom, "D08 QR page did not reach ready state")
    require('data-qr-kind="demo-local-passport-url"' in dom, "D08 QR page missing explicit demo-local classification")
    require(expected.replace("&", "&amp;") in dom or expected in dom, "D08 QR page does not expose the exact encoded URL")
    require('/data/demo-passport-qr.svg' in dom, "D08 QR SVG is not mounted in the UI")

    print("QR_SCAN_PASS: QR decoded byte-for-byte to the exact passport URL; UI exposes the same carrier and route")


if __name__ == "__main__":
    main()
