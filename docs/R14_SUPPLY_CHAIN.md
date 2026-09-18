# R14 — Dependency / Supply-Chain Controls

## GitHub Actions

Every external GitHub Action used by CI is pinned to an immutable 40-character commit SHA. Human-readable major-version comments are retained beside the SHA, but branch/tag references are not execution authorities.

Current pins were resolved from the official action repositories on 2026-09-18:

- actions/checkout v4 → `11d5960a326750d5838078e36cf38b85af677262`
- actions/setup-python v5 → `a26af69be951a213d495a4c3e4e4022e16d87065`
- actions/upload-artifact v4 → `ea165f8d65b6e75b540449e92b4886f43607fa02`

## Python CI dependencies

CI-only Python dependencies are listed in `requirements-ci.txt` with exact versions. The current security scanner is `pip-audit==2.10.1`; the QR test dependency is `qrcode[pil]==8.2`.

CI installs the pinned requirements and executes `pip-audit -r requirements-ci.txt`. A reported known vulnerability fails the job.

## Repository enforcement

`scripts/validate_supply_chain.py` rejects:

- GitHub Action references that are tags/branches instead of 40-character SHAs.
- Missing expected official action pins.
- Unpinned Python requirements.
- Removal of the dependency-audit CI step.

This controls known dependency/action risk. It does not claim protection against malicious packages, compromised upstream releases, operating-system package vulnerabilities, or every supply-chain attack.

## Upgrade rule

Dependency/action upgrades are explicit changes: update the version/SHA, run audit + full regression, review upstream release/security notes, then merge. Silent floating upgrades are not accepted for production-critical CI.
