#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 2, "usage: validate_onboarding_demo.py <dom>")
    dom = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")

    for marker in [
        'data-onboarding-ready="true"',
        'data-onboarding-valid="true"',
        'data-completed-steps="5"',
        'data-tenant-override="false"',
        'data-private-leak="false"',
        'data-step="organization" data-completed="true"',
        'data-step="member" data-completed="true"',
        'data-step="product" data-completed="true"',
        'data-step="import" data-completed="true"',
        'data-step="passport" data-completed="true"',
        'POST /api/organizations',
        'POST /api/members',
        'M24 SYNTHETIC FLOW PASS · 5/5 steps · tenant override blocked · private payload hidden',
        'role="status" aria-live="polite"',
        'urn:dpp:m24:pilot:0001',
    ]:
        require(marker in dom, f"M24 onboarding demo missing evidence: {marker}")

    require('>restricted<' not in dom, "M24 onboarding demo leaked private payload marker")
    print("M24_ONBOARDING_UI_PASS: 5-step synthetic onboarding flow renders deterministic tenant/RBAC/import/passport evidence without private payload leakage")


if __name__ == "__main__":
    main()
