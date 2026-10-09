# SOULFLAME DPP — AI-FIRST MASTER PLAN v0

Status: engineering candidate, not production approval  
Parent candidate: PR #304 / `5205aa81d22e0a8d3e6ab17243682dc08d5b38b1`  
Initial regulatory module: Battery DPP  

## 1. Product promise

The client starts with ordinary language, not a compliance form.

`prompt → targeted questions → evidence → structured facts → review → DPP draft → validation → QR/publication`

The AI is an interface and orchestration layer. It is **not** a source of regulatory facts. Nothing may become a trusted DPP value merely because a model inferred it.

Manual mode is always available and follows the same evidence and approval rules.

## 2. Non-negotiable truth model

Every factual value must carry:

- `value`
- `source_type`: `user | document | system | integration`
- `source_ref`: stable reference to the conversation message, document, system record or integration record
- `verified`: explicit boolean

AI/model inference is never accepted as factual provenance.

A complete set of verified facts becomes `review_required`, not automatically ready. A human must explicitly approve before generation. Publication remains a separate validation gate.

## 3. Shared core + regulatory modules

### Shared core

- tenant/company workspace
- authentication and roles
- source/evidence registry
- fact/provenance model
- conversation state
- human approvals
- model/item/batch/passport lifecycle
- version history and audit trail
- QR/public URL
- access classes
- import/export/integrations
- monitoring and recovery

### Regulatory modules

Each module supplies its own:

- required/conditional fields
- questions
- validators
- evidence rules
- access classes
- lifecycle rules
- publication checks
- authoritative references

Battery is module 1. New sectors must plug into the same core instead of cloning the platform.

## 4. State machine

### AI intake

1. `collecting` — one or more required facts are missing or unverified.
2. `review_required` — required facts are present and verified, human approval is still missing.
3. `ready_for_generation` — facts are verified and explicitly human-approved.

### DPP lifecycle

Generation is not publication. Existing DPP lifecycle and regulatory validation remain authoritative. DRAFT, ACTIVE and revoked behavior must continue to be tested independently.

## 5. Worker split

### DAVID Worker A — AI / UX / Extraction

Owner line: Mitko + Worker A

1. Conversation state and one-prompt entry.
2. Deterministic missing-question planner.
3. Document ingestion adapters.
4. Candidate fact extraction with source references.
5. Conflict detection between user/document/system values.
6. AI ↔ manual switching without losing progress.
7. Human review screen and correction loop.
8. Multilingual presentation layer.

Worker A must never write verified=true solely from an LLM response.

### DAVID Worker B — Core / Data / QA / Security

Owner line: Borko + Worker B

1. Provenance/evidence data contract.
2. Tenant isolation and RLS verification.
3. Model/item/batch/DPP persistence.
4. QR/public passport binding.
5. Versioning/audit/history.
6. API/integration boundaries.
7. Negative security tests.
8. Release evidence and recovery gates.

Worker B owns the rule that no AI shortcut can bypass access, evidence, validation or publication gates.

## 6. Execution order

### Gate 0 — Finish Stage 1 acceptance

Parent code candidate remains Draft. Before any production claim:

- real Google login
- company onboarding
- model / item / batch / DPP flow
- physical QR scan
- DRAFT / ACTIVE / revoked behavior
- two-tenant negative isolation
- encrypted DB + Storage backup
- isolated restore
- C04 migration gate

AI-first work may proceed in an isolated branch, but it does not make production GREEN.

### Gate A1 — Evidence-bound intake contract

PASS when:

- one prompt starts intake
- unresolved facts become targeted questions
- facts without provenance are rejected
- AI provenance is rejected
- unverified facts remain unresolved
- complete verified facts require human review
- generation is allowed only after explicit approval
- manual mode obeys identical rules

Implementation: `api/_ai_intake_contract.js`  
Tests: `tests/api/ai-intake-contract.test.cjs`

### Gate A2 — Conversation persistence

PASS when:

- intake session survives reload/re-login
- answers and provenance preserve tenant ownership
- AI/manual switches preserve state
- concurrent edits cannot silently overwrite newer values

### Gate A3 — Document evidence ingestion

Start with PDF + CSV/Excel-compatible tabular import.

PASS when:

- uploaded evidence receives stable identity
- extracted candidates reference exact source
- extraction never marks a value verified automatically
- conflicting values are surfaced, not silently chosen
- unsupported extraction stays missing/unverified

### Gate A4 — AI question planner

PASS when:

- asks only unresolved/conditional questions
- does not ask already verified fields again
- explains why a question is required
- deterministic fallback exists when the model is unavailable
- model outage never corrupts saved state

### Gate A5 — Draft generation

PASS when:

- approved fact set maps into existing battery model/item/passport contracts
- generation produces DRAFT only
- source traceability remains queryable per field
- missing/invalid regulatory data prevents false readiness

### Gate A6 — Publication handoff

PASS when:

- existing validation/completeness/access checks remain authoritative
- QR is bound to the exact passport/version expected by policy
- ACTIVE/revoked behavior remains correct
- publishing creates an auditable event

### Gate A7 — Additional regulatory module

Only after Battery end-to-end is stable. Add one category at a time with its own traceability matrix and tests.

## 7. Two-PC 24/7 worker design

The workstation agent should be resumable, not an uncontrolled autonomous deployer.

Each worker needs:

- unique worker ID
- assigned branch/worktree
- task queue with dependency IDs
- heartbeat
- checkpoint after each completed task
- append-only activity log
- test command + evidence output
- crash/reboot recovery
- Git lease before write
- no direct production deploy permission
- explicit human approval for migrations, production data changes, secrets, merges and releases

Worker A and Worker B must not edit the same branch concurrently.

## 8. Definition of success for the first AI prototype

A manufacturer can:

1. authenticate into its workspace;
2. describe the product in one prompt;
3. answer only missing questions;
4. attach evidence;
5. see confirmed / unverified / missing facts and their sources;
6. correct anything manually;
7. approve the fact set;
8. generate a DPP DRAFT using the existing core;
9. continue later from the same saved state;
10. reach QR/publication only through the existing validation gates.

No synthetic claim of legal certification or `100% READY` is allowed.

## 9. Immediate next engineering tasks

Worker A next:

- design model-provider adapter boundary around the intake contract;
- define candidate extraction response schema;
- build deterministic question-planner fallback.

Worker B next:

- map the intake fact contract to existing onboarding/model/passport endpoints;
- define persistence tables/RLS as a migration proposal only;
- add provenance/conflict/tenant-isolation tests before any live DB change.

Shared next:

- run the real Stage 1 PC/QR acceptance separately from this AI branch;
- keep PR #304 Draft until its release gates are genuinely satisfied.
