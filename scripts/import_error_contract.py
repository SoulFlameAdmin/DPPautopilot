#!/usr/bin/env python3
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "import-error-contract.json"


@lru_cache(maxsize=1)
def load_import_error_contract() -> dict[str, dict[str, Any]]:
    raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    errors = raw.get("errors", [])
    by_sqlstate: dict[str, dict[str, Any]] = {}
    for entry in errors:
        sqlstate = entry["sqlstate"]
        if sqlstate in by_sqlstate:
            raise ValueError(f"duplicate SQLSTATE in import error catalog: {sqlstate}")
        by_sqlstate[sqlstate] = {
            "sqlstate": sqlstate,
            "code": entry["code"],
            "message": entry["message"],
            "http_status": int(entry["intended_http_status"]),
        }
    return by_sqlstate


def map_import_sqlstate(sqlstate: str) -> dict[str, Any]:
    contract = load_import_error_contract()
    entry = contract.get(sqlstate)
    if entry is not None:
        return dict(entry)

    return {
        "sqlstate": sqlstate,
        "code": "internal_error",
        "message": "An unexpected error occurred.",
        "http_status": 500,
    }
