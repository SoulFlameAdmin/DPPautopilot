#!/usr/bin/env python3
from __future__ import annotations
import re, sys
from pathlib import Path

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)

def main() -> None:
    require(len(sys.argv) == 2, "usage: validate_separation_ui.py <dom>")
    dom = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    require('data-separation-ready="true"' in dom, "D11 view did not render")
    require('data-cross-level-leak="false"' in dom, "D11 detected cross-level path leak")
    require('MODEL LEVEL' in dom and 'ITEM LEVEL' in dom, "D11 level labels missing")

    model_paths = {
        path for path in re.findall(r'data-model-path="([^"]+)"', dom)
        if path.startswith("model.")
    }
    item_paths = {
        path for path in re.findall(r'data-item-path="([^"]+)"', dom)
        if path.startswith("item.")
    }

    require(model_paths, "D11 model field set is empty")
    require(item_paths, "D11 item field set is empty")
    require(not any(path.startswith("item.") for path in model_paths), "item path rendered in model section")
    require(not any(path.startswith("model.") for path in item_paths), "model path rendered in item section")
    require(model_paths.isdisjoint(item_paths), "model/item canonical path sets overlap")

    print(f"SEPARATION_PASS: {len(model_paths)} model paths and {len(item_paths)} item paths render in disjoint sections with zero cross-level leakage")

if __name__ == "__main__":
    main()
