# Google session expiry P0

An expired Google access token must not be made valid by extending `expires_at` in browser storage. Only Supabase Auth may issue a new access token after refresh. This is an independent Draft QA branch, not a production authorization.
