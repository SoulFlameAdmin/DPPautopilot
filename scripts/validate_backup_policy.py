#!/usr/bin/env python3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
text=(ROOT/"docs/R11_BACKUP_POLICY.md").read_text(encoding="utf-8").lower()

def require(c,m):
    if not c: raise AssertionError(m)

for phrase in [
    "verified organization subscription plan",
    "free",
    "not accepted as production disaster-recovery coverage",
    "target rpo",
    "<= 24 hours",
    "target rto",
    "<= 8 hours",
    "storage/evidence objects separately",
    "r12 remains red",
    "frhletkiuupgksmgxoxc",
]:
    require(phrase in text,f"R11 backup policy missing: {phrase}")

require("pitr" in text and "must not be claimed as enabled" in text,"R11 must not imply unverified PITR")
print("R11_BACKUP_POLICY_PASS: actual Free-plan state, backup scope, production upgrade/manual-backup requirement, RPO/RTO targets and R12 separation are explicit")
