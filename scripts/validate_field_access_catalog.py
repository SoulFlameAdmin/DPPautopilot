#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "dpp-field-catalog.json"
MIGRATION = ROOT / "supabase" / "migrations" / "20261002039000_dpp_field_access_catalog.sql"

ROW = re.compile(
    r"^\s*\('((?:''|[^'])*)','((?:''|[^'])*)','((?:''|[^'])*)'\)[,;]?\s*$"
)


def sql_unescape(value: str) -> str:
    return value.replace("''", "'")


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    expected = {field["path"]: field["access"] for field in catalog["fields"]}
    version = str(catalog["catalogVersion"])

    observed: dict[str, str] = {}
    versions: set[str] = set()
    for line in MIGRATION.read_text(encoding="utf-8").splitlines():
        match = ROW.match(line)
        if not match:
            continue
        path, access, row_version = map(sql_unescape, match.groups())
        if path in observed:
            raise AssertionError(f"duplicate DB catalog field: {path}")
        observed[path] = access
        versions.add(row_version)

    if observed != expected:
        missing = sorted(set(expected) - set(observed))
        extra = sorted(set(observed) - set(expected))
        mismatched = sorted(
            path for path in set(expected) & set(observed)
            if expected[path] != observed[path]
        )
        raise AssertionError(
            f"BAT05 DB/catalog drift missing={missing} extra={extra} access_mismatch={mismatched}"
        )

    if versions != {version}:
        raise AssertionError(
            f"BAT05 catalog version drift: migration={sorted(versions)} json={version}"
        )

    print(
        f"BAT05_FIELD_ACCESS_CATALOG_PASS: {len(expected)} field/access pairs; "
        f"catalogVersion={version}"
    )


if __name__ == "__main__":
    main()
