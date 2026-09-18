# T01 — Unit Test Suite Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe suite covers business-rule components whose upstream tasks are already GREEN:

- D07 deterministic demo identifier generation/parsing/validation
- D09 catalog-driven completeness scoring and missing-field traceability

The suite is implemented with Python `unittest` and is separate from the older one-shot validator scripts. It exercises positive and negative cases, deterministic behavior and edge cases.

T01 is **not GREEN** yet because its declared dependency M22 (stable API validation/error contract) is still RED. M22 error-code/message unit coverage must be added before T01 can satisfy its full acceptance criteria.

## Evidence — defer cycle 1

- GitHub Actions run `35395905409` on commit `20040c3d25a02a0a029731d51a016b9b657af672`: `Run T01 green business-rule unit suite` PASS inside a full successful workflow.
- The suite uses Python `unittest` and covers deterministic identifiers, round-trip and invalid inputs, a 2,000-ID collision sample, 100% completeness scoring, deterministic missing-item behavior and actionable missing-field traceability.
- T01 remains RED until M22 is GREEN and stable API error-code/message unit coverage is added.

## Evidence — M22 semantic mapping extension

- `scripts/import_error_contract.py` provides a reusable semantic mapper from `DP001`-`DP008` to stable code/message/HTTP-status metadata.
- `tests/unit/test_import_error_contract.py` verifies exact mappings, fresh return objects and fail-safe handling for unknown SQLSTATE values.
- Full GitHub Actions run `35398504301` on `54fe4db25b2f65309874e3fa41a284c3bd835c7e`: T01 unit suite PASS.
- T01 remains RED because M22 remains RED until M17-M19 expose the contract through a real API.

