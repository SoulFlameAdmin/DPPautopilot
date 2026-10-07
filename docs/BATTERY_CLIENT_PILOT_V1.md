# SoulFlame DPP — Battery Client Pilot v1

## Goal

Prove the product with one real manufacturer before expanding scope:

**1 manufacturer → 1 battery model → customer-approved real data → ~10 serialized units → DPP → physical QR → public scan → update same DPP → UAT → willingness to pay.**

This is a product pilot. It is not, by itself, regulatory certification or legal sign-off.

## Phase A — System hardening before client data

Exit criteria:

- Production deployment READY.
- Main CI GREEN.
- Cross-browser GREEN.
- U07 GREEN without weakening the approved baseline.
- Google login/session survives refresh, new tab and browser reopen.
- One-membership tenant recovery works deterministically.
- Parallel two-tab tenant creation cannot create duplicate companies.
- No uncaught JavaScript errors in the manufacturer flow.
- DRAFT passports do not expose a false/broken QR state.
- Selected DPP detail reads passport-specific overrides where applicable.
- Technical-pilot update RPC is tenant/role/state/concurrency guarded and covered by tests.
- Full clean E2E passes with a brand-new test account/company without manual DB repair.

## Phase B — Real customer intake

Capture only the data required for the pilot.

### Company
- Legal/company name
- Country
- Pilot owner/contact
- Compliance/product-data contact
- Engineering/production contact
- Intended DPP scope
- Expected annual volume
- Target pilot date

### Product/model
- Customer model/SKU
- Battery category
- Chemistry
- Rated capacity
- Nominal voltage
- Manufacturer identity
- Manufacturing location/date fields required for the selected scope
- Customer-approved public fields
- Restricted/private fields
- Evidence/documents available

### Production process
- Batch identifier format
- Serial identifier format
- Approximate pilot quantity (target ~10)
- Existing ERP/MES/BMS/API/CSV/XLSX sources
- Printer/label workflow
- Who is authorized to approve publication/update

### Pilot success criteria
The client and SoulFlame agree before provisioning what counts as PASS:
- correct model and serial identities
- correct public/private data boundary
- successful physical QR print and scan
- same QR resolves to the same DPP
- approved update becomes visible without replacing the QR
- customer can repeat the workflow with acceptable effort

## Phase C — Customer tenant setup

1. Customer signs in with the approved Google account.
2. Create/recover exactly one intended company tenant.
3. Complete onboarding and persist responses to that tenant.
4. Confirm roles/access.
5. Record pilot scope and success criteria.
6. No production/compliance claim is shown until the relevant evidence exists.

## Phase D — Real battery pilot

1. Create exactly one customer-approved battery model.
2. Validate model data.
3. Create one batch.
4. Provision approximately 10 unique serial units.
5. Create one DPP per unit.
6. Review completeness/missing data.
7. Activate only using the correct product/state route.
8. Bind one QR carrier per active DPP.
9. Print physical labels.
10. Scan labels from a separate phone/device without admin login.
11. Verify identifier/model/customer/public fields.
12. Update one approved field on one selected DPP.
13. Scan the same printed QR again.
14. Confirm same passport identity + updated value.
15. Repeat a second unit to rule out one-off behavior.

## Phase E — UAT

Customer performs or witnesses:
- login/workspace access
- product/model review
- batch/unit review
- public scan
- DPP update
- re-scan same QR
- export/evidence review where enabled

Record:
- PASS/FAIL per step
- screenshots/video
- exact issue
- severity P0/P1/P2
- workaround, if any
- customer feedback
- requested changes

No feature request is automatically accepted into the pilot core. Separate blocking requirements from later improvements.

## Phase F — Commercial checkpoint

After successful UAT ask for an explicit commercial signal:
- willingness to continue to paid deployment,
- letter/email of intent,
- pilot extension,
- or formal commercial discussion after company/contract/payment framework is ready.

Do not interpret polite feedback as willingness to pay.

## Battery v1 freeze criteria

Freeze the Battery v1 core when:
- clean internal E2E is reproducible;
- real-client E2E passes;
- no open P0 defect;
- agreed P1 defects have safe workarounds or are closed;
- tenant isolation/security acceptance passes;
- client confirms workflow value;
- evidence pack is stored;
- commercial next step is recorded.

After freeze, return to the canonical engineering/productization plan instead of continuously adding Battery-only features.

## Post-Battery execution order

Use the canonical master plan and NEXT MAIN PRODUCTIZATION PLAN. Prioritize by dependency:

1. Sync master-plan evidence with the live implementation.
2. UX/accessibility/loading/error consistency.
3. Security/privacy/tenant isolation.
4. Full automated testing and reliability gates.
5. Release/production acceptance.
6. Customer-grade CSV/XLSX import.
7. Integration API + ERP/MES connector framework.
8. Local printer/Connector agent.
9. Supplier portal.
10. Billing/support/notifications.
11. Approved registry integration.
12. NFC pilot.
13. Additional sectors only after Battery v1 is proven and stable.
