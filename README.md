## Latest consolidated engineering workstream — 2026-10-10

The project now groups related audits into domain workstreams to reduce pass/report overhead without deleting historical evidence. Current report: [Data + DB privilege integrity workstream](docs/DATA-SECURITY-INTEGRITY-WORKSTREAM-2026-10-10.md). A least-privilege migration is committed but **not applied** to live Supabase; no production database writes were made. CI runner and deployment/runtime checks remain open.

## Полная концепция проекта
Полное описание идеи, архитектуры, учебной логики, предметных контуров, принципов бесплатности, администрирования, безопасности и будущего развития: [docs/PROJECT-CONCEPT-AND-VISION.md](docs/PROJECT-CONCEPT-AND-VISION.md).

# MEDBIOHIM

## Ветки (важно)

| Ветка | Роль |
|-------|------|
| **`main`** | **Прод** — source of truth, Vercel production |
| **`beta`** | **Только тесты и эксперименты** — не деплоить как production |

Подробно: **[BRANCHES.md](BRANCHES.md)** · журнал экспериментов: **[docs/ACTIVE-EXPERIMENTS.md](docs/ACTIVE-EXPERIMENTS.md)**

Коммиты на `beta`: префиксы `experiment:` / `test:` / `wip:`. На `main` — только готовое к проду.

## Frontend (repo root) → Vercel
Next.js App Router.
- Browser API base: `/api/v1`
- Vercel server-side proxy target: `SPACEWEB_API_ORIGIN`
- Chemistry (на main): `/chemistry`, `/api/chemistry/resolve`, `/api/chemistry/health` — см. [docs/chemical-engine.md](docs/chemical-engine.md)
- **Strict TypeScript**: see **[docs/dev-notes.md](docs/dev-notes.md)**.

## backend/ → SpaceWeb
PHP API. Document root: `backend/public/`.
Copy `.env.example` → `.env`. Folder `data/` must be writable.

## Deployment chain
`Browser → Vercel /api/v1 → SpaceWeb /api/v1 → PHP → Supabase`

## План и документация
- [ROADMAP.md](ROADMAP.md) — единый план проекта и порядок работ
- [Отчёт Pass 53: API proxy hardening](docs/API-PROXY-HARDENING-2026-10-10-PASS53.md) — PHP-first fallback, приватное кеширование media, безопасные 502; CI/runtime verification ещё заблокированы
- [Отчёт Pass 54: сверка целостности тестов и вопросов](docs/DATA-INTEGRITY-RECONCILIATION-2026-10-10-PASS54.md) — read-only проверка связей и классификация пустых ответов
- [PHASES_STATUS.md](PHASES_STATUS.md) — текущее состояние фаз
- [Единый чек-лист GitHub/production](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md) — Actions, сборка, API, безопасность, данные, media, UI и сценарии end-to-end
- [docs/README.md](docs/README.md) — карта документов и источников истины
- [Браузерное расширение](integrations/browser-extension/README.md) — MVP быстрых ссылок для Chrome/Edge
- [GitHub issue template](.github/ISSUE_TEMPLATE/bug_report.yml) — структурированная фиксация ошибок с commit SHA и доказательствами
- [Optional integrations workflow](.github/workflows/optional-integrations-check.yml) — тесты Telegram webhook и минимальных прав расширения

## Docs
- [BRANCHES.md](BRANCHES.md) — main vs beta
- [docs/ACTIVE-EXPERIMENTS.md](docs/ACTIVE-EXPERIMENTS.md) — что тестируется на beta
- [docs/chemical-engine.md](docs/chemical-engine.md)
- [docs/dev-notes.md](docs/dev-notes.md)
- [docs/platform-concept-medbiohim.md](docs/platform-concept-medbiohim.md)

Synced: 2026-10-10


## Текущее состояние проекта — 2026-10-10

MEDBIOHIM — единая образовательная платформа. Полный запланированный функционал сохраняется при $0 обязательных расходов.

**Важно:** этот README описывает архитектуру и функциональные контуры. Он не заменяет runtime-проверку: актуальные статусы, подтверждённые deployment SHA, блокеры и правила закрытия задач фиксируются в [ROADMAP.md](ROADMAP.md), [PHASES_STATUS.md](PHASES_STATUS.md) и [едином чек-листе проверки](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md). Коммит или статус Vercel READY сам по себе не означает, что SpaceWeb API, физические файлы и пользовательские сценарии проверены.

### Каноническая архитектура

