#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from dpp_identifiers import is_demo_identifier, make_demo_identifier, parse_demo_identifier

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def expect_invalid(model_id, serial) -> None:
    try:
        make_demo_identifier(model_id, serial)
    except ValueError:
        return
    raise AssertionError(f"expected invalid identifier inputs: model={model_id!r}, serial={serial!r}")


def main() -> None:
    model = "NSD-EV-82-DEMO"
    first = make_demo_identifier(model, 1)
    require(first == "urn:dpp:demo:battery:NSD-EV-82-DEMO:000001", "canonical first identifier changed")
    require(make_demo_identifier(model, "000001") == first, "normalization is not deterministic")
    require(parse_demo_identifier(first) == (model, 1), "identifier round-trip failed")
    require(is_demo_identifier(first), "valid identifier rejected")

    ids = [make_demo_identifier(model, i) for i in range(1, 10001)]
    require(len(ids) == len(set(ids)), "collision detected in 10,000 sequential identifiers")
    require(ids[9999].endswith(":010000"), "serial normalization at 10,000 is incorrect")

    fixture = json.loads((ROOT / "data/sample-battery.json").read_text(encoding="utf-8"))
    expected = [make_demo_identifier(model, i) for i in (1, 2)]
    actual = [item["unique_identifier"] for item in fixture["items"]]
    require(actual == expected, "sample fixture identifiers diverge from generator")

    for bad_model, bad_serial in [
        ("", 1), ("bad model", 1), ("/bad", 1), (model, 0), (model, -1), (model, True), (model, "abc"), (model, 10**12),
    ]:
        expect_invalid(bad_model, bad_serial)

    for invalid in ["", "urn:dpp:prod:battery:X:000001", "urn:dpp:demo:battery:X:0", "BAD-ID"]:
        require(not is_demo_identifier(invalid), f"invalid identifier accepted: {invalid}")

    print("IDENTIFIER_PASS: deterministic demo URNs round-trip, fixture matches generator, 10,000 IDs have zero collisions, invalid inputs rejected")


if __name__ == "__main__":
    main()
