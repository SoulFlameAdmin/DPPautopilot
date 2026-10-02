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
        'data-suggestion-count="35"',
        'data-applied-count="0"',
        'data-unknown-count="4"',
        'data-catalog-field-count="42"',
    ]:
        require(marker in dom,f"X06 missing browser marker: {marker}")
    require(dom.count('data-apply-header=')>=35,"X06 expected explicit Apply controls for reviewable suggestions")
    require("No suggestion" in dom,"X06 unknown columns are not visibly left untouched")
    require("Suggestions are review-only by default" in dom,"X06 non-destructive default is not explicit")
    require("<pre id=\"accepted\">{}</pre>" in dom or '<pre id="accepted">{}</pre>' in dom,"X06 accepted mapping must start empty")
    print("BAT18_MAPPING_UI_PASS: 35 curated suggestions span the catalog, 4 unknown columns stay untouched, 42 canonical fields are loaded, and accepted mapping starts empty")

if __name__=="__main__": main()
