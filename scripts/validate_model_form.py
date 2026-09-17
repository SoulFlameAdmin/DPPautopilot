#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 3, "usage: validate_model_form.py <valid-dom> <invalid-dom>")
    valid = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    invalid = Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace")

    for marker in [
        'data-form-ready="true"',
        'data-form-valid="true"',
        'data-error-count="0"',
        'data-field="model.identification.manufacturer.name"',
        'data-field="model.eu_declaration_of_conformity"',
        'VALID · 34 catalog model fields checked',
    ]:
        require(marker in valid, f"D04 valid form missing evidence: {marker}")

    for marker in [
        'data-form-ready="true"',
        'data-form-valid="false"',
        'data-error-count="1"',
        'data-error-for="model.identification.manufacturer.name">Required field<',
        'INVALID · 1 field error(s)',
    ]:
        require(marker in invalid, f"D04 invalid form missing error evidence: {marker}")

    print("MODEL_FORM_PASS: catalog-driven 34-field model form accepts complete fixture and exposes one deterministic required-field error")


if __name__ == "__main__":
    main()
