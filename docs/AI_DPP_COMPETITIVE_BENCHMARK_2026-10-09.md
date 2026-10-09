# SoulFlame AI DPP — Competitive Capability Benchmark & Execution Blueprint v1
**Research date:** 2026-10-09  
**Owner:** Mitko / DAVID Worker A (product & AI UX); Borko / DAVID Worker B (security, persistence, release QA)  
**Status:** DESIGN / DOCS ONLY. Not proof of feature deployment, legal compliance, or production readiness.  
**Repository:** `SoulFlameAdmin/DPPautopilot`

## Executive decision

**Do not replace the existing DPP system.** Treat the existing manufacturer onboarding, authentication, tenant workspace, product/model/item/passport/QR implementation as the system of record; progressively add evidence-backed AI assistance. Our differentiation is **one conversational entry point with safe, explainable automation**, not claiming that AI itself is a legal certifier.

The current engineering baseline is **Draft PR #304** (Stage 1 candidate, SHA `5205aa81d22e0a8d3e6ab17243682dc08d5b38b1`). The AI intake candidate is **stacked Draft PR #306**, branch `ai/ai-first-intake-v0-20261009`, last independently inspected HEAD `c0e4e089862080474b507660c9da3f8bdc6ddb39`. These are **not merged or production approved**. PR #306 currently exposes authenticated `/api/ai-intake`, AI candidates for the **eight early manufacturer questionnaire fields**, human review and manual fallback. **These eight fields are onboarding fields, not the regulatory Annex XIII battery-passport dataset.** A battery passport generation claim would be premature.

## Public, source-backed competitor benchmark

The features below are **claims described on vendors' own public sites**, not independently penetration-tested, purchased, or verified through private accounts. Do not treat "not documented" as "does not exist." Do not copy software, UX assets, proprietary datasets, or non-public endpoints.

| Reference product | Publicly described capability | What to adopt conceptually in our own design | Source |
|---|---|---|---|
| **TracePass** | Document-based AI extraction from PDFs/datasheets and structured passport fields; confidence scores, sources, reviewer approval; GS1 Digital Link QR; public web research suggestions | Evidence-linked field cards, grounded candidate extraction, gap checklist, verify/edit/flag action, public-source candidates always UNVERIFIED | https://www.tracepass.eu/ |
| **PicoNext AI / DPP Planner** | PDF, Word, PowerPoint and URL intake; AI summaries mapped to templates; iterative follow-up prompts; reviewer edits; reusable templates, rich media, DPP publishing | Multi-format document adapters; reusable per-category question schemas; iterative structured conversation, editable drafts | https://piconext.com/platform/generative-ai/ ; https://piconext.com/en-IE/platform/digital-product-passport-planner/ |
| **PicoNext Shopify** | Shopify data ingestion; AI drafting; preview/publishing; QR download | Later-phase opt-in commerce connector (never a prerequisite for Battery MVP) | https://piconext.com/platform/digital-product-passport-ecommerce/ |
| **TrusTrace** | AI-enabled supply-chain traceability, supplier evidence connected to shipment/product-level records, cross-regulation data reuse | Supplier evidence requests and one source-of-truth evidence registry; reuse a verified value with a tracked applicability scope | https://trustrace.com/ ; https://trustrace.com/newsroom/trustrace-named-a-market-shaper-in-gartner-emerging-market-quadrant-for-digital-product-passport |
| **Kezzler** | Connected product identity, traceability/lifecycle events, QR experiences, DPP compliance support | Long-lived product resolver, event timeline, and role-specific QR experience, independent of AI provider | https://kezzler.com/ ; https://kezzler.com/solutions/ |
| **Arianee** | API-first platform, data mapping, validations, role-based passport portal, GS1 Digital Link QR, import and lifecycle event APIs | Standards-aware IDs, typed APIs, batch ingestion, role-filtered views, event-ledger architecture | https://www.arianee.com/en/platform ; https://www.arianee.com/en/solutions/integration |

### Competitive positioning (hypothesis to test, not a claim of superiority)

The first screen should ask one useful question: **"Tell us what you manufacture, and attach documents if you have them."** Within a minute, an eligible test user should understand (1) what was recognized, (2) which data is missing, (3) what must be checked, and (4) the next action. AI then creates an **editable** setup and draft; users retain full control. The hypothesis is lower time-to-first-draft versus a form-first flow. Prove this through observed user tests; do not advertise "better than vendor X" without comparative data.

## Regulatory scope: no one universal passport schema

