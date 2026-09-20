-- R07 cleanup: converge duplicate registry credential guards to one canonical request+response guard.
-- Historical migrations remain immutable; this migration only removes the superseded request-only helper/trigger.

drop trigger if exists dpp_registry_request_payload_privacy_guard
  on public.dpp_registry_submissions;

drop function if exists public.dpp_reject_registry_payload_credentials();
drop function if exists public.dpp_json_has_credential_key(jsonb);

comment on trigger dpp_registry_payload_credential_guard on public.dpp_registry_submissions is
  'R07 canonical registry privacy guard: request_payload and response_payload fail closed on obvious credential-bearing JSON keys.';
