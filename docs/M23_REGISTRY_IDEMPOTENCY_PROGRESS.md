# M23 — Registry Submission Idempotency Extension

Status: **PARTIAL — master task remains RED**

This slice extends M23 coverage over the already-GREEN M15/M16 registry workflow.

Implemented:

- optional `idempotency_key` on registry submissions
- unique scope: organization + provider + environment + idempotency key
- `dpp_create_registry_submission(...)` for safe idempotent creation
- exact duplicate request returns the existing submission with `already_exists=true`
- reuse of the same key with different item/passport/payload fails closed
- no client role execution grant is introduced

A pre-fix runtime probe proved that duplicate registry submissions with identical request data could be inserted as separate rows.

M23 remains RED because M17-M19 are still RED; API-level duplicate/conflicting write behavior must still be implemented and covered.