- **EU Battery Regulation 2023/1542, Article 77:** battery passports start **18 February 2027** for **LMT**, **EV**, and **industrial batteries >2 kWh** within its specified scope, with Annex XIII information and access-level distinctions. See: https://eur-lex.europa.eu/eli/reg/2023/1542/oj and Article 78 for passport properties.
- **ESPR Regulation (EU) 2024/1781:** sector-specific delegated acts determine covered product groups, data and operative dates. **There is no universal mandatory DPP for every company now.** See https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/explore-our-faqs_en and https://eur-lex.europa.eu/eli/reg/2024/1781/oj.
- Implement a **regulatory-module registry** with versioned legal references, effective-date / applicability logic, conditional fields, field-level access class and validation tests. Human/regulatory counsel must confirm interpretation before contractual claims.

## Current system vs. gap (as of inspected PR #306)

| Capability | Evidence/status | Decision |
|---|---|---|
| Manufacturer eight-field AI onboarding | **DRAFT CODE**: `api/_ai_intake_contract.js`, `api/_ai_prompt_extractor.js`, `api/ai-intake.js`, Early UI and tests in PR #306; not production PASS | **Preserve**; independent review + auth/negative tests |
| Explicit per-value human review, manual fallback | **DRAFT CODE** in PR #306; not production PASS | Keep AI as suggestion, never source of truth |
| Saved cross-session conversation with stable message IDs | **NOT evidenced** in inspected PR | A2: design and implement with RLS; no hidden storage in client only |
| Field-level source provenance and conflicts across documents | Contract exists, durable registry not evidenced | A2/A3: durable evidence entities and conflict handling |
| PDF/CSV/Excel evidence upload/extraction | **NOT evidenced** in PR #306 | A3: allowlisted uploads, async parser + malware/type checks, field anchors |
| Regulatory Battery Annex XIII structured field mapping | **NOT proven** by the eight-field questionnaire | A5: separate verified battery field inventory + type validators |
| Product/model/batch/item → DPP DRAFT | Existing system candidate, end-to-end on device not proven | Keep legacy business logic authoritative; evidence-based E2E test |
| Stable QR/public passport with lifecycle | Existing Stage 1 candidate; **physical scan acceptance outstanding** | Test before production claims |
| Tenant isolation & RLS across all new AI data | Existing core patterns; **new AI schema unproven** | Required negative tests before migration |
| Production launch readiness | **BLOCKED** by P1 early "READY" issue, C04 migration gate, verified DB+Storage backup and isolated restore, real PC/mobile/physical QR acceptance | No deploy/merge/production SQL from this benchmark |

### Specific caution from current code

`api/ai-intake.js` currently validates a Supabase user access token and returns an inferred candidate set from a submitted prompt. The intake contract accepts a `source_ref`, but the current extractor path uses a generic prompt reference (`conversation:prompt`). **This is not a durable per-message proof reference**. Future A2 persistence must issue stable server-side message/evidence IDs and bind them to a tenant/user before facts can be treated as source-backed. "Verified" must mean an auditable explicit action, never "LLM confidence > threshold."

## Target single-prompt UX

1. **Login / tenant selection**: ensure authenticated and tenant-authorized workspace; show existing draft/session when present.
2. **Describe / upload**: text first, optional files and URLs; show a consent/processing notice, prohibit silent Gmail access.
3. **Understanding**: show company/product category and plausible model details as **unverified suggestions** with provenance status.
4. **Ask only unresolved questions**: deterministic planner tracks required/conditional fields; AI may rephrase or prioritize, not waive a legal field.
5. **Evidence panel**: every candidate has value + data type + source + anchor (e.g., PDF page/table row/message ID) + confidence (optional) + reviewer state. Conflicting sources remain visible.
6. **Review and edit**: keep confirmed user edits, approval actor/time and diff history; allow AI/manual switching with zero data loss.
7. **Create DPP DRAFT**: use the existing model/item/passport server APIs only after required values and human review meet contract.
8. **Publish separately**: apply access rules, legal module validator and existing publication gate; never publish solely from model output.
9. **Resume later**: re-login returns identical conversation, selected evidence, approved facts and draft version; use optimistic concurrency.

**UX acceptance scenario:** user types "We manufacture LMT battery packs, here are two datasheets." System identifies *likely* LMT category, requests classification confirmation and required evidence; it must NOT manufacture battery chemistry, recycled content, carbon footprint or safety certificates.

## Suggested normalized data contract (PROPOSAL ONLY; no migration approved)