- GitHub — код, миграции, документация, roadmap/status и небольшие декларативные контентные артефакты.
- Vercel Hobby — Next.js frontend и deployment.
- SpaceWeb Free — PHP API/runtime и тяжёлые физические media-файлы.
- Supabase Free — PostgreSQL, Auth, RLS, metadata и canonical data.
- Backblaze B2 Free — дополнительное object storage/backup при необходимости.
- Дополнительные бесплатные сервисы — только специализированные дополнения: cache/CDN, push, OCR, search, monitoring, analytics, backup.

Supabase остаётся единственным canonical source of truth для данных. Дополнительные сервисы не создают вторую конкурирующую БД и не должны быть обязательными для базовой работы сайта.

### Уже реализовано

- авторизация, /api/v1/me, роли и academic context;
- группы, предметы, учебный план и расписание;
- homework/planner и group-scoped academic flows;
- тесты, подготовки, история и server-authoritative scoring;
- immutable snapshots для воспроизводимости результатов;
- Question Library с ответами без запуска теста;
- subject-scoped банки вопросов и жалобы на вопросы;
- admin problem center;
- optional AI grading с deterministic-проверкой до вызова AI;
- игнорирование орфографических ошибок при свободном ответе;
- curriculum → topic → question/test mapping;
- Histology atlas/trainer/materials architecture;
- 28 electronograms и captions metadata;
- Chemistry unified master catalog на 436 элементов с provenance;
- chemistry bank на сайте;
- admin database console с редактированием, импортом/экспортом и audit/rollback;
- поиск и пагинация в admin database console;
- zero-cost/full-functionality policy;
- стабильная baseline-точка для безопасного отката.

### Гистология

Физические материалы хранятся отдельно от Supabase metadata. Канонический runtime-путь на SpaceWeb: /public_html/content/histology/.

Модель: Supabase metadata/source_key/path → SpaceWeb physical file → PHP API → frontend.
Наличие записи в Supabase не считается доказательством существования физического файла; финальная проверка — HTTP 200 + корректный MIME.

### Тесты и ответы

Server-authoritative модель: клиент не является источником правильного ответа; question/authoritative answer фиксируются snapshot; score вычисляется сервером; free-text сначала проверяется детерминированно и только затем при необходимости AI; AI необязателен; spelling/orthography не должны влиять на смысловую оценку; multiple-choice проверяется без AI.

### Химия

Единый master catalog: 436 элементов, 260 open tasks, 176 test questions. Сохраняется provenance двух независимых методических источников. Текстовые формулы сохраняются; image-only structural formulas не восстанавливаются догадкой; неподтверждённый OCR не заменяет production answers.

### Администрирование

Планируется единый PC-style Operations Center: Database Console → Content Center → File & Storage Center для SpaceWeb/B2 → reconciliation metadata/objects → health/quota dashboard → audit/history/rollback. Изменения должны проходить whitelist, server-side role checks, validation и audit.

### Объединённый flow расписания и заданий

Целевой сценарий: Расписание → дата → предмет → занятие → задание → выполнение/сдача → единый статус.

### Основной незакрытый backlog

Перед тем как отмечать любой пункт готовым, пройти соответствующую часть [единого чек-листа GitHub/production](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md). Для каждого подтверждённого дефекта создать GitHub issue с commit SHA, шагами воспроизведения, ожидаемым/фактическим результатом и безопасно очищенными логами.

Production/runtime Vercel + SpaceWeb + CI; auth/security final gate; физическая сверка Histology media; Materials/DOCX/PDF/media delivery; smoke всех published tests; единый Schedule + Homework UX; Smart grading E2E; admin Content Center; DB/File/Storage Operations Center; mobile/browser acceptance; завершение Chemistry answers/formula verification; strict TypeScript/ESLint и architecture cleanup; AI tutor/provider runtime; performance/free-tier optimization; дополнительные бесплатные сервисы только как optional additions.

Подробности и порядок работ находятся в ROADMAP.md и PHASES_STATUS.md.

### Дополнительные инструменты

- Browser extension MVP: `integrations/browser-extension/` — только быстрые ссылки, без permissions, токенов и доступа к приватным данным.
- [Telegram bot MVP](integrations/telegram-bot/README.md): изолированный webhook с `/start`, `/help`, `/site`, `/schedule`, `/tests`, `/subjects`, `/materials`, `/privacy`. Пока только публичные ссылки; нет доступа к аккаунтам, расписанию конкретного студента или оценкам.

### Zero-cost правило

Функциональность не удаляется и не урезается только из-за бесплатной инфраструктуры. Сначала применяются cache, pagination, lazy loading, streaming, batching, deduplication, metadata/binary separation и распределение нагрузки между бесплатными слоями.

### Stable baseline

