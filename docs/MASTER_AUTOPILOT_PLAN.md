# DPP Autopilot — MASTER AUTOPILOT PLAN

**Source of truth:** this file.  
**Plan version:** 2.1  
**Frozen:** 2026-09-17  
**Target:** evidence-backed production readiness, not percentage-by-assumption.

## Status protocol

- `GREEN` = implementation exists + applicable test passed + concrete evidence is recorded.
- `YELLOW` = implementation is partial or test/evidence is incomplete.
- `RED` = not implemented or failed.
- `BLOCKED` = external access, legal sign-off, customer data, vendor credentials, or another dependency prevents completion.
- A task may move to `GREEN` only after its acceptance criteria are satisfied.
- `PROJECT_100_PERCENT_COMPLETE` is allowed only when every required task is GREEN, mandatory test suites pass, and production acceptance is evidenced.

## Verified binding snapshot

| System | Verified object | State | Evidence / decision |
|---|---|---|---|
| GitHub | `SoulFlameAdmin/DPPautopilot`, branch `main` | VERIFIED | Repository exists and connected GitHub account has write/admin access. |
| Vercel | No project linked to `SoulFlameAdmin/DPPautopilot` | BLOCKED | Existing Vercel project `dpp` is linked to a different repository: `SoulFlameAdmin/dpp`; it must not be treated as this project. |
| Supabase | No verified project binding | BLOCKED | Connected account currently exposes `soulflame-twins`; there is no evidence that it belongs to DPP Autopilot. Do not write DPP data there without an explicit verified binding. |

## Current implementation audit

At freeze time the repository was a static prototype: `index.html`, `vercel.json`, `README.md`, `data/master-plan.json`, and `data/worker-status.json`. During this execution cycle the repository gained a canonical master plan, environment policy, requirements traceability baseline, security baseline, repository validator, security hygiene validator, `.gitignore`, and GitHub Actions CI. It still has no application backend, authenticated users, verified DPP database binding, migrations, production API layer, or verified DPPautopilot Vercel deployment.

## Product scope

DPP Autopilot is a Battery Digital Product Passport automation platform. The production scope is: organisation onboarding; authenticated users and RBAC; battery model and item records; import/mapping/validation; passport generation and public/private data access; identifiers and QR/data carrier; evidence attachments; immutable audit history; registry workflow/status tracking; export; observability; backups/recovery; and a production-grade delivery/test pipeline. Compliance-facing claims remain subject to current official EU rules and qualified legal/compliance review.

## Architecture target

Browser UI -> application/API layer -> Supabase Auth/Postgres/Storage (only after verified DPP project binding). Vercel hosts preview/production deployments once the correct GitHub repo is imported. Database changes are migration-driven. Tenant isolation is enforced server-side and with database RLS. Public passport reads are explicitly separated from authenticated/private access. CI gates merge/deploy on validation and automated tests.

---

