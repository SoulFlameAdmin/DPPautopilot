# Global DPP RLS / Grant Guard

Status: **hardening evidence**

This guard fails if any `public.dpp_*` table has Row Level Security disabled or exposes direct table privileges to `anon` / `authenticated`.

It preserves the deny-by-default architecture while narrow approved functions/API paths remain the intended client boundary.

This strengthens M05, R04 and T02 evidence but does not independently make those master tasks GREEN.
