# SoulFlame DPP — Final Clean Auth + E2E Plan v1

## Rule
Do not claim 100% READY until the physical manufacturer golden path is proven end-to-end with evidence.

## Frozen baseline
- Source branch: `borko/manufacturer-integration-v2`
- Source SHA: `3d4c1824c4c5151bb4dac008d4532e732ec43521`
- 6/6 workflow families: GREEN on that exact SHA.
- Cleanup branch: `mitko/final-auth-clean-e2e-v1`

## Phase A — Auth cleanup
1. Dedicated `/register`, `/login`, `/forgot-password` pages.
2. Registration captures contact name, company name, business email, phone, EIK/VAT/registration ID, password + confirmation.
3. Signup metadata persists through Supabase Auth.
4. Email verification returns to company setup.
5. Login stores the real session and routes:
   - active tenant → `/dashboard`
   - no tenant → `/company`
6. Password recovery uses a real recovery session, new password confirmation and global refresh-session revoke.
7. Logout/protected-route behavior must be physically tested.

## Phase B — Company + onboarding
1. Create/activate organization tenant.
2. Confirm tenant isolation.
3. Answer all 8 onboarding questions.
4. Refresh/re-login: all 8 answers remain.
5. Configure only from real entered data.

## Phase C — Battery golden path
1. Product/model + real SKU.
2. Batch.
3. ~10 unique serial units.
4. 10 DPP records.
5. 10 QR codes.
6. Print/preview.
7. Physical phone scan opens the exact public passport.
8. Update one DPP.
9. Scan the same QR again and verify updated data.
10. Audit, provenance, tenant security and persistence.

## PASS evidence
For every step capture: URL, timestamp, screenshot, expected result, actual result, PASS/FAIL, blocker if failed.

## Stop conditions
- No fake success.
- No fabricated manufacturer technical values.
- No 100% compliance/certification claims from CI.
- No merge to main until auth + E2E evidence is complete.
- Keep EU conformance groundwork isolated until the pilot gate is complete.

## Definition of Done
Register → verify → login → tenant → onboarding 8/8 → configure → SKU → batch → 10 serials → 10 DPP → 10 QR → physical scan → update → same QR → security/audit → refresh/re-login = PASS.
