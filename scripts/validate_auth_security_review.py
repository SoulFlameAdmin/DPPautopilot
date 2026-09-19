#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
review=json.loads((ROOT/"data/auth-security-review.json").read_text(encoding="utf-8"))
auth=(ROOT/"demo/auth.html").read_text(encoding="utf-8")
recovery=(ROOT/"demo/auth-recovery.html").read_text(encoding="utf-8")
docs=(ROOT/"docs/R06_AUTH_SECURITY_REVIEW.md").read_text(encoding="utf-8")

assert review.get("version")==1
assert review.get("task")=="R06"
assert review.get("status")=="partial"

controls=review.get("controls",[])
expected={
    "publishable_key_only",
    "memory_only_session",
    "generic_reset_response",
    "fixed_same_origin_recovery_redirect",
    "no_referrer_auth_pages",
    "recovery_type_gate",
    "recovery_expiry_gate",
    "fragment_consumed_immediately",
    "password_update_authenticated",
    "token_cleared_after_update",
}
assert {c["id"] for c in controls}==expected, "R06 control set drifted"
for control in controls:
    assert control.get("surface")
    assert control.get("expected")
    for rel in control.get("evidence",[]):
        assert (ROOT/rel).is_file(), f"R06 evidence file missing: {rel}"

assert "new URL('/demo/auth-recovery.html',location.origin).href" in auth
assert "redirect_to='+encodeURIComponent(redirectTo)" in auth
assert "If the account is eligible, a password reset email will be sent." in auth
assert "localStorage" not in auth and "sessionStorage" not in auth
assert '<meta name="referrer" content="no-referrer">' in auth

assert "h.type==='recovery'" in recovery
assert "expiresAt*1000>Date.now()" in recovery
assert "history.replaceState(null,'',location.pathname)" in recovery
assert recovery.index("history.replaceState") < recovery.index("save.onclick")
assert "method:'PATCH'" in recovery and "/auth/v1/user" in recovery
assert "accessToken=null" in recovery
assert "localStorage" not in recovery and "sessionStorage" not in recovery
assert '<meta name="referrer" content="no-referrer">' in recovery

runtime=review.get("external_runtime_evidence_required",[])
assert len(runtime)>=4
assert any("allowed redirect URLs" in x for x in runtime)
assert any("real password update" in x.lower() for x in runtime)
assert "R06 remains **RED**" in docs

print("R06_AUTH_SECURITY_REVIEW_PASS: 10 repository-level auth/session/redirect/recovery controls are versioned and fail-closed; deployed runtime evidence remains explicit")
