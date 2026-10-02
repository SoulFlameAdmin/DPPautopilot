# CRYPTO Production Readiness Manifest

This manifest separates software completion from physical authenticity completion.

## Software security gate

Required PASS:
- threat model and trust boundaries;
- tenant-safe NFC identity binding;
- no passport/secrets on chip;
- unique device-key model;
- non-exportable/protected key custody;
- PKI/KMS trust boundary;
- provisioning receipts without secrets;
- challenge issuance;
- standard P-256 verifier and protected AES/KMS adapter;
- atomic anti-replay;
- fail-closed result contract;
- append-only verification history;
- revocation/replacement/rotation;
- tamper state;
- privacy minimization;
- negative/attack contract tests;
- BMS trust-composition hook;
- evidence-driven progress tracker;
- dedicated exact-head DPP CRYPTO CI.

## Physical authenticity gate

Production must remain **NOT PHYSICALLY CERTIFIED** until all apply:
- exact currently orderable secure NFC SKU approved;
- real tag provisioned;
- proof-of-possession captured;
- configuration lock confirmed;
- real phone tap/challenge proof verifies;
- replay/modified/wrong-key/cross-battery/cross-tenant tests fail safely;
- revocation/replacement/rotation tested on real tag;
- counter/tamper behavior tested where supported;
- KMS/provider outage fails closed;
- CR24 evidence bundle completed and linked.

## Deployment gate

Tracker/UI reachability requires a successful deployment. A Vercel build-rate-limit,
account quota or missing deployment access is an external deployment blocker and cannot
be relabeled as security PASS.

## Release label

Until physical gate passes, permitted wording:
**Software security subsystem ready; physical Secure NFC validation pending.**

Forbidden wording:
**100% production-secure physical battery authentication**
unless CR02 + CR13 + CR24 have real hardware PASS evidence.
