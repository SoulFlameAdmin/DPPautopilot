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
    "dpp_app_binding",
    "dpp_audit_log",
    "dpp_authority_evidence",
    "dpp_authority_users",
    "dpp_battery_items",
    "dpp_battery_models",
    "dpp_carrier_scan_events",
    "dpp_client_applications",
    "dpp_early_access_sessions",
    "dpp_email_outbox",
    "dpp_evidence_attachments",
    "dpp_field_catalog_access",
    "dpp_field_catalog_runtime",
    "dpp_field_events",
    "dpp_import_mappings",
    "dpp_import_rows",
    "dpp_import_runs",
    "dpp_manufacturer_configurations",
    "dpp_manufacturer_onboarding_answers",
    "dpp_nfc_challenges",
    "dpp_nfc_identities",
    "dpp_nfc_provisioning_receipts",
    "dpp_nfc_verification_events",
    "dpp_organization_members",
    "dpp_organizations",
    "dpp_partner_access",
    "dpp_passport_authority_payloads",
    "dpp_passport_lifecycle",
    "dpp_passport_versions",
    "dpp_passports",
    "dpp_physical_carriers",
    "dpp_provision_batch_items",
    "dpp_provision_batches",
    "dpp_rate_limit_buckets",
    "dpp_registration_requests",
    "dpp_registry_submissions",
    "dpp_supplier_data_packages",
    "dpp_supplier_field_requirements",
    "dpp_supplier_invitations",
    "dpp_supplier_package_signatures",
    "dpp_supplier_package_verification_events",
    "dpp_supplier_portal_members",
    "dpp_supplier_reminder_events",
    "dpp_suppliers",
    "dpp_user_tenant_context",
    "dpp_world_companies",
)
REQUIRED_DEPENDENCIES = (("auth", "users"), ("public", "leads"), ("storage", "objects"))


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
    # These cross-schema tables are required by real DPP foreign keys or Storage metadata.
    # Partial archives never qualify as restore-ready, even if structure checks pass.
    if require_auth:
        missing.extend(f"{schema}.{table}" for schema, table in REQUIRED_DEPENDENCIES
                       if (schema, table) not in entries)
    return {
        "schema_version": 2,
        "structural_toc_pass": not missing,
        "expected_table_data_entries": len(REQUIRED_DPP) + (len(REQUIRED_DEPENDENCIES) if require_auth else 0),
        "all_46_dpp_tables_present": all(("public", t) in entries for t in REQUIRED_DPP),
        "external_dependency_checks": ("auth.users", "public.leads", "storage.objects") if require_auth else (),
        "partial_archive_mode": not require_auth,
        "seen_table_data_entries": len(entries),
        "missing_required_table_data": missing,
        "includes_auth_users_data": ("auth", "users") in entries,
        "includes_leads_data": ("public", "leads") in entries,
        "includes_storage_metadata": ("storage", "objects") in entries,
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
    parser.add_argument("--no-auth-required", action="store_true", help="Partial DPP-only dump: skip external dependencies. NEVER restore-ready.")
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
