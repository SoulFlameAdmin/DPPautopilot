# C03 Production Promotion Policy — Partial Progress

C03 remains **RED** because C02 is not GREEN and no production promotion has been executed.

## Fail-closed production policy

data/production-promotion-policy.json defines the canonical source and target:

- Repository: SoulFlameAdmin/DPPautopilot
- Source branch: main only
- Vercel team: team_cKaIZfnCMzoiiq80J0MhV0A2
- Vercel project: prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr (dpp-autopilot)

scripts/verify_production_promotion_evidence.py denies promotion evidence unless the same candidate commit is proven across successful CI, verified preview, migration gate, security/browser smoke and the canonical production target in READY state.

Wrong branch, project, environment, state, missing evidence or commit drift fail closed.

## Deployment boundary

No Vercel create/update/redeploy/promotion action is performed by this precursor. Therefore the global deployment lease is not claimed here. A future real production promotion must use the DAVID Vercel deployment lease and may only occur after C02 and the remaining release gates are GREEN.

## Before GREEN

C03 needs C02 GREEN plus real production promotion evidence, exact deployment metadata and post-promotion smoke proof.
