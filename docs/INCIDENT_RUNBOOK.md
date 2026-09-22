# DPP Autopilot Incident Runbook

> R13 status: **RED / PARTIAL precursor**. This runbook is repository-tested operational guidance. R09/R10 are not yet GREEN, so no live paging, human acknowledgement or production rollback capability is claimed. Structured production-log ingestion is evidenced, but full R09 runtime/retention acceptance is not.

## 1. Purpose and evidence boundaries

Use this runbook for DPP availability, authentication/authorization, tenant-isolation, data-integrity, privacy/security and abuse incidents.

Current proven foundations:

- R09 supplies redacted structured `dpp_http_request` events and `X-Request-ID` correlation; Vercel runtime aggregation has returned a real production `dpp_http_request` event, proving deployed structured-event ingestion on a production deployment.
- R10 defines deterministic monitoring signals and owners, but live delivery is not configured.
- R11 defines backup scope and recovery objectives.
- R12 has a passing isolated PostgreSQL restore drill.
- F08 is GREEN and production deployment exists; this does not by itself prove R09 retention acceptance, R10 live delivery, or production rollback.
- C05 production rollback is not yet accepted. “Rollback” below means follow an approved deployment/database rollback mechanism if and when C05 proves it; until then use containment and isolated recovery validation.

## 2. Roles

Every incident must identify these roles. One person may hold more than one role for a small team, but ownership must be explicit in the incident record.

- **Incident commander** — owns severity, timeline, decisions and handoffs.
- **DPP operations owner** — triages availability/auth/user impact and R10 operational signals.
- **DPP platform owner** — triages runtime, latency, rate-limit, database/provider and deployment behavior.
- **Privacy/security lead** — leads tenant-isolation, unauthorized-access, personal/confidential-data and evidence-preservation work.
- **Communications owner** — maintains internal/customer status messages using confirmed facts only.

## 3. Severity and acknowledgement targets

### SEV1 — critical, target acknowledgement ≤15 minutes

Use SEV1 for any of:

- sustained R10 critical `availability_5xx_rate` or `consecutive_5xx`;
- confirmed or suspected tenant-isolation failure;
- confirmed or suspected unauthorized disclosure of confidential or personal data;
- material data corruption or destructive writes affecting production records.

### SEV2 — major, target acknowledgement ≤30 minutes

Use SEV2 for:

- major degradation without confirmed data exposure;
- sustained `latency_p95`, `auth_failure_rate` or other warning signals with material user impact;
- authentication/authorization failures preventing legitimate users from completing core workflows.

### SEV3 — limited, target acknowledgement ≤4 hours

Use SEV3 for limited degradation, non-urgent defects or warning signals without material user impact.

Severity may only move down after the trigger has cleared and impact has been verified. A suspected privacy/tenant-isolation incident remains SEV1 until the security/privacy lead has bounded the exposure.

## 4. Detect and open

Create an incident record with:

- incident ID;
- UTC start/detection time;
- current severity;
- incident commander and role owners;
- affected surface(s): models, items, passport, imports, export, auth, database, registry/evidence;
- R10 signal(s), if applicable;
- representative R09 request IDs only — never bearer/access/refresh tokens, request bodies, cookies, Supabase keys or raw confidential payloads;
- user/tenant impact stated as confirmed, suspected or unknown;
- current containment state.

Do not copy raw secrets into tickets, chat or incident notes.

## 5. Triage

1. Confirm the signal or report using the smallest safe evidence set.
2. Correlate failures using `X-Request-ID` and structured R09 fields: surface, method, status, outcome, duration, auth-present boolean and stable public error code.
3. Establish whether impact is:
   - one request/user;
   - one tenant;
   - multiple tenants;
   - all traffic;
   - unknown.
4. Check whether the incident is availability, latency, auth/RBAC, abuse/rate-limit, data integrity, privacy/security, provider/deployment, or a combination.
5. Record the earliest confirmed failing request/time and a known-good comparison.
6. Do not broaden database access or bypass RLS/RBAC to investigate.

## 6. Containment

Choose the least-destructive safe containment that limits impact:

