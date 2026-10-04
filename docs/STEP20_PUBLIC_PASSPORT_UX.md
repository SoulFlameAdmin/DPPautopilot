# Step 20 — Final Public Passport UX

Status: GREEN when the committed acceptance checks pass.

## User outcome

A person who scans the QR for an ACTIVE Scooter/LMT battery gets a production public passport that is readable on phone and desktop, not a raw JSON/path dump.

The page:
- identifies the individual battery and ACTIVE state;
- groups public fields into human-readable sections;
- shows EU data-point numbers for traceability;
- formats units, arrays, objects, URLs and public contact details;
- exposes QR and technical identity metadata;
- uses the canonical LMT 71-point matrix to decide which fields are public;
- omits legitimate-interest and authority-only fields by construction;
- clearly states that ACTIVE/public display is not legal certification;
- has explicit loading, not-found/error and empty-public-data states.

## Security boundary

The browser consumes only `GET /api/passport?identifier=...`, whose server-side public projection is already fail-closed against catalog-restricted paths. The renderer adds a second allowlist: only `public`, `public_identifier`, and `public_identifier_or_operator_identity` matrix points are rendered.

Point 16 and point 25 derived-duplicate rows are not rendered as duplicate cards.

## Deliberate non-goals

Step 20 does not close:
- #21 revoked/replaced/retired UX;
- #49 legitimate-interest authenticated access;
- #50 authority-only access;
- #76 final BG/EN bilingual passport.

Those remain separate master-plan gates.