# FOUNDATION

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| F01 | Verify canonical GitHub repository | — | Repo identity/default branch/write access verified | Connector result naming exact repo | GREEN |
| F02 | Inventory current code/config | F01 | Root tree and implemented surfaces documented | Audit section in this file | GREEN |
| F03 | Freeze canonical master plan | F01,F02 | This file exists with stable IDs, dependencies, acceptance and evidence rules | `docs/MASTER_AUTOPILOT_PLAN.md` commit | GREEN |
| F04 | Keep machine-readable progress view | F03 | `data/master-plan.json` remains parseable and dashboard can render it | CI validator + dashboard smoke test | YELLOW |
| F05 | Keep DAVID worker status contract | F03 | Worker JSON parseable with required fields/status | Passing CI validator | GREEN |
| F06 | Define product scope and target architecture | F03 | Scope + architecture recorded and reviewed against implementation | This file | GREEN |
| F07 | Bind correct Vercel project | F01 | Vercel project is linked to `SoulFlameAdmin/DPPautopilot` | Vercel project metadata | BLOCKED |
| F08 | Verify first production deployment | F07 | Production deployment READY; app and data JSON return 200 | Deployment metadata + HTTP verification | RED |
| F09 | Add CI baseline | F03 | CI validates JSON, stable IDs, required repo files and HTML data references | GitHub Actions check `validate` PASS on commit `9f3892b26176da8a9aac8063f3f528906840d18c` | GREEN |
| F10 | Define dev/preview/production environment policy | F03 | Environment ownership, secrets, promotion and rollback rules documented | `docs/ENVIRONMENT_POLICY.md` + PASS on commit `eb40704890ececa3df3e2f519962e82d0570c39e` | GREEN |
| F11 | Requirements traceability matrix | F03 | Product/compliance fields map to authoritative requirement/source and implementation | `docs/REQUIREMENTS_TRACEABILITY.md`; field-level implementation mapping still incomplete | YELLOW |
| F12 | Enforce GREEN evidence rule | F03 | Validator rejects GREEN tasks with empty evidence | `scripts/validate_repo.py` + passing GitHub Actions checks | GREEN |
| F13 | Bind dedicated Supabase project | F06 | Project identity verified as DPP Autopilot; URL/keys available to correct environments | Supabase project metadata | BLOCKED |
| F14 | Baseline repository security hygiene | F03 | No committed secrets; `.gitignore`/secret policy in place; dependency strategy defined | `.gitignore`, `scripts/security_hygiene.py`, `docs/SECURITY_BASELINE.md`, PASS on commit `5747153bc6b94589a6e805e9d8790dd6e304654c` | GREEN |

# DEMO PRODUCT

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| D01 | Product dashboard / navigation | F09 | Dashboard usable with clear Demo/MVP/Production boundaries | UI smoke test + screenshots | RED |
| D02 | Realistic sample battery dataset | F11 | Sample model/items cover required demo fields and are explicitly synthetic | Fixture validation test | RED |
| D03 | CSV import demo | D02 | File can be loaded, columns previewed and mapped without backend | Browser test fixture | RED |
| D04 | Battery model form | D02 | Required model fields validate and errors are visible | Form tests | RED |
| D05 | Battery instance form | D04 | Item fields link to model and validate identifiers/status | Form tests | RED |
| D06 | Public passport view | D04,D05 | Stable route renders public-safe passport fields | E2E route test | RED |
| D07 | Unique identifier generation | D05 | IDs are deterministic/unique per defined strategy and collision tested | Unit tests | RED |
| D08 | QR/data carrier | D06,D07 | QR resolves to exact passport URL and is scannable | E2E + scan evidence | RED |
| D09 | Completeness score | D04,D05,F11 | Score derives from defined field requirements | Unit tests | RED |
| D10 | Missing-field warnings | D09 | Missing/invalid fields show actionable messages | UI tests | RED |
| D11 | Model vs item data separation | D04,D05 | UI and data structures clearly separate shared/model and instance data | Unit/UI tests | RED |
| D12 | Responsive demo | D01-D11 | Core flows pass phone/tablet/desktop viewports | Responsive E2E screenshots | RED |
| D13 | Demo reset/replay | D02-D12 | Reset returns app to known fixture state | E2E test | RED |
| D14 | Demo acceptance | D01-D13 | Create/import -> validate -> passport -> QR completes without console/runtime error | Recorded E2E evidence | RED |

