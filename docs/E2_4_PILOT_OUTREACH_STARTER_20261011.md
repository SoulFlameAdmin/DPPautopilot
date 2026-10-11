# E2.4 Pilot Outreach Starter — 2026-10-11

Status: **OUTREACH PREPARATION / NOT CUSTOMER-PROVEN**

This pack turns the existing Battery Client Pilot v1 and BG managed-pilot contract into a concrete first-contact workflow. It does not claim regulatory certification, production readiness, client acceptance, or E2.4 PASS.

## 1. Who to approach first

Prioritize Bulgarian and nearby EU organizations that can realistically provide one real battery model and about 10 serialized units:

1. battery manufacturers or assemblers;
2. industrial / stationary energy-storage battery integrators above 2 kWh;
3. battery importers/distributors that control product documentation and serialized stock;
4. LMT battery manufacturers/integrators only where the 2027 passport scope is relevant and source data is available.

Prefer organizations with an identifiable product/compliance/engineering owner, CSV/XLSX/ERP product data, ability to print a QR label, and willingness to let one representative witness UAT.

## 2. Qualification questions

Use these before asking for data:

- Which battery category and exact model/SKU would be easiest to pilot?
- Can you identify about 10 physical serialized units of that same model?
- Who owns the manufacturer/product/compliance data for that model?
- Where is the data today: ERP, MES, BMS, API, CSV, XLSX, PDF or manual documents?
- Do you already have unique serial identifiers for each unit?
- Can you print and physically attach a QR label to the pilot units?
- Who can approve which fields may be public?
- Who can witness a 20–30 minute acceptance session?
- Is there a safe approved channel for transferring pilot data/documents?
- What would make the pilot commercially useful to you: data cleanup, passport generation, QR workflow, supplier-data gaps, export/integration, or readiness planning?

Do not request real customer data until an explicit pilot agreement and transfer channel exist.

## 3. First-contact message

### Short cold message

> Здравейте, разработваме SoulFlame DPP Autopilot за Battery Digital Product Passports. Търсим 1 производител/интегратор за ограничен пилот: 1 модел, около 10 серийни батерии, QR и проверка на реалния workflow. Пилотът е за техническо валидиране и подготовка, не е правна сертификация. Ако темата е релевантна, можем да направим 20-минутна демонстрация и да уточним какви данни реално имате.

### Warm/referral version

> Здравейте, свързвам се по препоръка във връзка с Battery Digital Product Passport. Имаме работещ managed-pilot workflow и търсим една реална фирма за контролиран тест с 1 модел и около 10 серийни единици. Идеята е да проверим данните, QR потока и какво липсва от източниците ви, без да обещаваме правна сертификация. Можем ли да направим кратък разговор с човека, който отговаря за продуктови/compliance данни?

## 4. 20-minute discovery/demo agenda

**0–3 min:** Their product, role, battery category, model and current data source.

**3–7 min:** Show the product concept: source data → mapping/completeness → unique item → DPP → physical QR → public scan → controlled update → same QR.

**7–12 min:** Ask the qualification questions and identify missing supplier/manufacturer evidence.

**12–16 min:** Define a minimal pilot: one company, one model, about 10 units, one authorized UAT contact, one approved transfer channel.

**16–20 min:** Agree one next action only: data-template review, technical call, pilot agreement review, or demo with the responsible person.

Never present synthetic acceptance, internal CI, or a technical pilot as customer acceptance.

## 5. Pilot offer boundary

The existing commercial offer remains authoritative for scope. The outreach version should describe the pilot as:

- managed, not self-service by default;
- one organization;
- at least one model;
- about 10 serialized units;
- customer-approved source data;
- public/private separation;
- unique identifiers and QR carriers;
- completeness/missing-data report;
- one controlled update with the same QR;
- UAT record and remediation list.

Explicit exclusions: legal certification, legal advice, automatic EU Registry submission, publication of restricted fields without accepted access controls, and production-rollout claims before real UAT.

## 6. Contact tracker fields

For each lead record only business-relevant information:

`organization | country | contact role | public business contact/source | battery category | likely model | data source | 10 units possible? | QR possible? | decision owner | status | next action | next date | notes`

Statuses: `TARGET`, `CONTACTED`, `REPLIED`, `QUALIFIED`, `DEMO_BOOKED`, `PILOT_REVIEW`, `AGREED`, `DECLINED`, `NO_RESPONSE`.

Do not store unnecessary personal data or sensitive technical/customer documents in the tracker.

## 7. Qualification to pilot handoff

A lead becomes **PILOT_REVIEW** only when all are known:

- legal/business organization identity;
- responsible pilot contact;
- one candidate battery model;
- path to about 10 unique units;
- expected data sources;
- customer understands technical-pilot/non-certification boundary;
- data transfer channel still pending or approved;
- UAT witness identified or explicitly pending.

A lead becomes **AGREED** only after explicit customer consent to the pilot scope. Interest, a demo booking, or a positive conversation is not an agreed pilot.

## 8. Current evidence boundary

The repository already has a synthetic/non-client Bulgarian pilot mechanism. Its tracker explicitly keeps **BG02 real customer dataset import** and **BG09 customer UAT** blocked. Therefore outreach may use the technical workflow for demonstration, but it must not be described as a completed real-client pilot.

## 9. First execution target

Initial operating target: build a shortlist of 10 qualified organizations, reach the responsible product/compliance/engineering contact, book 3 discovery calls, and obtain 1 candidate for pilot review. These are commercial funnel targets, not product PASS criteria.

No production SQL, deployment, registry submission, or live customer data processing is authorized by this document.
