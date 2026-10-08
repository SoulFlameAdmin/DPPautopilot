# STAGE 1 / Twins HTTP Input Security — verified ENGINE checkpoint
**Observed:** 2026-10-08 UTC. **Status:** Source CI GREEN, independent QA and deployment NOT DONE.

## Exact tested source
- Repository: `SoulFlameAdmin/soulflame-twins`, branch `mitko/dpp-stability-twins-engine`, **draft PR #170**.
- Tested commit: `4c22239d21868e9be09a30d9944b7722025924df`.
- GitHub Actions: [DPP Tenant Atomic Contract run #37823401651](https://github.com/SoulFlameAdmin/soulflame-twins/actions/runs/37823401651) — **33/33 PASS**, 0 failures. [Individual Quote run #37823401675](https://github.com/SoulFlameAdmin/soulflame-twins/actions/runs/37823401675) — SUCCESS.
- Neither draft PR #170 nor DPP draft PR #293 has been merged, and no Supabase production migration was applied.

## Real security and stability findings fixed in the *Twins Engine draft branch only*
1. `readJson` previously did not enforce max size/JSON object shape on already Vercel-parsed `req.body`, potentially accepting oversized bodies and arrays; malformed raw string JSON silently turned into an empty object. The endpoint now rejects over **30,000 UTF-8 bytes** with **HTTP 413**, invalid/non-object/empty JSON with **HTTP 422**, whether request was parsed, raw string, or streamed.
2. Stream chunks were decoded *independently* with `chunk.toString()`, corrupting multibyte Bulgarian Cyrillic or emoji when a codepoint crossed chunk boundaries. The endpoint now buffers bounded bytes and decodes once after the full stream arrives.
3. Uncaught upstream/service errors previously returned `error.message` to the public response, potentially exposing internal exception details. **5xx messages are now generic**; 4xx retain sanitized user-facing explanations.
4. New tests cover parsed/string/stream parity, 30 KB UTF-8 boundaries, oversized bodies, null/array/malformed/empty JSON, stream-byte overflows, split Bulgarian Cyrillic+emoji, and leak-proof 500 responses.

## Required independent review and next evidence
- Borko verifies security consequences and backward compatibility of the API change against the real frontend, confirms no valid UI request exceeds the limit, and reports exact CI run / SHA.
- Do not mark global STAGE 1 100% GREEN: **Main CI C04** still correctly reports three unapplied database migrations, and **Step18** still references the wrong `dpp_user_tenant_context.organization_id` column (correct column `active_organization_id`). Borko owns Step18 fixture/independent CI review.
- **Backup/restore still unproven.** Do not apply SQL to the shared production database, update `bound-supabase-migration-snapshot`, merge, or deploy solely because this source contract passed.
- Vercel deployment remains deferred by owner.

## Acceptance level
`TWINS_REQUEST_INPUT_SECURITY = TESTED SOURCE GREEN`; `OVERALL_STAGE1 = BLOCKED`; `PRODUCTION = NOT DEPLOYED`.
