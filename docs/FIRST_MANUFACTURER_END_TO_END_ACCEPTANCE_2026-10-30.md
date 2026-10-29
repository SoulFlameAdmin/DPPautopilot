# SOULFLAME DPP — first real manufacturer acceptance contract

**Date:** 2026-10-30  
**Status:** Engineering acceptance plan; not a claim of production readiness.

## Business outcome

An operator (e.g. Ilko) gives a prospective manufacturer a single link. The manufacturer owns its identity, data and approval decisions. A guided assistant gathers DPP-relevant business data. The service prepares a **draft** industry-specific configuration, a verified manufacturer approves it, and only then are a tenant, its initial real product and verified passport data provisioned. Generated draft content must not be presented as regulatory proof, a completed QR passport, a paid account or a submitted EU registration.

## Evidence from live database

The owner read-only audited `frhletkiuupgksmgxoxc`:
- Three existing Early Access sessions show `opened_at`, `submitted_at`, `configured_at`, and nonempty questionnaire/config JSON, yet all remain `reviewing`.
- The configuration objects identify `mode: DPP pilot`, `generatedFrom: manufacturer_onboarding_8`, `nextAction: Create real Product / SKU`.
- There are zero records in `dpp_client_applications`, `dpp_registration_requests` and `dpp_registry_submissions` at audit time; this is not evidence that real customers have been activated.
- There is a separate functioning tenant/model/item/passport system with synthetic tests, but it is **not wired into the Early Access approval step**. Its principal database security boundaries must remain separate.

## Update: identity/tenant correlation from live read-only audit

The three pre-existing `reviewing` Early Access rows are **not three separate prospects**. They have **one distinct email and one distinct `supabase_user_id`**, which matches a confirmed `auth.users` email in all three rows. That user is a member of **one tenant** holding **2 battery models, 12 battery items and 12 passports** (11 active, 1 draft). This demonstrates existing technical entities associated with the account, **not evidence they belong to an independently paying customer or satisfy the new applicant's legal ownership/QR proof requirements**.

Do not create duplicate tenants based on `dpp_early_access_sessions.id`, and do not infer a unique manufacturer count from session count. A verified account with membership is still not sufficient to auto-assign a company's Early Access application to a tenant; owner must verify company ownership and assess existing products.

The SoulFlame PR #171 now includes an owner-only, read-only identity/tenant evidence check on individual applicant detail. It must fail closed on Auth/admin API failure or mismatched emails. The API returns only summary evidence, not raw `supabase_user_id` or organization IDs. No tenant is created or activated by this operation.

## Acceptance gates

| Gate | Single concrete outcome | Security/compliance proof | Current evidence |
| --- | --- | --- | --- |
| A. Identity | Request link, receive email, verify possession, resume | No API-issued bearer in response; no localStorage-email impersonation | Draft API PR #171 + DPP PR #350; tests pass, inbox E2E not yet proven |
| B. Company context | Identify verified account and create/select only its tenant | Authenticated Supabase user, exact tenant membership, role & RLS negative tests | APIs exist; Early Access conversion not connected |
| C. Guided AI intake | Sector/country/product-specific questions with validation | Explicit consent to external LLM; server-only Gemini key; redact identifiers; audit source, confidence and human corrections | Existing 10-question scripted intake; no demonstrated Gemini inference |
| D. Draft configuration | Build a proposed per-company dashboard and required product fields | Label as DRAFT, store source/evidence and reviewer approval; prohibit fictional values | Legacy pilot configuration JSON exists; not active |
| E. First SKU and item | Authorized owner approves real product, model and unique battery/item ID | Manufacturer-sourced data, no duplicate identifiers, tenant isolation | Production APIs + synthetic API test exist; no live customer pilot proven |
| F. Passport and QR | Issue versioned passport and printable QR that resolves to allowed public fields | Correct field-level access, accessible QR link, no private payload exposure, mobile scan acceptance | Existing test precursor, not an accepted first-customer journey |
| G. Billing/activation | Accepted quote, correct payment state and explicit owner activation | Audit history, non-replayable state transition, no free access to paid private tenant | Separate partner quote flow; conversion not linked |
| H. Operations | Ilko can see only assigned sales status; owners see DPP data | Separation of CRM/Call Desk from manufacturer records; permission audits | Not yet E2E tested |

### Required real-case regression matrix (before production)

1. New Gmail and non-Gmail address; unverified wrong address never accesses a tenant.
2. Failed mail send, expired link, resend abuse, double-click submission and simultaneous submissions.
3. Saved `reviewing` form cannot be overwritten or reverted from `activated/rejected` by a client link.
4. Admin endpoint requires **both** admin authorization and an actual Supabase user; internal dispatch secret alone is insufficient.
5. Admin sees confidential questionnaire only on demand and cannot retrieve another tenant's passport.
6. A self-registered company cannot forge `organization_id`, add another company's member, obtain another customer's SKU or private payload.
7. Suggested AI data is separate from approved product evidence; `null/unknown` fields remain explicitly missing rather than hallucinated.
8. Review/approval generates exactly one tenant and one starter SKU when retried, without duplicate identifiers or extra paid charges.
9. QR works via phone and desktop, is revocable/redirectable where applicable and exposes only authorized public data.
10. Never mark EU Registry submission, external authority approval or legal compliance as completed without real receipts.

## Release blockers and next implementation sequence

**Hard stop C04:** Four canonical migration labels are absent from the bound applied-migration history. Read-only schema check shows corresponding live objects but a live-only change to `dpp_api_client_application_submit`; see `docs/C04_LIVE_SCHEMA_RECONCILIATION_2026-10-30.md`. Do not replay stale SQL or fake a green gate. Prove backup/isolated restore, reconcile exact live definitions and migration provenance with owner approval.

**External environment validation:** Vercel environment metadata currently returns 403 in the connected account; real Gmail sender readiness and live app secrets cannot be confirmed. Do not share tokens in chat; resolve in project permissions, then run controlled preview smoke tests.

**Implementation order:** auth/verified email → safe admin review → C04 reconciliation → authenticated tenant conversion → server-side validated AI draft → human approval → model/item/passport version → QR/public read → commercial activation. No direct manufacturer DPP writes from anonymous Early Access or operator CRM. Deployment promotion requires explicit owner sign-off and green exact-commit checks.

This document is a tracked acceptance contract, **not evidence that the unfinished steps are built**.
