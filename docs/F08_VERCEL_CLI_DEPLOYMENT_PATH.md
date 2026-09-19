# F08 — Vercel CLI deployment path

## Purpose

The normal Git → Vercel integration for the existing DPP delivery project is not creating deployments. This defines a second controlled path from the canonical repository `SoulFlameAdmin/DPPautopilot` using GitHub Actions and the Vercel CLI.

This path does **not** make F08 GREEN by itself. F08 remains BLOCKED until a real production run completes and the live application plus `/data/master-plan.json` pass HTTP smoke checks.

## Bound target

- GitHub repository: `SoulFlameAdmin/DPPautopilot`
- Vercel team: `team_cKaIZfnCMzoiiq80J0MhV0A2`
- Vercel project: `prj_K0RSGrEkEr3XDouCTA3tdasbqH55` (`dpp`)
- Workflow: `.github/workflows/vercel-deploy.yml`
- Vercel CLI: exact pin `59.19.1`

The team/project IDs are non-secret identifiers and are fixed so the release job cannot accidentally deploy DPP code into another Vercel project.

## Required secret

GitHub Actions must contain one secret:

- `VERCEL_TOKEN` — a Vercel token limited to the access required to deploy the bound DPP project.

The token must never be committed or emitted into logs/artifacts.

## Preview

Run **DPP Vercel deploy** manually with an exact `release_sha`, target `preview`, and an empty production confirmation.

The workflow checks out that exact commit, pulls preview environment configuration, builds with pinned Vercel CLI, deploys prebuilt output, checks the live home page and master-plan JSON, and uploads a deployment receipt.

## Production

Production requires:

- `release_sha`: exact current `main` SHA
- `target`: `production`
- `production_confirmation`: exactly `DEPLOY_PRODUCTION`

The workflow refuses a production deploy when the SHA differs from the current `origin/main`.

## Evidence rule

Workflow existence and CI validation are precursor evidence only. F08 may become GREEN only after a real production deployment is observed and the deployment URL returns successful live checks for `/` and `/data/master-plan.json`, with a receipt bound to the exact production commit/project.
