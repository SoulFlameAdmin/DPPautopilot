# DAVID White Call Desk v0.9 · MITKO REVIEW

This folder contains a safe, **read-only** web review of the Windows DAVID White Call Desk. Main branch and DPP routes remain unchanged until this branch is approved and merged.

## How to review

Open the Vercel review deployment link, check the Live Call Desk, Company Info, Call Records and Settings/Security screens. Use the Notes demo to test local-only drafts. The preview has no live credentials, API connection, external storage, calls, real customer data or real captions.

## Actual Windows implementation (separate)
DAVID v0.9 Windows locally supports Twilio trial API check / test call / hangup, local metadata import (up to 100 calls; 60-second sync while configured), CSV exports, company notes, browser microphone captions, local mic recording, and email drafts. The Windows server is loopback-only and cannot be deployed unchanged to a public Vercel URL.

## Next stage for shared access
- Authenticated worker and reviewer accounts
- Supabase tenant/role isolation, opt-in Twilio call metadata and notes synchronization
- Secrets only in server-side protected environment variables
- Webhook verification, audit logs and call recording consent
- Admin approval for customer access, paid calling and any recordings

Never commit Twilio secrets, account numbers, phone lists or recordings. Keys visible in earlier chat screenshots must be revoked.

Review by Mitko requested; no deployment to DPP production or merge is requested.
