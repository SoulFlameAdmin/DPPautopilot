#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "dpp-field-catalog.json"
MIGRATION = ROOT / "supabase" / "migrations" / "20261002039100_dpp_field_catalog_access.sql"

MAP = re.compile(
    r"-- BAT05_RUNTIME_ACCESS_MAP_BEGIN.*?\$catalog\$\s*(\[.*?\])\s*\$catalog\$::jsonb.*?-- BAT05_RUNTIME_ACCESS_MAP_END",
    re.S,
)


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    sql = MIGRATION.read_text(encoding="utf-8")

    match = MAP.search(sql)
    if not match:
        raise AssertionError("BAT05 runtime access map marker missing from migration")

    rows = json.loads(match.group(1))
    expected = {field["path"]: field["access"] for field in catalog["fields"]}
    observed: dict[str, str] = {}

    for row in rows:
        path = row.get("path")
        access = row.get("access")
        if path in observed:
            raise AssertionError(f"duplicate DB catalog field: {path}")
        observed[path] = access

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

    version = str(catalog["catalogVersion"])
    expected_sql = f"select x.path,x.access,'{version}'"
    if expected_sql not in sql:
        raise AssertionError(
            f"BAT05 catalog version drift: expected migration version {version}"
        )

    print(
        f"BAT05_FIELD_ACCESS_CATALOG_PASS: {len(expected)} field/access pairs; "
        f"catalogVersion={version}"
    )


if __name__ == "__main__":
    main()
