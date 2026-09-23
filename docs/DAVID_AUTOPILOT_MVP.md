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

## Next slices

1. Feed the planner from authenticated model/item/import API snapshots instead of demo fixtures.
2. Add source adapters for ERP/BMS/PLM and evidence documents.
3. Add a supplier-request queue with draft -> approve -> send -> await -> ingest states.
4. Add evidence extraction with provenance and confidence, never silent auto-acceptance.
5. Add registry submission orchestration behind explicit policy/approval.
6. Expose the queue in the product UI with audit events and retry state.