- `ai_intake_sessions`: `id, tenant_id, actor_id, module_key, module_version, state, revision, created_at, updated_at`.
- `ai_intake_messages`: `id, session_id, tenant_id, role, text, created_at, request_id`; message text is confidential.
- `ai_evidence_assets`: `id, tenant_id, storage_key, sha256, mime, size, original_name, upload_actor_id, processing_state, retention_until`.
- `ai_candidate_facts`: `id, session_id, tenant_id, field_key, typed_value_json, source_type, source_id, source_anchor_json, proposer, reviewer_state, reviewed_by, reviewed_at, version`.
- `ai_fact_conflicts`: `session_id, field_key, left_fact_id, right_fact_id, resolution_state, resolver_id`.
- `ai_fact_approvals`: append-only approvals and revocations tied to immutable candidate version hashes, approver ID and event timestamp.
- `ai_session_events`: append-only state changes/retries/failures and explicit publish handoff metadata.

Invariants: **tenant scope on every row**; authorized read/write RLS; immutable source IDs; no forged `verified=true`; idempotent imports; max payload/file limits; virus/type checks; request-level rate limits and cost limits; deletion/retention/export policy for GDPR; prevent prompt-injection from document bodies controlling tools. Suggested application events and storage scheme must be reviewed by Worker B before any SQL is deployed.

## Milestones, owners and measurable gates

| Priority | Milestone | Owner | Exit test |
|---|---|---|---|
| P0 | Stage 1 safety & real hardware | Borko + Mitko | P1 "READY" state repaired; PC + mobile manufacturer path, two-tenant negative, physical QR → correct DPP URL; C04/backup/restore gates explicit PASS |
| A1 | Existing eight-field AI intake independent QA | Both | Exact PR #306 SHA, isolated CI, 401/403, malformed/duplicated fields, AI outage/manual fallback, no publish shortcut |
| A2 | Durable session/provenance and resume | Borko: DB/RLS; Mitko: UX contracts | Logout/login resumes; stable source IDs; revisions protected; two-tenant read/write denied |
| A3 | Evidence upload + extraction | Mitko AI + Borko security | PDF + CSV tested first, Excel later; exact source anchor; wrong MIME/oversize malicious input rejected; UNVERIFIED only |
| A4 | Question planner & category selection | Mitko | deterministic missing/conditional questions; no repetition; offline fallback; unsupported categories explicitly reported |
| A5 | Battery Annex XIII fact mapping → model/item/DPP DRAFT | Both | legal data requirements traced field-by-field; no false completion; reviewed facts create DRAFT, not ACTIVE |
| A6 | QR/publication handoff | Borko | human approval, validated access tiers, immutable audit/version record, physical QR, revocation test |
| A7 | One additional regulatory module | Both after real pilot | unique legal applicability, reviewed schema, negative applicability tests, no cloned platform |

**Do not create a new all-in-one "AI passport endpoint" bypassing existing APIs.** Keep AI inference and trusted document facts distinct: `suggestion → source-bound candidate → human review → verified domain fact → validated draft`.

## Minimum test matrix for A2–A5

- **Truth**: unsupported or unknown field rejected; hallucinated values never auto-verified; incomplete evidence clearly shown.
- **Conflict**: two documents with different rated capacities → both exposed; reviewer decides and is recorded.
- **Security**: tenant A cannot fetch, enumerate or overwrite B sessions, files or approvals; non-owners cannot mutate review; expired token gives 401.
- **Replay**: duplicate AI request/import cannot duplicate approved data; retry after timeout is idempotent.
- **Resume**: conversation + evidence anchors + manual edits persist across reload, sign-out and second browser; last-write-wins silently is forbidden.
- **Robustness**: model timeout/5xx, missing credentials or budget ceiling leave manual workflow working.
- **File safety**: malicious MIME mismatch, oversize file, dangerous filenames, document prompt-injection and parser failures produce safe errors.
- **Publishing**: AI cannot call approve/publish itself; DPP status stays DRAFT until designated human/business validation and QR tests.

## First execution sequence

1. Collect independent QA on Draft PR #306; keep it stacked and unmerged.
2. Agree non-overlapping files/PR ownership with Borko; neither worker edits the other's branch simultaneously.
3. Draft A2 session + provenance API schema contract and security test vectors, **without migration/deploy**.
4. Prototype A3 document adapters using synthetic data (no private manufacturer files, no production credentials).
5. Run real PC/QR acceptance separately; only after verified backup and migration processes consider production operations.

**Release law:** code review PASS ≠ end-to-end acceptance PASS ≠ legal compliance. Keep exact SHA, run URL, expected/actual assertion, reviewer and date for every gate.
