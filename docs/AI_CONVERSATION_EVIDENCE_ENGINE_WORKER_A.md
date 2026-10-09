# AI Conversation + Evidence Engine (Worker A / Draft)

**Scope:** eight-field manufacturer Early Access intake — not the Battery Regulation Annex XIII passport dataset.  
**Integration baseline:** stacked on AI-intake Draft PR #306; preserve Auth / RLS / DPP core; no production writes.

## Implemented in this branch

Pure `api/_ai_conversation_engine.js` event reducer, with accompanying Node `tests/api/ai-conversation-engine.test.cjs`. It does not call an AI provider, upload any file, write to Supabase, or publish a passport.

- **Messages** recorded with unique server-supplied IDs and user/assistant role.
- **Evidence registry** for uploaded documents and other validated source records; document candidate must carry existing evidence ID and a PDF page / data row anchor.
- **Candidate facts** always start unverified. An LLM response cannot set `verified=true`, attach arbitrary AI provenance, or introduce unknown fields.
- **Conflict detection** presents contradictory proposals, demanding explicit review before verification.
- **Human review** of each candidate, plus a separate final approval of the full eight-field **onboarding configuration**.
- **AI ↔ manual** switch preserving messages, sources and review outcomes.
- **Revision-based optimistic locking contract**, event UUID idempotency, append-only metadata audit and deterministic replay.
- **No publish shortcut**; `can_generate_battery_passport` and `can_publish` are always `false`. The only authorization produced is `can_generate_onboarding_configuration` after eight verified facts and explicit human approval.

## Next integration contract (Borko / Worker B)

**Backend requirements — NOT yet implemented:**

1. Authenticate requests using existing Supabase Auth; derive `tenant_id` and `actor_id` from authorized server context, not from client JSON.
2. Check role permissions separately for message posting, evidence registration, fact review and approval; do not let model-generated events impersonate a human.
3. Generate IDs server-side; durably store session, messages, evidence, candidates, approvals and audit under tenant-scoped tables/RLS. Do not trust a client-supplied serialized state.
4. Apply events transactionally using **compare-and-swap on `revision`**, enforcing uniqueness of `(session_id,event_id)` and atomic audit; retry only exact duplicates.
5. Store evidence in tenant-controlled private Storage, validate content bytes/MIME, size, permission and scanning policy before `evidence.register`; source reference alone is **not** proof of the content or truth of a field.
6. Keep immutable provenance references and the original evidence files / location/row anchors; store reviewer identity and approval time.
7. Only after source data is validated and user-approved may the existing onboarding save endpoint be called; DPP draft/publication remains an entirely separate secured workflow.
8. Test two-user/two-tenant reads and writes, logout/login resume, conflicts and corrections, stale revisions, model outage, malformed input, file parser errors, and storage recovery.

**Important:** `candidate.review` enforces event structure, not legal review authority. The server adapter must verify actual reviewer access and ensure proposed facts are grounded in their claimed message/document; AI-created suggestion is not proof. The reducer cannot by itself attest to the source's authenticity or compliance.

## Local regression command

`node --test tests/api/ai-conversation-engine.test.cjs`

## Release blockers unrelated to this draft

Stage 1's premature READY P1 bug, C04 migration checks, verified encrypted DB and Storage backup + isolated restore, and real desktop/mobile + physical QR scan acceptance remain open until independently demonstrated. No production migration, deploy, PR merge, or company data mutation is authorized by this draft.
