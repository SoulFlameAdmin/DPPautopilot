create index if not exists dpp_carrier_scan_carrier_fk_idx
  on public.dpp_carrier_scan_events(organization_id,carrier_id);
