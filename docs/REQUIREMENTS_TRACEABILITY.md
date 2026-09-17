# DPP Autopilot — Requirements Traceability Matrix

**Status:** baseline; implementation mapping is incomplete until the canonical database/API schema exists.  
**Last reviewed:** 2026-09-17.

## Authoritative sources

1. Regulation (EU) 2023/1542, especially Article 77, Article 78 and Annex XIII: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1542
2. European Commission — Batteries / DPP implementation: https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/batteries_en
3. European Commission — DPP Registry: https://single-market-economy.ec.europa.eu/single-market/digital-product-passport/dpp-registry_en

The Commission states that the DPP Registry became operational on 20 July 2026 and provides a testing environment. The battery-passport obligation applies from 18 February 2027 to LMT batteries, industrial batteries above 2 kWh and EV batteries within the Regulation's scope. This document is engineering traceability, not legal advice.

## System-level obligations

| Req ID | Requirement | Source | Planned implementation | Verification |
|---|---|---|---|---|
| SYS-001 | Passport required for in-scope LMT, >2 kWh industrial and EV batteries from 2027-02-18 | Art. 77(1) | Scope/category validation and lifecycle rules | Unit + acceptance test |
| SYS-002 | Passport contains model-level and individual-battery information | Art. 77(2), Annex XIII | Separate `battery_models` and `battery_items` domains | Schema + API tests |
| SYS-003 | Public, authority-only and legitimate-interest access classes are distinct | Art. 77(2), Annex XIII 1-4 | Field-level access classification + RBAC/RLS/API projection | Security matrix |
| SYS-004 | Passport accessible through QR linked to unique identifier | Art. 77(3) | Identifier service + QR/public passport route | E2E scan test |
| SYS-005 | Information must be accurate, complete and up to date | Art. 77(4) | Validation, completeness rules, version history, audit | Unit/integration tests |
| SYS-006 | Data uses open standards; interoperable, machine-readable, structured, searchable | Art. 77(5), Art. 78 | Versioned JSON/API model; open export; no proprietary-only storage | Contract/export tests |
| SYS-007 | Access and modification rights must be restricted | Art. 78(f) | Auth + RBAC + RLS + server enforcement | Negative security tests |
| SYS-008 | Authentication, reliability and integrity must be ensured | Art. 78(g) | Auth, immutable audit, checks/constraints, signed integration where required | Security/integration tests |
| SYS-009 | High security/privacy and fraud avoidance required | Art. 78(h) | Security controls, rate limits, logging, privacy inventory | Security acceptance |
| SYS-010 | Registry registration/workflow is required by current DPP architecture | Commission DPP Registry resources | Registry adapter + test-environment workflow; no live claim until verified | Registry test evidence |

## Annex XIII — publicly accessible model information

These are canonical requirement concepts. Exact column names/types remain RED until the DB schema is implemented and reviewed.

| Req ID | Canonical concept | Source | Access | Planned domain field/group |
|---|---|---|---|---|
| PUB-001 | Annex VI Part A identification/label information | Annex XIII 1(a) | Public | `model.identification.*` |
| PUB-002 | Material composition and chemistry | Annex XIII 1(b) | Public | `model.composition.*` |
| PUB-003 | Hazardous substances other than Hg/Cd/Pb | Annex XIII 1(b) | Public | `model.composition.hazardous_substances[]` |
| PUB-004 | Critical raw materials | Annex XIII 1(b) | Public | `model.composition.critical_raw_materials[]` |
| PUB-005 | Carbon-footprint information | Annex XIII 1(c), Art. 7 | Public | `model.carbon_footprint.*` |
| PUB-006 | Responsible-sourcing information | Annex XIII 1(d), Art. 52(3) | Public | `model.responsible_sourcing.*` |
| PUB-007 | Recycled-content information | Annex XIII 1(e), Art. 8(1) | Public | `model.recycled_content.*` |
| PUB-008 | Share of renewable content | Annex XIII 1(f) | Public | `model.renewable_content_share` |
| PUB-009 | Rated capacity (Ah) | Annex XIII 1(g) | Public | `model.rated_capacity_ah` |
| PUB-010 | Minimum/nominal/maximum voltage and temperature ranges | Annex XIII 1(h) | Public | `model.voltage.*` |
| PUB-011 | Original power capability and limits / relevant temperature range | Annex XIII 1(i) | Public | `model.power_capability.*` |
| PUB-012 | Expected lifetime in cycles and reference test | Annex XIII 1(j) | Public | `model.expected_lifetime.*` |
| PUB-013 | Capacity threshold for exhaustion (EV batteries) | Annex XIII 1(k) | Public | `model.exhaustion_capacity_threshold` |
| PUB-014 | Non-use temperature range and reference test | Annex XIII 1(l) | Public | `model.storage_temperature.*` |
| PUB-015 | Commercial warranty calendar-life period | Annex XIII 1(m) | Public | `model.warranty_calendar_life` |
| PUB-016 | Initial and 50%-cycle-life round-trip energy efficiency | Annex XIII 1(n) | Public | `model.energy_efficiency.*` |
| PUB-017 | Internal cell and pack resistance | Annex XIII 1(o) | Public | `model.internal_resistance.*` |
| PUB-018 | C-rate of relevant cycle-life test | Annex XIII 1(p) | Public | `model.c_rate_test` |
| PUB-019 | Required marking information | Annex XIII 1(q), Art. 13(3)-(4) | Public | `model.markings.*` |
| PUB-020 | EU declaration of conformity | Annex XIII 1(r), Art. 18 | Public | `model.eu_declaration_of_conformity` |
| PUB-021 | Waste prevention/management information | Annex XIII 1(s), Art. 74(1)(a)-(f) | Public | `model.waste_information.*` |

