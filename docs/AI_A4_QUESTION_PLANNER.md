# AI A4 — Deterministic Questions

Draft Worker A module. It reuses the existing eight-field manufacturer intake contract and asks conflicting, missing, then unverified questions. Bulgarian and English wording work without an AI API.

The caller must supply server-authorized facts and conflict flags. This helper never writes to a database, authorizes approval, generates a battery passport or publishes a QR passport. The eight onboarding fields are not the EU Battery Annex XIII dataset.

Manual review and production release remain gated separately. Suggested check: `node --test tests/api/a4-question-planner.spec.cjs`.
