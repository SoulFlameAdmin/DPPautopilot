# Binding Attempt 04 — 2026-09-17

## Goal

Resolve F08 (first verified production deployment) without bypassing Vercel quotas, inventing credentials/secrets, weakening Supabase authentication, or overwriting unrelated projects.

## Vercel recheck

The linked Vercel delivery project `dpp` still has zero deployments. The dedicated project `dpp-autopilot` also has no verified deployment. The controlled mirror binding from F07 remains valid.

A direct deployment retry through the available Vercel connector was attempted again. The callable wrapper still fails before execution because it exposes no arguments while the underlying operation requires `target`, `name`, and `files`.

The Git-triggered mirror path remains blocked by Vercel Hobby `build-rate-limit`. The previously recorded API quota reset is 2026-09-18 21:42:41 Europe/Sofia; the current verified local time during Attempt 04 was 2026-09-17 21:59:48 +03:00, so that reset had not occurred.

Vercel Hobby deployment limits operate over a rolling 24-hour window. Creating another team/account or otherwise routing around the quota was not attempted.

## Supabase fallback review

A Supabase Edge Function fallback was evaluated. The available deploy action explicitly recommends JWT verification and permits disabling it only under narrow conditions. Because the app needs a public HTTP endpoint and the user did not explicitly authorize disabling JWT, no public unauthenticated Edge Function was deployed. No secret was invented to simulate authentication.

## GitHub Pages fallback probe

A temporary GitHub Pages workflow was added in commit `41efedebc5463f924489db7d5de44ebc4f9c4d25` using the official static Pages actions.

The workflow created a `github-pages` deployment object but failed at `actions/configure-pages@v5` with:

`Get Pages site failed. Please verify that the repository has Pages enabled and configured to build using GitHub Actions ... Error: Not Found`

`Upload static site` and `Deploy to GitHub Pages` were therefore skipped. The temporary workflow was removed in commit `30a7bb04a0162b2117aa80ffcd5d6186e3262b5f` so future pushes do not create a known-failing deployment check.

## Result

F08 remains `BLOCKED` because no hosting path currently available through the authorized connectors can produce a real public production deployment now:

- Vercel Git deployment is blocked by the Hobby build/deployment quota.
- Vercel direct deployment is not callable because of the connector schema mismatch.
- GitHub Pages requires repository Pages enablement/configuration not exposed by the current connector.
- Supabase public Edge Function fallback would require an auth-policy change that was not explicitly authorized.

No deployment was claimed as successful and no HTTP 200 evidence was fabricated.
