#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


STATES=("loading","empty","success","error")
VIEWS={
    "dashboard":{
        "source":"index.html",
        "success":['data-async-state="success"','data-stage='],
    },
    "model":{
        "source":"demo/model.html",
        "success":['data-async-state="success"','data-form-ready="true"'],
    },
    "item":{
        "source":"demo/item.html",
        "success":['data-async-state="success"','data-item-ready="true"'],
    },
    "import":{
        "source":"demo/import.html",
        "success":['data-async-state="success"','data-import-loaded="true"'],
    },
    "import-validation":{
        "source":"demo/import-validation.html",
        "success":['data-async-state="success"','data-validation-ready="true"'],
    },
    "passport":{
        "source":"demo/passport.html",
        "success":['data-async-state="success"','data-passport-ready="true"','data-restricted-leak="false"'],
    },
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv)==2,"usage: validate_u02_async_states.py <artifact-dir>")
    artifacts=Path(sys.argv[1])
    root=Path(__file__).resolve().parents[1]

    helper=(root/"demo/async-state.js").read_text(encoding="utf-8")
    for token in ["loading","empty","success","error","data.asyncState","aria-busy","DPPAsyncState"]:
        require(token in helper,f"U02 helper missing token: {token}")

    for view,meta in VIEWS.items():
        source=(root/meta["source"]).read_text(encoding="utf-8")
        require('/demo/async-state.js' in source,f"U02 {view} does not load shared async state helper")
        require("u02." in source,f"U02 {view} does not use shared async state contract")

        for state in STATES:
            dom_path=artifacts/f"u02-{view}-{state}.html"
            require(dom_path.is_file(),f"U02 missing browser artifact: {dom_path}")
            dom=dom_path.read_text(encoding="utf-8",errors="replace")
            require(f'data-async-state="{state}"' in dom,f"U02 {view} did not settle in {state}")
            expected_busy='aria-busy="true"' if state=="loading" else 'aria-busy="false"'
            require(expected_busy in dom,f"U02 {view} {state} missing deterministic aria-busy state")
            if state=="success":
                for marker in meta["success"]:
                    require(marker in dom,f"U02 {view} success missing marker: {marker}")

    print("U02_ASYNC_STATE_MATRIX_PASS: 6 async core views expose deterministic loading/empty/success/error states with browser evidence")


if __name__=="__main__":
    main()
