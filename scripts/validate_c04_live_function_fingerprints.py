#!/usr/bin/env python3
"""C04 read-only, fail-closed comparison of DPP SQL function bodies.

A list of applied migration *names* is not proof that deployed SQL still
matches the version-controlled implementation. Never mutates the database.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT / "data/c04-live-function-fingerprints_2026-10-30.json"
BOUND_PROJECT = "frhletkiuupgksmgxoxc"
REQUIRED = {
    "dpp_api_client_application_submit",
    "dpp_api_client_applications_mine",
    "dpp_api_registration_request_create",
    "dpp_api_registration_request_verify",
    "dpp_api_registration_requests_mine",
}

def normalize_pg_body(body: str) -> str:
    # Match the read-only SQL snapshot normalization exactly:
    # lower(regexp_replace(btrim(body), E'\\s+', ' ', 'g')).
    # PostgreSQL btrim removes literal spaces, not linefeeds or tabs.
    return re.sub(r"\\s+", " ", body.strip(" ")).lower()

def effective_repo_bodies(root: Path, names: set[str]) -> dict[str, str]:
    """Last CREATE OR REPLACE definition in filename order wins."""
    found: dict[str, str] = {}
    migrations = sorted((root / "supabase/migrations").glob("*.sql"))
    if not migrations:
        raise AssertionError("C04: repository migration directory is empty")
    for sql_path in migrations:
        sql = sql_path.read_text(encoding="utf-8")
        for name in names:
            expr = re.compile(
                r"create\\s+or\\s+replace\\s+function\\s+public\\."
                + re.escape(name) + r"\\s*\\(",
                re.IGNORECASE,
            )
            for match in expr.finditer(sql):
                tail = sql[match.start():]
                body_match = re.search(r"\\$function\\$([\\s\\S]*?)\\$function\\$", tail, re.IGNORECASE)
                if not body_match:
                    raise AssertionError(f"C04: cannot extract {name} from {sql_path.name}")
                found[name] = body_match.group(1)
    missing = sorted(names - found.keys())
    if missing:
        raise AssertionError("C04: missing repository function bodies: " + ", ".join(missing))
    return found

def compare(root: Path, evidence: dict) -> list[str]:
    if evidence.get("version") != 1 or evidence.get("task") != "C04_FUNCTION_DEF":
        raise AssertionError("C04: function fingerprint evidence schema mismatch")
    if evidence.get("project_id") != BOUND_PROJECT:
        raise AssertionError("C04: function fingerprint project mismatch")
    if evidence.get("source") != "Supabase execute_sql read-only pg_get_functiondef":
        raise AssertionError("C04: function fingerprint source not authoritative")
    try:
        observed = datetime.fromisoformat(evidence["observed_at"].replace("Z", "+00:00"))
    except (ValueError, TypeError, KeyError):
        raise AssertionError("C04: invalid function observation timestamp") from None
    if observed.tzinfo is None:
        raise AssertionError("C04: function observation requires timezone")
    if not (-timedelta(minutes=10) <= datetime.now(timezone.utc) - observed <= timedelta(days=30)):
        raise AssertionError("C04: function observation is stale or future dated")
    rows = evidence.get("functions")
    if not isinstance(rows, list) or len(rows) != len(REQUIRED):
        raise AssertionError("C04: expected exactly five live function fingerprints")
    by_name = {item.get("name"): item for item in rows if isinstance(item, dict)}
    if set(by_name) != REQUIRED or len(by_name) != len(rows):
        raise AssertionError("C04: function fingerprint names/duplicates mismatch")
    expected = effective_repo_bodies(root, REQUIRED)
    drift = []
    for name in sorted(REQUIRED):
        actual_hash = by_name[name].get("normalized_body_md5")
        if not isinstance(actual_hash, str) or not re.fullmatch(r"[0-9a-f]{32}", actual_hash):
            raise AssertionError(f"C04: invalid fingerprint for {name}")
        repo_hash = hashlib.md5(normalize_pg_body(expected[name]).encode("utf-8")).hexdigest()
        if repo_hash != actual_hash:
            drift.append(name)
    return drift

def main() -> int:
    evidence = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))
    drift = compare(ROOT, evidence)
    if drift:
        raise AssertionError(
            "C04_SCHEMA_DRIFT_BLOCKED: deployed function differs from repository: "
            + ", ".join(drift)
            + "; preserve the live definition and reconcile provenance before release."
        )
    print("C04_FUNCTION_FINGERPRINTS_PASS: all five live SQL function bodies match repository definitions.")
    print("C04 remains PARTIAL until release-time schema verification, restore and owner approval.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
