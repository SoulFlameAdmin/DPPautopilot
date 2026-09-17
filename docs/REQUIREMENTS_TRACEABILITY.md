# DPP Autopilot — Requirements Traceability Matrix

**Status:** implementation traceability contract complete for the current engineering baseline; regulatory watch items remain explicitly pending.  
**Last reviewed:** 2026-09-17.  
**Machine-readable implementation contract:** `data/dpp-field-catalog.json`.  
**Automated coverage:** `scripts/validate_field_catalog.py`.

## Authoritative sources and current-law snapshot

1. Regulation (EU) 2023/1542 on batteries and waste batteries. The current consolidated EUR-Lex version available on 2026-09-17 is dated **2026-08-13**.
2. Regulation (EU) 2024/1781 (ESPR), including the amendment adding Article 77(10) to the Batteries Regulation: the economic operator must upload the battery unique identifier to the DPP Registry.
3. European Commission — Digital Product Passport for Batteries.
4. European Commission — DPP Registry and current technical/user guidance.

Current Commission guidance reviewed on 2026-09-17 states that the DPP Registry became operational on **20 July 2026** together with a testing environment; the battery passport becomes mandatory on **18 February 2027** for the relevant battery categories. The Commission Batteries page identifies **Digital Batteries Passport — data point by category, last update 15 August 2026** as the current battery data-point guidance. The broader DPP timeline still indicates a battery-specific implementing act on detailed access rights for **Q4 2026**; DPP Autopilot therefore records that item as pending and does not treat future access-right details as already adopted.

This document is engineering traceability, not legal advice. Production compliance claims require a fresh regulatory review and qualified legal/compliance sign-off.

## Traceability implementation rule

Every catalog entry in `data/dpp-field-catalog.json` contains:

- a concrete canonical field path;
- one or more requirement IDs;
- authoritative source reference;
- access class;
- data type and required/conditional declaration;
- target DB field/table;
- target API field;
- target UI field.

`python scripts/validate_field_catalog.py` fails CI if a field loses its source, access class, requiredness, or DB/API/UI target, or if required coverage disappears for Annex VI Part A, Annex XIII public, legitimate-interest, authority-only, or individual-battery requirements.

The DB/API/UI targets are a versioned engineering contract. Their later physical implementation is tracked separately by M04/M09/M17-M20; F11 verifies traceability, not completion of those dependent implementation tasks.

## System-level obligations

| Req ID | Requirement | Source | Implementation contract | Verification |
|---|---|---|---|---|
| SYS-001 | Passport required for in-scope LMT, >2 kWh industrial and EV batteries from 2027-02-18 | Art. 77(1) | `model.identification.category` + scope rules | Catalog validation + later unit/acceptance test |
| SYS-002 | Passport contains model-level and individual-battery information | Art. 77(2), Annex XIII | Separate `model.*` and `item.*` namespaces | Catalog validation + later schema/API tests |
| SYS-003 | Public, authority-only and legitimate-interest access classes are distinct | Art. 77(2), Annex XIII | Field `access` classification | Catalog validation + later security matrix |
| SYS-004 | Passport accessible through QR linked to unique identifier | Art. 77(3) | `item.unique_identifier` + QR/public route contract | Catalog validation + later E2E scan test |
| SYS-005 | Information must be accurate, complete and up to date | Art. 77(4) | Requiredness/types + validation/version/audit tasks | Catalog validation + later integration tests |
| SYS-006 | Data uses open standards; interoperable, machine-readable, structured, searchable | Art. 77(5), Art. 78 | Versioned JSON/API schema contract | Contract/export tests |
| SYS-007 | Access and modification rights must be restricted | Art. 78(f) | Access classes + RBAC/RLS/API projection targets | Security tests |
| SYS-008 | Authentication, reliability and integrity must be ensured | Art. 78(g) | Auth/audit/constraints targets | Security/integration tests |
| SYS-009 | High security/privacy and fraud avoidance required | Art. 78(h) | Security/rate-limit/logging/privacy tasks | Security acceptance |
| SYS-010 | Registry registration/workflow required by current DPP architecture | Article 77(10) + Commission Registry | Registry identifier/metadata contract | Registry test evidence |

