# BORKO DPP SECURITY WORKSTREAM

Purpose: isolated workstream for Borko's GPT on the DPP Battery platform.

## Safety boundary
- Work only on branch `borko/dpp-security-lab`.
- Do not commit directly to `main`.
- Do not merge to `main`.
- All changes must remain visible in the dedicated draft PR.
- Every implementation change should include tests or concrete evidence where applicable.
- Never mark a task GREEN without implementation + applicable PASS evidence.

## Scope
Primary scope:
- cryptographic signing and verification
- signed supplier data
- Secure NFC verification
- tamper evidence / tamper detection
- attack-tested verification paths
- key/provenance/security documentation

Out of scope unless coordinated:
- DPP core data-engine ownership
- Import Autopilot
- Battery ID/BMS core integration
- lifecycle/service-history core integration
- factory provisioning core integration
- production deployment or merge decisions

## Handoff format
For each completed unit, record:
1. what changed
2. files changed
3. tests run
4. PASS/FAIL evidence
5. known risks/blockers
6. next dependency-safe step

This branch is intentionally used as a visible audit trail. The draft PR updates automatically as commits are pushed.
