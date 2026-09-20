# DPP Autopilot Privacy Data Inventory

> Scope: DPP Autopilot only. The bound Supabase project is shared with other applications; non-`dpp_*` tables are explicitly excluded from this inventory.

R07 remains **RED/PARTIAL** until M01–M13 are fully accepted and retention/deletion decisions are implemented. This document records the data currently designed or observed for DPP, without claiming a completed legal retention policy.

## Processors and external recipients

| Party | Role | DPP data | Current status |
| --- | --- | --- | --- |
| Supabase | Platform/processor | Auth identity, DPP Postgres records, evidence metadata and private object bytes | Active for Auth/Postgres/Storage/Edge; final authenticated evidence lifecycle acceptance incomplete |
| Vercel | Application runtime/processor | HTTP request metadata and DPP API payloads | Deployment evidence exists; final production acceptance remains blocked/incomplete |
| GitHub | Development/CI processor | Source and synthetic test data only | Production personal data is prohibited in repo/CI |
| EU DPP registry provider | Planned external recipient | Approved registry request payload + submission metadata | Live provider integration not accepted |

## Data inventory

| Data area | Purpose | Location | Personal/business content | Retention state |
| --- | --- | --- | --- | --- |
| Auth identity | Login, recovery, account security | Supabase Auth `auth.users` | Email/phone when configured, password hash, auth/security metadata | Account-lifecycle behavior; DPP deletion/retention policy pending |
| Tenant authorization | Membership, roles, active tenant | `dpp_organization_members`, `dpp_user_tenant_context` | User UUID + organization/role | No time expiry; lifecycle/cascade only; policy pending |
| Organization metadata | Tenant identity/routing | `dpp_organizations` | Business name/slug | Persists to organization deletion; policy pending |
| Battery product records | Canonical model/item data | `dpp_battery_models`, `dpp_battery_items` | Product/business data + creator user UUID | No time expiry; policy pending |
| Passports/history | Public/private DPP projection and history | `dpp_passports`, `dpp_passport_versions` | Regulatory product data, tenant-confidential payload, actor UUID | Version history persists; period pending |
| Import staging | Mapping/validation/transactional import | `dpp_import_mappings`, `dpp_import_runs`, `dpp_import_rows` | Product/business staging + creator UUID | Owner/admin terminal `invalid`/`committed` purge after minimum 30 days is implemented; final policy acceptance pending |
| Registry submissions | External registry workflow/retry evidence | `dpp_registry_submissions` | Request/response payload, refs/errors, actor UUID | Operational/legal period pending |
| Evidence | Evidence integrity and attachment metadata | `dpp_evidence_attachments` + private `dpp-evidence` Storage via caller-JWT `dpp-evidence-object` Edge Function | Filenames/metadata/files may contain personal or confidential data | Pre-upload size/SHA-256/type integrity is deployed; final authenticated upload→download→delete acceptance and retention period remain pending |
| Audit | Accountability and security trail | `dpp_audit_log` | Actor UUID + before/after snapshots | Append-only; audit-safe retention/deletion exception pending |
| App binding | DPP namespace binding | `dpp_app_binding` | Non-personal configuration | Application binding lifetime |
| Rate-limit metadata | Abuse prevention | Process-local API memory + `dpp_rate_limit_buckets` for shared authenticated counters | Truncated SHA-256 network/credential bucket digests + counters/window timestamps; raw IP/bearer values are not stored | Local buckets are pruned/capped; shared rows older than reset+10 min are opportunistically deleted; deployed/public distributed acceptance pending |

## Data minimization rules

- Flexible `canonical_data`, passport private payloads, import JSON, registry payloads and evidence metadata must not become general-purpose personal-data containers.
- Public passport responses remain restricted by the M10 classification policy and HTTP allowlist.
- Raw bearer credentials must never be persisted in rate-limit keys, logs or evidence.
- CI/repository fixtures must remain synthetic and must not contain production personal data.
- Evidence filenames/files can expose personal data; production acceptance requires explicit minimization/redaction and deletion rules.

## Retention/deletion gaps before GREEN

- Terminal import staging cleanup is implemented for `invalid`/`committed` runs older than 30 days; final accepted retention policy and operational scheduling remain pending.
- Define passport/version retention and rules for regulatory history.
- Define registry submission retention and external-recipient terms.
- M13 private Storage/Edge integrity controls are deployed; complete the real authenticated upload→download/content verification→delete lifecycle and accepted evidence retention/deletion rules.
- Define audit-safe deletion/retention exceptions for immutable snapshots.
- R08 now has retention status, terminal import purge, bounded evidence-byte export and owner/admin non-destructive deletion-impact preview; destructive organization/user deletion remains intentionally disabled pending accepted rules.
- Complete R05 runtime wiring for the shared authenticated limiter and define a safe distributed identity path for anonymous public passport traffic.

## Shared Supabase boundary

The live Supabase project contains unrelated non-DPP application tables. DPP migrations, APIs, exports, tests and this inventory must remain restricted to the `dpp_*` namespace plus the required `auth.users` identity linkage and private `dpp-evidence` object storage.


## Current lifecycle precursor

- `dpp_api_retention_status()` reports active-tenant retention blockers.
- `dpp_api_purge_import_staging(timestamptz)` implements owner/admin-only terminal staging purge with a 30-day minimum.
- `dpp_api_org_deletion_impact()` is owner/admin-only and non-destructive: it reports tenant row counts, evidence declared bytes, active tenant contexts, Auth-user boundary and blocker codes while keeping destructive deletion unavailable.
- `GET /api/export?include_evidence=1` provides a bounded integrity-checked evidence-byte export precursor; exhaustive large-tenant packaging/streaming acceptance remains pending.
