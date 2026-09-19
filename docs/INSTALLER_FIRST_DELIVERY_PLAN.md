# DPP Installer-First Delivery Plan

This file is the active delivery strategy for DAVID when choosing dependency-safe product work.

## Priority order

1. Keep one versioned DPP product and track it in `data/installer-release.json`.
2. Package the existing DPP web UI and installer UI into a local Windows desktop application.
3. Produce a test `DPP-Setup.exe` that contains the required local UI/assets and launches DPP after installation.
4. Store customer data/config outside replaceable application binaries.
5. Implement DEV and STABLE update channels.
6. Updates must be signed/verified, backed up, health-checked and rollback-safe.
7. Test installation/update on a clean Windows environment without GitHub, Node, Python or developer secrets.
8. Add customer-specific connectors only through explicit adapters and customer-owned credentials.
9. Vercel is a secondary distribution/update host, not a blocker for local installer development.
10. Never mark installer work production-ready without concrete install/update/rollback evidence.

## Version rule

DAVID must read `data/installer-release.json` before installer work. Every release change advances the version deliberately and records source SHA, channel, tests and evidence. DEV versions may move quickly. STABLE is customer-facing and requires all release acceptance gates.

## Language rule

All customer-facing installer and application surfaces must support persistent BG/EN switching. New UI must not introduce untranslated customer-visible strings.

## Current next task

Package the existing local DPP site + installer UI into the first Windows desktop shell while preserving local/offline startup. Do not wait for Vercel if this task can proceed locally.
