# DPP Autopilot — NEXT MAIN PRODUCTIZATION PLAN

**Execution order:** after the verified DPP core, complete these steps as the main productization queue.
**Rule:** a step is GREEN only when the real user flow is implemented and verified. Demo-only behavior must not be presented as production.

## Main next steps

1. **SF Partners DPP official tab / entry** — make DPP a first-class SoulFlame Partners product entry, immediately after Restaurant OS, linking to the DPP Autopilot product surface. **Status: MERGED / LIVE DEPLOY BLOCKED BY VERCEL RATE LIMIT** — SoulFlame commit `8b3df39b5321e8e70f7da16032043923298c6d3a`; Deployment Safety PASS.
2. **Demo company login** — one-click isolated demo company session with resettable synthetic data. **Status: IMPLEMENTED / LIVE DEPLOY BLOCKED BY VERCEL RATE LIMIT** — SoulFlame commit `4c8d228f498fd87c48fb883a73b94f65c1772e63`; one-click demo tenant + reset + explicit no-production-write boundary; Deployment Safety PASS.
3. **Production company registration** — email verification, company profile, DPP product selection, plan and onboarding request.
4. **Merge Early Partner handoff into the company workspace** — partner code/status/unlock/install flow visible from one customer journey.
5. **Unified Company Dashboard** — models, batteries, passports, QR/print, imports, integrations, printers, team, support and billing. **Status: DEMO SURFACE PARTIAL** — Models, Production, QR/Print, Integrations, Connector and Registration are present; production auth/team/import/support/billing wiring remains.
6. **Produce X units workflow** — select model + quantity -> create unique battery items, identifiers, passports and QR carriers atomically. **Status: DEMO IMPLEMENTED / PRODUCTION NOT CLAIMED** — browser-local generation works; transactional DPP API/Supabase provisioning remains.
7. **Production QR binding flow** — generate -> bind carrier -> print -> scan -> exact public passport. **Status: DEMO IMPLEMENTED / PHYSICAL PRODUCTION BINDING PENDING** — unique demo passport URL + scannable QR path exists; live `dpp_physical_carriers` acceptance remains.
8. **DPP Print Center** — single/batch labels, templates, readable ID, preview, reprint controls and queue state. **Status: DEMO PARTIAL** — single and batch browser print + label preview work; production printer queue/templates/retry remain.
9. **SF DPP Connector desktop/local agent** — authenticated local bridge for printer, ERP/MES/BMS and diagnostics. **Status: DEMO SIMULATION ONLY** — UI/contract concept exists; signed local agent not yet built.
10. **Printer discovery and test print** — discover local/network printers, choose default, test, retry and job status. **Status: DEMO SIMULATION ONLY** — browser demo simulates discovery and test print; real enumeration requires the local Connector.
11. **Customer-grade CSV import acceptance** — upload, map, validate, fix errors and commit into live tenant data.
12. **Excel (.xlsx) first-class import** — workbook intake, sheet/column mapping and saved reusable mappings.
13. **Customer integration API layer** — tenant credentials/OAuth/API keys, docs, webhooks, limits and examples.
14. **ERP/MES connector framework** — reusable adapters instead of one-off product forks.
15. **BMS/machine connector framework** — approved Modbus/OPC UA/MQTT/CAN-gateway adapters where customer infrastructure supports them.
16. **Cloud Connector Wizard** — endpoint/credential setup, field mapping, sync preview, health and error handling.
17. **Pre-payment Integration Assessment** — capture ERP/MES/BMS/API/printer/volume/sample-file requirements before provisioning. **Status: DEMO FORM IMPLEMENTED** — ERP/MES, BMS, API/cloud, printer, volume and format are captured in the demo; production persistence/handoff remains.
18. **Supplier Portal UI** — supplier invitation, scoped missing fields, evidence and package submission without tenant-wide access.
19. **Final Public Passport UX** — stable public route, mobile-first BG/EN presentation, access boundaries, lifecycle/revoked/replaced state.
20. **EU Registry test integration acceptance** — real approved test credentials/specification, submission, status, retry and evidence; no unsupported compliance claim before proof.
21. **Secure NFC production pilot** — real NTAG 424 DNA provisioning/verification after QR production flow is accepted.
22. **Billing customer page** — plan, setup fee, monthly fee, payment state, invoice/portal and entitlements.
23. **Customer notification automation** — request received, reviewing, configuring, ready and active notifications; email first, Viber as a separately configured channel.
24. **Client support workflow** — support ticket/chat, diagnostics and explicitly authorized remote troubleshooting.
25. **DPP admin RPC security hardening** — review SECURITY DEFINER surface and revoke unintended anon/authenticated execute grants.
26. **RLS intent audit** — document deny-by-default tables vs missing policies and verify every exposed DPP table.
27. **Cross-company attack test** — Company A cannot read/write Company B through UI, REST, RPC, import, supplier or evidence paths.
28. **Authentication production acceptance** — signup/login/logout/reset/email verification/session revocation and owner/admin/editor/viewer lifecycle.
29. **Real customer end-to-end pilot** — real customer data -> model -> 10+ units -> passports -> physical QR print -> scan on another device -> correct public passport.
30. **Synchronize MASTER PLAN with live implementation** — reconcile post-plan migrations/APIs/supplier/NFC/carrier/provisioning work into the canonical tracker.
31. **Protect canonical main branch** — required PR/CI checks before production-changing merges.
32. **Final legal/compliance acceptance** — current official schema/registry/privacy/DPA review and explicit manufacturer data-responsibility boundary.

