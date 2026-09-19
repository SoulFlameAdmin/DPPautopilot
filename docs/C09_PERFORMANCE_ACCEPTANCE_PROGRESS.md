# C09 Performance Acceptance — Partial Progress

C09 remains **RED** because T07 and C07 are not GREEN and no real production-like deployment performance run exists.

The precursor deliberately reuses the versioned T07 budgets instead of inventing new SLOs: at least 200 multi-surface requests at concurrency 25, zero request errors, p95 <= 2000 ms, and a 1000-row import <= 3000 ms.

Final acceptance must use real HTTP/TLS against a production-like **non-production** preview/staging target for the exact C07 commit. Production customer data and the production database are forbidden for this load run. In-process/synthetic handler timing cannot satisfy C09.

The verifier denies commit drift, non-TLS targets, production data/database reuse, insufficient load/concurrency, any error-rate breach, p95 breach, import-volume/latency breach, and synthetic-only metrics.

No Vercel deploy or load against production is performed by this precursor.
