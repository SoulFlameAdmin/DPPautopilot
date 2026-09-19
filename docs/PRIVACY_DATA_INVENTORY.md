# DPP Autopilot Privacy Data Inventory

> Scope: DPP Autopilot only. The bound Supabase project is shared with other applications; non-`dpp_*` tables are explicitly excluded from this inventory.

R07 remains **RED/PARTIAL** until M01–M13 are fully accepted and retention/deletion decisions are implemented. This document records the data currently designed or observed for DPP, without claiming a completed legal retention policy.

## Processors and external recipients

| Party | Role | DPP data | Current status |
| --- | --- | --- | --- |
| Supabase | Platform/processor | Auth identity, DPP Postgres records, planned evidence objects | Active for Auth/Postgres; evidence object lifecycle incomplete |
| Vercel | Planned app runtime/processor | HTTP request metadata and DPP API payloads | Production runtime not currently proven |
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
| Import staging | Mapping/validation/transactional import | `dpp_import_mappings`, `dpp_import_runs`, `dpp_import_rows` | Product/business staging + creator UUID | No automatic cleanup; bounded staging retention required |
| Registry submissions | External registry workflow/retry evidence | `dpp_registry_submissions` | Request/response payload, refs/errors, actor UUID | Operational/legal period pending |
| Evidence | Evidence integrity and attachment metadata | `dpp_evidence_attachments`; planned `dpp-evidence` Storage bucket | Filenames/metadata/files may contain personal or confidential data | Object lifecycle/deletion not yet accepted |
| Audit | Accountability and security trail | `dpp_audit_log` | Actor UUID + before/after snapshots | Append-only; audit-safe retention/deletion exception pending |
| App binding | DPP namespace binding | `dpp_app_binding` | Non-personal configuration | Application binding lifetime |
| Rate-limit metadata | Abuse prevention | Process-local API memory | Client IP + truncated bearer digest/counters | Non-durable; stale-window pruning follow-up required |

## Data minimization rules

- Flexible `canonical_data`, passport private payloads, import JSON, registry payloads and evidence metadata must not become general-purpose personal-data containers.
- Public passport responses remain restricted by the M10 classification policy and HTTP allowlist.
- Raw bearer credentials must never be persisted in rate-limit keys, logs or evidence.
- CI/repository fixtures must remain synthetic and must not contain production personal data.
- Evidence filenames/files can expose personal data; production acceptance requires explicit minimization/redaction and deletion rules.

## Retention/deletion gaps before GREEN

- Define bounded cleanup for import staging rows.
- Define passport/version retention and rules for regulatory history.
- Define registry submission retention and external-recipient terms.
- Complete M13 Storage lifecycle and evidence deletion behavior.
- Define audit-safe deletion/retention exceptions for immutable snapshots.
- Implement accepted organization/user deletion and export policy under R08.
- Add stale-window pruning to the process-local R05 limiter before production.

## Shared Supabase boundary

The live Supabase project contains unrelated non-DPP application tables. DPP migrations, APIs, exports, tests and this inventory must remain restricted to the `dpp_*` namespace plus the required `auth.users` identity linkage and planned `dpp-evidence` object storage.
