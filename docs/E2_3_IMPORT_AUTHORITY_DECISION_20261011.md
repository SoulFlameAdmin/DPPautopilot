# Owner decision required: authoritative import validation

Decision needed before E2.3 import integrity can be closed.

**Option A — database-derived validation**
Keep tenant-scoped authenticated RPCs, but derive import validation inside PostgreSQL from normalized canonical data and treat caller `validation_errors` as advisory only.

Pros: preserves current tenant/RBAC architecture and direct Supabase model. Cons: requires a new/revised migration and duplicated/versioned validation logic at the database boundary.

**Option B — server-only import writes**
Revoke authenticated execution of import create/validate/commit RPCs and allow only a trusted server to stage normalized data after end-user tenant/actor authorization.

Pros: one application validation boundary can own canonical normalization. Cons: changes authentication/secrets architecture, requires server actor propagation/audit and a separate security review.

Either option must also add versioned source-unit conversion evidence. HTTP-only validation is not sufficient while direct authenticated RPC execution remains available.

Current recommendation for review: prefer **Option A** if the product intends Supabase RPCs to remain a supported authenticated data API; otherwise Option B is cleaner only if direct client RPC access is intentionally removed everywhere, not just for imports.

No option is approved by this document. No production migration or ACL change is authorized.
