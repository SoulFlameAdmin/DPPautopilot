# Scooter Battery DPP v1

Dedicated product profile for **LMT / electric-scooter batteries** on top of the existing DPP Autopilot battery core.

## Architecture

Manufacturer data enters through manual UI, CSV/batch import or API. Each accepted physical battery item gets its own unique identifier, passport record and public URL. The QR carrier must resolve to that individual public passport; one QR is not reused for an entire model.

Public route: `/passport?identifier=<unique_identifier>`.

The route calls only the public passport API projection. Restricted and authority-only information is not rendered by the public page.

## Acceptance

The scooter profile is not called production-ready until all 12 acceptance gates in `data/scooter-battery-profile-v1.json` have deployed evidence. Existing generic battery capabilities may be reused, but partial or in-process evidence does not turn a gate GREEN.

This file is an engineering contract, not legal certification or legal advice.
