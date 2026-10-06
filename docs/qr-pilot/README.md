# First customer QR pilot — intake and acceptance

Technical validation only. DEMO / SAMPLE / APPROVAL materials are not legal compliance evidence. This package does not alter production, activate passports, or bypass the LMT readiness route.

## Customer handoff / Entrega del cliente / Клиентски данни

One company, one model, ten individually identified battery units. A shared model SKU is not a unique unit ID. Fill `client-intake-template.csv`; additional technical columns and supporting source documents should be agreed with the operator. This four-column intake is an identification checklist, **not** a complete import dataset or Annex XIII passport.

ES: Solicitamos datos autorizados de un modelo y diez baterías, con un identificador único por unidad. Para empezar no necesitamos baterías físicas, API, NFC ni acceso a producción. Indiquen qué campos pueden publicarse y quién aprobará el piloto.

BG: Искаме разрешени данни за един модел и десет батерии с отделен идентификатор за всяка. За начало не са нужни физически батерии, API, NFC или production достъп. Уточнете кои полета могат да са публични и кой ще одобри пилота.

Fill `client-approval-template.json` with a real approval reference, category review reference, exact identifiers, public-column allowlist, and UAT contact. Keep approvals and customer data in an authorized private location, **never commit completed files to this repository**. Empty templates intentionally fail validation. Permission to use data does not mean permission to publish all fields. This approval format is an internal handoff; existing production access policy remains authoritative.

Run offline, without API or database access:

```sh
python3 scripts/check_qr_pilot_intake.py /private/customer.csv /private/approval.json
```

A preflight PASS checks structure and matching supplied approval only. A human must confirm authorization authenticity, actual battery category, required model fields and public/private projection before existing import mapping/validation. Never infer LMT from the word scooter; never send LMT through the non-LMT technical-pilot path. Missing compliance fields remain missing, never fabricated.

## Evidence gates

Record accepted git commit, deployed environment, tenant, operator, time, expected result, actual result and evidence reference for each step. Keep the customer's private evidence outside the public repository.

| Gate | Required evidence | Initial state |
|---|---|---|
| Release | Relevant CI green on accepted commit; deployed commit and smoke verified | NOT RUN |
| Authorization | Data-use permission, public field allowlist, category review | NOT RUN |
| Isolation | Own company context; unauthorized user/other tenant denied | NOT RUN |
| Import | Agreed mapping, validation, ten units; no silent row loss | NOT RUN |
| Passport/QR | Ten distinct unit passports and ten matching QR targets | NOT RUN |
| Physical print | Real size, legible unit ID, no clipped QR; phone opens exact passport | NOT RUN |
| Update/rescan | Authorized update; same printed QR returns updated unit; audit entry | NOT RUN |
| Negative cases | Unknown ID, duplicate ID and invalid input rejected clearly | NOT RUN |
| UAT | Named customer reviewer accepts results and documents missing data | NOT RUN |

First customer is accepted only with actual customer data and physical scan evidence. Test-batch success is not customer UAT. No automatic acceptance, legal certification, EU Registry submission, or second-customer rollout is implied.
