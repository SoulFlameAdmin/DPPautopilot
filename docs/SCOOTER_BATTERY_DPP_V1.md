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

