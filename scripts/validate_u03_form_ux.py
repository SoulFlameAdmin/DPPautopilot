#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8", errors="replace")


def main() -> None:
    require(
        len(sys.argv)==9,
        "usage: validate_u03_form_ux.py <model-valid> <model-invalid> <item-valid> <item-invalid> <auth-invalid> <recovery-invalid> <mapping-invalid> <import-dom>",
    )
    model_valid,model_invalid,item_valid,item_invalid,auth_invalid,recovery_invalid,mapping_invalid,import_dom=map(read,sys.argv[1:])

    # Existing catalog-driven create/edit forms: validation must be field-linked,
    # live, non-destructive and deterministic.
    for name,dom,valid_marker in [
        ("model",model_invalid,'data-form-valid="false"'),
        ("item",item_invalid,'data-item-valid="false"'),
    ]:
        require(valid_marker in dom,f"U03 {name} invalid state missing")
        require('data-input-preserved="true"' in dom,f"U03 {name} validation mutated input")
        require('aria-invalid="true"' in dom,f"U03 {name} invalid field not exposed")
        require('aria-describedby=' in dom,f"U03 {name} field errors are not associated")
        require('aria-live="polite"' in dom,f"U03 {name} errors are not live-announced")

    require('data-form-valid="true"' in model_valid,"U03 model valid path regressed")
    require('data-item-valid="true"' in item_valid,"U03 item valid path regressed")

    # Authentication: local validation must fail before network auth while retaining
    # exactly what the user typed.
    for marker in [
        'data-auth-ready="true"',
        'data-form-valid="false"',
        'data-input-preserved="true"',
        'id="email"',
        'aria-describedby="email_help email_error"',
        'id="email_error"',
        'id="password_error"',
        'Enter a valid email address.',
        'Password is required.',
    ]:
        require(marker in auth_invalid,f"U03 auth invalid evidence missing: {marker}")
    require(auth_invalid.count('aria-invalid="true"')>=2,"U03 auth invalid controls not exposed")

    # Recovery token is synthetic and consumed only in-memory; invalid password
    # must be blocked locally and preserved without issuing the PATCH.
    for marker in [
        'data-recovery-ready="true"',
        'data-recovery-session="valid"',
        'data-password-update="blocked"',
        'data-form-valid="false"',
        'data-input-preserved="true"',
        'aria-describedby="password_help password_error"',
        'aria-invalid="true"',
        'Password must be at least 8 characters.',
    ]:
        require(marker in recovery_invalid,f"U03 recovery invalid evidence missing: {marker}")

    # Mapping name validation is associated and non-destructive while the generated
    # mapping payload remains invalid until corrected.
    for marker in [
        'data-mapping-ready="true"',
        'data-payload-valid="false"',
        'data-form-valid="false"',
        'data-input-preserved="true"',
        'aria-describedby="mappingName_help mappingName_error"',
        'aria-invalid="true"',
        'Mapping name is required.',
    ]:
        require(marker in mapping_invalid,f"U03 mapping invalid evidence missing: {marker}")

    # File import is a write-adjacent input surface: it must be explicitly labelled
    # and tied to the live result/status region.
    for marker in [
        '<label for="fileInput"',
        'id="fileInput"',
        'aria-describedby="loadStatus"',
        'id="loadStatus"',
        'role="status"',
        'aria-live="polite"',
    ]:
        require(marker in import_dom,f"U03 import input accessibility missing: {marker}")

    print("U03_FORM_UX_PASS: model/item/auth/recovery/mapping/import controls expose associated accessible errors/status and preserve user input on local validation failures")


if __name__=="__main__":
    main()
