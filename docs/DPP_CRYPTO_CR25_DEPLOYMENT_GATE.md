# CR25 Deployment Evidence Gate

CR25 tracks evidence. It must not confuse repository CI with a reachable deployed surface.

## GREEN requirements

All of the following are required:
1. `data/dpp-crypto-status.json` exists and validates in dedicated DPP CRYPTO CI.
2. `demo/dpp-crypto-progress.html` reads the JSON dynamically and contains no stale hardcoded success counts.
3. Exact commit SHA and dedicated DPP CRYPTO run are recorded.
4. A deployed/reachable URL for the progress surface is recorded.
5. Fetching that URL returns the progress page successfully.
6. The deployed status payload corresponds to the intended commit/status revision.
7. Evidence link is posted to Issue #241.

## Current environment limitation

The connected Vercel account currently exposes no teams/projects to this session, so deployment reachability cannot be independently verified through the Vercel connector.

This is an evidence-access blocker, not a reason to mark CR25 GREEN.

## Evidence record

When deployment access is available, record:
- deployment provider;
- project/deployment ID;
- immutable deployment URL;
- public/authorized progress URL;
- commit SHA;
- HTTP status;
- captured timestamp;
- DPP CRYPTO CI run ID;
- optional screenshot/hash;
- Issue #241 comment link.

CR25 remains YELLOW until these deployment checks pass.
