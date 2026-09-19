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

## Proven CI evidence

- PR: #53, head `e1cec128e9a147b65b8bd8b299608e22beacf250`
- Full CI run: `35454765266` — SUCCESS
- Job: `validate` — SUCCESS
- Log marker: `T10_FULL_REGRESSION_PRECURSOR_PASS: T01-T09 precursor evidence aggregates cleanly; dependency_green=0/9; final acceptance remains false`
- Aggregate artifact container: `demo-ui-smoke` artifact `10588191022`
- Artifact digest: `sha256:6aa41c8e3b24a5b3c13443d8a2811b36450214937542ca5e3fcf07f14983a2b0`
- Included report: `artifacts/t10-full-regression-report.json`

T10 remains RED/PARTIAL by design. No production/deployment acceptance is claimed.

## Merge confirmation

- Exact-head CI: `35455189633` — SUCCESS
- Exact head: `d9166bbf16ab91fdac92294a5b80e3088839384c`
- Exact-head aggregate artifact: `10588036888`, digest `sha256:fdfade06e3f3f76a4dc2074a8bcab55f6ebdc7c76f721d3505dc6781b5a9af87`
- PR #53 merged to `main` as `9fbc356d55f902fa1f5a73a9ac16fefccef01c67`.
- T10 remains RED/PARTIAL; no release or production acceptance is claimed.