# MVP / DATA / AUTH / API

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| M01 | Authentication | F13 | Sign-up/in/out/reset/session handling works | Auth integration tests | RED |
| M02 | Organisations / tenants | M01 | Users belong to organisations and active tenant is explicit | DB + integration tests | RED |
| M03 | RBAC | M01,M02 | Owner/admin/editor/viewer permissions enforced server-side | Authorization test matrix | RED |
| M04 | Core database schema | F13,F11 | Models/items/passports/orgs/users represented with PK/FK/check constraints | Migration + schema diff | RED |
| M05 | Row Level Security | M02,M03,M04 | Cross-tenant reads/writes are denied by database policy | Negative security tests | RED |
| M06 | Migration workflow | M04 | Reproducible ordered migrations from clean database | Migration replay test | RED |
| M07 | CSV mapping wizard | M04 | Customer columns map to canonical fields with saved mapping | Integration/E2E test | RED |
| M08 | Import validation / row errors | M07,F11 | Invalid rows do not silently pass; errors are downloadable/actionable | Unit/integration tests | RED |
| M09 | Annex/requirement data model mapping | F11,M04 | Canonical schema traces to requirement matrix | Traceability review | RED |
| M10 | Public/private access categories | M03,M09 | Every passport field has explicit access class; API enforces it | API/security tests | RED |
| M11 | Version history | M04 | Material passport changes create immutable version records | DB integration tests | RED |
| M12 | Critical audit log | M03,M04 | Actor/action/time/target/before-after metadata captured; app cannot alter past entries | DB policy tests | RED |
| M13 | Evidence attachments | M03,M04 | Allowed files upload/download under tenant policy; type/size limits enforced | Storage tests | RED |
| M14 | Identifier/lifecycle service | M04,D07 | Identifier uniqueness and lifecycle transitions enforced | Unit/integration tests | RED |
| M15 | Registry test workflow abstraction | F11,M14 | Registry payload/status model exists without unsupported live claims | Contract tests | RED |
| M16 | Registry status tracking | M15 | Submission/accepted/rejected/retry states persisted with timestamps | Integration tests | RED |
| M17 | API: models | M03,M04 | Authenticated CRUD with validation/tenant enforcement | API tests | RED |
| M18 | API: battery items | M03,M04 | Authenticated CRUD with model linkage/tenant enforcement | API tests | RED |
| M19 | API: passports | M03,M04,M10 | Public/private read and controlled write endpoints | API/security tests | RED |
| M20 | API: imports | M07,M08 | Create/validate/commit import flow is transactional | Integration tests | RED |
| M21 | Export data/evidence | M10-M13 | Tenant-scoped export includes required records/history/evidence manifest | Integration/E2E test | RED |
| M22 | Validation/error contract | M17-M20 | API returns stable machine-readable error codes/messages | Contract tests | RED |
| M23 | Idempotency/concurrency rules | M17-M20 | Duplicate import/submission and conflicting writes are safely handled | Concurrency tests | RED |
| M24 | Pilot onboarding flow | M01-M22 | New org -> users -> import -> validate -> passport works end-to-end | E2E acceptance | RED |
| M25 | MVP acceptance | M01-M24 | Mandatory MVP tests all pass on preview with no P0/P1 defect | Test report + preview evidence | RED |

# FRONTEND / UX / ACCESSIBILITY

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| U01 | Application information architecture | D14,M24 | Navigation supports dashboard, models, items, imports, passports, settings | E2E navigation tests | RED |
| U02 | Loading/empty/error states | U01 | Every async core view has deterministic loading, empty, success and failure states | Component/E2E tests | RED |
| U03 | Form validation UX | D04,D05,M22 | Field and form errors are accessible and preserve user input | UI tests | RED |
| U04 | Responsive production UX | U01-U03 | Core workflows pass mobile/tablet/desktop without overflow/blockers | Visual tests | RED |
| U05 | Accessibility | U01-U04 | Keyboard flow, labels, landmarks, focus, contrast and critical axe rules pass | Automated + manual evidence | RED |
| U06 | Cross-browser compatibility | U04 | Latest stable Chromium/Firefox/WebKit core flows pass | Cross-browser E2E report | RED |
| U07 | Visual regression baseline | U04 | Key routes have approved deterministic screenshots | Visual snapshot report | RED |

