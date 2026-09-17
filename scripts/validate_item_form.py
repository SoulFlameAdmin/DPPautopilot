#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 3, "usage: validate_item_form.py <valid-dom> <invalid-dom>")
    valid = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    invalid = Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace")

    for marker in [
        'data-item-ready="true"',
        'data-item-valid="true"',
        'data-model-linked="true"',
        'data-error-count="0"',
        'data-field="item.unique_identifier"',
        'data-field="item.lifecycle_status"',
        'value="NSD-EV-82-DEMO"',
        'VALID · model linked + 8 item groups checked',
    ]:
        require(marker in valid, f"D05 valid item form missing evidence: {marker}")

    for marker in [
        'data-item-valid="false"',
        'data-model-linked="true"',
        'data-error-count="1"',
        'Identifier must be a demo URN linked to this model',
        'INVALID · 1 field error(s)',
    ]:
        require(marker in invalid, f"D05 invalid item form missing evidence: {marker}")

    print("ITEM_FORM_PASS: item links to model, all 8 item field groups validate, and malformed identifier is rejected visibly")


if __name__ == "__main__":
    main()
