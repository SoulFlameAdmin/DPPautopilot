# R06 Auth Security Review — Partial Progress

R06 remains **RED** because M01 and M03 are not fully accepted and the recovery flow still lacks deployed runtime evidence. This review hardens repository behavior without claiming production completion.

## Repository-level controls now enforced

- Browser auth uses only the Supabase publishable key; no service-role credential is present.
- Session tokens remain memory-only; `localStorage` and `sessionStorage` are not used.
- Password-reset success copy is generic and does not confirm whether an account exists.
- Reset requests use a fixed same-origin recovery destination: `/demo/auth-recovery.html`. No user-controlled redirect target is accepted.
- The redirect target is URL-encoded before it is sent as `redirect_to`.
- Authentication and recovery pages set `Referrer-Policy: no-referrer` via meta policy.
- Recovery accepts only `type=recovery` with an access token and rejects an expired `expires_at` when present.
- After parsing the fragment, the page immediately removes it from the browser URL with `history.replaceState`; the token remains only in memory.
- Password update is an authenticated `PATCH /auth/v1/user` and clears the in-memory token after success.

## Supabase contract basis

Current Supabase Auth documentation states that password-reset flows support an explicit redirect destination and that the destination must be included in the project's allowed redirect URLs. Supabase also documents fragment-based client recovery sessions for browser flows.

## Required before GREEN

- Verify the actual deployed recovery URL is allowlisted in Supabase Auth URL Configuration.
- Trigger a real reset email against the deployed app and prove it lands on the recovery page.
- Complete a real password update and prove the recovery session is consumed/non-reusable.
- Complete M01 and M03 acceptance.

No Vercel deployment is attempted by this precursor.
