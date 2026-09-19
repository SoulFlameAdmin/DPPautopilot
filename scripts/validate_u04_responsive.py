#!/usr/bin/env python3
from __future__ import annotations

import re
import struct
import sys
from pathlib import Path

VIEWPORTS={
    "phone": (300, 500),
    "tablet": (650, 900),
    "desktop": (1200, 1800),
}
SURFACES={
    "dashboard":"index.html",
    "model":"demo/model.html",
    "item":"demo/item.html",
    "import":"demo/import.html",
    "import-validation":"demo/import-validation.html",
    "passport":"demo/passport.html",
    "settings":"demo/settings.html",
    "onboarding":"demo/onboarding.html",
    "mapping":"demo/mapping.html",
    "auth":"demo/auth.html",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def attr(dom: str, name: str) -> str | None:
    match=re.search(rf'{re.escape(name)}="([^"]*)"',dom)
    return match.group(1) if match else None


def main() -> None:
    require(len(sys.argv)==2,"usage: validate_u04_responsive.py <artifact-dir>")
    artifacts=Path(sys.argv[1])
    root=Path(__file__).resolve().parents[1]

    for surface,source_path in SURFACES.items():
        source=(root/source_path).read_text(encoding="utf-8",errors="replace")
        require('/demo/responsive-probe.js' in source,f"U04 {surface} does not load responsive probe")

    widths: dict[str,list[int]]={name:[] for name in VIEWPORTS}
    checked=0
    for viewport,(min_width,max_width) in VIEWPORTS.items():
        for surface in SURFACES:
            dom_path=artifacts/f"u04-{viewport}-{surface}.html"
            png_path=artifacts/f"u04-{viewport}-{surface}.png"
            require(dom_path.is_file(),f"U04 missing DOM evidence: {dom_path.name}")
            require(png_path.is_file(),f"U04 missing screenshot: {png_path.name}")
            raw=png_path.read_bytes()[:24]
            require(len(raw)>=24 and raw[:8]==b"\x89PNG\r\n\x1a\n" and raw[12:16]==b"IHDR",
                    f"U04 invalid PNG screenshot: {png_path.name}")
            png_width,png_height=struct.unpack(">II",raw[16:24])
            require(png_width>=min_width and png_width<=max_width,
                    f"U04 {viewport}/{surface} screenshot width {png_width} outside expected range")
            require(png_height>=500,f"U04 {viewport}/{surface} screenshot height unexpectedly small: {png_height}")

            dom=dom_path.read_text(encoding="utf-8",errors="replace")
            for marker in [
                'data-responsive-probe="true"',
                'data-responsive-ready="true"',
                'data-horizontal-overflow="false"',
                'data-blocking-overlay-count="0"',
            ]:
                require(marker in dom,f"U04 {viewport}/{surface} missing marker: {marker}")

            raw_width=attr(dom,"data-viewport-width")
            raw_scroll=attr(dom,"data-root-scroll-width")
            require(raw_width and raw_width.isdigit(),f"U04 {viewport}/{surface} missing viewport width")
            require(raw_scroll and raw_scroll.isdigit(),f"U04 {viewport}/{surface} missing root scroll width")
            width=int(raw_width)
            scroll=int(raw_scroll)
            require(min_width<=width<=max_width,f"U04 {viewport}/{surface} unexpected viewport width {width}")
            require(scroll<=width+1,f"U04 {viewport}/{surface} root overflow {scroll}>{width}")
            widths[viewport].append(width)
            checked+=1

    require(max(widths["phone"])<min(widths["tablet"]),"U04 phone/tablet viewport ordering invalid")
    require(max(widths["tablet"])<min(widths["desktop"]),"U04 tablet/desktop viewport ordering invalid")

    print(
        f"U04_RESPONSIVE_PASS: {checked} measured browser viewports across "
        f"{len(SURFACES)} core surfaces have no root horizontal overflow or full-screen blocking overlay"
    )


if __name__=="__main__":
    main()
