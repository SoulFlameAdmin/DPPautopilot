# BG Battery Pilot v1 — Managed Pilot

**Commercial target:** Bulgarian importers, distributors and integrators of industrial/energy-storage batteries above 2 kWh.

**Regulatory scope:** Regulation (EU) 2023/1542, Article 77 and Annex XIII. The battery-passport obligation applies from 18 February 2027 to LMT batteries, industrial batteries above 2 kWh and EV batteries. This pilot is an engineering/compliance-support service, not legal certification or legal advice.

## Why this pilot exists

The full DPP Autopilot SaaS continues toward self-service authentication, tenant/RBAC and production acceptance. BG Battery Pilot v1 is the narrower sellable path: a customer supplies an agreed dataset, SoulFlame/DPP Autopilot validates and imports it, generates passport records and QR links, and returns an evidence-backed pilot package for customer UAT.

This avoids falsely presenting unfinished self-service features as production-ready while allowing a real Bulgarian company to test its own battery data now.

## Pilot customer profile

Primary: Bulgarian economic operator placing industrial/ESS batteries >2 kWh on the EU market or putting them into service.

Good first-fit data sources:
- manufacturer specification sheets;
- EU declaration of conformity;
- model composition/chemistry data;
- capacity, voltage, power, lifetime and temperature data;
- serial/unique identifiers for individual battery units;
- CSV/ERP export where available.

EV/OEM and LMT are supported by the core data model but are not the first commercial pilot target.

## Managed pilot flow

1. Customer provides the intake CSV and supporting public documents.
2. DPP Autopilot maps the source columns to canonical battery fields.
3. Validation produces completeness and missing-field findings.
4. Accepted model/item rows are imported.
5. A passport record and unique identifier are produced per accepted battery item.
6. QR resolves to the public-safe passport route.
7. Customer reviews the output and signs pilot UAT findings.
8. Missing supplier data is returned as an actionable remediation list.

## Default acceptance dataset

The acceptance test uses at least:
- 1 real customer organisation;
- 1 real in-scope industrial/ESS battery model >2 kWh;
- 10 individual battery items/serials;
- supporting public compliance/specification documents sufficient to populate the public Annex XIII subset available to the customer.

The customer may provide more models/items, but these minimums define a small deterministic pilot acceptance.

## Deliverables

- canonical model + item dataset;
- import/mapping report;
- field completeness and missing-data report;
- public passport URL(s);
- scannable QR per accepted item;
- version/audit evidence available from the implemented platform capabilities;
- export/evidence package from the implemented export surface;
- UAT report: PASS / PARTIAL / BLOCKED per acceptance criterion.

## Privacy / access boundary for v1

The managed pilot defaults to **public and public-identifier data only** for customer-visible passport output. Annex XIII legitimate-interest and authority-only content is not requested for the first paid pilot unless the corresponding authenticated access-control path has completed acceptance.

This keeps the first real-customer pilot inside the platform capabilities that can be evidenced today and prevents accidental publication of restricted battery information.

## Not claimed by this pilot

- no claim of legal certification;
- no claim that DPP Autopilot replaces the customer's legal/compliance responsibility;
- no live EU Registry submission unless separately evidenced with valid operator/test credentials;
- no authority-only or legitimate-interest disclosure without accepted access controls;
- no claim that future implementing acts are already final.

## Sellable-pilot exit gate

BG Battery Pilot v1 becomes **SALES READY** only when all of the following have concrete evidence:

- BG01 intake contract validates against the canonical field catalog;
- BG02 real customer dataset imports without silent row loss;
- BG03 public/private projection test shows zero restricted-field leakage;
- BG04 10/10 pilot item identifiers are unique;
- BG05 10/10 QR codes resolve to the intended passport URLs;
- BG06 completeness/missing-data report is generated;
- BG07 export/evidence package is generated;
- BG08 production/preview route used for UAT is READY and smoke-tested;
- BG09 customer UAT is recorded;
- BG10 commercial offer clearly states scope, exclusions, responsibilities and support.

Until BG09 exists, the product may be demonstrated and offered as a **paid pilot**, but not represented as customer-proven production rollout.

## Immediate platform dependency

M01 password-recovery acceptance remains blocked by Supabase Auth URL Configuration. The application already requests the DPP recovery URL, but Supabase must allow the exact production redirect; otherwise Auth falls back to the configured Site URL. This does not block managed-pilot data preparation, but it blocks calling the self-service SaaS onboarding fully accepted.

## Authoritative references

- EUR-Lex Regulation (EU) 2023/1542: https://eur-lex.europa.eu/eli/reg/2023/1542/oj
- Supabase Auth redirect URL documentation: https://supabase.com/docs/guides/auth/redirect-urls
