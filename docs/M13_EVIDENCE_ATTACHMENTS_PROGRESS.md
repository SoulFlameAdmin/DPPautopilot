# M13 — Evidence Attachments Progress

Status: **PARTIAL — master task remains RED**

This precursor implements the database/policy boundary for evidence files without claiming a real object-storage upload/download path.

Implemented: tenant-scoped evidence metadata; model/item/passport/registry/import related-record types; cross-tenant target rejection; dedicated `dpp-evidence` bucket metadata; organization-prefixed paths; project MIME allowlist (PDF/PNG/JPEG/CSV/JSON); 10 MiB project maximum; SHA-256 metadata; member-read/editor-write/admin-delete RLS policies; deny-by-default production grants; immutable M12 audit hook.

The 10 MiB/type allowlist is a DPP Autopilot product policy, not a legal requirement.

M13 remains **RED** because M03 is RED and no real Supabase Storage/API upload/download flow has yet been tenant-enforced and tested.
