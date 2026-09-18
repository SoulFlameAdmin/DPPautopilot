# M22 — Validation / Error Contract Progress

Status: **PARTIAL — master task remains RED**

This dependency-safe slice defines a stable machine-readable error contract for the already-GREEN M20 transactional import boundary.

Implemented custom PostgreSQL SQLSTATE codes:

- `DP001` — import not found
- `DP002` — import has no staged rows
- `DP003` — import is not committable
- `DP004` — staged row still has validation errors
- `DP005` — normalized identity fields are missing
- `DP006` — committed row count mismatch
- `DP007` — committed import state is inconsistent
- `DP008` — duplicate battery identifier

The semantic mapping and intended future HTTP status are versioned in `data/import-error-contract.json`. The future M17-M19 API layer must preserve these semantics in its machine-readable response body.

M22 is **not GREEN** yet because M17-M19 are RED and no real API currently exposes these codes/messages.