## Annex VI Part A — explicit public identification/label fields

| Req ID | Required concept | Source | Canonical field |
|---|---|---|---|
| A6-001 | Manufacturer identification and contact information | Annex VI Part A(1), Art. 38(7) | `model.identification.manufacturer.*` |
| A6-002 | Battery category and battery/model identification | Annex VI Part A(2), Art. 38(6) | `model.identification.category`, `model.identification.model_id` |
| A6-003 | Place of manufacture | Annex VI Part A(3) | `model.identification.place_of_manufacture` |
| A6-004 | Date of manufacture (month/year) | Annex VI Part A(4) | `model.identification.date_of_manufacture` |
| A6-005 | Weight | Annex VI Part A(5) | `model.physical.weight_kg` |
| A6-006 | Capacity | Annex VI Part A(6) | `model.rated_capacity_ah` |
| A6-007 | Chemistry | Annex VI Part A(7) | `model.composition.chemistry` |
| A6-008 | Hazardous substances other than Hg/Cd/Pb | Annex VI Part A(8) | `model.composition.hazardous_substances` |
| A6-009 | Usable extinguishing agent | Annex VI Part A(9) | `model.safety.usable_extinguishing_agent` |
| A6-010 | Critical raw materials above the stated threshold | Annex VI Part A(10) | `model.composition.critical_raw_materials` |

## Annex XIII — publicly accessible model information

| Req ID | Canonical concept | Source | Canonical implementation field/group |
|---|---|---|---|
| PUB-001 | Annex VI Part A identification/label information | Annex XIII 1(a) | Explicit `A6-001`–`A6-010` paths above |
| PUB-002 | Material composition and chemistry | Annex XIII 1(b) | `model.composition.chemistry` |
| PUB-003 | Hazardous substances other than Hg/Cd/Pb | Annex XIII 1(b) | `model.composition.hazardous_substances` |
| PUB-004 | Critical raw materials | Annex XIII 1(b) | `model.composition.critical_raw_materials` |
| PUB-005 | Carbon-footprint information | Annex XIII 1(c), Art. 7 | `model.carbon_footprint` |
| PUB-006 | Responsible-sourcing information | Annex XIII 1(d), Art. 52(3) | `model.responsible_sourcing` |
| PUB-007 | Recycled-content information | Annex XIII 1(e), Art. 8(1) | `model.recycled_content` |
| PUB-008 | Share of renewable content | Annex XIII 1(f) | `model.renewable_content_share` |
| PUB-009 | Rated capacity (Ah) | Annex XIII 1(g) | `model.rated_capacity_ah` |
| PUB-010 | Minimum/nominal/maximum voltage and temperature ranges | Annex XIII 1(h) | `model.voltage` |
| PUB-011 | Original power capability and limits / relevant temperature range | Annex XIII 1(i) | `model.power_capability` |
| PUB-012 | Expected lifetime in cycles and reference test | Annex XIII 1(j) | `model.expected_lifetime` |
| PUB-013 | Capacity threshold for exhaustion (EV batteries) | Annex XIII 1(k) | `model.exhaustion_capacity_threshold` |
| PUB-014 | Non-use temperature range and reference test | Annex XIII 1(l) | `model.storage_temperature` |
| PUB-015 | Commercial warranty calendar-life period | Annex XIII 1(m) | `model.warranty_calendar_life` |
| PUB-016 | Initial and 50%-cycle-life round-trip energy efficiency | Annex XIII 1(n) | `model.energy_efficiency` |
| PUB-017 | Internal cell and pack resistance | Annex XIII 1(o) | `model.internal_resistance` |
| PUB-018 | C-rate of relevant cycle-life test | Annex XIII 1(p) | `model.c_rate_test` |
| PUB-019 | Required marking information | Annex XIII 1(q), Art. 13(4)-(5) | `model.markings` |
| PUB-020 | EU declaration of conformity | Annex XIII 1(r), Art. 18 | `model.eu_declaration_of_conformity` |
| PUB-021 | Waste prevention/management information | Annex XIII 1(s), Art. 74(1)(a)-(f) | `model.waste_information` |

