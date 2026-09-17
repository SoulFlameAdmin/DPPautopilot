# Binding Attempt 08 — 2026-09-17

## Goal

Resolve F08 with a safe hosting fallback while preserving the canonical GitHub repository, avoiding Vercel quota bypass, avoiding invented secrets, and avoiding unrelated infrastructure changes.

## Live Vercel recheck

At 2026-09-17 22:19:52 Europe/Sofia:

- Vercel project `dpp` (`prj_K0RSGrEkEr3XDouCTA3tdasbqH55`) still had zero deployments.
- Vercel project `dpp-autopilot` (`prj_G5l5aZmy3TY7wVRZsl4zCG7zG3yr`) still had zero deployments.
- Controlled mirror commit `748806ae42aa5e958a993137695818036b1022b6` still reported Vercel `failure` with target containing `upgradeToPro=build-rate-limit`.

The Vercel blocker therefore remains platform/account capacity rather than a repository code/config regression.

## Supabase Edge fallback

A new isolated Edge Function `dpp-autopilot-static` was created. It uses only a Supabase publishable-key guard and reads the public canonical GitHub repository; it does not write application data or touch unrelated Edge Functions.

Version 2 fixed path routing. Supabase `pg_net` production-side HTTP checks then verified:

- app endpoint: HTTP 200
- `data/master-plan.json`: HTTP 200 and JSON body
- `data/worker-status.json`: HTTP 200 and JSON body

However, the app response was forced to `text/plain`. Current Supabase documentation explicitly states that Edge Functions do not support HTML content and rewrite `text/html` GET responses to `text/plain`.

An XHTML variant (`application/xhtml+xml`) was also tested in version 3, but the Supabase gateway still returned `text/plain`. Therefore Edge Functions cannot serve the browser frontend for F08.

## Supabase Storage fallback

A dedicated public Storage bucket `dpp-autopilot-static` was created through an isolated publisher function. The publisher used Supabase server-side secret credentials only inside the Edge runtime; no secret was written to GitHub, returned in a URL, or exposed to the client.

The bucket successfully received:

- `index.html`
- `data/master-plan.json`
- `data/worker-status.json`

Production-side `pg_net` checks verified HTTP 200 for all three objects. The JSON objects were served with `application/json` as expected. The HTML object was served as `text/plain`.

A further `index.xhtml` object with `application/xhtml+xml` was uploaded after widening the bucket MIME allowlist. It also returned HTTP 200 but was served as `text/plain`.

Current Supabase Storage documentation confirms this is intentional: HTML files are returned as plain text for security. Therefore Supabase Storage cannot be accepted as a browser frontend host for F08.

## Result

F08 remains `BLOCKED`.

Verified remaining blocker:

1. Vercel remains at `build-rate-limit` and has zero DPP deployments.
2. GitHub Pages creation is blocked by the connected GitHub integration permission (Attempt 05).
3. Netlify remains an external viable host but requires an explicit user connection/install before it can be invoked.
4. Supabase Edge Functions and Storage can return the DPP JSON/API content with HTTP 200, but both intentionally force HTML/XHTML frontend content to `text/plain`; they are not valid static frontend hosts.

No browser-ready production deployment or HTTP evidence was fabricated.
