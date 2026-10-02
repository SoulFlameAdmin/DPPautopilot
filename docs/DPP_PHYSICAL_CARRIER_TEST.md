# Real QR + NFC physical carrier test

This workstream proves the complete physical-to-cloud path before it is folded into the main DPP UX.

## Boundary

- QR and NFC carry only a public HTTPS URL / Battery ID.
- NTAG215 is a convenience URL carrier, **not** an authentication or anti-cloning factor.
- Authentication, company membership and authorization remain in Supabase.
- The cryptographic Secure NFC workstream remains separate. A later NTAG424 DNA / secure-hardware upgrade must not require replacing the DPP record architecture.

## Real test journey

1. Borko signs in to the physical test station.
2. He creates/activates the test company if needed.
3. He enters manufacturer, model, SKU, serial, chemistry, capacity, voltage and production date.
4. The station creates/reuses the battery model, creates the battery item, assigns a human-readable public Battery ID, creates the passport and activates it.
5. The station generates the public passport URL and QR.
6. Borko binds the QR record and physically prints the label.
7. Borko writes the **same HTTPS URL** into Mitko's NTAG215 through Web NFC on supported Android Chrome, or through NFC Tools as fallback.
8. The NFC binding is saved in Supabase separately from the secure-NFC cryptographic identities.
9. A clean phone scans the QR and taps NFC. Both routes open the same live public passport.
10. Mitko creates/signs in to a worker account. The page exposes his Supabase user UUID, but it does not let him assign himself a company role.
11. Borko/admin adds Mitko as viewer (the current test mapping for WORKER).
12. Mitko activates the company and loads the organization-authorized passport view.
13. Borko changes a battery/passport value in Supabase. The QR and NFC do not change; the next open reads the new cloud value.
14. Carrier replace/revoke preserves the battery and passport history.

## URLs

Provisioning station:

    /demo/physical-test.html

Carrier landing page:

    /demo/carrier-passport.html?id=<unique_identifier>

Authenticated carrier management API:

    GET   /api/carriers?battery_item_id=<uuid>
    POST  /api/carriers
    PATCH /api/carriers

Public carrier landing API (consolidated into the same Serverless Function):

    GET /api/carriers?mode=open&identifier=<BatteryID>&source=unknown

Test-only QR image mode on the same function:

    GET /api/carriers?mode=qr&url=<same-origin-public-url>

The QR image endpoint exists to finish the physical pilot quickly. Production should move QR generation in-process or to an owned service so the public Battery ID URL is not sent to a third-party QR image service.

## Source attribution

For the first test, QR and NFC contain the exact same URL. The landing page therefore records source=unknown; it must **not** pretend it knows whether the browser was opened by camera or NFC. If source-specific analytics are needed later, use distinct signed/non-sensitive carrier aliases or a deliberate source parameter while resolving to the same battery passport.

## Security rules

Never store any of the following inside QR or NTAG215:

- passwords
- access/refresh tokens
- role grants
- private DPP fields
- service-role keys
- secrets used to authorize Supabase
- phone/device fingerprints

The physical carrier identifies the battery. Supabase Auth + tenant membership + RBAC identifies and authorizes the person.

## GREEN criteria

GREEN requires physical evidence, not only unit tests:

- Borko auth succeeds.
- Test company/tenant is active.
- Real battery item is stored in Supabase.
- Active passport exists.
- QR is generated and printed.
- QR binding exists.
- NTAG215 receives the same URL.
- NFC binding exists.
- Web NFC verification or a clean-phone tap proves the URL.
- QR and NFC both open the same battery.
- Mitko worker/viewer membership is admin-approved.
- Mitko can read allowed organization data and cannot self-promote.
- A live cloud data change appears on the next open without QR regeneration or NFC rewrite.
- Replace/revoke leaves a coherent audit trail.
- CI migration replay + API tests are green.

## Vercel Hobby function limit

The physical test intentionally uses one new Serverless Function (`api/carriers.js`). Public landing and QR test-image modes are consolidated into it so the project remains within the current Vercel Hobby 12-function deployment limit.
