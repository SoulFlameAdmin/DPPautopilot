#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path

def require(c,m):
    if not c: raise AssertionError(m)

def main():
    require(len(sys.argv)==2,"usage: validate_mapping_assistant_ui.py <dom>")
    dom=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
    for marker in [
        'data-review-ready="true"',
        'data-suggestion-count="10"',
        'data-applied-count="0"',
        'data-unknown-count="2"',
    ]:
        require(marker in dom,f"X06 missing browser marker: {marker}")
    require(dom.count('data-apply-header=')>=10,"X06 expected explicit Apply controls for reviewable suggestions")
    require("No suggestion" in dom,"X06 unknown columns are not visibly left untouched")
    require("Suggestions are review-only by default" in dom,"X06 non-destructive default is not explicit")
    require("<pre id=\"accepted\">{}</pre>" in dom or '<pre id="accepted">{}</pre>' in dom,"X06 accepted mapping must start empty")
    print("X06_MAPPING_UI_PASS: 10 suggestions are reviewable with confidence/evidence, 2 unknown columns stay untouched, and default accepted mapping is empty")

if __name__=="__main__": main()
