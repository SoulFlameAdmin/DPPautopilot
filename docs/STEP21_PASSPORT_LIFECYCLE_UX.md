# Step 21 — Retired / Revoked / Replaced Passport UX

Status: GREEN when the committed acceptance gates pass.

## Goal

A previously printed QR must not turn into a confusing 404 when an ACTIVE passport reaches a terminal operational state.

For Scooter/LMT passports, Step 21 adds three terminal states:

- **RETIRED** — the passport is no longer active, usually after end-of-life or another operator decision.
- **REVOKED** — the economic operator has withdrawn the passport record.
- **REPLACED** — the old identifier remains resolvable and points the public user to another ACTIVE passport.

These are product lifecycle states in DPP Autopilot. They are not presented as a new EU legal classification.

## Public behavior

The canonical `/passport?identifier=...` route resolves:
- ACTIVE → the normal public passport from Step 20.
- RETIRED / REVOKED / REPLACED → a minimal public lifecycle tombstone.

A tombstone contains only:
- passport ID;
- original unique identifier;
- terminal status;
- standardized reason code;
- changed/updated timestamps;
- active replacement identifier only for REPLACED.

It does **not** expose the old public payload, private payload, organization ID, actor ID, or free-text internal reason note.

For REPLACED, the page links to the replacement ACTIVE passport.

## Operator transition safety

Only owner/admin/editor may transition an ACTIVE passport to a terminal state.

The transition uses optimistic concurrency and stores lifecycle metadata in `dpp_passport_lifecycle`.

Generic passport PATCH cannot bypass the lifecycle route. REPLACED requires a different ACTIVE passport in the same organization.

## QR behavior

Existing physical QR labels keep their canonical identifier URL and therefore resolve to the lifecycle notice.

The QR/print page continues to issue/print a carrier only for an ACTIVE passport, so terminal passports cannot accidentally receive a fresh verified production label.

## Non-goals

Step 21 does not close:
- #29 full Passports management UI;
- #32 physical carrier revoke/reissue/reprint;
- #72 full battery lifecycle/performance event engine;
- final legal retention policy.
