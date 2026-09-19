#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    require(len(sys.argv) == 3, "usage: validate_core_navigation.py <dashboard-dom> <settings-dom>")
    dashboard = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
    settings = Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace")

    dashboard_routes = [
        "/demo/model.html?sample=1",
        "/demo/item.html?sample=1",
        "/demo/import.html?sample=1",
        "/demo/passport.html?id=urn%3Adpp%3Ademo%3Abattery%3ANSD-EV-82-DEMO%3A000001",
        "/demo/settings.html?sample=1",
    ]
    for route in dashboard_routes:
        require(route in dashboard, f"U01 dashboard navigation missing route: {route}")

    for marker in [
        'data-settings-ready="true"',
        'data-secret-storage="false"',
        'data-persistent-write="false"',
        'data-nav="models"',
        'data-nav="items"',
        'data-nav="imports"',
        'data-nav="passports"',
        'data-nav="onboarding"',
        'role="status" aria-live="polite"',
        'SETTINGS PRECURSOR PASS · explicit tenant · no secret persistence · no production write',
    ]:
        require(marker in settings, f"U01 settings surface missing evidence: {marker}")

    print("U01_CORE_NAVIGATION_PASS: dashboard exposes models/items/imports/passports/settings and settings returns to core synthetic workflows without secret persistence")


if __name__ == "__main__":
    main()
