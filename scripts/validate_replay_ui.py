#!/usr/bin/env python3
from __future__ import annotations
import re
import sys
from pathlib import Path

def require(c,m):
    if not c: raise AssertionError(m)

def main():
    require(len(sys.argv)==2,"usage: validate_replay_ui.py <dom>")
    dom=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
    require('data-reset-ready="true"' in dom,"D13 fixture did not load")
    require('data-mutated-detected="true"' in dom,"D13 mutation was not detected")
    require('data-reset-equal="true"' in dom,"D13 reset did not restore exact baseline")
    status_match=re.search(r'<div id="status"[^>]*>(.*?)</div>',dom,re.I|re.S)
    require(status_match is not None,"D13 status element missing")
    status_text=re.sub(r'<[^>]+>','',status_match.group(1)).strip()
    require(status_text=="Reset returned to exact known fixture state",f"D13 success state not visible: {status_text!r}")
    require('Northstar Demo Cells (Synthetic)' in dom,"D13 reset snapshot does not show baseline manufacturer")
    print("REPLAY_PASS: mutation is detected and reset returns to byte-equivalent known fixture state")

if __name__=="__main__": main()
