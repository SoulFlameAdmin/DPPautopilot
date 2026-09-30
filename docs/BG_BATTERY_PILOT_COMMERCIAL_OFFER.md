# BG Battery Pilot — Commercial Offer

**Offer type:** managed pilot for Bulgarian importers, distributors and integrators of industrial / energy-storage batteries above 2 kWh.

This is a **managed pilot** for Digital Product Passport engineering and compliance-support. It is **not legal certification**, not legal advice, and does not transfer the customer's regulatory responsibility to SoulFlame / DPP Autopilot.

## Scope

The pilot covers one agreed customer organisation, at least one in-scope battery model and an initial acceptance batch of at least 10 individual battery items. The first delivery path is intentionally managed: the customer provides an agreed dataset and supporting documents; DPP Autopilot maps, validates and prepares the passport outputs.

The default customer-visible output is limited to fields classified as `public` or `public_identifier`. Legitimate-interest and authority-only fields are excluded from the first pilot unless an authenticated access path has separately completed acceptance.

## Deliverables

- canonical model and item dataset for the accepted pilot batch;
- source-column mapping and import findings;
- completeness and missing-data report;
- unique identifier for each accepted battery item;
- public Battery Passport URL for each accepted item;
- scannable QR data carrier for each accepted item;
- public/restricted separation evidence;
- export/evidence package containing the pilot outputs and acceptance evidence;
- pilot UAT record with PASS / PARTIAL / BLOCKED findings.

## Customer responsibilities

The customer must provide the real customer data only after an explicit pilot agreement and through an approved transfer channel. The customer remains responsible for the accuracy, provenance and legal sufficiency of manufacturer, conformity, composition, performance and other regulatory information supplied to the pilot.

The customer must identify an authorised UAT contact and confirm whether the generated public passport output matches the supplied source information before rollout.

## Exclusions

- no legal certification or legal opinion;
- no claim that DPP Autopilot replaces the economic operator's legal obligations;
- no live EU DPP Registry submission unless valid operator/test credentials and a separately accepted registry path exist;
- no publication of legitimate-interest or authority-only information without accepted access controls;
- no guarantee that future implementing acts or guidance will remain unchanged;
- no production rollout claim before real customer UAT is recorded.

## Acceptance

The non-client technical acceptance baseline is 10 synthetic battery items with: zero restricted-field leakage, 10/10 unique identifiers, 10/10 QR carriers decoding to their intended passport URLs, a generated completeness report, an export/evidence package, and a READY smoke-tested UAT deployment.

The commercial pilot becomes **customer-proven** only after two external gates are complete: a real customer dataset imports without silent row loss, and the real customer records UAT acceptance.

## Commercial model

Implementation scope and price are quoted from the number of battery models/items, source-system complexity, mapping effort, supporting-document quality, and any integration work. The quotation must state setup work, optional recurring support, included volumes, change-request boundaries and any third-party costs before the customer transfers production data.

## Handoff

After the technical pilot is accepted, the customer receives the agreed passport URLs/QRs, completeness findings, export/evidence package and a remediation list for missing supplier data. Any move from managed pilot to broader self-service rollout is a separate acceptance decision.
