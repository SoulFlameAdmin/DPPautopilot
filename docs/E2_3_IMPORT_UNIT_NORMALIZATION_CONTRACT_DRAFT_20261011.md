# E2.3 source-unit normalization contract — design draft

This is a design contract only. No production behavior is authorized or claimed.

## Problem

Canonical paths encode canonical units (`Ah`, `kg`, `V`, `%`, `W`, `ohm`, `cycles`, `years`, `degC`), but the current CSV/XLSX import mapping stores only `source_header -> canonical_path`. That is insufficient to prove that a source value was expressed in the canonical unit or correctly converted before staging.

Examples that must not be guessed:

- `20000 mAh` mapped directly to `model.rated_capacity_ah` must not become `20000 Ah`;
- `12800 g` must not become `12800 kg`;
- `48000 mV` must not become `48000 V`;
- `0.93` must not silently become either `0.93%` or `93%` without an explicit source-unit/representation decision;
- `68 mΩ` must not become `68 ohm`.

## Proposed versioned record

For every mapped unit-bearing value, retain a normalization record beside the staged row or in a tenant-scoped evidence table:

```json
{
  "contract_version": "dpp-unit-normalization-v1",
  "canonical_path": "model.rated_capacity_ah",
  "source_column": "capacity_mAh",
  "source_value": "20000",
  "source_unit": "mAh",
  "canonical_unit": "Ah",
  "conversion_rule": "mAh_to_Ah_divide_1000",
  "canonical_value": 20,
  "mapping_profile_id": null,
  "source_ref": "upload:<server-issued-id>",
  "actor_review_required": false
}
```

## Verification rules

1. The canonical path must exist in the locked schema/matrix version used by the import.
2. The canonical unit must equal the schema/matrix unit for that path.
3. Source unit must come from an explicit allowlist for that canonical dimension.
4. Conversion is performed or recomputed server-side using a named versioned deterministic rule.
5. The server compares the recomputed value with the submitted canonical value; mismatch fails closed.
6. Unknown/ambiguous units do not default to the canonical unit.
7. Percent-like values require an explicit representation (`percent_0_100` vs another representation); no magnitude heuristic such as `<=1 means fraction` is allowed.
8. Original source value and source reference are preserved for evidence/audit.
9. Conversion metadata does not make a value legally verified; source/provenance and human review rules remain separate.

## Initial deterministic conversions suitable for engineering review

- `mAh -> Ah`: divide by 1000
- `Ah -> Ah`: identity
- `g -> kg`: divide by 1000
- `kg -> kg`: identity
- `mV -> V`: divide by 1000
- `V -> V`: identity
- `mW -> W`: divide by 1000
- `kW -> W`: multiply by 1000
- `W -> W`: identity
- `mΩ -> ohm`: divide by 1000
- `ohm -> ohm`: identity
- `cycles -> cycles`: identity, integer and non-negative
- `years -> years`: identity
- `% -> %`: identity, bounded by the field contract

Temperature conversion (`°F -> °C`), calendar-period conversion, C-rate semantics and field-specific compound objects require separate review before inclusion.

## Storage / API implications

The current saved mapping profile schema only stores string targets. A production implementation needs a versioned mapping shape that can carry source-unit and conversion metadata without breaking existing profiles. The import RPC must not rely on browser-generated metadata as authoritative; the trusted boundary must validate or recompute it.

Adding a database migration for this contract would change the locked C04 pending-migration set. That requires an explicit owner decision before any migration is added to the release/rehearsal plan.

Status: **DESIGN READY FOR REVIEW, IMPLEMENTATION BLOCKED ON TRUST-MODEL / C04 SCOPE DECISION**.