# SECURITY / PRIVACY / OPERATIONS

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| R01 | Environment/secret management | F10,F13 | No service-role secrets client-side; env scope documented and verified | Config inspection | RED |
| R02 | Security headers / TLS | F08 | Production serves TLS and required headers; unsafe defaults removed | HTTP header test | RED |
| R03 | Input/file validation | M13,M17-M20 | Server rejects malformed/oversize/disallowed payloads | Negative tests | RED |
| R04 | Tenant isolation security suite | M05,M17-M21 | Cross-tenant attack cases consistently deny access | Security test report | RED |
| R05 | Rate limiting / abuse controls | M17-M20 | Sensitive/public endpoints have documented limits and 429 behavior | Load/abuse tests | RED |
| R06 | Auth security review | M01,M03 | Session/cookie/redirect/reset flows use secure defaults | Security review evidence | RED |
| R07 | Privacy data inventory | M01-M13 | Personal/business data, purpose, location, processor and retention recorded | `docs/PRIVACY_DATA_INVENTORY.md` | RED |
| R08 | Retention/deletion/export | R07 | User/org deletion and export follow defined policy with audit-safe exceptions | Integration tests | RED |
| R09 | Logging/observability | F08,M17-M20 | Structured errors and request correlation available without leaking secrets | Runtime log evidence | RED |
| R10 | Monitoring/alerting | R09 | Critical availability/error signals have thresholds and owners | Alert test evidence | RED |
| R11 | Backup policy | F13,M04 | Backup scope/RPO/RTO documented against actual Supabase plan/features | Backup config evidence | RED |
| R12 | Restore test | R11 | Restore to isolated environment succeeds and integrity checks pass | Restore drill report | RED |
| R13 | Incident runbook | R09-R12 | Severity, triage, comms, rollback, data incident steps documented | `docs/INCIDENT_RUNBOOK.md` | RED |
| R14 | Dependency/supply-chain checks | F09 | CI checks vulnerable dependencies/actions and pins critical workflow actions | Passing security CI | RED |

# TESTING / RELIABILITY / PERFORMANCE

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| T01 | Unit test suite | D07,D09,M22 | Deterministic business-rule tests cover identifiers, scoring, validation, errors | Coverage/test report | RED |
| T02 | Database integration suite | M04-M16 | Schema/RLS/audit/versioning/import behaviors pass against test DB | Integration report | RED |
| T03 | API integration suite | M17-M23 | Positive/negative API flows pass | API test report | RED |
| T04 | E2E suite | M24,U01-U04 | Critical user journeys pass from browser to DB | E2E report | RED |
| T05 | Visual/responsive suite | U04,U07 | Key screens pass approved viewport baselines | Screenshot diff report | RED |
| T06 | Cross-browser suite | U06 | Critical E2E passes Chromium/Firefox/WebKit | Browser matrix | RED |
| T07 | Load test | M17-M21 | Agreed concurrency/data-volume targets pass within latency/error budgets | Load report | RED |
| T08 | Reliability/retry test | M15,M16,M23 | Retries/timeouts/idempotency survive injected failures | Reliability report | RED |
| T09 | Accessibility test gate | U05 | Automated accessibility checks block regressions | CI report | RED |
| T10 | Full regression gate | T01-T09 | All mandatory suites pass from clean checkout | CI release run | RED |

# CI/CD / RELEASE / PRODUCTION ACCEPTANCE

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| C01 | Pull-request CI | F09,T01-T04 | Validation/tests required before merge | Branch/rules evidence + passing run | RED |
| C02 | Preview deployment verification | F07,C01 | Each releasable change gets preview and automated smoke test | Vercel deployment + test | RED |
| C03 | Production promotion policy | F10,C02 | Production only from defined branch/release condition | Config/document evidence | RED |
| C04 | Database migration deployment gate | M06,C03 | Migration applied/verified before incompatible app release | Deployment log | RED |
| C05 | Rollback procedure | C03,C04 | App rollback tested; DB rollback/forward-fix strategy documented | Drill evidence | RED |
| C06 | Staging acceptance | T10,C02 | Full mandatory suite passes on staging/preview with production-like config | Acceptance report | RED |
| C07 | Production smoke tests | C03,C06,F08 | Home/auth/core API/public passport endpoints verified after deploy | Timestamped smoke report | RED |
| C08 | Runtime error review | C07,R09 | No unresolved P0/P1 runtime error clusters during acceptance window | Vercel runtime evidence | RED |
| C09 | Performance acceptance | T07,C07 | Production-like latency/error budgets satisfied | Performance report | RED |
| C10 | Security acceptance | R01-R14,C07 | Security checklist/tests pass; no known critical/high issue accepted silently | Security report | RED |
| C11 | Privacy/compliance acceptance | F11,R07,R08 | Traceability/privacy artifacts complete; unsupported compliance claims removed | Review evidence | RED |
| C12 | Legal/compliance sign-off | C11 | Qualified reviewer signs current production scope | External sign-off | BLOCKED |
| C13 | Pilot customer UAT | M25,C06 | Real pilot completes agreed scenarios and signs acceptance | UAT record | BLOCKED |
| C14 | Final production evidence pack | C07-C13 | Links to commits, migrations, tests, deployments, backups, runbooks and sign-offs collected | `docs/PRODUCTION_EVIDENCE.md` | RED |
| C15 | 100% final acceptance | C14 | Every required task GREEN; no mandatory test failing; production verified | Final audit + evidence pack | RED |

