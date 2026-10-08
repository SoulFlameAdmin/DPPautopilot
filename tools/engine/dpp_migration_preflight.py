#!/usr/bin/env python3
"""Read-only diagnostic for DPP C04 migration gaps. NOT a release approval.

Never contacts Supabase, never changes applied-history snapshot, never executes SQL.
A report with no missing names does not prove schema validity, backup, or release safety.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parents[2]
PATTERN = re.compile(r"^(\d{14})_([a-z0-9_]+)\.sql$")


def report(root: Path, snapshot: dict, expected_project: str) -> dict:
    if snapshot.get("project_id") != expected_project:
        raise ValueError("Bound project mismatch; cannot inspect an unrelated snapshot")
    if snapshot.get("source") != "Supabase list_migrations read-only connector":
        raise ValueError("Migration inventory is not from the verified read-only source")
    entries = snapshot.get("applied_migrations")
    if not isinstance(entries, list) or not entries:
        raise ValueError("No verified migration history")
    by_name = {}
    by_version = {}
    for item in entries:
        if not isinstance(item, dict) or not isinstance(item.get("version"), str) or not isinstance(item.get("name"), str):
            raise ValueError("Invalid applied migration record")
        name = item["name"]
        version = item["version"]
        if not re.fullmatch(r"\d{14}", version):
            raise ValueError("Invalid applied migration version")
        if name in by_name or version in by_version:
            raise ValueError("Duplicate applied migration name or version")
        by_name[name] = version
        by_version[version] = name

    migration_dir = root / "supabase" / "migrations"
    if not migration_dir.is_dir():
        raise ValueError("Repository migration directory is missing")
    rows = []
    repo_names = set()
    repo_versions = set()
    for path in sorted(migration_dir.glob("*.sql")):
        match = PATTERN.fullmatch(path.name)
        if not match:
            raise ValueError("Invalid repository migration name: " + path.name)
        version, name = match.groups()
        if name in repo_names or version in repo_versions:
            raise ValueError("Duplicate repository migration name or version")
        repo_names.add(name)
        repo_versions.add(version)
        body = path.read_bytes()
        rows.append({
            "version": version,
            "name": name,
            "sha256": hashlib.sha256(body).hexdigest(),
            "applied_in_bound_snapshot": name in by_name,
            "applied_version_match": by_name.get(name) == version if name in by_name else None,
        })
    if not rows:
        raise ValueError("Repository has no migrations")

    conflicts = [
        {"name": row["name"], "repo_version": row["version"], "database_version": by_name[row["name"]]}
        for row in rows if row["name"] in by_name and not row["applied_version_match"]
    ]
    pending = [row for row in rows if not row["applied_in_bound_snapshot"]]
    # Version collisions are independently meaningful even if names differ.
    other_version_conflicts = [
        {"version": row["version"], "repo_name": row["name"], "database_name": by_version[row["version"]]}
        for row in rows if row["version"] in by_version and by_version[row["version"]] != row["name"]
    ]
    return {
        "schema_version": 1,
        "purpose": "NON_RELEASE_DIAGNOSTIC",
        "project_id": expected_project,
        "snapshot_observed_at": snapshot.get("observed_at"),
        "applied_in_snapshot": len(entries),
        "repository_migrations": len(rows),
        "pending_count": len(pending),
        "pending": pending,
        "name_version_conflicts": conflicts,
        "version_name_conflicts": other_version_conflicts,
        "snapshot_name_coverage": not pending and not conflicts and not other_version_conflicts,
        "c04_release_gate_passed": False,
        "backup_restore_verified": False,
        "production_sql_executed": False,
        "status": "BLOCKED" if pending or conflicts or other_version_conflicts else "PREFLIGHT_ONLY",
        "note": "A source-only gap report never certifies applied migrations, restore readiness, or production release.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    policy = json.loads((root / "data/migration-deployment-gate-policy.json").read_text(encoding="utf-8"))
    snapshot = json.loads((root / "data/bound-supabase-migration-snapshot.json").read_text(encoding="utf-8"))
    if policy.get("bound_project_id") != "frhletkiuupgksmgxoxc":
        raise ValueError("Wrong bound project in policy")
    result = report(root, snapshot, policy["bound_project_id"])
    payload = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 0  # report generation only; never interpret this exit code as C04 PASS.


if __name__ == "__main__":
    raise SystemExit(main())
