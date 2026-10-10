# SOULFLAME DPP — ЕТАП 2 / ЗАКЛЮЧЕН MASTER PLAN

**Статус:** Задължителна посока за работа; **не е технически PASS / production READY**.
**Решение:** 2026-10-11.
**Важно:** ЕТАП 2 е продуктов етап с четири задължителни работни блока. Не го смесвайте с имена на съществуващи CI jobs (Stage 2/4/5), C04 или с технически миграции.

## ЕТАП 2.1 — Единен AI процес

**AI извличане → уточняващи въпроси → човешко одобрение → DPP чернова.**

Definition of Done:
- A3 обработва описание и документи с file/source SHA, произход, права и противоречия; никакъв недоказан AI факт не получава `verified=true`.
- A4 задава конкретни въпроси за липсващи/противоречиви данни и поддържа избор, корекция, отхвърляне и resume.
- A2 проверява действителния tenant, актьор, роля, собственост, CAS и idempotency; негативни two-tenant/two-actor тестове.
- A5 приема само потвърдени факти и изгражда **чернова** с източници и видими липсващи полета, без автоматично публикуване.
- Доказан end-to-end тест от един реалистичен вход до запазена чернова, включително отказ/повторение/конфликт.
- GPT endpoint #329/#335 са само начална част от тази функционалност. Targeted CI PASS не е E2.1 PASS.

## ЕТАП 2.2 — Реални архиви и възстановяване; безопасно затваряне на C04

Definition of Done:
- Авторитетен encrypted backup на **живата** PostgreSQL база, отделно архивирани реални private/public Storage bytes, manifest с counts/bytes/SHA-256; **без публикуване на лични данни/тайни**.
- Изолиран **реален** DB + Storage restore, измерено време, сравнение на обекти/права, auth/RLS/RBAC/RPC/tenant/QR invariants.
- Отделно: `BASELINE_RECOVERY_PASS` и `MIGRATION_REHEARSAL_PASS` след точните 10 C04 миграции върху копие. Synthetic PG17 restore не изпълнява първото условие.
- Одобрен rollback план, exact SHA + migration checksums, reviewer PASS.
- **STOP:** Без изрично одобрение на собственика — никакъв live SQL, grant/revoke, snapshot refresh, merge или deploy. Проектът е на Supabase Free; проверка на реален provider backup/PITR е задължителна, наличност не се предполага.
- Докато тези доказателства липсват: **C04 RED**, независимо от успехите на изолирания CI.

## ЕТАП 2.3 — Всички задължителни полета, валидации и приложимост

Definition of Done:
- Пълна independently reviewed LMT 71-point matrix: mandatory/conditional/future, types, units, value paths, public/restricted/authority-only, source/provenance, field-level access.
- Формални валидатори и безопасен mapping за сложните nested/list fields; непотвърдените, липсващите и неприложимите са различни състояния.
- Security negative tests за private/authority fields, грешни единици, fabricated evidence, update/version controls.
- Независим domain/legal review на актуалните изисквания към конкретния продукт, без измислено EU compliance/certification твърдение.
- AI може да предложи факти, но не да извършва юридическа атестация.

## ЕТАП 2.4 — Реален пилот с фирма, 10 батерии, QR и актуализации

Definition of Done:
- Реална пилотна фирма с изрично съгласие, проверени роли и потвърден достъп.
- Създаване на модел и партида/10 отделни батерии; точни уникални ID и генерирани версии на DPP.
- **Физически** печат и сканиране на QR с поне два телефона/браузъра, real public/private data projection, обновяване на паспорт и повторно сканиране на СЪЩИЯ QR, проверка на историята и revocation/role limits.
- Снимки, времеви отметки, логове, независим PASS от пилотния клиент и документирани FAIL сценарии.
- Не се твърди production/commercial readiness при липса на отворено и документирано клиентско приемане.

## Задължителни междинни доказателства

За всеки блок: owner, задачa, PR, exact SHA, CI run, acceptance evidence, независим REVIEW verdict, FAIL/BLOCKED причини. **Никакви проценти или 100% READY без всички mandatory PASS.**

## Отговорности

- **Борко:** независим QA на A2/RLS/CAS; C04 migration/recovery toolkit и реален recovery evidence plan; ревю на E2.1/2.3/2.4.
- **AI/DPP разработка:** свързване на A3→A4→A2→A5 и field validators в Draft branches с изолирани тестове.
- **Собственикът:** осигурява и изрично одобрява чувствителен live backup, staging/restore разходи, миграции/деплой, работа с реална фирма и пилотен тест.

**Release gate:** ЕТАП 2 PASS само при E2.1 + E2.2 + E2.3 + E2.4 = независимо доказани PASS. Документът сам по себе си НЕ е PASS, permission или production release.
