# SoulFlame A3 — Document Evidence Integration (Draft)

Scope: manufacturer onboarding data only. Battery Annex XIII passport creation is **not** implemented here.

Implemented: strict CSV parser, source-row anchors, optional conversion of already-decoded PDF pages and Excel sheet rows, and unverified candidates. PDF / XLSX binaries are not decoded. No uploads, storage writes, OCR, AI API calls, automated legal approval, passport publishing or live production changes.

Integration boundary: the backend must authenticate organization membership, issue evidence IDs, store original bytes in private tenant Storage and compare SHA-256 before using any candidate. Uploaded documents are untrusted. Real PDF and Excel decoders must run isolated with byte/time limits and validated output. Keep source references, conflicts and review decisions in the existing A2 persistence layer; never relabel a document candidate as user-provided evidence.

Contract commands:
- node --test tests/api/document-intelligence-a3.spec.cjs
- node --test tests/api/a3-evidence-adapters.spec.cjs
- node --test tests/api/a3-evidence-safety.spec.cjs

Do not report tests as PASS without a successful run on exact commit SHA. Stage 1, C04, backup / restore, tenant-isolation and physical QR acceptance remain release blockers.