# EXPANSION (post-production; not required for first production acceptance unless contracted)

| ID | Task | Depends on | Acceptance criteria | Evidence required | Status |
|---|---|---|---|---|---|
| X01 | ERP connector framework | C15 | Versioned connector interface and sandbox test harness | Integration tests | RED |
| X02 | SAP connector | X01 | Contracted SAP workflow passes sandbox/pilot | Connector evidence | RED |
| X03 | BMS/telemetry ingestion | X01 | Authenticated ingestion with validation/idempotency | Load/integration tests | RED |
| X04 | Supplier portal | C15 | Scoped supplier access and evidence requests | RBAC/E2E tests | RED |
| X05 | Missing-data automation | X04 | Rules create deduplicated reminders with audit trail | Integration tests | RED |
| X06 | AI mapping assistant | M07 | Suggestions are reviewable, non-destructive and confidence/evidence aware | Evaluation set | RED |
| X07 | Manufacturing-scale bulk generation | T07 | Contracted throughput target met | Load report | RED |
| X08 | Webhooks/events | M17-M23 | Signed/retryable/idempotent events | Contract/reliability tests | RED |
| X09 | Analytics | C15 | Tenant-safe operational metrics without leaking restricted data | Security/data tests | RED |
| X10 | Configurable DPP schema engine | F11,C15 | Versioned schemas and migration rules validated | Schema tests | RED |
| X11 | Additional sector modules | X10 | Each module begins only after applicable final rules are traced | Separate evidence pack | BLOCKED |
| X12 | Partner/reseller administration | C15 | Delegated administration has explicit tenant boundaries | RBAC tests | RED |
| X13 | Enterprise SSO/SCIM | M03,C15 | SSO/SCIM lifecycle passes enterprise test tenant | Integration tests | RED |
| X14 | HA/regional options | C15 | Contracted availability/data-region requirements are tested | DR/availability report | RED |

## Evidence log

Append evidence here only after verification.

| Date | Task | Evidence | Result |
|---|---|---|---|
| 2026-09-17 | F01 | GitHub connector verified `SoulFlameAdmin/DPPautopilot`, default branch `main`, admin/write permissions | PASS |
| 2026-09-17 | F02 | Root inventory verified static prototype files only at audit start | PASS |
| 2026-09-17 | F03 | Canonical plan created at `docs/MASTER_AUTOPILOT_PLAN.md` | PASS |
| 2026-09-17 | F05 | `scripts/validate_repo.py` validated worker status contract in GitHub Actions | PASS |
| 2026-09-17 | F07 | Vercel inventory contains no project linked to `SoulFlameAdmin/DPPautopilot`; project `dpp` links to different repo `SoulFlameAdmin/dpp` | BLOCKED |
| 2026-09-17 | F09 | GitHub Actions `validate` completed successfully for commit `9f3892b26176da8a9aac8063f3f528906840d18c` | PASS |
| 2026-09-17 | F10 | `docs/ENVIRONMENT_POLICY.md` committed; CI PASS on `eb40704890ececa3df3e2f519962e82d0570c39e` | PASS |
| 2026-09-17 | F11 | Requirements baseline committed with Article 77/78, Annex XIII and Registry traceability; implementation/schema crosswalk incomplete | PARTIAL |
| 2026-09-17 | F12 | CI validator enforces non-empty concrete evidence text for GREEN tasks | PASS |
| 2026-09-17 | F13 | Supabase inventory exposes `soulflame-twins`; no verified DPP Autopilot binding | BLOCKED |
| 2026-09-17 | F14 | `.gitignore`, security hygiene scanner and security baseline committed; CI PASS on `5747153bc6b94589a6e805e9d8790dd6e304654c` | PASS |