## Annex XIII — legitimate-interest model information

| Req ID | Canonical concept | Source | Canonical implementation field/group |
|---|---|---|---|
| LIM-001 | Detailed cathode/anode/electrolyte composition | Annex XIII 2(a) | `model.restricted_composition` |
| LIM-002 | Component part numbers and replacement-source contacts | Annex XIII 2(b) | `model.spares` |
| LIM-003 | Exploded diagrams/cell locations | Annex XIII 2(c) | `model.disassembly` + evidence references |
| LIM-004 | Disassembly sequences | Annex XIII 2(c) | `model.disassembly` |
| LIM-005 | Fastening techniques | Annex XIII 2(c) | `model.disassembly` |
| LIM-006 | Required disassembly tools | Annex XIII 2(c) | `model.disassembly` |
| LIM-007 | Damage-risk warnings | Annex XIII 2(c) | `model.disassembly` |
| LIM-008 | Cell quantity/layout | Annex XIII 2(c) | `model.disassembly` |
| LIM-009 | Safety measures | Annex XIII 2(d) | `model.safety_measures` |

## Annex XIII — authority-only information

| Req ID | Canonical concept | Source | Canonical implementation field/group |
|---|---|---|---|
| AUTH-001 | Test-report results proving compliance | Annex XIII 3 | `model.compliance_test_reports` |

## Annex XIII — individual battery information

| Req ID | Canonical concept | Source | Canonical implementation field/group |
|---|---|---|---|
| ITEM-001 | Performance/durability values at market placement and status changes | Annex XIII 4(a), Art. 10(1) | `item.performance_history` |
| ITEM-002 | State of health | Annex XIII 4(b), Art. 14 | `item.state_of_health` |
| ITEM-003 | Status: original / repurposed / re-used / remanufactured / waste | Annex XIII 4(c) | `item.lifecycle_status` |
| ITEM-004 | Charge/discharge cycle count | Annex XIII 4(d) | `item.usage.cycles` |
| ITEM-005 | Negative events / accidents | Annex XIII 4(d) | `item.usage.events` |
| ITEM-006 | Periodic operating environmental conditions incl. temperature | Annex XIII 4(d) | `item.telemetry.environment` |
| ITEM-007 | State of charge history | Annex XIII 4(d) | `item.telemetry.state_of_charge` |

## Registry traceability

| Req ID | Requirement | Current evidence | Implementation contract |
|---|---|---|---|
| REG-001 | Registry is operational and has a separate testing environment | Commission Registry pages reviewed 2026-09-17 | Environment separation remains mandatory |
| REG-002 | Organisation enrolment precedes registration workflow | Commission Registry user guidance | Planned onboarding/registry workflow |
| REG-003 | Unique product/passport identifiers and metadata are registered | Article 77(10) + Commission Registry | `item.unique_identifier` + registry adapter target |
| REG-004 | Live submission must not be claimed from test-only evidence | Engineering control | Master-plan evidence protocol |

## Regulatory watch list

The following items are deliberately **not** treated as completed law/implementation:

- the Commission timeline indicates a battery access-right implementing act for Q4 2026; when adopted, access-class rules must be re-reviewed;
- Commission battery data-point guidance can be revised; the current page says to check for newer versions;
- remaining harmonised DPP standards and future Commission technical guidance must be incorporated when officially published/applicable;
- live Registry integration remains RED until real operator credentials and live/test workflow evidence exist.

These watch items are explicit change-management inputs rather than missing F11 traceability rows. CI coverage ensures the current engineering contract cannot silently lose the presently identified mandatory field groups.
