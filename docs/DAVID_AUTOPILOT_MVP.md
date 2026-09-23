# DAVID DPP Autopilot MVP

## Goal

Turn DPP completeness gaps into a deterministic, evidence-backed action queue that DAVID can execute safely in stages.

The MVP does **not** claim autonomous legal compliance. It does not send supplier messages, publish passports, submit to a registry, or make unsupported compliance claims without an explicit approval path.

## First vertical slice

`scripts/david_autopilot.py` consumes:

- `data/dpp-field-catalog.json` — canonical field requirement/evidence metadata;
- a battery fixture or future API snapshot;
- `data/david-autopilot-policy.json` — source routing, priority and approval gates.

It produces:

- current completeness;
- one deterministic action per missing required field;
- the likely source system/evidence source;
- safe-local vs approval-gated execution mode;
- regulatory/source evidence and UI/API/DB targets;
- a deterministic `nextAction`.

## Execution boundary

Safe local automation may inspect or transform already-authorized local/internal data.

Approval is required before actions with external or compliance-significant side effects, including supplier outreach, public publishing, registry submission, destructive changes, or unsupported compliance claims.

## Authenticated API snapshot bridge

The planner can now consume a caller-supplied snapshot of authenticated DPP API responses instead of a synthetic demo fixture.

Supported input surfaces:

- `models.data[]` from `GET /api/models`;
- `items.data[]` from `GET /api/items`;
- optional `import.data` / `imports.data` metadata from the authenticated import API.

The bridge selects a model/item deterministically, verifies the item belongs to the selected model, maps only known API fields into missing canonical paths, and preserves canonical data as the source of truth. Snapshot objects containing credential-like fields such as Authorization/access tokens are rejected so authentication material is never accepted as planner input.

CLI example:

```bash
python scripts/david_autopilot.py --api-snapshot snapshot.json --output plan.json
```

Optional `--model-id`, `--item-id`, and `--item-index` selectors make the target explicit. The generated plan records only non-secret provenance identifiers/status and keeps the existing approval gates unchanged.

## Next slices

1. Add source adapters for ERP/BMS/PLM and evidence documents.
2. Add a supplier-request queue with draft -> approve -> send -> await -> ingest states.
3. Add evidence extraction with provenance and confidence, never silent auto-acceptance.
4. Add registry submission orchestration behind explicit policy/approval.
5. Expose the queue in the product UI with audit events and retry state.
