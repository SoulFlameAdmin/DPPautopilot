#!/usr/bin/env python3
from __future__ import annotations
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
    require('Reset returned to exact known fixture state' in dom,"D13 success state not visible")
    require('Northstar Demo Cells (Synthetic)' in dom,"D13 reset snapshot does not show baseline manufacturer")
    print("REPLAY_PASS: mutation is detected and reset returns to byte-equivalent known fixture state")

if __name__=="__main__": main()
