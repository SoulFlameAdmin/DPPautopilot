# EU DPP Conformance Groundwork V1

Issue: #290

## Purpose
Start the evidence-based EU Battery Passport conformance layer without changing the live pilot flow in #289.

## Official baseline locked for this slice
- Regulation (EU) 2023/1542: Article 77 requires a battery passport from 18 February 2027 for LMT batteries, industrial batteries >2 kWh, and EV batteries; Article 77 also requires QR -> unique identifier -> passport and separates model vs individual-battery information.
- Article 78 defines interoperability, access and technical-operation requirements.
- Commission guidance “Digital Batteries Passport – data points by category” v2.0 (15 Aug 2026 / published 21 Aug 2026) is treated as non-binding implementation guidance.
- Commission Implementing Decision (EU) 2026/1736 publishes references for EN 18216:2026, EN 18219:2026, EN 18220:2026, EN 18221:2026, EN 18222:2026 and EN 18223:2026.

## Added in this branch
1. `data/lmt-battery-71-eu-conformance-v1.json`
   - derives from the existing 71-point LMT matrix;
   - adds category applicability, normalized access class, source type, evidence requirement, provenance requirement, effective date, verification state and explicit `MAPPED_NOT_PROVEN` status.

2. `data/eu-dpp-system-contracts-v1.json`
   - model vs individual-battery separation;
   - immutable UID contract;
   - QR resolver contract;
   - lifecycle states and successor-link rule;
   - access classes;
   - Registry adapter states;
   - evidence-pack contract;
   - final conformance gate.

3. `data/eu-dpp-harmonised-standards-v1.json`
   - locks the six OJ-published harmonised standard references;
   - deliberately marks every clause review as blocked until licensed normative text is available.

## Safety / claim rule
Nothing in this branch means “EU compliant” or “certified”. The branch only creates traceability contracts and evidence gates.

## Next implementation gates
- generate automated validators from the enriched 71-point matrix;
- add UID uniqueness/immutability tests;
- add QR exact-resolution tests;
- add model-vs-item inheritance tests;
- add lifecycle transition and successor-link tests;
- add access-policy server-side tests;
- build Registry adapter interface without credentials;
- map each licensed EN clause to implementation/test/evidence after normative-text review.

## External blockers that cannot be honestly closed in GitHub alone
Licensed EN normative texts, live EU Registry onboarding/credentials, real manufacturer source documents/data, physical QR scan from an independent device, customer UAT, and external legal/compliance review.
