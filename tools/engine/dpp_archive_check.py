#!/usr/bin/env python3
"""Read-only structural inspection of an EXISTING, local PostgreSQL custom dump.

No database connection, no restore, no production changes. This validates the
archive TOC only; neither backup currency nor a working restore is proved.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REQUIRED_DPP = (
    "dpp_organizations", "dpp_organization_members", "dpp_user_tenant_context",
    "dpp_battery_models", "dpp_provision_batches", "dpp_battery_items",
    "dpp_passports", "dpp_passport_versions", "dpp_audit_log",
    "dpp_early_access_sessions", "dpp_manufacturer_configurations",
    "dpp_manufacturer_onboarding_answers",
)


def find_table_data(toc: str) -> set[tuple[str, str]]:
    result: set[tuple[str, str]] = set()
    for line in toc.splitlines():
        if line.startswith(";") or not line.strip():
            continue
        match = re.match(r"^\s*\d+;\s+\d+\s+\d+\s+TABLE DATA\s+(\S+)\s+(\S+)(?:\s|$)", line)
        if match:
            result.add((match.group(1), match.group(2)))
    return result


def assess_toc(toc: str, require_auth: bool = True) -> dict:
    entries = find_table_data(toc)
    missing = [f"public.{t}" for t in REQUIRED_DPP if ("public", t) not in entries]
    if require_auth and ("auth", "users") not in entries:
        missing.append("auth.users")
    return {
        "schema_version": 1,
        "structural_toc_pass": not missing,
        "expected_table_data_entries": len(REQUIRED_DPP) + int(require_auth),
        "seen_table_data_entries": len(entries),
        "missing_required_table_data": missing,
        "includes_auth_users_data": ("auth", "users") in entries,
        "database_restore_verified": False,
        "storage_objects_restored_verified": False,
        "recovery_gate_green": False,
        "warning": "An archive TOC alone cannot prove a successful data or Storage restore.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--archive", type=Path, help="Existing local pg_dump -Fc archive to inspect via pg_restore -l")
    mode.add_argument("--toc", type=Path, help="Existing local pg_restore -l output (metadata only)")
    parser.add_argument("--no-auth-required", action="store_true", help="Partial DPP-only dump. Do NOT treat it as independently restorable.")
    args = parser.parse_args(argv)
    try:
        if args.archive:
            p = args.archive
            if not p.is_file() or p.is_symlink():
                raise ValueError("Archive must be an existing regular file, not a symlink")
            # Do not use shell=True. No connection or restore is performed.
            proc = subprocess.run(["pg_restore", "--list", str(p)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=40, check=False)
            if proc.returncode:
                raise ValueError(f"pg_restore --list failed ({proc.returncode}): {proc.stderr[:250]}")
            toc_text = proc.stdout
        else:
            p = args.toc
            if not p.is_file() or p.is_symlink():
                raise ValueError("TOC must be an existing regular file, not a symlink")
            if p.stat().st_size > 5_000_000:
                raise ValueError("TOC unexpectedly large; refusing to read")
            toc_text = p.read_text(encoding="utf-8")
        report = assess_toc(toc_text, require_auth=not args.no_auth_required)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["structural_toc_pass"] else 1
    except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({"structural_toc_pass": False, "recovery_gate_green": False, "error": type(exc).__name__}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
