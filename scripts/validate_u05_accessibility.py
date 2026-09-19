#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

SURFACES=(
    "dashboard","model","item","import","import-validation",
    "passport","settings","onboarding","mapping","auth",
)

ZERO_MARKERS=(
    "data-a11y-duplicate-id-count",
    "data-a11y-unlabeled-count",
    "data-a11y-positive-tabindex-count",
    "data-a11y-focus-failure-count",
    "data-a11y-missing-alt-count",
    "data-a11y-contrast-violation-count",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def attr(dom: str, name: str) -> str | None:
    m=re.search(rf'{re.escape(name)}="([^"]*)"',dom)
    return m.group(1) if m else None


def main() -> None:
    require(len(sys.argv)==2,"usage: validate_u05_accessibility.py <artifact-dir>")
    artifacts=Path(sys.argv[1])
    checked=0

    for surface in SURFACES:
        path=artifacts/f"u05-{surface}.html"
        require(path.is_file(),f"U05 missing DOM evidence: {path.name}")
        dom=path.read_text(encoding="utf-8",errors="replace")
        require('data-accessibility-probe="true"' in dom,f"U05 {surface} probe missing")
        require('data-accessibility-ready="true"' in dom,f"U05 {surface} probe not ready")
        require('data-a11y-pass="true"' in dom,f"U05 {surface} accessibility probe failed")
        require(attr(dom,"data-a11y-main-count") not in {None,"0"},f"U05 {surface} missing main landmark")
        require(attr(dom,"data-a11y-h1-count")=="1",f"U05 {surface} must expose exactly one H1")
        for marker in ZERO_MARKERS:
            require(attr(dom,marker)=="0",f"U05 {surface} non-zero {marker}: {attr(dom,marker)}")
        count=attr(dom,"data-a11y-interactive-count")
        require(count is not None and count.isdigit(),f"U05 {surface} missing interactive count")
        checked+=1

    print(
        f"U05_ACCESSIBILITY_PASS: {checked} core surfaces have browser-proven landmarks, "
        "single H1, unique IDs, labelled controls, zero positive tabindex, programmatic focusability, "
        "image alt coverage and zero sampled WCAG text-contrast violations"
    )


if __name__=="__main__":
    main()
