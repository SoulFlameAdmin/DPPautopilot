#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
from pathlib import Path

from completeness import score_fixture

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    catalog = json.loads((ROOT / "data/dpp-field-catalog.json").read_text(encoding="utf-8"))
    fixture = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))

    complete = score_fixture(catalog, fixture)
    require(complete["required"] > 0, "required catalog field set is empty")
    require(complete["score"] == 100.0, f"complete fixture score is not 100: {complete}")
    require(complete["missingCount"] == 0, "complete fixture unexpectedly has missing fields")

    broken = copy.deepcopy(fixture)
    del broken["model"]["identification"]["manufacturer"]["contact"]
    incomplete = score_fixture(catalog, broken)
    require(incomplete["score"] < 100.0, "missing required field did not lower completeness score")
    require(incomplete["missingCount"] == 1, f"expected one missing field, got {incomplete['missingCount']}")
    missing = incomplete["missing"][0]
    require(missing["path"] == "model.identification.manufacturer.contact", "wrong field identified as missing")
    require(missing["ui_target"] == "modelForm.manufacturerContact", "warning lacks actionable UI target")
    require("Annex" in missing["source"] or "Article" in missing["source"], "warning lacks requirement source")

    print(
        f"COMPLETENESS_PASS: {complete['required']} required catalog fields score 100%; "
        f"deterministic removal yields {incomplete['score']}% and one actionable warning"
    )


if __name__ == "__main__":
    main()
