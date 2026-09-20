# T03 API Integration Suite — Partial Progress

T03 remains **RED** because M17–M23 are not all fully accepted and deployed HTTP integration cannot be proven while F08 remains blocked.

## Current stateful integration precursor

- `data/api-integration-matrix.json` versions 9 positive/negative multi-surface scenarios across M17–M23.
- `tests/api/integration.test.cjs` executes the real serverless handler modules for models, items, passport, imports and export against a stateful fake backend.
- Covered behavior includes protected bearer boundaries, model→item→passport→export flow, opt-in caller-JWT evidence-byte augmentation with manifest byte-size/SHA-256 verification, import validate/commit/idempotent repeat, stable not-found/conflict semantics, invalid import commit rejection and public passport privacy stripping.
- `scripts/generate_api_integration_report.py` verifies the executable Node test set, proves the 8 scenarios collectively cover every dependency M17–M23, checks stable contract tokens/surfaces, and emits `artifacts/t03-api-integration-report.json`.

The report is in-process API integration evidence only. It deliberately does not claim real network/TLS/deployed HTTP behavior.

## Evidence — API integration coverage report

- GitHub Actions run `35412297769` on `461e22c77629369e28e1e2da19c76884cae81ec0` completed SUCCESS.
- `Run T03 stateful API integration precursor` and `Generate T03 API integration coverage report` both passed.
- The generated report proves all 8 versioned scenarios collectively cover every declared dependency M17–M23 across models, items, passport, imports and export.
- Artifact `10574279507` contains `artifacts/t03-api-integration-report.json` with the workflow evidence bundle.
- T03 remains RED until M17–M23 are fully accepted and deployed HTTP integration is proven.


## Evidence-byte export integration update — 2026-09-20

- The stateful model→item→passport journey now requests `GET /api/export?include_evidence=1`.
- The fake backend serves the same evidence bytes through the Edge Function route shape used by production code.
- Assertions prove manifest SHA-256 and byte size match, `evidence_export.integrity=sha256_verified`, one verified `evidence_objects` entry is returned, and its base64 decodes to the expected bytes.
- This is still in-process integration evidence; real authenticated Storage and deployed HTTP acceptance remain required before T03 can be GREEN.


## Resumable paged evidence export integration — 2026-09-20

- The stateful model→item→passport→export journey now includes two private evidence objects.
- Page 1 requests `evidence_offset=0&evidence_limit=1`, validates SHA-256/base64 integrity, and captures `manifest_sha256` + `next_offset`.
- Page 2 reuses that exact `manifest_sha256` through `evidence_manifest_sha256` and proves stable resume to the second evidence object through the production-shaped Edge Function route.
- This remains in-process integration evidence; live authenticated Storage, live manifest-drift behavior and deployed HTTP acceptance remain pending.
