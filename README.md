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