## Annex XIII — legitimate-interest model information

| Req ID | Canonical concept | Source | Access | Planned field/group |
|---|---|---|---|---|
| LIM-001 | Detailed cathode/anode/electrolyte composition | Annex XIII 2(a) | Legitimate interest + Commission | `model.restricted_composition.*` |
| LIM-002 | Component part numbers and replacement-source contacts | Annex XIII 2(b) | Legitimate interest + Commission | `model.spares.*` |
| LIM-003 | Exploded diagrams/cell locations | Annex XIII 2(c) | Legitimate interest + Commission | evidence/document group |
| LIM-004 | Disassembly sequences | Annex XIII 2(c) | Legitimate interest + Commission | `model.disassembly.sequence` |
| LIM-005 | Fastening techniques | Annex XIII 2(c) | Legitimate interest + Commission | `model.disassembly.fasteners[]` |
| LIM-006 | Required disassembly tools | Annex XIII 2(c) | Legitimate interest + Commission | `model.disassembly.tools[]` |
| LIM-007 | Damage-risk warnings | Annex XIII 2(c) | Legitimate interest + Commission | `model.disassembly.warnings[]` |
| LIM-008 | Cell quantity/layout | Annex XIII 2(c) | Legitimate interest + Commission | `model.cell_layout.*` |
| LIM-009 | Safety measures | Annex XIII 2(d) | Legitimate interest + Commission | `model.safety_measures.*` |

## Annex XIII — authority-only information

| Req ID | Canonical concept | Source | Access | Planned field/group |
|---|---|---|---|---|
| AUTH-001 | Test-report results proving compliance | Annex XIII 3 | Notified bodies / market surveillance / Commission | protected evidence records |

## Annex XIII — individual battery information

| Req ID | Canonical concept | Source | Access | Planned field/group |
|---|---|---|---|---|
| ITEM-001 | Performance/durability values at market placement and status changes | Annex XIII 4(a), Art. 10(1) | Legitimate interest | `item.performance_history[]` |
| ITEM-002 | State of health | Annex XIII 4(b), Art. 14 | Legitimate interest | `item.state_of_health.*` |
| ITEM-003 | Status: original / repurposed / re-used / remanufactured / waste | Annex XIII 4(c) | Legitimate interest | `item.lifecycle_status` |
| ITEM-004 | Charge/discharge cycle count | Annex XIII 4(d) | Legitimate interest | `item.usage.cycles` |
| ITEM-005 | Negative events / accidents | Annex XIII 4(d) | Legitimate interest | `item.usage.events[]` |
| ITEM-006 | Periodic operating environmental conditions incl. temperature | Annex XIII 4(d) | Legitimate interest | `item.telemetry.environment[]` |
| ITEM-007 | State of charge history | Annex XIII 4(d) | Legitimate interest | `item.telemetry.state_of_charge[]` |

## Registry traceability

| Req ID | Requirement | Current evidence | Implementation status |
|---|---|---|---|
| REG-001 | Registry is operational and has a separate testing environment | European Commission DPP Registry page, reviewed 2026-09-17 | Source verified; integration RED |
| REG-002 | Organisation enrolment precedes registration workflow | Commission Registry user resources | Product workflow RED |
| REG-003 | Unique product/passport identifiers and metadata are registered | Commission Registry description + applicable implementing rules | Adapter/schema RED |
| REG-004 | Live submission must not be claimed from test-only evidence | Engineering control | Enforced by master-plan acceptance rules |

## Open traceability work before F11 can be GREEN

- Extract Annex VI Part A into explicit field-level rows rather than the `PUB-001` umbrella.
- Cross-check the latest consolidated Regulation and any delegated/implementing acts that changed Annex XIII or access rights.
- Map every requirement row to concrete DB column/API schema/UI field after M04/M09 are implemented.
- Map the six published DPP interoperability standards and the latest Registry technical documentation to API/data-carrier/storage requirements where licenses/public text allow.
- Add automated schema-to-requirement coverage so a required field cannot disappear silently.

Until those items are complete and tested, master task F11 remains `YELLOW`, not GREEN.
