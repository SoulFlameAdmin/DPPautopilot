-- BAT13/BAT05 metadata sync: applicability metadata changed the canonical
-- catalog version while field-path/access pairs remain unchanged.
update public.dpp_field_catalog_runtime
set catalog_version='2026-09-18-applicability-v1',
    synced_at=now()
where catalog_version is distinct from '2026-09-18-applicability-v1';

comment on table public.dpp_field_catalog_runtime is
  'BAT05 runtime field/access projection synchronized to canonical catalog version 2026-09-18-applicability-v1; applicability rules remain in the versioned JSON catalog.';
