-- QR/SKU client-readiness hotfix: pgcrypto lives in the extensions schema on Supabase.
-- The batch provisioning RPC uses digest() for an idempotency fingerprint. With the
-- previous locked search_path (public, pg_temp), production failed before provisioning.
-- Keep SECURITY DEFINER search_path explicit and add only the trusted extensions schema.

alter function public.dpp_api_scooter_battery_batch_provision(uuid,text,jsonb)
  set search_path = public, extensions, pg_temp;
