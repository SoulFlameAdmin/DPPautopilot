# E2.3 import trust boundary review — 2026-10-11

Status: **BLOCKED for authoritative server validation**. This document records source-level behavior only. It is not evidence of a production exploit, legal compliance, or a completed E2.3 gate.

## Finding

The current import chain treats caller-provided normalized JSON and caller-provided `validation_errors` as more authoritative than the name `Server-side validation` in the manufacturer UI suggests.

### Browser normalization

`assets/csp/manufacturer-ops-inline-1.js` builds `normalized_model` and `normalized_item` in the browser. Generic numeric-looking strings are converted with `Number(...)`; there is no source-unit contract or server-recomputed conversion. A column containing mAh can therefore be mapped to the Ah target without enough evidence for the server to prove that conversion occurred.

The same browser code sends a caller-built `validation_errors` array. It also still exposes the legacy mapping target `item.state_of_health.percent`, while the locked LMT 71-point matrix represents state-of-health through specific fields such as remaining capacity, remaining power capability, remaining round-trip efficiency, self-discharge and ohmic resistance.

The browser's generic nested-path helper also means stored mapping paths are part of the client trust boundary. The saved-mapping RPC currently accepts arbitrary string values. A path containing prototype-chain segments such as `__proto__` must therefore never be allowed to flow from a tenant-shared stored mapping into the browser helper. This Draft keeps harmless legacy paths readable but rejects stored profiles containing `__proto__`, `prototype` or `constructor` path segments at the HTTP response-shape boundary. This is a source-level defense-in-depth finding, not a claim that such a malicious profile exists in production.

### HTTP boundary

At locked Stage-2 base SHA `0ecc7e4bb76aad55f97ef3536d003e0ac2a172ec`, `api/imports.js` only required object-shaped `normalized_model` / `normalized_item` and an optional array-shaped `validation_errors`. It forwarded those rows to `dpp_api_import_create`.

This Draft adds defense-in-depth validation before that forwarding step:

- commit-authoritative model/item identity checks and duplicate-identity consistency;
- current LMT matrix scalar type checks for supplied canonical fields;
- percent 0..100 and non-negative cycle domains;
- positive weight/capacity/C-rate/voltage checks when supplied;
- matrix-defined voltage ordering when the full ordered group is supplied;
- battery identifier printable/length checks;
- unknown LMT canonical paths rejected instead of persisted as free-form JSON;
- known complex array/object paths quarantined until field-specific schemas exist;
- duplicate battery identifiers rejected inside one staged batch;
- same model identifier with conflicting model data rejected instead of allowing row-order-dependent last-write-wins upserts;
- new saved mapping targets restricted to current catalog or locked 71-point paths;
- harmless retired legacy mapping targets remain readable, while prototype-chain path segments fail closed.

Partial imports remain partial: this validator does **not** require all 50 mandatory launch points before staging a model/item import.

## Authoritative database gap remains

The database path is still independently callable by an authenticated Supabase user:

1. `dpp_api_import_create` is granted to `authenticated` and stores the caller's `normalized_model`, `normalized_item` and `validation_errors`.
2. `dpp_validate_import` counts the stored `validation_errors`; it does not derive semantic validation from canonical JSON.
3. A run is marked `validated` when that caller-originated error count is zero.
4. `dpp_commit_import` then writes `normalized_model.canonical_data` and `normalized_item.canonical_data` to the model/item tables after identity checks.
5. `dpp_api_import_mapping_save` is also granted to `authenticated` and currently checks mapping keys/values only as strings, not against the locked canonical path set.

Therefore the new Vercel/API guard is **defense in depth, not authoritative closure**. A client that calls the Supabase RPC directly can bypass `api/imports.js`.

## Existing-model overwrite and concurrency gap

`dpp_commit_import` uses `ON CONFLICT (organization_id, model_identifier) DO UPDATE` and replaces `manufacturer_name`, `category` and the entire `canonical_data` document with the incoming row. There is no expected-version / `updated_at` compare-and-swap on this import path.

That creates two source-level integrity risks that are not closed by per-row validation:

- a partial import for an already-existing model can replace a richer existing model document with a smaller incoming canonical document, dropping fields that were not present in the import;
- two concurrent imports targeting the same model can race, with the later commit winning even when the earlier writer changed the model after the other import was prepared.

The Draft can prevent conflicting rows inside one submitted batch, but it cannot authoritatively protect the existing database row without a database-side compare/merge policy. E2.3 update/version testing therefore remains BLOCKED until import update semantics are explicitly defined and enforced.

## Required closure decision

One of these trust models must be selected and independently reviewed:

1. **Database-derived validation.** Keep authenticated tenant-scoped RPCs, but make PostgreSQL derive structural/canonical validation itself and treat caller error arrays as advisory only. The mapping-save RPC should validate canonical target paths at the same authoritative boundary. Import commit also needs an explicit existing-model policy, for example immutable model-on-import, merge-only with field provenance, or CAS-protected replacement. This requires a new migration or a revision to the migration plan.
2. **Server-only staging RPC.** Revoke direct authenticated execution of write/import RPCs and let a trusted server call them after validating the end-user actor/tenant. The trusted server would still need an authoritative existing-model concurrency policy; moving the call boundary alone does not solve lost updates. This changes the auth/secrets architecture and requires a separate security review.

Do not add a production migration casually. The locked C04 rehearsal currently names exactly 10 pending migrations. An additional import-hardening migration would change that set and invalidate the current rehearsal manifest until the owner explicitly accepts the new scope.

## Source-unit contract still required

Value-domain validation cannot prove correct normalization by itself. A valid-looking `20000` can still mean `20000 mAh` incorrectly stored as `20000 Ah`.

Before E2.3 can claim unit integrity, the import pipeline needs a versioned normalization record for every unit-bearing mapped value containing at least:

- canonical field path;
- original source value;
- declared source unit;
- canonical unit;
- conversion rule/version;
- converted canonical value;
- source column/document reference;
- actor/system that performed the mapping;
- review/approval evidence where ambiguity exists.

The server must recompute or verify deterministic conversions. Ambiguous or unknown source units must fail closed instead of guessing.

## Gate impact

- HTTP/browser defense-in-depth: testable in this Draft.
- Database authoritative semantic validation: **BLOCKED / owner architecture decision required**.
- Database authoritative mapping-path validation: **BLOCKED / owner architecture decision required**.
- Existing-model update/CAS policy: **BLOCKED / owner architecture decision required**.
- Source-unit normalization evidence: **BLOCKED / implementation required**.
- E2.3 overall: **not PASS**.
- C04: unchanged and RED; no production SQL, snapshot refresh, merge or deploy is authorized by this work.