## Immediate execution chain

**STEP 01 -> STEP 02 -> STEP 05 -> STEP 06 -> STEP 07 -> STEP 08 -> STEP 09/10 -> STEP 11/12 -> STEP 17 -> STEP 29**

This chain creates the fastest path from the current backend to a real customer-operable DPP product.

## 2026-10-03 execution evidence

- `SoulFlameAdmin/soulflame-twins` PR #159 merged STEP 01 into main.
- `SoulFlameAdmin/soulflame-twins` PR #160 merged the full demo company workspace into main after Deployment Safety SUCCESS.
- Vercel deployment statuses for both main commits are rate-limited (`retry in 24 hours`), so no live deployment claim is made yet.
- Demo company workspace routes are `/dpp-autopilot/company` and `/dpp-autopilot/company/passport` once the SoulFlame deployment is available.


## 2026-10-07 physical Battery pilot overlay

This section records current physical production evidence without retroactively marking canonical task IDs GREEN before their own acceptance/evidence requirements are reconciled.

### Proven physical flow
- Google-only login and persistent company session.
- Company-specific onboarding stored to the tenant.
- Real production tenant path through Manufacturer Dashboard.
- Product/SKU creation: `BAT-EV-001`.
- Batch provisioning for 10 serialized units: `BAT-SF000001` → `BAT-SF000010`.
- Technical-pilot activation with `regulatory_compliance=false`.
- One DPP per unit and physical QR carriers.
- Real printed QR sheet.
- Public scan from a separate phone without admin login.
- Same DPP update for `BAT-SF000010`: rated capacity 100 → 101 Ah.
- Public API and same printed QR expose the updated record while preserving the same passport identity.

### Current interpretation
The Battery core flow is physically proven as a **technical pilot**, but the full product is not yet declared PILOT READY or production/compliance complete.

Before the first real client:
1. close remaining current-head CI/U07/tenant/UI hardening;
2. repeat a clean full E2E with a fresh test account/company and no manual DB repair;
3. execute `docs/BATTERY_CLIENT_PILOT_V1.md` with one real manufacturer.

### Main-page tracker rule
The canonical percentage on the home page remains derived from `data/master-plan.json`. Recent physical evidence must be reconciled task-by-task before changing canonical GREEN counts; the client-pilot mission is shown separately so product progress is visible without weakening the evidence rule.
