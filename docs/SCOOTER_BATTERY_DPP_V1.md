# Scooter Battery DPP v1

Dedicated product profile for **LMT / electric-scooter batteries** on top of the existing DPP Autopilot battery core.

## Release path

The current release uses the live production-shaped surfaces already built in DPP Autopilot:

- Public passport: `/passport?identifier=<unique_identifier>`
- Printable QR label: `/qr?identifier=<unique_identifier>`
- Public passport API: `/api/passport?identifier=<unique_identifier>`
- QR SVG API: `/api/qr?identifier=<unique_identifier>`

Each accepted physical battery item gets its own unique identifier and QR carrier. One QR must not be reused for an entire battery model.

## Final printer acceptance

Software readiness is not the same as physical printer acceptance. The final physical check is:

1. Open a verified active battery label in `/qr`.
2. Print one real label.
3. Scan the printed QR from a separate phone/device.
4. Confirm it resolves to the same active public passport and identifier.

The profile is not called production-ready until all 12 acceptance gates have deployed evidence and the physical carrier check passes.

This file is an engineering contract, not legal certification or legal advice.

## Stage 1 acceptance — stable public HTTPS passport

Stage 1 is accepted only after a READY production deployment from the current `main` contains the clean public routes and live smoke passes all of these checks:

- `/api/passport?identifier=<id>` returns the active sanitized public passport.
- `/passport?identifier=<id>` returns the public passport page over HTTPS.
- `/api/qr?identifier=<id>` returns the QR carrier for that exact identifier.
- `/qr?identifier=<id>` returns the printable QR page over HTTPS.
- The identifier returned by the API matches the identifier requested.
- Unknown identifiers fail safely and no restricted/authority-only data is exposed.

Production evidence must be collected after the deployment is READY; code/config validation alone does not complete Stage 1.

## Stage 2 acceptance — unique Battery ID + unique QR per battery

Stage 2 is accepted when all of the following are true:

- `dpp_battery_items.unique_identifier` is globally UNIQUE and NOT NULL.
- The production database has no duplicate `unique_identifier` groups.
- QR generation is based on the exact individual battery identifier, never only on the battery model.
- Two different battery identifiers produce two different canonical passport URLs and two different QR SVG carriers.
- The QR response exposes `X-DPP-Identifier` and `X-DPP-Target` so production smoke can prove the identifier-to-carrier mapping.
- Shared model QR remains forbidden for the Scooter Battery profile.

Physical printer acceptance is intentionally Stage 10; Stage 2 proves identity and carrier uniqueness in the data/API layer.

