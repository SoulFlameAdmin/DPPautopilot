# SoulFlame DPP GPT — Definition of Done to 100%

**Status: OPEN / no Stage 1 release PASS.** Last scoped verified PR on 2026-10-10: #329, isolated candidate-only CI. This document is a work contract, not a percentage estimate or an EU compliance certification.

## Acceptance law

**100% READY** is allowed only when **every mandatory gate below** has a named owner, exact immutable SHA, repeatable tests, date-stamped evidence, cross-tenant negative coverage and independent reviewer PASS. Do not replace a failed acceptance gate with a success from an unrelated test. No AI candidate, typed value or QR becomes legally verified without trusted role + evidence.

| ID | Mandatory outcome | Evidence required | Current evidence / missing |
|---|---|---|---|
| G01 | Authenticated GPT candidate API sends only bounded input; no API key exposure; private/unapproved data stays private | Exact test SHA, test 401/422/429/503, gateway smoke with approved test account, prompt-redaction/retention review | #329 local/CI mock coverage; actual paid gateway acceptance OPEN |
| G02 | Distributed per-tenant/user inference budget, quota, provider spending limits, abuse monitoring | Fail-closed rate-limit across 2+ isolates, peak load, cost ceiling and billing alert evidence | #329 requires shared limiter; per-org budget, billing tests OPEN |
| G03 | Multi-format document ingestion with evidence anchors, file SHA, tenant-bound private Storage and malicious input defense | Real CSV/PDF/XLSX fixtures, anti-formula, cross-tenant denial and duplicate/conflict review | A3 #309/#320/#321 Draft; no complete file integration PASS |
| G04 | A2 persistent per-organization conversation, review, resume, manual fallback and strict CAS | Two-actor, two-tenant, role matrix, concurrent retries, rollback, audit replay, deployed RLS | #324 PG17 isolated PASS; A2 **not applied to live project** |
| G05 | A4 questions resolve every missing/conflicting mandatory value without inventing facts | Real A3→A4 choices handoff; BG/EN; human correction and resume test | #310 planner targeted PASS; E2E OPEN |
| G06 | Battery DPP draft maps accepted/authorized evidence to ALL required LMT regulatory points including validated typed nested structures and access separation | Independent review of all 71 matrix entries, mandatory/conditional applicability, tested schemas, restricted/authority leakage negative tests | #313/#314 scalar proposal; 20 simple public scalar fields offered for extraction; others OPEN |
| G07 | Controlled passport generation, changes, versioning, publication and lifecycle permissions | Server-owned reviewer and signed revision, tenant permission, idempotent publish, no surprise exposure, 10-unit scenario | Publication deliberately disabled for GPT; OPEN |
| G08 | Golden path: new manufacturer → verified organization → model/batch → 10 units → DPP → QR print/scan → update passport → old QR displays new data | Actual browsers/mobile/physical QR and multi-account session tests, screenshot/log/links | PR #315/#316 synthetic tests; physical acceptance OPEN |
| G09 | Security/reliability acceptance, no false READY, tenant-bound consent/privacy and zero critical regressions | Full non-release isolated PG17 suite, security ACL/RLS negative tests, C03 + C04 fail-closed, security review PASS | C04 RED; auth expiry review OPEN; Stage1 not READY |
| G10 | Verified disaster recovery for live DPP, auth dependencies and Storage bytes | Encrypted DB backup, encrypted Storage backup, isolated restore, independent data/QR/RLS cross-checks, observed RPO/RTO | Synthetic backup replay ≠ actual recovery; OPEN |
| G11 | Regulatory and commercial customer acceptance | Responsible human/legal compliance review, dated EU rule interpretation, actual pilot and manufacturer acceptance, contract and ownership evidence | OPEN; do not assert regulatory certification or paying customers |
| G12 | Final release identity and operations | Exact reviewed integration SHA, green mandatory release gate, observability/log scrubbing, rollback and incident runbook, sign-off before production rollout | OPEN |

## Current implementation boundaries

- Early Access intake has **8 manufacturer questions**; it is NOT the battery's 71-point passport.
- #329 `POST /api/ai-battery-candidates` extracts **UNVERIFIED** candidates for 20 public simple scalar point types in the existing 71-point LMT registry; it cannot create or publish a battery DPP.
- The endpoint is off unless **both** `AI_BATTERY_CANDIDATE_API_ENABLED=true` and `DPP_SHARED_RATE_LIMIT_ENABLED=true`; rate-limit backend must be proven and per-organization budget added before any real paid service.
- User JWT verification is not tenant membership authorization. Before linking a candidate to a specific battery, server must determine authenticated member, role, organization, item, evidence source SHA and reviewer event from the database. Never accept `verified:true`, tenant ID, or approval proof from a browser as authoritative.
- The proposed A5 `planBatteryDraft` is only a side-effect-free draft helper; its caller must supply **trusted**, database-bound authorization and evidence, not client-form metadata.
- Keep AI model tokens, Supabase service keys, private documents and credentials out of client bundles, repositories, email and analytics logs.

## Dependency-ordered next implementation

1. **Stabilize isolated CI**: #329 independent candidate tests; Borko's #324 CAS race/role tests; #320 A3 Unicode + #321 choices handoff; and auth expiry P0. Independently pass every exact head.
2. **Prepare C04 safely**: read-only live registry + SQL object reconciliation; reviewed migration dependency order and checksums; encrypted DB and separate Storage backup; **true** isolated restore with RLS+ACL tests; only then ask for human approval for live changes.
3. **Integrate server A2**: trusted tenant/actor + session and source binding, conflict choices, manual review, CAS replay, rejection audit. No data inferred by GPT is verified.
4. **Expand A5 to real passport**: typed allowlists for every complex field, policy/access restrictions, missing/conditional reports; expert review and completeness tests. AI inference alone cannot satisfy documentary evidence.
5. **Prove real life**: GPT gateway billed test in staging, per-tenant quotas, scanner+printer mobile E2E with ten units and lifecycle updates, security and data privacy reviews.
6. **Final approval**: only after ALL G01–G12 are independently PASS may the owner authorize a production merge/deploy and a Stage1 READY claim.

## Fail-closed release blockers (do not bypass)

- Current bound Supabase project remains without nine proposed migration registry records and corresponding new A2 tables/RPCs; `dpp_api_organization_ensure` missing as verified in live catalog.
- Live `dpp_api_technical_pilot_update_capacity` has anon EXECUTE (but has an internal role guard). Revoke action is a **separate approval-gated security remediation**.
- A stale migration snapshot is not permission to refresh the record without corresponding live applied SQL and restoration evidence.
- Physical QR acceptance and real DB/Storage disaster recovery are not interchangeable with mocked simulations.