- stop or pause a known-bad change through an approved mechanism when available;
- restrict a failing feature path if an approved feature/config mechanism exists;
- preserve audit/log evidence and request IDs;
- for suspected abuse, retain the existing R05 rate-limit controls rather than disabling auth/security checks;
- for suspected tenant isolation or disclosure, stop affected write/publication paths before attempting cleanup;
- never delete audit history or evidence merely to “fix” an incident.

If containment requires a Vercel create/update/redeploy, the DAVID Vercel deployment lease law applies before that action.

## 7. Communications

Internal updates must include:

- incident ID/severity;
- confirmed impact and affected surfaces;
- containment/recovery state;
- next decision point;
- unresolved risks.

External/customer communication must:

- distinguish confirmed facts from investigation;
- avoid exposing tenant identifiers, security details, credentials or other customers’ data;
- avoid promising recovery times that are not evidence-backed;
- use the approved communications/legal path for privacy or regulatory notifications.

This precursor does not hard-code statutory notification deadlines. Applicable obligations must be reviewed for the affected jurisdiction/data and approved by the privacy/legal owner.

## 8. Recovery, rollback and restore

### Application/runtime recovery

- Prefer a known-good approved release or configuration rollback only after C05 defines/proves the production mechanism.
- Do not make an untracked “hot fix” directly against production.
- If deployment is required, obey the Vercel deploy lease and record the exact commit/deployment evidence.

### Database recovery

- Do not restore over production as the first diagnostic step.
- Use the R11 backup scope and R12 pattern: restore to an isolated environment first, then verify schema, DPP binding, RLS and relational integrity.
- Establish the incident time window and data-loss boundary before any production recovery decision.
- Preserve immutable audit evidence.
- Evidence object bytes require their own storage recovery lifecycle; a PostgreSQL restore alone does not prove evidence-object recovery.

## 9. Data/privacy/security incident procedure

For suspected tenant-isolation, unauthorized access or disclosure:

1. Set/retain SEV1.
2. Preserve relevant R09 request IDs/log metadata and DPP immutable audit records.
3. Bound affected tenant(s), record types, fields/data classes, time window and actions.
4. Confirm whether public vs private passport data, Auth identity linkage, evidence metadata/objects or audit snapshots were involved.
5. Stop affected publication/write path using the least-destructive approved control.
6. Do not alter/delete source evidence before the security/privacy lead approves preservation needs.
7. Determine processors/external recipients involved using the R07 privacy inventory.
8. Follow applicable legal/privacy notification and customer communication requirements after jurisdiction-specific review; do not guess deadlines.
9. Document remediation, residual risk and any required credential/session invalidation through supported provider flows.

## 10. Verification before closure

An incident may move to recovery/closure only when applicable evidence shows:

- triggering R10 condition is below its clear threshold or the equivalent source symptom is gone;
- representative API flows return expected status/error behavior;
- auth/RBAC and tenant isolation are unchanged;
- no new security-hygiene regression exists;
- database integrity is verified when data was at risk;
- public passport privacy boundary is intact when publication was affected;
- recovery/rollback action and exact commit/config are recorded;
- affected users/tenants and communications status are documented.

## 11. Close and learn

Record:

- timeline;
- root cause (or “unknown” with follow-up owner);
- detection gap;
- containment/recovery actions;
- customer/data impact;
- evidence references;
- corrective actions with owners;
- test/monitoring/runbook changes;
- whether severity/thresholds need review.

Do not close merely because an alert stopped firing if user/data impact is unresolved.

## 12. Synthetic CI drill boundary

A repository-level drill now exercises the R09 event contract through R10 `availability_5xx_rate`, maps the critical signal to `SEV1` and the DPP operations owner, verifies a synthetic 5-minute acknowledgement against the 15-minute target, walks every required runbook phase, and proves recovery clears the alert in a later monitoring window.

This is deliberately not live incident-drill evidence: deployed structured-log ingestion is evidenced, but there is no approved notification destination, human acknowledgement, production rollback or production incident recovery claim.

## 13. Current gaps before R13 GREEN

R13 cannot be GREEN until:

- R09 production logging/correlation and retention/backend ownership are fully accepted;
- R10 has a live notification destination plus fire/recover/acknowledgement evidence;
- production rollback procedure C05 is defined where rollback is required;
- at least one runtime incident drill exercises detection → triage → containment → communication → recovery → verification using deployed evidence.
