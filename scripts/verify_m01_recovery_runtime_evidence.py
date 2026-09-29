#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def parse_ts(value, field):
    require(isinstance(value, str) and value, f"{field} must be a non-empty ISO timestamp")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AssertionError(f"{field} must be a valid ISO timestamp") from exc
    require(dt.tzinfo is not None, f"{field} must be timezone-aware")
    return dt.astimezone(timezone.utc)


def verify(doc):
    require(doc.get("version") == 1, "evidence version must be 1")
    require(doc.get("task") == "M01", "evidence task must be M01")

    deployment = doc.get("deployment") or {}
    require(deployment.get("project_id") == "prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr",
            "wrong Vercel project")
    require(deployment.get("target") == "production", "deployment must target production")
    require(deployment.get("state") == "READY", "deployment must be READY")
    require(deployment.get("commit_sha"), "deployment commit_sha is required")
    require(deployment.get("url", "").startswith("https://"), "deployment URL must be HTTPS")

    flow = doc.get("recovery_flow") or {}
    requested_at = parse_ts(flow.get("requested_at"), "recovery_flow.requested_at")
    opened_at = parse_ts(flow.get("opened_at"), "recovery_flow.opened_at")
    updated_at = parse_ts(flow.get("password_updated_at"), "recovery_flow.password_updated_at")
    require(requested_at <= opened_at <= updated_at,
            "recovery timestamps must be monotonic")
    require(flow.get("redirect_origin") == deployment.get("url"),
            "recovery redirect origin must match deployment URL")
    require(flow.get("recovery_session") == "valid",
            "a real valid recovery session is required")
    require(flow.get("password_update") == "success",
            "password update must succeed")
    require(flow.get("session_after_update") == "consumed",
            "recovery session must be consumed after update")
    require(flow.get("url_fragment_scrubbed") is True,
            "recovery URL fragment must be scrubbed")
    require(flow.get("token_persisted") is False,
            "recovery token must not be persisted")
    require(flow.get("token_reuse_rejected") is True,
            "consumed recovery token must not remain reusable")

    checks = doc.get("http_checks") or {}
    require(checks.get("recovery_page_status") == 200,
            "deployed recovery page must return HTTP 200")
    require(checks.get("auth_config_status") == 200,
            "deployed auth config must return HTTP 200")
    require(checks.get("supabase_project") == "frhletkiuupgksmgxoxc",
            "runtime must use the bound Supabase project")

    forbidden_keys = {"service_role", "service_role_key", "refresh_token", "access_token", "password", "new_password"}
    def walk_keys(value):
        if isinstance(value, dict):
            for key, item in value.items():
                require(str(key).lower() not in forbidden_keys,
                        f"runtime evidence must not contain secret field/material: {key}")
                walk_keys(item)
        elif isinstance(value, list):
            for item in value:
                walk_keys(item)
    walk_keys(doc)

    return {
        "task": "M01",
        "decision": "PASS",
        "deployment_commit": deployment["commit_sha"],
        "production_url": deployment["url"],
        "password_updated_at": flow["password_updated_at"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    doc = json.loads(args.evidence.read_text(encoding="utf-8"))
    result = verify(doc)
    print("M01_RECOVERY_RUNTIME_EVIDENCE_PASS: " + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
