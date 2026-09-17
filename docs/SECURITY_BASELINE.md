# DPP Autopilot — Security Baseline

## Repository rules

- Never commit secrets, private keys, database passwords, service-role keys or production credentials.
- Environment files are ignored except a future `.env.example` containing names/placeholders only.
- CI runs `scripts/security_hygiene.py` on every push/PR to catch obvious secret patterns and forbidden tracked environment files.
- Third-party workflow actions must use explicit major versions now and should be pinned to immutable SHAs before production release.
- Dependencies must be introduced through a package manifest/lockfile and reviewed by CI; ad-hoc CDN scripts are not acceptable for production-critical code without integrity/version controls.

## Application security target

- Authentication and authorization are server-enforced, not UI-only.
- Tenant isolation is enforced in the database with RLS plus server/API checks.
- Public passport views expose only fields classified public by the requirements matrix.
- Service-role/database/registry secrets are server-only.
- Inputs and uploads are validated server-side; size/type limits are explicit.
- Critical changes produce immutable audit evidence.
- Rate limits and abuse controls protect public and sensitive endpoints.
- Logs must not contain secrets or unnecessary personal/commercially sensitive data.

## Dependency strategy

When the static prototype becomes an application:
1. Choose the minimum required runtime/framework packages.
2. Commit the lockfile.
3. CI installs from the lockfile deterministically.
4. Run dependency vulnerability review in CI.
5. Reject known critical/high vulnerabilities unless a documented, time-bounded exception exists.
6. Keep runtime and build dependencies separated.
7. Remove unused packages during each release cycle.

## Current status

This baseline covers repository hygiene only. It does not claim production application security. Auth, RBAC, RLS, rate limiting, privacy, security headers, dependency scanning and penetration/security acceptance remain separate RED tasks in the master plan until implemented and tested.
