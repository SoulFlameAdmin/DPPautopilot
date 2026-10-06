# Steps 36–37 · Production Acceptance

Accepted on 2026-10-06 against the production DPP stack.

## 36 · XLSX / Excel import
- Production company dashboard exposes XLSX upload.
- SheetJS 0.20.3 is bundled locally.
- Multi-sheet selection is implemented.
- XLSX rows pass through the same normalized Stage → Validate → Commit import pipeline as CSV.
- Production deployment reached READY on the canonical alias.

## 37 · Saved import mappings
- Existing tenant table `dpp_import_mappings` is now exposed only through authenticated tenant/RBAC RPCs.
- Profiles support CSV and XLSX.
- Owner/Admin/Editor can create, update, revision and delete profiles.
- Viewer can list/read profiles but cannot mutate them.
- Profile fields include source headers, canonical field mapping, source format and revision.
- Company import UI can select, load, apply, save and delete mapping profiles.
- Manual mapping changes detach the active saved-profile relation until the mapping is saved/applied again.
- Staged imports persist `mapping_id` through the existing transactional import API.

## Production constraints handled
- A separate `/api/import-mappings` serverless function was intentionally removed because the Vercel Hobby project has a 12-function deployment limit.
- Saved mapping operations were folded into the existing `/api/imports` function, preserving the function-count ceiling without reducing functionality.

## Acceptance evidence
- Supabase migration `dpp_saved_import_mapping_api` applied successfully.
- Production DB acceptance executed create → update/revision → list → delete and returned `STEP37_DB_ACCEPTANCE_PASS`.
- Browser operations JS and imports API JS parse successfully.
- Production Vercel deployment `dpl_akeUrNykaXyduKUnPW9kNssXcZZx` reached READY and owns the canonical `dpp-autopilot.vercel.app` alias.
- No direct table privileges were granted to browser roles; access remains through tenant-scoped SECURITY DEFINER RPCs.

## Sequential result
- GREEN through: **37**
- Next task: **38 · Customer API credentials**
