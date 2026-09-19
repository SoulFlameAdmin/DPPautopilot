-- DPP security hardening: shrink directly callable authenticated RPC surface.
-- Pure context/path parsers do not need definer rights; internal tenant/RBAC helpers remain
-- SECURITY DEFINER but are callable only by owner/service_role, while public API RPCs retain access.

alter function public.dpp_request_user_id() security invoker;
alter function public.dpp_evidence_storage_org_id(text) security invoker;

revoke execute on function public.dpp_active_organization_id() from authenticated;
revoke execute on function public.dpp_require_active_role(text[]) from authenticated;
revoke execute on function public.dpp_set_active_organization(uuid) from authenticated;
