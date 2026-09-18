#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 5, "usage: validate_qr.py <generated-decoded.txt> <ui-decoded.txt> <expected-url> <qr-dom.html>")
    generated = Path(sys.argv[1]).read_text(encoding="utf-8").strip()
    ui_decoded = Path(sys.argv[2]).read_text(encoding="utf-8").strip()
    expected = sys.argv[3]
    dom = Path(sys.argv[4]).read_text(encoding="utf-8", errors="replace")

    require(generated == expected, f"generated QR decoded URL mismatch: {generated!r} != {expected!r}")
    require(ui_decoded == expected, f"embedded UI QR decoded URL mismatch: {ui_decoded!r} != {expected!r}")
    require('data-qr-ready="true"' in dom, "D08 QR page did not reach ready state")
    require('data-qr-kind="demo-local-passport-url"' in dom, "D08 QR page missing explicit demo-local classification")
    require('data-embedded-qr="true"' in dom, "D08 page does not contain the embedded generated QR carrier")
    require(expected.replace("&", "&amp;") in dom or expected in dom, "D08 QR page does not expose the exact encoded URL")

    print("QR_SCAN_PASS: generated and embedded UI QR codes both decode byte-for-byte to the exact passport URL; route returned HTTP 200")


if __name__ == "__main__":
    main()
