# C04 independent live-object reconciliation — 10 October 2026

**Evidence type:** read-only live-catalog reconciliation aid. This is NOT a migration deployment, release certification, backup or approval.

**Fresh base:** this branch is stacked directly on PR #324 head `caa877d9ca8424cd01b46870f088305b7ea890b2` to avoid the stale/diverged history of PR #325.

**Important provenance note:** the factual live findings below come from the prior independently reported read-only Supabase inspection of bound project `frhletkiuupgksmgxoxc`. This branch strengthens the repeatable catalog query and safety contract but **does not itself re-query the live database**. Any new release decision must use a fresh, timestamped live read-only run.

## Previously established live findings

- Nine proposed repo migration names were absent from the live migration registry, not merely the older bound snapshot.
- No current public `dpp_api_organization_ensure` function was observed.
- No A2 intake tables were observed: sessions, messages, candidates, approvals, requests and events.
- No proposed A2 CAS/public or `*_unbound` functions were observed.
- Existing `dpp_api_technical_pilot_update_capacity` was observed as `SECURITY DEFINER` with effective anon EXECUTE. Its function body also contained the internal active-role guard, so that finding is an unwanted permission boundary, not proof of unauthorized data writes.
- `dpp_api_manufacturer_onboarding_configure` existed with authenticated access; presence alone did not prove the later truthful-progress migration body/effects were applied.

## Why this fresh-base audit is stronger

`scripts/c04-live-catalog-readonly.sql` remains three SELECT-only metadata queries, but now captures additional security-relevant catalog evidence:

- function owner;
- `SECURITY DEFINER` state;
- raw function ACL text, which helps distinguish effective role access from the ACL source;
- per-function runtime configuration such as pinned `search_path` where present;
- effective anon/authenticated EXECUTE;
- definition hash for diagnostic drift comparison only;
- table owner, RLS enabled state, FORCE RLS state and raw table ACL for the six A2 tables.

These fields are metadata only. They do not read application rows and cannot authorize a release by themselves.

## Registry reconciliation from the prior live audit

| Migration | Prior live registry | Related prior live object/ACL evidence |
|---|---|---|
| `dpp_organization_ensure` | ABSENT | RPC absent |
| `dpp_capacity_update_anon_execute_revoke` | ABSENT | Existing capacity RPC still had effective anon EXECUTE |
| `dpp_onboarding_truthful_progress` | ABSENT | Configure RPC existed; exact implementation still requires release-time verification |
| `dpp_ai_intake_persistence_v1` | ABSENT | Six A2 tables absent |
| `dpp_ai_intake_persistence_v1_hardening` | ABSENT | Dependent A2 objects absent |
| `dpp_ai_conversation_cas_v2` | ABSENT | CAS functions absent |
| `dpp_ai_candidate_conflict_constraint_fix` | ABSENT | A2 candidates table absent |
| `dpp_ai_manual_candidate_cas_v1` | ABSENT | Manual CAS RPC absent |
| `dpp_ai_request_actor_bound_idempotency` | ABSENT | Actor-bound public and inner CAS RPCs absent |

## Current code/CI boundary

PR #324 remains isolated non-production evidence. Its actor-bound idempotency hardening is not installed live merely because PostgreSQL integration tests pass. Main CI is expected to remain blocked at C04 until the authoritative migration/recovery evidence is satisfied.

The capacity ACL remediation migration is already fail-closed: it revokes from both `public` and `anon`, re-grants authenticated EXECUTE, and asserts anon no longer has effective EXECUTE. It still requires the normal backup/restore and explicit approval gates before production application.

## Immediate decision and next gates

1. Keep **C04 = RED** and `default: deny`; never edit the bound snapshot to imitate deployment.
2. Run the strengthened catalog query read-only against the exact bound project immediately before release rehearsal and archive the timestamped metadata output privately.
3. Reconcile exact migration names and checksums against any out-of-band/manual deployment evidence.
4. Obtain verified encrypted database backup and separate private Storage object backup at a coherent recovery point.
5. Restore only into an isolated target and measure the actual restore result, RPO/RTO evidence and integrity checks.
6. Apply genuinely pending migrations to the isolated restore in dependency order, then run tenant-cross, reviewer-permission, CAS replay/race, RLS/grants, SECURITY DEFINER/search_path, onboarding truthfulness and QR/lifecycle negative tests.
7. Require explicit human authorization before any production SQL, role change, snapshot refresh, merge or deploy.

## Stop rules

- No production SQL or live role changes from this branch.
- No fake snapshot refresh.
- No claim that a clean PostgreSQL replay equals a real backup restore.
- No secrets, customer data or Storage object bytes in GitHub/email evidence.
- No in-place restore test on the shared production project.

This branch is a read-only audit aid and review surface. It does not make the DPP production-ready on its own.
