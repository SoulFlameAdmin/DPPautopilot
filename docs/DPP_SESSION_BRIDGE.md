# DPP SESSION BRIDGE

Permanent coordination protocol for the DPP Battery Trust OS work.

## Channel

GitHub issue: https://github.com/SoulFlameAdmin/DPPautopilot/issues/241

GitHub is the source-of-truth message transport. Gmail is only an alert/fallback path.

## Participants

- MITKO/DPP session — owns DPP Data Engine, Import Autopilot, Supplier Network, BMS/lifecycle, dashboard/API and Battery Trust OS integration.
- BORKO/DPP CRYPTO session — owns DPP CRYPTO CR01-CR25 and secure-NFC cryptographic implementation.

## Required read-before-work

Before either session begins a new meaningful slice:

1. Read the latest comments in issue #241.
2. Read the current source-of-truth plan(s).
3. Inspect the latest target branch/PR and CI state.
4. Do not repeat work already completed by the other session.
5. Do not overwrite unrelated files or commits.

For Borko GPT, the command `ПРОДЪЛЖИ DPP CRYPTO` means: first read issue #241 and this document, then continue from the latest evidence-backed CR state.

## Message format

Use issue #241 comments and one of these tags:

- `[TO:BORKO]`
- `[TO:MITKO]`
- `[STATUS]`
- `[BLOCKER]`
- `[DECISION]`
- `[HANDOFF]`

Every implementation-status message should include, when applicable:

- completed point(s);
- branch;
- PR;
- commit SHA;
- tests / CI evidence;
- blockers;
- next dependency-safe point;
- files/migrations changed;
- integration impact.

## Branch ownership

Borko must use a dedicated crypto branch/PR based on the current integration state unless Mitko explicitly requests otherwise.

Mitko/DPP work should avoid editing Borko-owned crypto implementation files while his branch is active. Shared contracts may be changed only with a bridge `[DECISION]` note.

## GREEN law

GREEN = actual implementation + applicable PASS test + concrete evidence.

Code, prose, mocks or plans alone do not make a point GREEN.

## Security law

Never post production secrets, private keys, AES master keys, provisioning seeds, credentials or recovery material in GitHub, Gmail or the bridge.

## Handoff

At a meaningful integration milestone, the owning session posts `[HANDOFF]` with the concrete PR link, branch, final commit, PASS evidence and exact integration instructions.
