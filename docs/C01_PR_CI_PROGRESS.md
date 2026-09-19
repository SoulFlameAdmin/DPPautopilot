# C01 Pull-request CI — Partial Progress

C01 remains **RED** because T01–T04 are not all GREEN and merge-blocking branch-rule enforcement cannot yet be proven.

## Repository CI contract

The canonical `.github/workflows/ci.yml` already runs the same `validate` job for:

- pushes to `main`;
- `pull_request` events.

Workflow-level permissions are read-only (`contents: read`). The job runs repository/traceability/security validators, unit/API/database suites, T07 load characterization, T08 reliability checks, restore/security checks and browser smoke evidence.

`data/pr-ci-contract.json` versions this expectation and `scripts/validate_pr_ci_contract.py` fails CI if the PR trigger, read-only permissions, PostgreSQL test service or required test steps drift.

## Branch-rule evidence boundary

GitHub rulesets currently returned an empty list. Reading classic `main` branch protection returned HTTP 403 `Resource not accessible by integration`, so this precursor does **not** claim that merges are blocked until CI passes.

A separate draft probe PR is used to prove that a real `pull_request` event starts the canonical CI workflow. It is not merged and is closed after evidence is collected.

## Before GREEN

C01 requires:

1. T01–T04 GREEN.
2. Passing real pull-request CI evidence.
3. Authorized evidence that the required CI check is merge-blocking through branch protection/rulesets.