Rollback reference: 8e8fef5c2f661e7e1d625964909307c00c343884. Это технический baseline, а не независимая production-проверка.


### Latest engineering workstream — 2026-10-10 (Pass 55)

Reviewed GitHub Actions workflow definitions and rechecked the runner failure; current evidence still shows a pre-step failure, not a confirmed test failure or green CI. Reconciled Histology electronogram metadata read-only: 28 cards, captions on all, five source/image basename mismatches, and no linked `source_file_id` values. No production data or media paths were changed pending physical SpaceWeb/B2 verification. Details: `docs/CI-MEDIA-TRACEABILITY-WORKSTREAM-2026-10-10-PASS55.md`.


### Pass 56 — security status

The PostgreSQL 17.6 privilege audit found unnecessary MAINTAIN/TRUNCATE/REFERENCES/TRIGGER privileges on 71 public tables for `anon` and 78 for `authenticated` (out of 83). The migration was updated but remains unapplied. Latest Actions runs are pre-step failures, so current CI is blocked/unverified. Details: `docs/DATABASE-LEAST-PRIVILEGE-STATUS-RECONCILIATION-2026-10-10-PASS56.md`.

### Latest verification status — 2026-10-10 (Pass 57)

- GitHub Actions smoke job retry still fails before steps/logs (`steps: null`); PHP/frontend checks have not been verified by CI. Do not treat this as a code-test failure or a green build.
- Supabase default ACL/role-membership preflight was read-only. Least-privilege migration is committed but **not applied**; no production writes in this pass.
- Details: [Pass 57 CI + DB preflight](docs/CI-DB-PREFLIGHT-WORKSTREAM-2026-10-10-PASS57.md).

### Release verification caveats — Pass 58 (2026-10-10)

The latest source audit found no tracked frontend dependency lockfile, a minimal ESLint config without rules, Next.js build configuration that ignores built-in TypeScript errors (the separate predeploy audit runs typecheck), and disabled FTPS certificate verification in the backend deployment workflow. GitHub Actions still fails before steps, so none of these gates has been confirmed by a successful run. Details: [Pass 58 report](docs/RELEASE-GATE-SOURCE-AUDIT-2026-10-10-PASS58.md).


### Latest engineering status — 2026-10-10 (Pass 59)
GitHub Actions currently fails across code-check, smoke, backend archive, and source-package workflows before step details are exposed (`steps: null`). This does not establish that code checks ran or failed; frontend/PHP validation remains unverified. Follow `docs/CI-RUNNER-RECONCILIATION-2026-10-10-PASS59.md` for evidence and next steps. No production deployment or database writes were made in this pass.


### CI efficiency update — Pass 60
Documentation-only pushes now skip code-check, smoke-on-push, source-package, and backend-archive workflows where configured. Scheduled/manual checks remain available. This is queue-noise reduction only; the Actions runner initialization issue remains unresolved. See `docs/CI-DOCS-ONLY-FILTERS-2026-10-10-PASS60.md`.


### Actions diagnostics — Pass 61
The job-step endpoint returned no steps and log downloads returned `BlobNotFound` for both code-check jobs. The connected integration has repository admin-level permissions and the repo is not archived, so root cause remains unknown. Owner-side Actions settings/usage checks and potentially GitHub Support are needed. No successful CI result is claimed. See `docs/CI-JOB-LOG-DIAGNOSTICS-2026-10-10-PASS61.md`.


### Vercel observability — Pass 62
A recent docs-only production deployment was READY, but the newer commit's deployment state was not confirmed. Vercel runtime-log access returned 403 and build-event retrieval returned 404, so this does not establish runtime health. See `docs/VERCEL-RUNTIME-OBSERVABILITY-2026-10-10-PASS62.md`.


### Pre-deploy audit reconciliation — 2026-10-10
The pre-deploy audit now warns when the ESLint config appears to contain no rules or recognized presets. This is a heuristic warning, not a substitute for a real lint baseline. CI remains unverified while Actions jobs fail before exposing steps/logs. See [report](docs/PREDEPLOY-AUDIT-STATUS-RECONCILIATION-2026-10-10.md).


### Pass 64 — archive security and project inventory
Archive workflows now exclude root and nested `.env*` paths and include a pre-upload archive listing guard. CI has not executed the guard because Actions jobs still fail before steps/logs are available. Current inventory: 38 named PASS reports (numbering up to 64, with historical gaps), 22 closed legacy blockers, and 7 broad remaining workstreams. [Details](docs/ARCHIVE-SECURITY-AND-PASS-INVENTORY-2026-10-10-PASS64.md).
