#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 3, "usage: validate_public_passport.py <valid-dom> <not-found-dom>")
    valid = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    missing = Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace")

    for marker in [
        'data-passport-ready="true"',
        'data-restricted-leak="false"',
        'data-passport-id="urn:dpp:demo:battery:NSD-EV-82-DEMO:000001"',
        'data-public-field="model.identification.manufacturer.name"',
        'data-public-field="model.identification.model_id"',
        'data-public-field="model.composition.chemistry"',
        'data-public-field="item.unique_identifier"',
        'urn:dpp:demo:battery:NSD-EV-82-DEMO:000001',
    ]:
        require(marker in valid, f"D06 valid passport missing evidence: {marker}")

    forbidden = [
        'data-public-field="model.restricted_composition"',
        'data-public-field="model.safety_measures"',
        'data-public-field="model.compliance_test_reports"',
        'data-public-field="item.state_of_health"',
        'Synthetic NMC formulation',
        'DEMO-TEST-REPORT-001',
    ]
    for marker in forbidden:
        require(marker not in valid, f"D06 restricted content leaked into public render: {marker}")

    for marker in [
        'data-passport-ready="false"',
        'data-restricted-leak="false"',
        'data-passport-not-found="true"',
        'Passport not found for identifier: urn:dpp:demo:battery:missing',
    ]:
        require(marker in missing, f"D06 not-found state missing evidence: {marker}")

    print("PUBLIC_PASSPORT_PASS: stable public route renders allowed model fields + UID, excludes restricted/authority/item-private fields, and handles unknown IDs")


if __name__ == "__main__":
    main()
