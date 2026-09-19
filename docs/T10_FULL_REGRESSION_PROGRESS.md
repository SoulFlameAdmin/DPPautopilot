# T10 Full Regression Gate — progress

## Scope

T10 requires all mandatory suites T01-T09 to pass from a clean checkout and requires a release-CI acceptance run before the task can become GREEN.

## Implemented precursor

The repository now contains a strict aggregate policy and generator:

- `data/t10-regression-gate.json` defines the exact T01-T09 dependency set and precursor evidence surfaces.
- `scripts/generate_t10_regression_report.py` consumes the clean-checkout reports generated earlier in the same CI job for T01, T02, T03, T04, T07, T08 and T09.
- T05 is checked against the approved deterministic U07 visual baseline and visual workflow contract.
- T06 is checked against the Chromium/Firefox/WebKit workflow contract plus the recorded 30/30 matrix evidence in the canonical machine plan.
- The generator emits `artifacts/t10-full-regression-report.json`.
- The report remains non-final until every T01-T09 dependency is GREEN and a separate approved release-CI run is evidenced.

## Claim boundary

This is a real clean-checkout regression precursor, not final production acceptance. T10 remains RED while any of T01-T09 is not GREEN and until release-CI acceptance exists.
