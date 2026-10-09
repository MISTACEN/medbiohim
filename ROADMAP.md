# MEDBIOHIM ROADMAP

> Единый план проекта и источник порядка по задачам.  
> Обновляется вместе с изменениями в коде/БД.  
> Дата актуализации: **2026-10-10**.

## Как читать статус

- ✅ **DONE** — реализовано и проверено в живой системе.
- 🟡 **IN PROGRESS** — часть готова, требуется доработка или проверка.
- 🔴 **BLOCKED** — есть конкретный блокирующий дефект/зависимость.
- ⬜ **TODO** — ещё не делали.
- ⚪ **DEFERRED** — сознательно отложено.

Правило: задача получает ✅ только после проверки результата в целевом окружении. Сам факт коммита не считается проверкой.

---

## CURRENT EXECUTION CYCLE — 2026-10-10

**Текущий поток: CI diagnostics → security regression tests → SpaceWeb deployment gate → media/data reconciliation → runtime verification.**

### P1 trainer-answer confidentiality — mitigation applied (Pass 42, 2026-10-09)
- 🟢 Live Supabase: base table `trainer_feed_cards` is no longer readable by `anon` / `authenticated`; safe view `trainer_feed_cards_public` strips answer-bearing fields and option correctness flags.
- 🟢 Safe view was verified with an active MBH membership context: 206 cards visible, 0 correctness flags; unauthenticated SQL-editor context sees no MBH cards.
- 🟢 Direct client writes to `trainer_feed_answers` were revoked; authenticated users submit through `submit_trainer_feed_answer`, which validates membership and grades server-side.
- 🟢 PHP trainer feed/detail and common training-session responses now sanitize unanswered question snapshots; Next.js fallback uses the safe view/RPC and sanitizes unanswered snapshots.
- 🟡 Latest observed READY Vercel deployment is `d0949aa3`; the frontend trainer/security changes from `e23fb882` are included. Subsequent commits also include Pass 45 recursive sanitizer source changes, plus CI/docs/integrations. Pass 45 is not yet confirmed in a READY deployment. Live browser behavior remains unverified. SpaceWeb PHP deployment and real authenticated feed → training → answer → review → complete acceptance remain unverified.
- 🟡 Pass 41 also fixed two PHP syntax errors in `backend/src/Services/AdminDatabaseManager.php` (commit `fb4eed97`); runtime lint/build still await a functioning CI runner.

### P1 trainer route access consistency — source fix committed (Pass 44, 2026-10-10)
- 🟢 PHP source now treats both `subject_slug = histology` and `specialty_slug = mbh` as MBH-restricted in feed, detail, answer submission, and image routes.
- 🟢 The non-MBH feed query and both Supabase REST fallback branches exclude restricted cards; nested trainer-question answer fields are recursively sanitized.
- 🟡 Source fix commit: `99ed1bc905a1b9fe2f2d5ca2f2b6e8bac2dd53a3`. PHP lint, authenticated/non-MBH integration tests, and SpaceWeb deployment remain unverified because Actions jobs terminate before steps. Details: [Pass 44 security report](docs/SECURITY-FIX-2026-10-10-PASS44.md).

### P1 recursive answer-key sanitization — source fix committed (Pass 45, 2026-10-10)
- 🟢 Shared PHP `TrainingPayloadSanitizer::sanitizeQuestion()` now recursively strips answer/explanation/correctness keys; PHP trainer routes reuse it rather than maintaining a weaker duplicate closure.
- 🟢 Next.js trainer sanitizer now recursively traverses nested objects and arrays.
- 🟢 15 PHP sanitizer assertions passed in an isolated PHP 8.4 CLI run using repository class/test contents. A read-only DB spot-check found 206 published cards and no nested answer fields under the checked `question`/`metadata` branches.
- 🟡 Pass 45 is source-only until the next Vercel READY build and SpaceWeb deployment are verified; GitHub Actions still fails before steps. See [Pass 45 report](docs/SECURITY-FIX-2026-10-10-PASS45.md).

### CI/QA hardening — source updated, runner still blocked (2026-10-10)
- 🟢 Fixed the PHP namespace prefix in `.github/workflows/code-check.yml` route-registration smoke test; it previously contained four literal backslashes, which PHP interpreted as two namespace separators instead of one.
- 🟢 Added `backend/tests/TrainingPayloadSanitizerTest.php` covering unanswered answer-key removal, option correctness flags, preparation metadata, media path preservation, answered review preservation, and non-training endpoint isolation. The copied source/test pair was executed locally with PHP 8.4: syntax clean and all 15 assertions passed.
- 🟢 `scripts/predeploy-audit.mjs`, the code-check workflow, and the SpaceWeb deploy preflight now run this regression test.
- 🟢 SpaceWeb deploy workflow now requires a non-empty backup before deployment and verifies Pass 44 route/sanitizer markers after upload.
- 🟡 GitHub Actions runner allocation still fails before steps (`runner_id=0`, `steps=[]`); these new workflow checks have not run inside GitHub yet. See [the unified checklist](docs/GITHUB-PRODUCTION-VERIFICATION-CHECKLIST.md).

### Optional integration — browser extension MVP (2026-10-10)
- 🟢 Added `integrations/browser-extension/` Manifest V3 quick-access popup for Chrome/Edge.
- 🟢 No permissions, host permissions, cookies, API tokens, or private data access; it only opens canonical MEDBIOHIM routes.
- 🟡 Manual installation and all destination routes still need browser acceptance; not published to any extension store.
- 🟢 Telegram bot public-command MVP added under `integrations/telegram-bot/`: secret-verified webhook, private-chat-only public commands, canonical links, privacy response; 12 local Node tests passed using the source/test content.
- 🟢 Added `.github/workflows/optional-integrations-check.yml` to run bot tests and validate extension syntax/permissions.
- 🟡 Not deployed: bot token/webhook secret are not configured; no private data or account linking exists. Before schedule/grade notifications, add one-time linking, durable update idempotency, consent/preferences, group authorization, unlinking and privacy review.

### Active P1 — Unified Media Viewer
- 🟢 code architecture: unified viewer implemented;
- 🟢 Atlas nested modal removed;
- 🟢 Lecture/Trainer/Materials image entry points aligned;
- 🟢 desktop + mobile interaction contract implemented;
- 🟢 malformed TSX escaped-newline artifact found during regression and removed;
- 🟡 target-browser smoke: Windows/macOS/iPhone/Android;
- 🟢 Latest observed READY Vercel deployment (`d0949aa3`) includes the existing Pass 44 frontend source. 🟡 Real browser smoke on desktop/mobile remains open;
- 🟡 SpaceWeb authenticated media smoke.

### Immediate next gates — updated 2026-10-10
1. 🟡 **P1 trainer-answer mitigation verification.** Live DB boundary is fixed; Pass 44 also hardened PHP route membership checks. Verify authenticated MBH/non-MBH end-to-end training flows and confirm the current PHP source is deployed to SpaceWeb.
2. 🔴 **CI runner allocation.** Current GitHub Actions jobs fail before the first step (`runner_id=0`, no steps/logs); no new code-check result exists. Restore runner execution and verify the exact `main` commit.
3. 🟡 SpaceWeb trainer/material media 404/502 smoke and physical-file reconciliation (28 electronogram source-key paths have no matching `content_sources.source_path`).
4. 🟡 Histology questions/tests: compare duplicate/blank-answer candidates against source materials; then run start → answer → finish → review.
5. 🟡 Schedule/auth/dashboard production smoke; clarify makeup-session group scope before expanding recurring rows.
6. 🟡 Compare `site_content` and `histology_lectures`, then unify the canonical lecture source and continue Admin Content Center / quick editors.
7. 🟡 Admin database console target-runtime smoke after the `fb4eed97` syntax fix; validate SQL safety before wider use.
8. 🔴 AI provider runtime health and verified primary provider.
9. 🟡 API client timeout/stale-cache fix (`77b0f4a1`) is included in the latest observed READY Vercel deployment (`d0949aa3`); browser/runtime behavior remains unverified. See [Pass 43](docs/RELIABILITY-FIX-2026-10-09-PASS43.md).

**Rule:** no item becomes DONE from source inspection alone; target runtime evidence is required.

## 0. Source of truth и порядок работы

**Статус: 🟡 IN PROGRESS**

Цепочка проекта:

`GitHub main → Vercel → SpaceWeb API → Supabase`

Правила:
- `main` — стабильный источник для production.
- `beta` — только эксперименты.
- данные предметов и контента считаются актуальными только после проверки Supabase.
- числовое состояние проекта хранится в `docs/LIVE-PROJECT-SNAPSHOT-2026-10-06.md`; roadmap/status не должны копировать устаревающие live counts.
- файлы/медиа, которые физически лежат на SpaceWeb, документируются отдельно.
- перед крупными изменениями сначала обновляем roadmap/status.

---

## 1. Базовая платформа и авторизация

**Статус: 🟡 IN PROGRESS**

### Уже сделано
- ✅ React/Next.js frontend в корне репозитория.
- ✅ PHP backend в `backend/`.
- ✅ Supabase подключён.
- ✅ Auth flow и текущая структура пользовательских ролей существуют.
- ✅ Основные API-модули: auth, me, groups, subjects, tests, homeworks, files.
- ✅ Исправлен legacy test-key resolution (`local:` / `source_key`).
- ✅ Исправлен `AccountSettingsService::getPreferences()`.
- ✅ Настроен deployment workflow backend → SpaceWeb.
- ✅ TLS для HTTP-клиента больше не отключается автоматически.

### Осталось
- 🟡 пройти полный smoke-test логин → dashboard → logout;
- ✅ shared API refresh deduplicated; app bootstrap can recover a valid refresh session;
- 🟡 проверить production после последнего frontend commit;
- 🟡 зафиксировать единую схему env/secrets для Vercel + SpaceWeb;
- 🟡 устранить оставшиеся runtime 404/502 по медиа.

---

## 2. Главная / общий shell

**Статус: 🟡 IN PROGRESS**

- ✅ Sidebar / TopBar / AppShell существуют.
- ✅ Страница предмета использует единый контекст предмета.
- ✅ Базовая визуальная система сохранена стабильной.
- 🟡 **Aero Glass** добавлена только как **β-тема**, не как production default.
- ⬜ после стабилизации функционала провести отдельный UI-аудит всех страниц.

---

## 3. Расписание

**Статус: 🟡 IN PROGRESS**

### Уже сделано
- ✅ расписание берётся из Supabase;
- ✅ group-aware загрузка;
- ✅ День / Неделя / Месяц / Семестр;
- ✅ выделение текущего занятия;
- ✅ карточка занятия с темой;
- ✅ subject/lesson-plan связь;
- ✅ в Supabase для гистологии есть 37 schedule entries.

### Осталось
- 🟡 production smoke-test после последних изменений;
- 🟡 проверить все чередующиеся пары и объединённые пары визуально;
- 🟡 довести mobile view до полноценного agenda-режима;
- ⬜ отдельный polish расписания после функциональной стабилизации.

---

## 4. Архитектура предмета

**Статус: 🟡 IN PROGRESS**

Цель:

`Предмет → Учебный план → Билеты → Тесты → Практика → Лекции → Материалы → Микропрепараты → SRS → Прогресс`

### Уже сделано
- ✅ разделы остаются внутри выбранного предмета;
- ✅ не нужно заново выбирать предмет при переходах;
- ✅ гистология использует canonical active subject;
- ✅ пустая дублирующая запись `histology` на 4 семестр отключена;
- ✅ canonical active subject: 2 курс / 3 семестр.

### Осталось
- 🟡 одинаковый UX для всех предметов;
- 🟡 связать элементы учебного плана с контентом предмета;
- ⬜ предметная страница как единый learning hub.

---

## 5. Гистология

**Статус: 🟡 IN PROGRESS — основной текущий контентный приоритет**

Фактическое состояние Supabase на 2026-10-04:
- ✅ 350 `exam_questions`;
- ✅ 5 `ticket_banks`;
- ✅ 206 опубликованных trainer feed cards;
- ✅ 27 опубликованных материалов;
- ✅ 30 карточек относятся к канонической предметной связке тренажёра/атласа;
- ✅ 9 опубликованных тестов по гистологии;
- ✅ 14 модулей учебного плана;
- ✅ 37 записей расписания по гистологии.

### Архитектура
- ✅ **Микропрепараты → Атлас** — полноценный атлас только контента тренажёра.
- ✅ **Микропрепараты → Тренажёр** — режимы выбора тем/карточек, последовательное прохождение, история.
- ✅ подробные файлы ведут в **Материалы**;
- ✅ DOCX viewer реализован;
- ✅ фото и документы доступны внутри предмета.

### Осталось
- 🟡 проверить соответствие всех 30 карточек плану занятий;
- 🟡 проверить все 28 электронограмм и captions;
- 🟡 проверить полноту тестов 96 + 67 без потери существующих тестов;
- ✅ two malformed bird-blastula links reconstructed from supplied source archive;
- 🟡 пройти UI smoke-test атлас → материал → документ → назад;
- 🟡 решить 404/502 локальных медиа на SpaceWeb;
- ⬜ сделать окончательную матрицу: тема → лекция → препарат → ЭМ → вопросы → тест.

---

## 6. Тесты и банк вопросов

**Статус: 🟡 IN PROGRESS**

### Уже сделано
- ✅ 735 опубликованных questions (live Supabase, 2026-10-05);
- ✅ test/question backend;
- ✅ режим банка;
- ✅ нумерация;
- ✅ последовательное прохождение;
- ✅ history/attempt flow;
- ✅ admin editing groundwork;
- ✅ legacy test IDs через `source_key`.

### Осталось
- 🟡 проверить каждый published test на открытие;
- 🟡 довести admin quick-edit вопросов;
- 🟡 объединить bank / проход / разбор в один UX;
- ✅ массовая проверка целостности test → questions проведена; после dedup 118 однозначных связей восстановлены;
- ✅ malformed bird-blastula links reconstructed from supplied source; source answer retained verbatim and documented for review.
- ✅ пользовательские отчёты об ошибках вопроса: student UI + preparation + bank + admin problem center.

---

## 7. Материалы

**Статус: 🟡 IN PROGRESS**

- ✅ материалы доступны внутри предмета;
- ✅ гистология имеет отдельный materials UI;
- ✅ документы и фото разделены;
- ✅ DOCX можно открывать на сайте;
- ✅ предусмотрен переход к оригиналу/файлам.

Осталось:
- 🟡 полноценный viewer для DOCX без потери структуры;
- 🟡 корректная выдача локальных файлов через SpaceWeb;
- ⬜ связать материалы с темами учебного плана.

---

## 8. AI-тьютор

**Статус: 🔴 BLOCKED / 🟡 IN PROGRESS**

Есть backend chain:
`groq → gigachat → gemini → mistral → openrouter`

Известные проблемы:
- Groq: возможен 403;
- GigaChat: модель переключена на `GigaChat-2-Max`;
- Gemini: direct mode не подходит для RU SpaceWeb, нужен proxy;
- Mistral: требуется повторная диагностика runtime body;
- OpenRouter: возможен security-policy 403.

План:
1. ⬜ привести provider health к фактическому runtime состоянию;
2. ⬜ выбрать гарантированный primary provider;
3. ⬜ оставить fallback chain;
4. ⬜ проверить AI chat end-to-end;
5. ⬜ затем связывать AI с предметом/темой/вопросом.

---

## 9. Chemistry

**Статус: 🟡 IN PROGRESS**

- ✅ chemistry engine / PubChem resolver на main;
- ✅ basic chemistry routes;
- ✅ educational projection renderers;
- 🟡 часть сложных экспериментальных UI остаётся в beta;
- ⬜ стабилизировать все chemistry tests;
- ⬜ устранить/проверить provider-related AI errors внутри chemistry flow.

---

## 10. Admin / CMS

**Статус: 🟡 IN PROGRESS**

Уже есть:
- ✅ users/roles;
- ✅ schedule CMS;
- ✅ subjects;
- ✅ content/work tools;
- ✅ question admin groundwork.

Следом:
- ⬜ единый Content Center;
- ⬜ quick edit question/answer;
- ⬜ edit material;
- ⬜ edit lesson;
- ⬜ edit trainer card;
- ⬜ audit/history изменений;
- ⬜ массовые операции.

---

## 11. Media / SpaceWeb

**Статус: 🟡 IN PROGRESS**

- ✅ backend media route;
- ✅ B2 integration exists;
- ✅ prepared clean `content/histology` package;
- 🟡 physical histology media still require SpaceWeb-side verification;
- 🟡 trainer feed image 404/502 must be closed.

---

## 12. Documentation / cleanup

**Статус: 🟡 IN PROGRESS**

Новая система:
- `ROADMAP.md` — что делаем и в каком порядке;
- `PHASES_STATUS.md` — текущее состояние фаз;
- `docs/README.md` — карта документов;
- `BRANCHES.md` — правила main/beta;
- `docs/ACTIVE-EXPERIMENTS.md` — только актуальные beta-эксперименты.

Временные GPT handoff / base64 artifact docs больше не должны быть source of truth.

---

# Порядок следующих работ

## NEXT 1 — Stability
1. ⬜ Vercel production build/smoke.
2. ⬜ login/logout.
3. ⬜ dashboard.
4. ⬜ schedule.
5. ⬜ subject page.
6. ⬜ tests.
7. ⬜ histology atlas/materials.
8. ⬜ media.

## NEXT 2 — Histology completion
1. ⬜ EM/captions audit.
2. ⬜ plan ↔ content mapping.
3. ⬜ tests/question bank audit.
4. ⬜ material viewer polish.

## NEXT 3 — Admin CMS
1. ⬜ questions quick-edit.
2. ⬜ materials edit.
3. ⬜ lessons edit.
4. ⬜ trainer cards edit.

## NEXT 4 — AI
1. ⬜ provider health.
2. ⬜ guaranteed primary provider.
3. ⬜ fallback.
4. ⬜ context-aware tutor.

## NEXT 5 — UI
1. ⬜ only after functionality is stable.
2. ⬜ Aero Glass remains beta until explicitly promoted.
3. ⬜ audit every screen against one design system.

---

# Definition of Done

Проект не считается «готовым», пока:

- [ ] production build зелёный;
- [ ] login работает;
- [ ] Vercel → SpaceWeb → Supabase работает;
- [ ] расписание работает;
- [ ] каждый раздел предмета открывается без повторного выбора предмета;
- [ ] тесты/банк работают;
- [ ] материалы открываются;
- [ ] histology atlas/trainer work end-to-end;
- [ ] media 404/502 закрыты;
- [ ] admin can fix content;
- [ ] AI has at least one verified provider;
- [ ] документация отражает фактическое состояние.


# Audit update — 2026-10-04

Актуальные документы:
- docs/FULL-AUDIT-2026-10-04.md — первый полный аудит;
- docs/DEEP-AUDIT-2-2026-10-04.md — повторный аудит скрытых следов функций и UI coverage;
- docs/UNFINISHED-REGISTRY.md — актуальный реестр;
- docs/API-COVERAGE-2026-10-04.md — API coverage.

## Что из старых P0 уже закрыто

- ✅ literal escaped newline в HistologyTrainer.tsx;
- ✅ frontend /api-compat calls удалены;
- ✅ homework mock-data удалён;
- ✅ sequential bank flow синхронизирован с preparation;
- ✅ structured question options поддерживаются preparation/test flows;
- ✅ admin schedule save идёт через реальный /admin/schedule;
- ✅ frontend/ и spaceweb_upload/ удалены;
- ✅ dead mock/fixture/UI artifacts удалены;
- ✅ legacy QuestionBank service удалён;
- ✅ false-zero admin question/progress fallbacks закрываются explicit errors/degraded state.

## Что осталось

### P1 — target environment
- 🟡 проверить последнюю Vercel сборку;
- 🟡 проверить последнюю SpaceWeb backend deployment;
- 🟡 закрыть trainer media 404/502 физическим media smoke-test;
- 🟡 проверить AI provider chain end-to-end.

### P2 — product/architecture
- 🟡 общий document viewer для поддерживаемых форматов;
- 🟡 material metadata editor;
- 🟡 trainer card editor;
- 🟡 content version history/rollback UI;
- 🟡 bulk content validation;
- 🟡 duplicate route consolidation;
- ⚪ generic learning_sessions layer — удалить после проверки legacy consumers;
- 🟡 расширение chemistry data/content.

## Current CI baseline

Последний полностью завершённый code-check перед самым новым documentation-only commit:
- ✅ TypeScript;
- ✅ Next.js production build;
- ✅ PHP syntax (93 files);
- ✅ predeploy audit: no escaped-newline, no retired /api-compat, homework API-only;
- ✅ smoke.

Новый code-check после Deep Audit commit запущен отдельно; его итог нужно дождаться перед финальным production verdict.

## Порядок дальше

1. Дождаться зелёного code-check.
2. Проверить Vercel/SpaceWeb.
3. Закрыть media.
4. Закрыть AI provider runtime.
5. Потом делать P2 product/architecture cleanup.
# Deep audit 3 — 2026-10-04

Полный новый отчёт: docs/DEEP-AUDIT-3-2026-10-04.md.

### Исправлено в третьем проходе
- ✅ shadowed domain routes consolidated;
- ✅ broken /admin/lectures/assist removed;
- ✅ legacy schedule writes removed;
- ✅ duplicate schedule import removed;
- ✅ generic session frontend helpers removed;
- ✅ search-param static-render risk removed from admin/settings;
- ✅ live Supabase integrity checked: no orphan test links, no missing material files, no missing trainer image paths.

### Remaining real work
- 🔴 delivery lag: Vercel production still points to an older commit;
- 🟡 SpaceWeb deploy must complete once on the final stable commit;
- 🟡 histology media requires real SpaceWeb/B2 file smoke;
- 🔴 AI provider runtime availability requires credentials/upstream access;
- 🟡 generic DOCX/PDF viewer for non-histology materials;
- 🟡 mobile schedule agenda;
- 🟡 polished subject-plan/material/trainer-card editors and visual version history.
## P0 blockers confirmed

- ✅ literal escaped newline in HistologyTrainer fixed; latest Code Checks are green.
- ✅ active frontend /api-compat calls removed.
- ✅ sequential bank/preparation contract is covered by current preparation flow.
- ✅ homework production mock fallback removed.
- ✅ admin schedule save uses real /admin/schedule.
- 🟡 remaining P0-class work is external/runtime verification (media and AI credentials) rather than failing CI.

## P1/P2 cleanup confirmed


# Audit hardening update — 2026-10-05

- ✅ live Supabase RLS init-plan warnings reduced to 0;
- ✅ question_reports SELECT policies consolidated to reporter-or-admin;
- ✅ trainer_feed_answers RLS uses init-plan-safe auth.uid();
- ✅ admin_change_log and content_versions admin policies use init-plan-safe auth.uid();
- 🟡 44 unindexed FK advisor findings remain informational/performance work;
- 🟡 leaked-password protection remains a Supabase Auth setting to enable;
- ✅ public smoke workflow strengthened for /, /tests, /schedule, /subjects, /materials, /trainers and public API surfaces;
- 🟡 final production verdict still waits for green CI + Vercel READY + SpaceWeb/media smoke.


# Runtime regression update — 2026-10-05

- ✅ live preparation mode constraint now allows sequential;
- ✅ global loading indicator covers shared API requests across pages, not only tests;
- ✅ concurrent 401 refresh race hardened;
- ✅ subject/ticket Supabase REST transient retries added;
- ✅ supplied Гистология.zip inspected and used for malformed histology reconstruction;
- 🟡 newest post-fix Vercel deployment must be confirmed READY;
- 🟡 actual authenticated production smoke remains required because the connector cannot inspect the user's browser token/session.


- 2026-10-05: Histology ZIP cross-audit completed through current 3rd semester; materials UI now includes all source documents, next-semester content is retained but hidden by default, legacy DOC HTML mirrors prepared for SpaceWeb, and published duplicate test/question cleanup continued. SpaceWeb media upload remains a manual infrastructure step.


## Audit update — 2026-10-05, current-semester content reconciliation

### Гистология
Live active subject is **2 курс / 3 семестр**.

Current verified live counts:
- ✅ 14 modules / 19 plan topics;
- ✅ 80 published materials;
- ✅ 261 source rows from `Гистология.zip`;
- ✅ 178 preparation photo sources;
- ✅ 28 electronogram trainer cards with source documents/captions;
- ✅ 206 trainer cards total;
- ✅ 169 trainer cards explicitly marked current-plan;
- ✅ 37 future/out-of-current-plan cards retained but hidden by default;
- ✅ 273 published questions, 194 archived;
- ✅ 0 published source-less questions;
- ✅ 76 published exam questions;
- ✅ 8 published tests + 1 archived duplicate;
- ✅ 5 ticket banks retained;
- 🟡 0 generated tickets because source ZIP does not provide canonical ticket grouping.

### Materials
- ✅ complete source-document layer registered in Supabase;
- ✅ Materials categories separated into Schemes / EM / Methodicals / Tests / Exam / Photos;
- ✅ default UI is current 3rd semester;
- ✅ future content is retained and shown through “Весь курс”;
- ✅ module/topic-first sorting;
- ✅ mobile/iPhone form controls normalized to a light scheme;
- ✅ DOCX/HTML/image/PDF viewer paths covered;
- 🟡 physical SpaceWeb document payload upload remains external.

### SpaceWeb
Prepared archive:
`MEDBIOHIM_histology_spaceweb_3sem_content_patch.zip`

It contains the source DOC/DOCX/GIF layer from `Гистология.zip` plus HTML mirrors for legacy `.doc`. Existing photo/EM deployment media is intentionally not duplicated.

### Next acceptance test
After the archive is physically placed on SpaceWeb:
`/subjects → Гистология → Материалы → DOC/DOCX → Фото препаратов → back`
must be checked on iPhone and desktop. Only then move the Histology Materials item from 🟡 to ✅.


### Гистология — экзаменационный банк, Pass 8
- ✅ Current 3rd-semester exam bank reconciled to **366 published exam_questions**: 350 canonical rows + 16 unique ZIP additions.
- ✅ ZIP additions are deduplicated against the canonical bank; 100 exact-text duplicates are archived, while 16 unique additions remain published.
- ✅ Canonical bank subject links were restored after detecting 350 rows with `subject_id = NULL`; all 366 published rows now point to the active histology subject.
- ✅ 0 published exam questions without a source.
- 🟡 Future respiratory/skin/urinary/reproductive/later GI source questions remain retained in source documents but unpublished until the next-semester plan is activated.
- 🟡 Ticket banks remain metadata-only; `tickets=0` because no canonical ticket grouping manifest exists in the supplied source archive.


---

# 13. Student-first architecture — «от студентов для студентов»

**Статус: 🟡 IN PROGRESS — новая продуктовая ось**

Главный принцип MEDBIOHIM теперь формулируется так:

> Сайт не должен быть только «электронным деканатом» или CMS. Это рабочее учебное пространство, которое студенты наполняют и используют вместе.

Основной контур:

`Студент → аккаунт → учебная группа → расписание → предмет → занятие → ДЗ → выполнение → прогресс`

Дополнительный контур:

`Telegram группы → бот → сообщение/фото → распознавание → предмет → занятие → ДЗ → сайт`

### 13.1 Студент как основной участник

- 🟡 регистрация/вход;
- 🟡 привязка к учебной группе;
- 🟡 просмотр группового расписания;
- 🟡 создание и уточнение ДЗ студентами;
- 🟡 отметка «сделано»;
- 🟡 сдача работы;
- 🟡 сообщения/сообщество;
- ⬜ предложения исправлений/дополнений к контенту;
- ⬜ подтверждение информации другими студентами;
- ⬜ история изменений учебной информации;
- ⬜ механика «кто добавил / кто подтвердил / кто исправил».

**Важно:** роль студента не должна превращаться в бесконтрольное редактирование официального расписания или канонического учебного контента. Нужна граница между пользовательским вкладом и официальными данными.

### 13.2 Учебная группа — центральная сущность

Уже есть:
- ✅ `groups`;
- ✅ `group_memberships`;
- ✅ active membership;
- ✅ group-aware schedule;
- ✅ group-aware homework;
- ✅ Telegram chat → group binding.

Нужно довести:
- ⬜ безопасное присоединение по коду/ссылке;
- ⬜ подтверждение участника;
- ⬜ starosta/модератор группы;
- ⬜ несколько групп у одного пользователя без поломки текущего UI;
- ⬜ история членства;
- ⬜ перенос студента между группами;
- ⬜ привязка Telegram-пользователя к аккаунту сайта.

### 13.3 Занятие как связующий объект

Для будущей автоматизации ДЗ недостаточно знать только предмет.

Нужна логика:

`Telegram message → group → date/time → schedule entry → subject → homework`

При этом:
- subject определяется из официального каталога;
- занятие определяется по расписанию и времени/дате сообщения;
- если совпадений несколько — бот не должен угадывать молча;
- при низкой уверенности создаётся **кандидат ДЗ**, а не окончательное ДЗ;
- пользователь/староста может подтвердить или исправить привязку.

Это важнее, чем просто `subject_hint`.

---

# 14. Telegram — регистрация + «Telegram → ДЗ»

**Статус: 🟡 IN PROGRESS — backend foundation есть, production flow не подтверждён**

### Что уже реально есть в коде

- ✅ `TelegramHomeworkService`;
- ✅ webhook endpoint `/api/v1/telegram/webhook`;
- ✅ secret-token проверка;
- ✅ Telegram chat discovery;
- ✅ admin привязка Telegram-чата к учебной группе;
- ✅ хранение Telegram messages;
- ✅ защита от повторной обработки message_id;
- ✅ reply-thread привязка;
- ✅ media-group/album привязка;
- ✅ импорт фото/документов;
- ✅ OCR/vision metadata;
- ✅ AI semantic classification;
- ✅ subject/due hints;
- ✅ создание `homeworks`;
- ✅ связь `telegram_messages → telegram_homework_links → homeworks`;
- ✅ `homework_attachments`;
- ✅ Admin UI `/admin/telegram`;
- ✅ webhook setup из admin;
- ✅ Telegram OAuth/custom provider trace в frontend/auth layer.

### Что показала живая Supabase

На текущей проверке:
- `telegram_bot_chats = 0`;
- `telegram_messages = 0`;
- `telegram_homework_links = 0`;
- `homework_attachments = 0`;
- `homeworks = 0`.

Следовательно, **кодовая foundation готова, но реальная эксплуатация Telegram-контура ещё не доказана**.

### 14.1 Регистрация через Telegram

Целевой UX:

1. Студент открывает бота.
2. Бот объясняет, что MEDBIOHIM использует Telegram для входа/привязки.
3. `/start` выдаёт безопасную ссылку/flow регистрации.
4. Студент подтверждает Telegram identity.
5. Аккаунт MEDBIOHIM создаётся или связывается с существующим.
6. Студент выбирает/вводит код учебной группы.
7. Сайт показывает группу и просит подтверждение.
8. После подтверждения студент получает расписание и ДЗ группы.

**Пока нельзя считать этот сценарий готовым:** в репозитории есть custom Telegram OAuth trace, но отдельного end-to-end bot registration flow с Telegram user ↔ `auth.users.id` ↔ `users` ↔ `group_memberships` не подтверждено.

### 14.2 Распознавание ДЗ из чата

Целевой алгоритм:

1. Получить сообщение.
2. Сохранить raw message.
3. Определить группу по Telegram chat.
4. Определить дату сообщения и автора.
5. Найти ближайшие занятия этой группы по расписанию.
6. Из текста/фото извлечь:
   - предмет;
   - формулировку задания;
   - срок;
   - номер/тему занятия;
   - вложения.
7. Сопоставить предмет с официальным `subjects`.
8. Сопоставить занятие с `schedule_entries`.
9. Оценить confidence.
10. Если confidence высокий — создать ДЗ.
11. Если средний/низкий — создать candidate для подтверждения.
12. Дать старосте/модератору исправить предмет/занятие/срок.
13. После подтверждения показать ДЗ всем участникам группы.

### 14.3 Критический gap текущей реализации

Сейчас сервис умеет выбрать **subject**, но основной автоматический контур ещё не является полноценным `message → конкретное занятие` resolver.

Нужно добавить отдельный слой:
`TelegramHomeworkResolver`

Он не должен смешиваться с OCR/LLM.

Вход:
- `group_id`;
- `telegram_date`;
- `message_text`;
- `subject_hint`;
- `due_hint`.

Выход:
- `subject_id`;
- `schedule_entry_id`;
- `lesson_context`;
- `confidence`;
- `resolution_status = auto|needs_confirmation|unresolved`.

### 14.4 Защита от ошибок

Бот **не должен**:
- создавать ДЗ только потому, что в сообщении есть слово «дз»;
- придумывать дату;
- подменять официальный предмет похожим названием;
- привязывать сообщение к чужой группе;
- публиковать низкоуверенное распознавание как подтверждённый факт;
- создавать дубликаты при повторной доставке Telegram update.

### 14.5 Telegram production acceptance

Для перевода фазы в ✅ нужен реальный тест:

`Telegram chat → webhook → Supabase message → resolver → homework → attachment → website`

и отдельно:

`Telegram /start → account link → group join → schedule/homework`

На каждом шаге должна быть запись/ответ, а не только HTTP 200.

---

# 15. Student-generated content / community

**Статус: ⬜ TODO / product direction**

Сайт «от студентов для студентов» должен позволять безопасно добавлять:

- ⬜ уточнения к ДЗ;
- ⬜ полезные материалы;
- ⬜ конспекты;
- ⬜ заметки к занятию;
- ⬜ сообщения группы;
- ⬜ предложения исправлений;
- ⬜ вопросы по предмету;
- ⬜ подтверждение/опровержение информации.

Модель доверия:

`student contribution → moderation/confirmation → shared group knowledge`

Не смешивать это с каноническим импортом учебных материалов.

---

# 16. Updated project dependency map

```
                         ┌─────────────────────┐
                         │      STUDENT        │
                         └──────────┬──────────┘
                                    │
                         auth / Telegram link
                                    │
                 ┌──────────────────▼──────────────────┐
                 │          USER + MEMBERSHIP          │
                 │ users → group_memberships → groups  │
                 └───────────────┬─────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
           SCHEDULE           SUBJECT          COMMUNITY
                │                │
                └────────┬───────┘
                         ▼
                    LESSON CONTEXT
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
       HOMEWORK       MATERIALS       TESTS
          │
          ▼
    SUBMISSIONS / DONE
          │
          ▼
       PROGRESS

Telegram group
      │
      ▼
  Telegram Bot
      │
      ▼
telegram_messages
      │
      ▼
OCR / semantic classifier
      │
      ▼
Homework Resolver
      │
      ├──────────────→ subject_id
      │
      ├──────────────→ schedule_entry_id
      │
      └──────────────→ due_at
                       │
                       ▼
                    HOMEWORK
                       │
                       ▼
                    STUDENT
```

### Архитектурный приоритет

1. 🔴 **Production stability** — auth/router/media/deployment.
2. 🔴 **Student identity + group membership**.
3. 🔴 **Telegram registration/linking**.
4. 🔴 **Telegram → lesson resolver → homework**.
5. 🟡 Student-generated content/community.
6. 🟡 Admin moderation/confirmation.
7. 🟡 Progress/analytics around real student activity.
8. 🟢 UI polish / Aero Glass после функциональной стабилизации.

### Новое правило карты

Любая новая функция должна отвечать на три вопроса:

1. **Кто студент?**
2. **К какой учебной группе и занятию относится действие?**
3. **Как результат попадает обратно в учебный процесс?**

Если на эти вопросы нет ответа, функция не считается интегрированной в MEDBIOHIM.


## Audit update — 2026-10-06 — Pass 14–17 second verification

**Статус: 🟢 CLOSED at implementation + live-invariant level.**

Pass 14–17 уже были реализованы в main, а последующие Pass 18–22 закрыли часть оставшихся P1. Второй проход 06.10 проверил именно текущий код и живую Supabase, а не только исторические отчёты.

### Pass 14 — AcademicContext
- 🟢 canonical group/subject/session/lesson/context_version contract;
- 🟢 explicit group selection for multi-group users;
- 🟢 UUID-authoritative subject identity;
- 🟢 active schedule/lesson resolution;
- 🟢 no current foreign-context gaps.

### Pass 15 — Core academic flow
- 🟢 planner/schedule/attendance use selected group;
- 🟢 homework submission retry/state transitions are safe;
- 🟢 active test attempt uniqueness is enforced;
- 🟢 progress is group-scoped;
- 🟢 homework now exposes one canonical derived my_status.

### Pass 16 — Tests / Preparation
- 🟢 preparation start validates group + subject context;
- 🟢 question membership is restricted to the session;
- 🟢 sequential bank progress is group-scoped;
- 🟢 terminal state transitions are guarded.

### Pass 17 — Test integrity / reproducibility
- 🟢 answers are persisted server-side;
- 🟢 final score is calculated server-side;
- 🟢 test attempts store immutable question/answer snapshots;
- 🟢 test attempts and preparation sessions store group/session/context version;
- 🟢 preparation result answer snapshots are populated;
- 🟢 normal test/preparation responses do not leak answer keys.

### Second-pass live invariants
- active attempt snapshot gaps: **0**;
- active preparation snapshot gaps: **0**;
- answers outside immutable snapshots: **0**;
- preparation answer snapshot gaps: **0**;
- foreign-group attempts/sessions: **0**;
- schedule ↔ academic session/year/semester mismatches: **0**.

There is one historical submitted attempt from 02.10.2026 created before snapshot migration with no saved answers, score or academic context. It is intentionally retained as a legacy historical anomaly; reconstructing its score/context would fabricate history.

Detailed verification: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS14-17-SECOND-VERIFY.md.

**Release caveat:** these passes are closed in code + live DB. Final PHP/TypeScript/build/browser/Vercel/SpaceWeb verification remains a separate deployment gate.

## Audit update — 2026-10-06 — Pass 18

Pass 18: 🟢 historical test/preparation integrity / 🟡 runtime verification pending.

- ✅ preparation scoring reads immutable session question snapshots;
- ✅ preparation result stores answer snapshot;
- ✅ AI review uses historical answer snapshot;
- ✅ live DB invariants show no active attempt/preparation context gaps;
- 🟡 GitHub Actions has no run attached to the latest commits;
- 🟡 PHP/Next build and SpaceWeb smoke test remain mandatory before final green gate.

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS18.md.


## 2026-10-06 — Pass 19: Progress / History / Preparation contract

- 🟢 preparation GET/finish/AI review теперь используют immutable question snapshots;
- 🟢 preparation results сохраняют answer_snapshot;
- 🟢 /progress считает submitted attempts завершёнными;
- 🟢 DB error в test history больше не превращается в ложный пустой progress;
- 🟢 test history строго scoped по test_attempts.group_id;
- 🟢 bank/preparation frontend передают group_id в bank-progress;
- 🟢 live active-context invariants остаются нулевыми;
- 🟡 один legacy submitted attempt от 2026-10-02 не имеет group_id и намеренно не приписан к группе;
- 🟡 PHP/Next/build/runtime verification после Pass 19 ещё обязательна.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS19.md.


## 2026-10-06 — Pass 20: Test / Preparation API contract

- 🟢 закрыты API leaks: test_attempts.question_snapshot больше не отдаётся клиенту;
- 🟢 preparation session.question_snapshot больше не отдаётся через start/get/save/finish;
- 🟢 эталоны подготовки доступны после завершения через исторический snapshot;
- 🟢 my attempts теперь SELECT-ит только публичные поля без answer snapshot;
- 🟢 старый ProgressService найден как неиспользуемый legacy trace, source of truth остаётся progress_rest;
- 🟡 PHP/Next/browser/runtime verification ещё обязательны.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS20.md.


## 2026-10-06 — Pass 21: Deployment gate / cross-group audit

- 🟢 bank-progress sequential session теперь строго scoped по canonical group;
- 🟢 live invariants после исправления: active context/snapshot gaps = 0;
- 🟢 GitHub code-check workflow существует и содержит PHP syntax + route registration + frontend audit;
- 🟡 GitHub workflow query не показывает runs для latest commits;
- 🟡 Vercel connected account возвращает 403 на list/create deployment, поэтому production deployment не форсировался;
- 🟡 SpaceWeb runtime gate ещё не подтверждён.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS21.md.


## 2026-10-06 — Pass 22: Legacy / stub / fake-success audit

- 🟢 admin users/homeworks no longer silently return partial data after primary-store failure;
- 🟢 unused legacy `ProgressService` removed together with its unused platform import;
- 🟢 TODO/placeholder/null/empty scans classified semantically rather than mass-editing legitimate UI/empty states;
- 🟡 historical documentation traces remain and are scheduled for source-of-truth reconciliation;
- 🟡 runtime/build/browser gate remains unconfirmed.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS22.md.


## 2026-10-06 — Pass 23: route / legacy cleanup

- 🟢 найден и устранён duplicate GET /api/v1/me: одновременно регистрировались profile_rest.php и domain_rest.php;
- 🟢 из routes.php удалена регистрация legacy profile_rest.php;
- 🟢 удалены orphan profile_rest.php и SupabaseRestProfile.php, которые возвращали неполный fallback-профиль;
- 🟢 canonical /api/v1/me теперь проходит через UserRepository::profileBundle() с существующим REST fallback;
- 🟡 полный PHP/Next/browser/runtime gate всё ещё требует target-environment проверки;
- 🟡 продолжается аудит остальных legacy fallback/import traces.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS23.md.


## 2026-10-06 — Pass 24: Tests / questions by lesson topic

- 🟢 added canonical curriculum topic map to the tests API;
- 🟢 map is scoped by the user's group/course/semester/specialty;
- 🟢 tests expose module/topic names and ordering metadata;
- 🟢 tests page now shows “Темы занятий → что готовить” with question/test counts;
- 🟢 question banks can be filtered by lesson topic;
- 🟢 untagged questions are explicitly reported instead of being guessed into topics;
- 🟡 detailed lesson-plan rows are still missing for subjects whose topic hierarchy has not been imported;
- 🟡 remaining untagged questions require controlled curriculum mapping;
- 🟡 PHP/Next/browser/SpaceWeb runtime verification remains mandatory.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS24.md.


## 2026-10-06 — Pass 25: full current-semester curriculum mapping

- 🟢 all 655 published questions in current 2nd-year/3rd-semester histology + organic/physical chemistry have canonical topics;
- 🟢 all 30 published tests in those subjects have canonical topics;
- 🟢 histology 206 previously untagged questions mapped by specimen/content, with 47 explicitly kept outside the current 18-week plan;
- 🟢 chemistry question taxonomy 1.1–3.13 mapped to canonical curriculum topics using source provenance;
- 🟢 chemistry 18-lecture calendar linked to topic dates where the current plan confirms them;
- 🟢 questions/tests outside the current calendar remain visible and explicitly marked rather than being falsely attached to a lesson;
- 🟢 tests UI shows date, topic, question/test counts and extra/out-of-calendar status;
- 🟢 no ticket-bank UUIDs or question answers/text were changed;
- 🟡 runtime/build/browser gate remains to be verified.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS25.md.


## 2026-10-07 — Pass 26: единый химический каталог из исходных файлов

- 🟢 проверен загруженный архив из 7 сканированных PDF: 142 страницы; обычный PDF text layer отсутствует, поэтому OCR не используется как единственный источник истины;
- 🟢 использованы ранее выверенные документы проекта с повторной сверкой исходного архива: `organic_chemistry_open_tasks_fixed.sql` и итоговая расшифровка вопросов/тестов;
- 🟢 в Supabase создан `chemistry_master_documents` — единый канонический документ для органической и физической химии;
- 🟢 в единый каталог собраны 260 открытых заданий + 176 опубликованных тестовых вопросов = 436 элементов;
- 🟢 для тестов сохранены варианты и правильные ответы;
- 🟢 для открытых заданий исходный текст, номер, тема и привязка к плану сохранены; пустой ответ не заменяется выдуманным решением;
- 🟢 химические формулы/реакции, которые присутствуют в текстовом источнике, сохраняются; формулы, существующие только как изображение, не восстанавливаются по догадке;
- 🟡 задания «Напишите структурные/скелетные формулы» требуют отдельного подтверждения формул по оригинальным изображениям страниц перед заполнением эталонных ответов;
- 🟡 полный архивный тестовый раздел источника содержит больше вопросов, чем текущий canonical test set; расширять production bank нужно отдельным контролируемым импортом, чтобы не занести OCR-ошибки;
- 🟢 ticket banks не изменялись.

Подробно: `docs/IMPLEMENTATION-AUDIT-2026-10-07-CHEMISTRY-MASTER-CATALOG.md`.


## 2026-10-07 — Pass 26A: эталонные ответы и формулы

- 🟢 в единый Supabase-каталог добавлены подготовленные ответы для 40 элементов;
- 🟢 19 формульных элементов получили отдельное текстовое представление структурных формул;
- 🟡 формулы пока имеют статус `prepared_from_text`, а не визуально подтверждённой: исходные сканы нужно проверить постранично перед использованием в автоматической проверке;
- 🟢 production `exam_questions.answer` не перезаписывался;
- 🟢 каталог защищён RLS и доступен на чтение авторизованным пользователям;
- 🟡 остаётся обработать ответы остальных 220 открытых заданий и провести визуальную проверку формул/стереохимии.


## 2026-10-07 — Pass 26B: две методички химии

- 🟢 подтверждено, что химический массив состоит минимум из **двух самостоятельных методических источников**;
- 🟢 источник 1: «Учебно-методическое пособие по органической и физической химии» ДВГМУ;
- 🟢 источник 2: Н.Н. Минаева, С.А. Пронкина — «Сборник задач, упражнений и тестовых заданий по органической химии» ДВГМУ;
- 🟢 в Supabase создан `chemistry_source_documents` с раздельной provenance-записью обоих источников;
- 🟢 единый master catalog хранит оба источника в `source_documents`;
- 🟢 совпадающие задания не удаляются автоматически как дубли: сначала сохраняется происхождение из методички;
- 🟡 конкретные элементы без надёжной source attribution не будут искусственно приписываться методичке.


### Pass 27 — Химический банк на сайте
- 🟢 Единый каталог химии подключён к странице «Тесты и билеты».
- 🟢 Добавлены поиск, фильтры «задание/тест» и «формулы сохранены», пагинация и раскрытие вопроса/ответа.
- 🟢 Ответы без подготовленного решения не выдаются за проверенные; формулы не восстанавливаются догадкой.


## 2026-10-07 — Storage architecture clarification: Supabase Free + SpaceWeb media

> Важное инфраструктурное правило проекта: Supabase используется на бесплатном плане и является БД/слоем метаданных, а тяжёлые изображения, фотографии препаратов, электронограммы и другие крупные медиа по возможности хранятся на SpaceWeb. Supabase Storage/B2 не считаются обязательным хранилищем для этих файлов.

### Каноническое разделение

- **Supabase Free** — PostgreSQL, Auth, RLS, связи, метаданные контента, вопросы, тесты, учебный план, trainer cards, source_key, пути/идентификаторы медиа.
- **SpaceWeb** — физические файлы большого объёма: фотографии, изображения микропрепаратов, электронограммы и документы, когда их хранение в репозитории или бесплатном Supabase нецелесообразно.
- **GitHub** — код, миграции, документация и небольшие декларативные/контентные артефакты; не использовать как обязательное хранилище всего большого архива.
- **Vercel** — frontend/deployment; не считать Vercel источником постоянного пользовательского media storage.

### Ограничение исходных архивов

Полный content.zip может быть слишком большим для загрузки в чат. Это не означает, что контент нужно урезать: архив рассматривается как источник, а его содержимое должно быть перенесено/разложено по канонической архитектуре частями.

Для content.zip уже подтверждено:
- 444 фактических файлов;
- 389 изображений;
- 207 уникальных наборов байтов после удаления дублей;
- Supabase содержит 206 trainer feed cards, включая 28 EM по назначению;
- физический media-layer должен проверяться отдельно на SpaceWeb.

### Правило для Histology media

Для гистологии каноническим физическим источником остаётся `/public_html/content/histology` на SpaceWeb (или путь из HISTOLOGY_MEDIA_ROOT), а Supabase хранит карточки, captions, metadata и ссылки/source_key.

**Не переносить все изображения из content.zip в public.files только ради формального соответствия.** Это нарушило бы выбранную бесплатную архитектуру и увеличило бы зависимость от лимитов Supabase.

### Release gate

Физическое наличие файла на SpaceWeb считается отдельным обязательным smoke-test:
Supabase metadata → API media route → SpaceWeb file → HTTP 200/image.

Статус: 🟡 требуется финальная проверка/синхронизация физического media-layer на SpaceWeb.


## 2026-10-07 — подтверждён физический Histology media root на SpaceWeb

Получено прямое подтверждение из файлового менеджера SpaceWeb: каталог Histology media физически присутствует под /public_html/... и содержит ожидаемую структуру:

- source-materials/;
- electronograms/;
- em/ — alias/совместимость электронограмм;
- 5_Фотографии препаратов/;
- дополнительный каталог с URL/Unicode-encoded именованием;
- README.md.

Это означает, что ранее сформулированный вывод «физические media отсутствуют» был слишком сильным: отсутствие этих бинарных файлов в GitHub и таблице public.files не означает, что их нет на SpaceWeb.

### Текущий статус media

- 🟢 физический Histology media root на SpaceWeb подтверждён;
- 🟢 структура каталогов соответствует README/content package;
- 🟡 требуется инвентаризация фактических файлов внутри каталогов и сопоставление с 206 trainer cards / 28 EM / Materials;
- 🟡 требуется HTTP smoke-test нескольких реальных image/document paths через production API;
- 🟡 требуется проверить, что backend HISTOLOGY_MEDIA_ROOT указывает именно на этот физический каталог.

Каноническая модель остаётся:
Supabase Free = metadata/DB → SpaceWeb = physical media → API = controlled delivery.


## 2026-10-07 — полноценная база вопросов без запуска теста

Раздел `/practice` переведён из режима только «практики» в полноценную **Базу вопросов** для всех авторизованных пользователей.

- опубликованные вопросы доступны напрямую, без создания test_attempt/preparation session;
- по умолчанию загружаются все типы опубликованных вопросов, а не только `ticket`;
- есть фильтр предмета, типа и поиск по тексту;
- есть постраничная навигация для полного банка;
- правильный ответ загружается отдельно от режима прохождения теста и доступен при просмотре вопроса;
- у каждого вопроса остаётся `QuestionReport` — жалоба привязана к конкретному `question_id`;
- жалобы обрабатываются админским `/admin/problems`, где вопрос можно быстро исправить;
- запуск теста для просмотра/изучения вопроса не требуется.

Архитектурное правило: **просмотр базы вопросов ≠ попытка теста**. Открытие вопроса не должно менять прогресс, результат или историю попыток.


## 2026-10-07 — изоляция банков по предметам

База вопросов и тестовая часть теперь рассматриваются как предметные контексты: переход из конкретного предмета передаёт его `subject_slug`, поэтому банк вопросов загружается только для этого предмета. Для гистологии и химии не смешиваются вопросы, ответы и тесты. Прямой общий `/practice` без контекста сохраняет возможность выбрать предмет вручную.


## 2026-10-07 — Project Source-of-Truth Audit

Проведена сверка кода, пользовательской логики и существующих документов. Создан канонический обзор архитектурных правил и остаточных release-gates:

`docs/PROJECT-SOURCE-OF-TRUTH-AUDIT-2026-10-07.md`

Зафиксированы как постоянные правила: независимые банки по предметам, база вопросов ≠ тест, жалоба → question_id → admin correction, optional AI grading, immutable history snapshots, единый academic context, Supabase Free как DB/metadata + SpaceWeb как physical media, расписание + задания как единый целевой UX, content reconciliation, runtime/deployment truth, strict build gate, timezone и mobile/browser acceptance.

Отдельно отмечены остаточные 🟡 проверки, которые нельзя выдавать за полностью закрытые только по наличию кода в GitHub.


## 2026-10-07 — Zero-cost + full-functionality policy

**Новый обязательный архитектурный принцип:** полный запланированный функционал должен сохраняться при **$0 обязательных расходов**.

Бесплатный стек:
- GitHub Free;
- Vercel Hobby;
- SpaceWeb Free;
- Supabase Free;
- Backblaze B2 Free allowance.

Правило оптимизации: при лимитах сначала применять caching, pagination, lazy loading, streaming, batching, deduplication, metadata/binary separation и распределение media между SpaceWeb/B2. Не урезать пользовательский сценарий только ради free-tier.

AI остаётся optional: deterministic/local path должен сохранять базовый функционал без платного AI.

Любой новый сервис проходит проверку permanent free vs trial, квоты, egress, поведение после лимита и риск автоматического расхода.

Полная политика: docs/FREE-TIER-FULL-FUNCTIONALITY-POLICY-2026-10-07.md.


## 2026-10-07 — Admin Data & Storage Control Center

Supabase остаётся единственным основным источником истины. Админская консоль развивается как единый интерфейс управления данными и физическими объектами, без создания второй canonical БД.

### A — Database Console
- 🟢 `/admin/database`: whitelisted tables, редактирование, импорт/экспорт, audit/rollback;
- 🟢 добавлен поиск по значениям и пагинация;
- 🟡 desktop/PC-style интерфейс: дерево таблиц, сортировка, фильтры, закрепление ключей, инспектор строки, связи;
- 🟡 bulk-edit с dry-run и валидацией;
- 🟡 health/reconciliation проверки.

### B — File & Storage Center
- 🟡 SpaceWeb file tree и проверка существования;
- 🟡 B2 object browser через бесплатный API;
- 🟡 Supabase metadata ↔ физический объект reconciliation;
- 🟡 MIME/размер/checksum, дубликаты и orphan-файлы;
- 🟡 безопасные move/rename/archive/delete;
- 🟡 отдельная проверка Histology `content/histology` и Materials.

### C — Unified Operations Dashboard
- 🟡 состояние Supabase/SpaceWeb/B2/Vercel;
- 🟡 квоты бесплатных ресурсов;
- 🟡 ошибки интеграций и проверки;
- 🟡 export/backup snapshots;
- 🟡 журнал операций и безопасный rollback.

### D — Free-service extensions
Другие бесплатные сервисы подключаются только как дополнения: кэш, push, поиск, OCR, мониторинг, аналитика, backup и т.п. Они не создают вторую БД и не становятся обязательными для работы MEDBIOHIM.

Подробная архитектура: `docs/ADMIN-DATA-CONSOLE-ARCHITECTURE.md`.

## 2026-10-07 — Consolidated Remaining Implementation Map

Этот блок фиксирует все ранее найденные, но ещё не закрытые направления. Ничего из уже работающего функционала не считается кандидатом на удаление только ради упрощения или free-tier.

### 1. Release / production verification — P0
- 🟡 подтвердить последний Vercel deployment как READY;
- 🟡 выполнить production smoke: login → /me → dashboard → logout;
- 🟡 authenticated smoke для schedule, subjects, tests, preparation, question bank, materials, trainer/atlas и admin;
- 🟡 подтвердить актуальный backend на SpaceWeb и отсутствие рассинхрона GitHub → SpaceWeb;
- 🟡 проверить PHP runtime, роутер, env/secrets и OPcache;
- 🟡 получить фактический CI result для актуального HEAD.

### 2. Auth / security — P0/P1
- 🟡 полный auth regression после исправлений /api/v1/me;
- 🟡 refresh/re-login и concurrent 401 recovery;
- 🟡 production roles/claims/group membership;
- 🟡 leaked-password protection в Supabase Auth;
- 🟡 отсутствие bootstrap/admin secrets в production;
- 🟡 финальный аудит RLS и 44 оставшихся advisor findings по FK-индексам;
- 🟡 server-side защита всех admin/data mutations.

### 3. Расписание + Задания — единый learning flow
Целевой UX: Расписание → дата → предмет → занятие → задания/домашняя работа → выполнение/сдача → статус.
- 🟡 объединить «Задания» и «Расписание» в единый пользовательский сценарий;
- 🟡 создание/редактирование homework из контекста даты и subject;
- 🟡 единый статус submitted/done/returned/graded;
- 🟡 attendance по паре: присутствовал / уважительная / болезнь / неуважительная;
- 🟡 knowledge gaps по предмету;
- 🟡 проверить schedule_entries ↔ academic_sessions/year/semester для исторических данных;
- 🟡 month/week overlap и чередующиеся/объединённые пары;
- 🟡 mobile agenda mode.

### 4. Histology — physical content completion
- 🟡 сопоставить все 444 файлов content.zip с физическими файлами SpaceWeb;
- 🟡 сопоставить 206 trainer cards с реальными image paths;
- 🟡 проверить все 28 EM и captions;
- 🟡 проверить Materials → DOCX/JPG/PNG physical objects → API HTTP 200 + MIME;
- 🟡 закрыть trainer media 404/502;
- 🟡 atlas → material → document/image → back smoke;
- 🟡 итоговая матрица тема → лекция → препарат → ЭМ → вопросы → тест;
- 🟡 не переносить весь архив в Supabase Storage только ради формальной синхронизации.

### 5. Materials / documents
- 🟡 единый viewer для DOCX/PDF и поддерживаемых форматов;
- 🟡 сохранить структуру документа, изображения и навигацию;
- 🟡 material metadata editor;
- 🟡 связать материал с canonical curriculum topic;
- 🟡 physical-file reconciliation и orphan detection;
- 🟡 streaming/lazy loading больших файлов.

### 6. Tests / preparation / Question Library
- 🟡 открыть и smoke-test каждый published test;
- 🟡 объединить банк → прохождение → разбор ошибок в единый UX;
- 🟡 admin quick-edit question/answer/options;
- 🟡 быстрый переход из жалобы к вопросу и исправлению;
- 🟡 строгая subject isolation для histology/chemistry и будущих subjects;
- 🟡 повторно проверить multiple-correct, free text, sequential и history;
- 🟡 сохранить immutable snapshot semantics при будущих редакторах;
- 🟡 историческую старую submitted attempt оставить документированным legacy case без выдумывания истории.

### 7. Smart answer grading
- 🟢 deterministic exact/normalized path;
- 🟢 spelling/orthography ignored;
- 🟢 AI optional;
- 🟡 end-to-end grading на реальном тесте;
- 🟡 pending/error/retry semantics;
- 🟡 multiple-choice без AI;
- 🟡 AI получает только необходимый question + authoritative answer и не раскрывает answer key клиенту.

### 8. Chemistry — completion
- 🟢 unified 436-item master catalog;
- 🟢 provenance for two independent methodicals;
- 🟡 подготовить/проверить оставшиеся 220 open-task answers;
- 🟡 визуально подтвердить 19 formula-heavy prepared answers по исходным страницам;
- 🟡 controlled expansion OCR-sensitive archived test sections;
- 🟡 не заменять production answers неподтверждёнными OCR/formula guesses;
- 🟡 стабилизировать chemistry tests and experimental UI;
- 🟡 проверить chemistry AI/provider-dependent flows.

### 9. Trainers / atlas / preparations
- 🟡 полный browser cycle: start → answer → resume → finish → result → error review;
- 🟡 randomization без дублей и с одним authoritative correct answer;
- 🟡 скрытие captions/answers там, где это требуется режимом экзамена/подготовки;
- 🟡 retry image loading и устойчивость на мобильной сети;
- 🟡 topic/type/count modes: 10/20/50/custom/all;
- 🟡 mobile pagination/list/sidebar.

### 10. Admin / CMS / Content Center
- 🟡 единый Content Center;
- 🟡 question quick-edit;
- 🟡 material editor;
- 🟡 lesson/lecture editor;
- 🟡 trainer-card editor;
- 🟡 content version history + visual rollback;
- 🟡 bulk validation and dry-run imports;
- 🟡 relation-aware row inspector;
- 🟡 DB health/reconciliation;
- 🟡 безопасные bulk operations.

### 11. File & Storage Operations Center
- 🟡 SpaceWeb tree/browser;
- 🟡 B2 object browser;
- 🟡 Supabase metadata ↔ SpaceWeb/B2 object map;
- 🟡 MIME/size/checksum, duplicate/orphan scan;
- 🟡 safe move/rename/archive/delete;
- 🟡 backup/export snapshots;
- 🟡 provider capacity/quota panel;
- 🟡 operation log + safe rollback.

### 12. UI / cross-platform acceptance
- 🟡 iPhone Safari, Android Chrome, Windows Chrome/Edge, Firefox, Yandex, macOS Safari/Chrome;
- 🟡 устранить iPhone dark/misaligned area;
- 🟡 mobile admin pagination and dense data tables;
- 🟡 mobile tests/preparation/trainers/materials;
- 🟡 loading/subject-loading performance and perceived latency;
- 🟡 prevent overlapping theory/visual layers in schedule/content;
- 🟡 one unified design system; Aero Glass remains beta until separately promoted;
- ⬜ final visual audit after functionality is stable.

### 13. Performance / free-tier optimization
- 🟡 measure DB/API/storage/egress before moving workloads;
- 🟡 cache read-heavy metadata;
- 🟡 pagination for large datasets;
- 🟡 lazy-load images/documents/trainers;
- 🟡 streaming for large files;
- 🟡 deduplicate media and metadata;
- 🟡 batch requests and verify indexes;
- 🟡 hard limits / graceful degradation for optional external providers;
- 🟡 no mandatory paid dependency.

### 14. AI tutor / provider layer
- 🟡 provider health endpoint with factual runtime status;
- 🟡 verified primary free/available provider;
- 🟡 preserve fallback chain;
- 🟡 diagnose Mistral/OpenRouter/GigaChat/Groq runtime errors with actual response bodies;
- 🟡 context-aware tutor: subject → topic → question/material;
- 🟡 AI remains optional for core learning/testing flows.

### 15. Code quality / architecture cleanup
- 🟡 fix current TypeScript/ESLint issues before removing build-time bypasses (typescript.ignoreBuildErrors, eslint.ignoreDuringBuilds);
- 🟡 centralize timezone handling;
- 🟡 inspect remaining legacy learning_sessions consumers before deletion;
- 🟡 finish duplicate/dead route and service cleanup audits;
- 🟡 keep API route ownership canonical and documented;
- 🟡 regression tests for subject isolation, snapshots, reports and academic context.

### 16. Documentation / release discipline
- 🟢 stable baseline recorded in docs/STABLE-BASELINE-2026-10-07.md;
- 🟡 every production-impacting change updates roadmap/status and relevant audit;
- 🟡 maintain free-tier capacity register;
- 🟡 maintain runtime deployment checklist;
- 🟡 distinguish repository state, user-observed working state and independently verified runtime;
- 🟡 create release snapshots before risky migrations.

### 17. Optional free-service aggregation — additions only
- 🟡 search permanent-free additions for cache/CDN, push, OCR, monitoring, analytics, search and backup;
- 🟡 each service must have clear quota, egress, retention, sleep/suspension and billing behavior;
- 🟡 supplementary services may enrich data through API but never replace Supabase canonical truth;
- 🟡 failure of an optional service must not break core MEDBIOHIM.

### Execution order
**P0:** production/auth/runtime gate → media delivery → tests/question bank smoke → schedule/homework core.
**P1:** Histology/Materials reconciliation → admin Content Center → trainer/preparation completion → mobile acceptance → chemistry answer completion.
**P2:** AI tutor/provider layer → PC-style storage/operations center → performance/free-tier distribution → optional free-service integrations → visual polish.
**Rule:** no new feature may silently regress the stable baseline; risky changes require a rollback point.


## 2026-10-07 — P0 implementation pass

Исправлены две найденные регрессии в curriculum-map: повреждённый PHP Throwable handler и потерянная связь topic → curriculum_items для planned_date/item_type. Подробный audit: `docs/IMPLEMENTATION-AUDIT-2026-10-07-P0.md`.

Production gate пока не закрыт: Vercel сообщает `build-rate-limit`; CI/runtime READY не считаются подтверждёнными до фактического успешного запуска.


## 2026-10-07 — P0 verification/fix cycles continued

- 🟢 Vercel production deployment for `59e38d9664645556bd2fca64ea6d97f998a5f200` reached **READY**; GitHub combined status for that commit reports Vercel success.
- 🟢 Repeated source verification found and fixed a real JSX regression in the Chemistry master-bank section and two admin validation defects.
- 🟢 Public health diagnostics were hardened: DB host/port/user and raw connection diagnostics are no longer returned by `HealthChecker`.
- 🟢 Histology Materials now have an authenticated SpaceWeb physical-file fallback when no B2 download URL exists; this preserves the canonical architecture `Supabase metadata + SpaceWeb binary`.
- 🟡 Latest commits after `59e38d9...` are currently blocked from a new Vercel deployment by `build-rate-limit`; they remain source-verified only until a READY deployment is available.
- 🟡 Production authenticated smoke and SpaceWeb runtime verification remain open.


## 2026-10-07 — semantic verification cycle

### Security
- 🟢 `public.chemistry_source_documents` RLS enabled in live Supabase.
- 🟢 Authenticated read-only policy added; server-side writes remain protected.
- 🟡 Supabase Auth Leaked Password Protection remains a separate hardening item.

### Subject/question isolation
- 🟡 Do not make `subjects.slug` globally unique: current data intentionally contains repeated slugs across academic contexts.
- 🟡 Next implementation gate: question/search boundaries must prefer authoritative `subject_id` / academic context and use slug only as a human-facing alias.
- 🟢 Existing histology ticket banks remain untouched by this cycle.

### 18. Media Optimization Pipeline — P1/P2
Цель: уменьшать размер загружаемых изображений и других медиа без заметной потери качества и без нарушения исходных файлов.

- 🟡 единый upload pipeline для Materials, лекций, trainer/atlas, профиля и админского Content Center;
- 🟡 определять реальный MIME/type по содержимому, а не доверять расширению;
- 🟡 изображения: автоматический resize по максимальному разумному разрешению;
- 🟡 выбирать оптимальный web-формат: **WebP** как основной безопасный fallback и **AVIF** для ещё меньшего веса там, где поддержка/качество оправданы;
- 🟡 не использовать WebM для обычных фотографий: WebM — контейнер прежде всего для видео/анимации. Если в конкретном сценарии WebM для image/animation действительно даёт выигрыш, поддержать его экспериментально, но не делать canonical photo format;
- 🟡 видео/анимации: отдельная транскодировка в WebM/AV1/VP9 только при доказанном выигрыше размера и совместимости;
- 🟡 сохранять оригинал только для типов, где он нужен для обучения/архива/редактирования; для обычных preview-фото хранить оптимизированный master + при необходимости thumbnail;
- 🟡 генерировать thumbnail/preview и несколько responsive sizes вместо загрузки огромного оригинала на телефон;
- 🟡 EXIF: удалять GPS и ненужные метаданные из пользовательских фото;
- 🟡 дедупликация по checksum/content hash до повторной загрузки;
- 🟡 лимиты размера/разрешения с понятной ошибкой до тяжёлого upload;
- 🟡 прогресс загрузки + состояние processing + retry;
- 🟡 оптимизация должна выполняться server-side/worker, чтобы слабый телефон не тратил батарею/память на тяжёлую конвертацию;
- 🟡 оригинал и производные файлы связывать через source_file_id/asset family;
- 🟡 MIME/size/checksum/width/height/duration хранить в metadata;
- 🟡 CDN/cache headers для immutable derivatives;
- 🟡 fallback: если конвертация недоступна, исходный поддерживаемый файл всё равно должен корректно сохраниться;
- 🟡 для документов не делать «сжатие любой ценой»: PDF/DOCX оптимизировать отдельно;
- 🟡 сравнить качество/размер на реальных фото препаратов, ЭМ, атласа и лекционных изображениях;
- 🟡 измерять storage + egress до/после оптимизации.

#### Архитектурное правило
**Original → optimized master → thumbnails/responsive derivatives → client.**
Canonical metadata остаётся в Supabase, физические бинарники — в согласованном storage (SpaceWeb/B2). Оптимизация не должна ломать Atlas/content или Materials.

#### Очередность
1. MIME/размер/checksum + безопасный upload.
2. Image optimizer WebP/AVIF + resize + thumbnails.
3. Responsive delivery/cache.
4. Video WebM pipeline.
5. Document/PDF optimization.
6. Дедупликация и storage/egress metrics.
7. Финальный visual/quality regression на iPhone/Android/desktop.


## 2026-10-07 — Media quality safety rule

Для Media Optimization Pipeline зафиксировано обязательное правило **content-aware multi-candidate compression**:

- 🟢 качество нельзя выбирать одной глобальной настройкой;
- 🟢 изображения классифицируются по назначению/содержимому: фото, микропрепарат/ЭМ, атлас, схема, скан, text-heavy, mixed;
- 🟢 для значимых изображений создаются несколько quality/compression candidates;
- 🟢 quality gate отдельно проверяет мелкий текст, подписи, формулы, границы и учебные детали;
- 🟢 выбирается минимальный по размеру кандидат, который проходит quality/readability threshold;
- 🟢 если кандидат не проходит — автоматически выбирается более качественный;
- 🟢 если ни один derivative не проходит — используется оригинал;
- 🟢 при невозможности надёжно подтвердить качество нельзя рисковать читаемостью: fallback идёт на более качественную версию/original;
- 🟢 original не удаляется ради экономии веса, если он нужен для zoom, восстановления или архива;
- 🟡 реализация этого quality gate ещё не считается DONE до runtime/visual проверки на реальных MEDBIOHIM материалах.

Полная политика: `docs/MEDIA-QUALITY-DELIVERY-POLICY.md`.


## 2026-10-07 — Pass 28: authoritative subject identity

🟢 Проведён semantic/code audit границы предметов.

- 🟢 exam_questions filtering теперь принимает subject_id и при его наличии считает UUID authoritative; subject_slug остаётся совместимым fallback.
- 🟢 Генерация билетов предпочитает ticket_banks.subject_id, а не выбирает весь банк только по slug.
- 🟢 Question Library catalog сохраняет subject_id, поэтому одинаковые slug больше не должны схлопывать разные subject rows в один logical item.
- 🟢 Global Search получил subject_id boundary и передаёт authoritative identity во все поддерживаемые источники.
- 🟢 Admin content package import больше не выбирает первый subject при duplicate slug: если slug неоднозначен, импорт требует явный subject_id.
- 🟢 Live DB подтверждает, что все текущие ticket banks имеют согласованный ticket_banks.subject_id = exam_questions.subject_id; для гистологии 366 опубликованных вопросов относятся к canonical subject UUID 977d78ca-7a58-4b0a-9e93-29d8e03f6946.
- 🟡 Frontend subject context должен передавать subject_id там, где контекст уже известен; старые slug-only входы сохраняются как backward-compatible fallback.
- 🟡 Target-runtime smoke остаётся отдельным gate: текущие новые commits ещё не получили READY Vercel deployment из-за build-rate-limit.


## 2026-10-07 — Pass 28A: Question Library UUID propagation

🟢 Предметный контекст в Question Library теперь может передавать subject_id; если старый вход содержит только subject_slug, frontend пытается безопасно вывести UUID только когда для этого slug существует ровно один subject_id в каталоге вопросов. При неоднозначности система не угадывает предмет и оставляет выбор пользователю.

🟡 Полный subject-id propagation по всем старым frontend entry points остаётся отдельным compatibility cleanup; новые boundaries уже принимают UUID.


## 2026-10-07 — Pass 29: Smart grading optionality/state machine

🟢 Исправлена семантика smart grading по всей цепочке обычного теста и preparation:

- deterministic MCQ/open normalized match остаётся первым и не вызывает AI без необходимости;
- орфография/опечатки не являются критерием correctness;
- AI остаётся optional fallback для смысловой проверки;
- pending/error от AI больше не блокируют завершение теста или preparation;
- unresolved answers сохраняются с grading_status и могут быть повторно проверены после завершения;
- обычные тесты получили retry endpoint для pending/error answer;
- preparation получила retry endpoint для одного или всех unresolved answers;
- Test/Preparation UI теперь использует server-authoritative grading, а не локальное сравнение как источник результата;
- для unresolved ответа UI показывает состояние и кнопку повторной проверки;
- после regrade результат обычной попытки пересчитывается;
- preparation сохраняет unresolved count отдельно от wrong count;
- AI review после завершения preparation остаётся отдельной необязательной аналитикой и не влияет на факт завершения.

🟡 Runtime gate остаётся: требуется реальный authenticated smoke на SpaceWeb/Vercel с детерминированным, semantic-AI, AI-error и retry сценариями.


## 2026-10-07 — Pass 30: file visibility security alignment

🟢 Закрыт выявленный P0 mismatch между Supabase RLS и server-side B2 presign:

- backend FileRepository больше не считает `group_id IS NULL` автоматически доступным для всех authenticated users;
- group-scoped file требует active membership;
- group-less file доступен authenticated пользователю только при `visibility='public'` либо uploader ownership;
- Supabase `files_read_allowed` приведена к той же политике;
- B2 presigned URL выдаётся после server-side `assertAccess`, поэтому service-role backend не должен расширять доступ относительно продуктовой модели.
- security advisor повторно проверен: этот file-policy gap исчез; остаётся отдельное предупреждение Leaked Password Protection.

🟡 Требуется target-runtime authorization smoke: owner, public file, same-group member, inactive member, unrelated user.


## 2026-10-07 — Pass 31: Histology material viewer access

🟢 Закрыт ещё один access-boundary gap: `/api/v1/materials/{id}/file` теперь проверяет не только `subject_slug=histology`, но и специальность пользователя (`mbh`) перед чтением физического файла с SpaceWeb.

Это синхронизирует viewer с generic Materials access policy и не оставляет прямой authenticated URL обходом specialty boundary.

🟡 Финальный target-runtime smoke всё ещё обязателен: разрешённый MBH user → DOC/DOCX/photo; пользователь без MBH → 403.


## 2026-10-08 — Histology Lecture 05: blood practical integration

🟢 Создана и проверена в Supabase полноценная Lecture 05: «Кровь и лимфа».

Связь закреплена с canonical curriculum:
- module: «Кровь и лимфа»;
- topic: «Неделя 5–6 · Лекция 5/практика · Кровь и лимфа»;
- topic UUID: b1000001-0000-4000-8000-000000000007.

🟢 Усилена сквозная учебная цепочка внутри лекции:
**теория → конкретный микропрепарат → морфологический признак → ЭМ → тест → экзаменационный вопрос**.

Подтверждены и связаны без изменения их canonical plan mapping:
- 8 опубликованных preparation-карточек «Кровь мазок»;
- 2 релевантных электронограммы;
- 2 source-backed материала;
- тест «Гистология — общая: кровь» — 20 вопросов;
- 9 опубликованных exam-question IDs по теме.

🟡 Не считать весь лекционный слой завершённым: это первый полноценно заполненный lecture body; остальные lecture bodies требуют отдельного source-backed прохода.

🟡 Production/browser smoke для лекции и физического media остаётся открытым до подтверждения целевого окружения.

Документация: docs/HISTOLOGY-LECTURE-05-BLOOD-LINKS-2026-10-08.md.


## 2026-10-08 — Histology Lecture 05: Mermaid rendering repair

🟢 Исправлена проблема, из-за которой Mermaid-схемы Lecture 05 отображались как текстовый блок кода. Причина найдена в импортированном `body_md`: Markdown был сохранён с лишним уровнем escaping для обратных кавычек и кавычек внутри Mermaid.

- live Supabase content нормализован;
- проверено: 11 Mermaid-блоков распознаются как реальные ```mermaid fences;
- проверено: лишних escaped backticks/quotes больше нет;
- `LectureRenderer` теперь нормализует такой legacy/imported Markdown до `parseBlocks`, не меняя обычные backslashes;
- добавлена воспроизводимая миграция `database/migrations/20261008_histology_lecture_05_mermaid_escape_fix.sql`.

🟡 Осталось: target-runtime/browser smoke после доставки frontend commit — проверить iPhone/Safari и desktop, что все 11 схем реально превращаются в SVG Mermaid, а таблицы и обычный Markdown остаются корректными.


### 2026-10-08 — Lecture 05: links + visual references
- 🟢 Fixed Markdown link rendering in `LectureRenderer`: internal lecture links such as «Микропрепараты» and the 20-question test now become actual clickable anchors.
- 🟢 Added 9 visual blocks to Lecture 05: 5 existing MEDBIOHIM blood-smear preparation images + 4 independent University of Utah WebPath images.
- 🟢 External images are used only as a visual cross-check; canonical MEDBIOHIM trainer cards remain the primary practical material.
- 🟢 Live Supabase lecture updated and verified; only Lecture 05 was touched.
- 🟡 Runtime/browser smoke on deployed Vercel build remains to be confirmed.
\n## 2026-10-08 — Histology Lecture 05: iPhone/Safari visual defect repair\n\n### Фактически подтверждённые проблемы\nНа реальном скриншоте production medbiohim.vercel.app видно:\n1. 5 собственных фотографий препаратов дают broken-image placeholder.\n2. Markdown-ссылки отображаются как [Микропрепараты] + URL вместо кликабельной ссылки.\n3. Внешняя WebPath-фотография загружается корректно, значит проблема не является общим запретом изображений в Safari.\n\n### Исправление\n- В src/components/lectures/LectureRenderer.tsx исправлен Markdown-link parser.\n- Для защищённых MEDBIOHIM trainer images лекция больше не использует прямые /content/histology/...jpg URL. Контент хранит canonical trainerId, а client-side ImageBlock получает изображение через существующий authenticated getTrainerImageUrl().\n- Это соответствует фактической архитектуре: metadata в Supabase → authenticated trainer media endpoint → физический Histology media root на SpaceWeb.\n- Live Lecture 05 обновлена без изменения trainer cards, их plan mapping или других subjects.\n- Добавлена миграция: database/migrations/20261008_histology_lecture_05_trainer_images_fix.sql.\n\n### Release gate\n🟡 До READY deployment и повторного browser smoke не считать пункт закрытым. Проверить:\n- «Микропрепараты» → /subjects/histology?tab=trainer;\n- «Материалы» → /subjects/histology?tab=materials;\n- тест «Гистология — общая: кровь» → 20 вопросов;\n- 5 MEDBIOHIM photos;\n- 4 WebPath photos;\n- 11 Mermaid blocks;\n- iPhone Safari layout/scroll.\n\nОграничение сохраняется: этот цикл касается только Histology Lecture 05.
 
---

# 2026-10-08 — Histology Lecture 05 learning UX / visual learning

**Статус: 🟡 IN PROGRESS — code + live content updated; deployed/runtime smoke pending**

Зафиксирован learning-слой: **теория → контекстный препарат → мини-тест из БД → ЭМ/практика → итоговый тест**.

### Уже сделано
- 🟢 Lecture 05 `lec-histology-blood-20261008` сохранена как canonical lecture в `site_content`.
- 🟢 Markdown/HTML rendering regression исправлена в `LectureRenderer`.
- 🟢 Mermaid parsing/normalization исправлен.
- 🟢 собственные фото лекции переведены на canonical trainer IDs + authenticated `getTrainerImageUrl()`.
- 🟢 Markdown links исправлены.
- 🟢 создан `ImageLightbox`: viewport-centered modal, zoom, reset, close, fullscreen API fallback.
- 🟢 Atlas `ImageBox` переведён на новый lightbox.
- 🟢 canonical specimen cards получают название/окраску/описание из trainer card, поэтому текст препарата не дублируется вручную в каждом фото-блоке.
- 🟢 Lecture 05 разбита на 6 логичных учебных блоков.
- 🟢 после каждого блока добавлен mini-test block, вопросы берутся из опубликованной `public.questions`.
- 🟢 создан authenticated backend `GET /questions/mini-quiz` + `POST /questions/mini-quiz/check`; answer key не отдаётся клиенту.
- 🟢 live Lecture 05 обновлена: 6 quiz blocks, контекстные photo checkpoints, старый photo-wall убран.
- 🟢 сохранена внешняя WebPath-проверка как дополнительный источник.
- 🟢 создан документ `docs/HISTOLOGY-LECTURE-LEARNING-UX-2026-10-08.md`.

### Остаётся
- 🟡 Vercel READY + frontend build verification;
- 🟡 SpaceWeb backend deployment для новых mini-quiz endpoints;
- 🟡 авторизованный iPhone Safari smoke;
- 🟡 проверить отсутствие regressions в других lecture pages;
- 🟡 после подтверждения — перевести пункт из IN PROGRESS в DONE.

### Non-regression
Этот цикл не меняет другие subjects, ticket banks или существующие trainer/electronogram records.

 
### Дополнение 2026-10-08 — возрастные нормы гемограммы

- 🟢 В Lecture 05 добавлен отдельный блок **7A–7E «Возрастные нормы гемограммы»**.
- 🟢 Добавлена временная шкала физиологических перекрёстов: 1-е сутки → 4-е сутки → 1–2 года → 4 года → 14–15 лет/взрослый.
- 🟢 Добавлены возрастные таблицы лейкоцитарной формулы и ключевых показателей гемограммы.
- 🟢 Добавлен алгоритм чтения возрастной карточки: **возраст → соответствующая норма → сравнение → вывод**.
- 🟢 После блока добавлен отдельный мини-тест из существующей базы вопросов гистологии.
- 🟡 Значения с различиями между указанными в присланном материале источниками не сведены молча к одному варианту.


## 2026-10-08 — Явные кнопки просмотра изображений

- 🟢 ImageLightbox обновлён: на превью теперь есть явная кнопка «Открыть на весь экран».
- 🟢 В открытом просмотрщике добавлены отдельные кнопки «Уменьшить», «Увеличить», «Сбросить», «Полный экран» и «Закрыть».
- 🟢 Управление масштабом сохранено до 300%; viewport остаётся фиксированным поверх страницы.
- 🟢 Для iPhone/iPad Safari сохранён fallback: если нативный Fullscreen API недоступен, используется полноэкранный fixed-lightbox.
- 🟡 Runtime на iPhone Safari и production deployment остаются непроверенными до фактического smoke-test.
- Commit: 7735ff1ccdc21b509ca6e61bb8267d81a3a1a4bf.


## 2026-10-08 — Unified Media Viewer / Atlas release gate

**Статус: 🟡 IN PROGRESS — P1**

Проблема подтверждена не только на iPhone: на Windows/desktop тот же архитектурный дефект проявляется как вложенное окно с ограничением 90vh, внутренним overflow-auto и отсутствующими на первом уровне controls.

### Исправление в работе
- 🟢 ImageLightbox переведён на единый viewport viewer: 100dvh, safe-area, явные controls, zoom до 500%, reset, close, desktop wheel, double-click, drag/pan и Pointer Events для pinch.
- 🟢 native Fullscreen API оставлен только как enhancement; CSS viewport остаётся рабочим fallback для Safari/iOS.
- 🟢 Atlas больше не использует внешний max-h-[90vh] overflow-auto modal вокруг изображения.
- 🟢 Atlas открывает тот же unified viewer напрямую, с названием, занятием, captions и переходом к материалам.
- 🟡 Lecture / Trainer / Materials должны пройти cross-page regression на том же viewer contract.
- 🟡 target runtime пока не подтверждён: Vercel/SpaceWeb deployment и реальный браузерный smoke обязательны.

### Release gate
1. Windows Chrome/Edge/Firefox/Yandex: Atlas open → controls → zoom → pan → close.
2. macOS Safari/Chrome: тот же сценарий.
3. iPhone Safari: viewer сразу занимает viewport, нет page-scroll для изображения, controls видимы.
4. Android Chrome: touch/pinch/drag/close.
5. Lecture → Atlas → Trainer → Materials: нет вложенных image modals и regressions.
6. Light/dark и safe-area не создают чёрных/пустых полос.
7. Production commit совпадает с проверяемой веткой до перевода в DONE.

До выполнения release gate пункт остаётся 🟡.
\n## 2026-10-08 — Unified Media Viewer: iPhone viewport regression found and patched\n\n- 🟡 Screenshot smoke exposed a second-level issue: the fixed viewer was still physically constrained by the app DOM on iPhone Safari, so the overlay did not cover the full viewport and MobileNav remained visible above it.\n- 🟢 Patched in `fix/unified-media-viewer-desktop-mobile`: `ImageLightbox` renders through `createPortal(..., document.body)`, gets explicit viewport sizing/z-index, and uses explicit glass RGBA surfaces.\n- 🟢 Scroll-lock effect no longer restarts on every zoom change.\n- 🟡 Target-runtime smoke remains mandatory before calling the viewer DONE.\n- 🟡 Required: iPhone Safari, Android Chrome, Windows Chrome/Edge/Firefox/Yandex, macOS Safari/Chrome, and Lecture → Atlas → Trainer → Materials regression.\n
2026-10-08 — launch-blocker sweep: fixed an additional literal-newline PHP syntax artifact in `backend/config/routes/questions_rest.php` on the same active viewer branch (`b374a49fd03574806595064746d09c046a19778e`). No new branch created. Remaining release gate is target runtime/Vercel build plus SpaceWeb/browser smoke.

## 2026-10-08 — Runtime integrity fixes during pre-launch audit

- 🟢 Schedule academic-session reconciliation: live `schedule_entries` now 309/309 with `session_id`; 0 unresolved current entries.
- 🟢 Backend namespace exception audit: fixed unqualified exceptions in `TestRepository`, `CalculatorsService`, `SrsService` on the current working branch.
- 🟡 Vercel remains externally blocked by current `build-rate-limit` status; exact branch deployment still required.
- 🟡 GitHub code-check jobs currently fail without usable step/log evidence; do not interpret that as a source failure until runner evidence exists.
- 🟡 SpaceWeb/auth/media/browser runtime gates remain open.

Rule unchanged: no production DONE from source-only inspection.

## 2026-10-08 — Final pre-launch sweep

- 🟢 Materials: canonical `public.files`/B2 delivery + legacy Histology SpaceWeb fallback unified.
- 🟢 Vercel API proxy preserves media redirect/cache/disposition headers.
- 🟢 B2 materials now negotiate a presigned URL through a JSON `file-url` endpoint; legacy authenticated binaries remain blob-fetched with Bearer.
- 🟢 Live DB integrity cleanup applied: duplicate schedule session index removed; `file_variants` RLS initplan fixed.
- 🟢 Live checks: 309/309 schedule entries have `session_id`; 80/80 published Materials have source metadata; 479/479 published active Histology questions have test links; duplicate/orphan test-question links = 0.
- 🟢 Found and fixed a real PHP SQL-string quoting bug in `HomeworkRepository.php` that could break backend parsing.
- 🟢 Predeploy audit extended to media viewer/materials redirect regressions.
- 🟡 Exact current branch deployment is still blocked by Vercel build-rate-limit; target SpaceWeb/browser runtime remains the final acceptance gate.

No new branch created; the unified viewer correction is already integrated into `main`, and the latest zoom/pan refinement is committed directly to `main`.


## 2026-10-07 — Pass 32: Schedule → exact lesson → homework → photos
- Schedule homework creation now uses the exact schedule entry UUID when launched from a lesson.
- Shared homework creation is aligned with the product security model: staff or the group's starosta; an ordinary student cannot publish shared group homework.
- Homework now stores `schedule_entry_id`; legacy homework without this field remains visible through the date+subject compatibility fallback.
- Homework creation supports up to 12 image attachments. Files reuse the existing authenticated `/files/upload` → B2/metadata pipeline; attachment rows live in `homework_attachments`.
- Primary DB and Supabase REST fallback both persist lesson context, due_date and attachments.
- Planner returns homework attachments with B2 download URLs for lesson view.
- Primary repository now persists `due_date`; this removes the existing create→planner visibility mismatch.
- Live Supabase schema was migrated and verified: `homeworks.schedule_entry_id` + index exist; no existing homework rows were modified.
- Private test environment was inventoried by variable family. Repository templates contain placeholders only; real test credentials are not published to GitHub.

- ⚠️ В live DB на 2026-10-07 нет ни одной активной membership с `role_in_group='starosta'`; сценарий ДЗ готов в коде, но для реального student-side создания общего ДЗ староста должен быть назначен администратором.

- 🟡 Materials physical delivery audit: live Histology has 80 published materials, all source_path-only (materials.file_id/content_sources.file_id are null); unified viewer fix now prefers canonical B2 file objects and keeps authenticated SpaceWeb fallback.

## 2026-10-07 — Pass 33: File & Storage Center foundation

- 🟢 added canonical file checksum metadata (`sha256`) for new uploads;
- 🟢 added explicit `storage_provider` and `processing_status` metadata;
- 🟢 added non-destructive admin Storage Audit API and UI;
- 🟢 audit reports file references from Materials, trainer cards, homework attachments and homework submissions;
- 🟢 live DB default corrected to `storage_provider='unknown'` for legacy/unclassified files; B2 is set only when `b2_file_id` is present;
- 🟡 physical B2/SpaceWeb object reconciliation is still not performed automatically — this is the next storage pass;
- 🟡 media optimization worker/derivatives are not implemented yet.

## 2026-10-07 — Pass 34: complete B2 reconciliation foundation

- 🟢 B2 reconciliation now builds its metadata keyset independently of the UI item limit;
- 🟢 B2 listing is paginated through all available object pages instead of stopping at the first 5000 objects;
- 🟢 audit now distinguishes matched B2 objects, B2 orphan objects, and active DB B2-backed records missing from B2;
- 🟢 B2 orphan detection is restricted to B2-backed metadata and no longer treats SpaceWeb/unknown files as B2 records;
- 🟢 admin Storage Center exposes both “нет в B2” and “нет в БД” results;
- 🟢 fixed the Storage Center navigation tuple type so the new storage tab is TypeScript-valid;
- 🟡 SpaceWeb physical existence/head reconciliation remains the next runtime-dependent storage task;
- 🟡 quality-gated image/video derivative generation remains unimplemented.


## 2026-10-07 — Pass 35: media derivative metadata foundation

- 🟢 added file_variants as a dedicated metadata layer for optimized image/video derivatives;
- 🟢 variants retain a strict parent files record and unique variant_key;
- 🟢 variant metadata supports MIME, dimensions, duration, checksum, physical object key and B2 id;
- 🟢 processing state is explicit (ready/queued/processing/failed/skipped);
- 🟢 variant RLS inherits the parent file's owner/public/active-group-member visibility boundary;
- 🟢 live migration applied; no existing binaries were moved, rewritten or deleted;
- 🟡 physical derivative generation/quality gating is deliberately not claimed yet and is the next implementation stage after runtime capability verification.


## 2026-10-07 — Pass 36: content-aware media quality gate

- added a pure MediaQualityPolicy service for selecting the smallest derivative that passes content-aware gates;
- separate thresholds cover text-heavy/diagram/scan versus electronogram/micropreparation/atlas content;
- policy rejects excessive downscaling, text readability loss, edge/detail loss and compression artifacts;
- video policy preserves a 1080p source tier and provides 720p/480p fallback candidates;
- policy never deletes or rewrites the original file;
- actual encoding and perceptual measurements remain runtime-dependent and will be wired after capability/worker verification.


## 2026-10-07 — Pass 37: safe derivative processor foundation

- 🟢 добавлен FileVariantRepository для upsert/list/status;
- 🟢 добавлен MediaDerivativeProcessor для реального image→WebP/AVIF процесса при наличии соответствующего GD encoder;
- 🟢 MIME определяется по фактическому содержимому через finfo, а не доверяется клиентскому MIME;
- 🟢 оригинал никогда не перезаписывается и не удаляется;
- 🟢 derivative candidate проходит существующий MediaQualityPolicy перед физической загрузкой выбранного варианта;
- 🟢 выбранный derivative получает checksum, MIME, размер, размеры изображения и B2 object id;
- 🟢 добавлен strict-admin endpoint ручной обработки существующего B2-backed изображения;
- 🟢 при отсутствии подходящего encoder файл не ломается: derivative остаётся failed/skipped, original сохраняется;
- 🟡 автоматический queue/worker ещё не объявлен готовым — текущий запуск намеренно ручной до проверки target runtime;
- 🟡 perceptual text/detail/artifact scoring пока не измеряется реально: текущий pass подготавливает pipeline, но не выдаёт ложный quality-pass.


## 2026-10-08 — Histology lecture bodies

🟢 Заполнен canonical lecture layer для гистологии из source-backed материалов `Гистология.zip`: 20 published lecture records в `site_content`, включая 19 новых тематических/дополнительных лекций и существующую расширенную Lecture 05 «Кровь и лимфа». Legacy `histology_lectures` stubs отключены из published выдачи. Reproducible migration: `database/migrations/20261008_histology_full_lectures.sql`.

🟡 Остались отдельные задачи: runtime/browser smoke deployed build, физическая сверка media на SpaceWeb и дальнейшее связывание каждой лекции с конкретными trainer/EM/test cards там, где source-backed IDs однозначны.

## 2026-10-08 — Histology lecture → plan → methodics → files → preparations

🟢 Текущий 3-й семестр гистологии нормализован по учебному плану: **16 лекционных пунктов** используют названия плана 1:1, без самостоятельного переименования.

🟢 Каждая текущая лекция получила explicit related_learning:
- конкретный Word/методический источник;
- точный раздел и страницы там, где пагинация надёжно извлечена;
- для старых .doc, где автоматическая пагинация не подтверждена, сохраняется точный заголовок раздела без выдуманных страниц;
- связанные схемы/таблицы/файлы из Гистология.zip;
- связанные канонические микропрепараты из trainer-контурa;
- электронограммы темы, когда они реально относятся к этому пункту.

🟢 Исправлены фактические cross-topic ошибки trainer mapping: кровь перенесена из «Соединительных тканей» в «Кровь и лимфа», кора мозжечка — в «Кора, мозжечок и ВНС», желудочно-кишечные препараты сняты с текущего пункта «ротовая полость».

🟢 Добавлен UI-блок прямо на странице лекции: «Материалы к этой лекции» с открытием Word/файлов и запуском полного просмотрщика препаратов с zoom/pan/fullscreen.

🟢 Добавлены воспроизводимые миграции:
- database/migrations/20261008_histology_lecture_plan_learning_links.sql;
- database/migrations/20261008_histology_lecture_01_preparations.sql.

🟡 Точный постраничный диапазон для части старых binary .doc пока не заявляется без надёжного сохранения исходной Word-пагинации; на сайте показывается проверенный раздел документа вместо выдуманных номеров страниц.


## 2026-10-08 — Lecture 05 as canonical rich-editor standard

🟢 Лекция 05 «Кровь и лимфа» закреплена как эталон оформления и структуры лекции: специальный контент хранится в body_md и включает Mermaid, изображения препаратов, мини-тесты, таблицы и математическую разметку.

🟢 Админский редактор лекций переведён на lossless block model: существующие специальные блоки при открытии лекции превращаются в редактируемые placeholder-блоки, а при сохранении обратно сериализуются без потери Mermaid/quiz/image/chart/chem/video/formula структуры.

🟢 Добавлены конструкторы для Mermaid-схем, таблиц, мини-тестов, формул, диаграмм, химических фигур, видео и trainer-препаратов/электронограмм; обычное Word-подобное форматирование сохранено.

🟢 Добавлен отдельный редактор учебных связей: методички, страницы/разделы, файлы/схемы, микропрепараты и электронограммы управляются из той же админской формы.

🟢 Остальные 15 текущих лекций получили первый source-backed rich-template слой по образцу Lecture 05: схема + реальные препараты + мини-тест из существующего банка.

🟢 Reproducible migration: database/migrations/20261008_histology_lecture_template_blocks.sql.

🟡 Следующий content pass — углубить каждую оставшуюся лекцию до уровня Lecture 05 по количеству source-backed таблиц/схем/практических блоков, не добавляя неподтверждённых фактов.


## 2026-10-08 — Single canonical admin lecture editor

🟢 Удалён встроенный legacy RichEditor из src/app/admin/lectures/page.tsx: админка использует только RichLectureEditor.

🟢 RichLectureEditor поддерживает lossless editing для форматов, используемых эталонной Lecture 05: Mermaid, таблицы, mini-quiz, формулы, trainer/EM images, charts, chemistry figures, videos, PDF/Word uploads, ссылки и базовое Word-подобное форматирование.

🟢 Специальные блоки можно заново открыть через «Изменить» и удалить без ручного редактирования Markdown.

🟢 LectureLearningEditor подключён к форме той же лекции и управляет methodic pages/sections, scheme/file materials, preparations и electronograms.

🟢 Current Histology lecture titles остаются canonical curriculum titles even after admin save.


## 2026-10-08 — Lecture 05 leukocyte differential trainer

🟢 В Лекцию 05 lec-histology-blood-20261008 встроен интерактивный тренажёр лейкоцитарной формулы.
- проценты: запоминание учебной нормы взрослого;
- ↑/↓: распознавание нейтрофилии/нейтропении, лимфоцитоза/лимфопении, эозинофилии, базофилии, моноцитопении и сдвига влево;
- мазок: распознавание клетки по изображению;
- два визуальных источника: локальные canonical MEDBIOHIM trainer cards и независимая внешняя сверка WebPath;
- внешний лабораторный reference-check отделён от учебной нормы Lecture 05 и помечен как вариант, зависящий от лаборатории;
- тренажёр является отдельным переиспользуемым блоком leukocyte в RichLectureEditor / LectureRenderer.

Важно: Lecture 05 уже редактируется через единый RichLectureEditor; новый тренажёр теперь также доступен как вставляемый блок редактора.


## 2026-10-08 — Unified Media Viewer refinement + branch reconciliation

- 🟢 `src/components/media/ImageLightbox.tsx` refined on canonical `main`: zoom keeps the exact cursor/touch focal point, pinch zoom preserves the pinch focal area, drag/pan is bounded by the visible image area, resize re-clamps the viewport, and controls remain touch-sized.
- 🟢 The same viewer continues to serve Atlas/micropreparations, lecture images, Materials images and trainer media; no second viewer implementation was introduced.
- 🟢 Repository branch audit completed against `main`: `fix/unified-media-viewer-desktop-mobile` has 0 unique commits and is already contained by `main`.
- 🟡 `beta`, `fix/chem-rendering-tests-rdkit` and `fix/lecture-service-schedule-home` are old divergent branches with unique commits, but their files are based on substantially older `main` history and would reintroduce retired/stale code if merged wholesale. They were intentionally not merged blindly; only useful work should be ported selectively after a current-target review.
- 🟡 Runtime acceptance remains open: exact current `main` deployment, iPhone Safari/Android Chrome touch smoke, Windows/macOS browser smoke and Lecture → Atlas → Trainer → Materials regression.


## 2026-10-08 — Leukocyte practical case cards

- 🟢 `LeukocyteDifferentialTrainer` переведён в практический режим карточки по методичке `4.Кровь.docx`.
- 🟢 Карточка генерирует возраст из учебных колонок методички и случайный процентный результат для конкретного вида лейкоцита.
- 🟢 Формат карточки: 1) опознать клетку на мазке; 2) написать возрастную норму; 3) переписать результат исследования; 4) назвать термин отклонения/норму; 5) сформулировать предварительную гипотезу для «5» через функцию клетки.
- 🟢 Оценка: ошибка в любом из первых 4 полей → 2; все 4 верны → 4; все 4 + обоснованная гипотеза → 5.
- 🟢 Проверка текста терпит варианты регистра, `ё/е`, дефисы и разделители диапазона; числовая проверка нормы и результата не требует идеальной записи символов.
- 🟢 Для эозинофилов и базофилов карточки не требуют отдельного термина снижения, потому что в исходной курсовой таблице он не приведён.
- 🟡 Гипотеза на «5» является учебной, не окончательным диагнозом; связи с бактериальной/вирусной инфекцией, аллергией/паразитозом и другими состояниями показываются как возможные направления, а не как диагноз по одному проценту.


## 2026-10-08 — однозначная визуальная карточка лейкоцитов

- Практический тренажёр больше не использует общий мазок с несколькими лейкоцитами для задания «опознать клетку».
- Нейтрофилы, лимфоциты и моноциты берутся только из подтверждённых одиночных MEDBIOHIM trainer-карточек.
- Для эозинофила и базофила используется отдельный внешний кадр с фокусировкой одного целевого лейкоцита; общий мазок не подменяет ответ.
- ImageLightbox получил режим focused image: фиксированная точка интереса + сохранённые zoom/pan/pinch/fullscreen.
- Исправлена нормализация и разбор чисел в ответах тренажёра: Unicode-символы и десятичные значения теперь обрабатываются корректно.


## 2026-10-08 — разнообразные визуальные варианты лейкоцитарной карточки

- В практической карточке добавлен режим `visualMode: mixed`: каждый раунд случайно показывает либо реальный препарат, либо учебный рисунок.
- Для одного типа клетки допускаются разные визуальные источники: подтверждённый одиночный препарат MEDBIOHIM, сфокусированный препарат WebPath и два варианта источника-рисунка.
- Учебные рисунки реализованы как контролируемые SVG-иллюстрации, а не как неподписанные случайные изображения: морфология следует методичке «Кровь» (форма ядра, количество сегментов, характер зернистости и соотношение ядра/цитоплазмы).
- Изображения остаются однозначными: в рабочем кадре один целевой лейкоцит; окружающие элементы мазка не должны создавать второй возможный ответ.
- ImageLightbox теперь умеет открывать и увеличивать такие векторные учебные рисунки теми же zoom/pan/fullscreen-контролами.


## 2026-10-08 — сборщик тестов в админке

- Добавлена кнопка **«Собрать тест»** в админскую страницу тестов.
- Конструктор позволяет выбрать предмет → модуль → тему, отобрать вопросы из банка, задать число вопросов и параметры теста.
- Добавлена кнопка **«Сброс для нового теста»**: полностью очищает текущую конфигурацию и выбранный пул.
- Добавлен режим пакетной сборки: из одного выбранного пула можно сразу создать несколько вариантов теста; состав и порядок вопросов перемешиваются для каждого варианта отдельно.
- Перед сборкой показывается инструкция, как должен выглядеть корректный тест и чем отличается тест-контейнер от отдельного вопроса.


## 2026-10-08 — уточнение нейтрофильных форм на общем мазке

- Карточки с общим мазком теперь явно показывают уровень распознавания: **популяция** или **одна конкретная клетка**.
- Для карточки «Нейтрофилы всего» явно указано, что палочкоядерные и сегментоядерные формы входят в одну оцениваемую популяцию; отвечать «п/я» или «с/я» вместо общего типа нельзя.
- В интерфейс добавлено наглядное отличие: п/я — цельное изогнутое ядро (палочка/подкова/S) без сегментации; с/я — 3–5 сегментов, соединённых тонкими перемычками.
- Исправлена подпись проблемного общего препарата MEDBIOHIM: он больше не называется «одиночной клеткой».


## 2026-10-08 — только задания с обязательным распознаванием клетки

- Практический тренажёр переведён в режим **single-cell only**: каждая карточка требует самостоятельно определить конкретную клетку по изображению.
- Общие мазки/популяционные карточки исключены из рабочего режима, чтобы палочкоядерные и сегментоядерные нейтрофилы не создавали двусмысленность.
- Название целевой клетки больше не подсказывается до ответа.
- Под изображением остаётся только универсальная инструкция по морфологическому распознаванию; после проверки показывается эталон.


## 2026-10-08 — возврат к предыдущим карточкам и своим ответам

- В практическом тренажёре сохранено состояние каждой пройденной карточки в текущем прохождении: изображение/кейс, введённые ответы и результат проверки.
- Добавлена кнопка **«Предыдущая карточка»**.
- Добавлена компактная навигация по номерам уже открытых карточек: можно вернуться непосредственно к нужной карточке.
- При возврате восстанавливаются именно ответы студента и ранее полученная оценка; новая случайная карточка вместо старой не генерируется.
- Кнопка **«Пройти заново»** очищает историю текущего прохождения.


## 2026-10-08 — подробная морфологическая подсказка в лейкоцитарном тренажёре

- Добавлена разворачиваемая памятка «Как отличать клетки в мазке».
- В ней сохранены признаки нейтрофила с различением юного/палочкоядерного/сегментоядерного, эозинофила, базофила, лимфоцита, моноцита и тромбоцитов.
- Добавлен быстрый алгоритм распознавания у микроскопа: зернистость → тип ядра → размер → соотношение ядра и цитоплазмы.
- Подсказка не меняет механику проверки: карточка по-прежнему требует самостоятельного ответа о конкретной клетке.


## 2026-10-08 — толерантная текстовая проверка ответов

- Орфография, регистр, `ё/е`, `й/и`, пробелы, дефисы и обычные окончания слов не влияют на оценку текстовых ответов.
- Для названий клеток добавлены нормальные словоформы, например `базофил` и `базофилы` считаются одним ответом.
- Для терминов вывода и учебной гипотезы допускаются небольшие опечатки в длинных словах.
- Числовая проверка остаётся строгой по смыслу: десятичная точка/запятая принимается, но неправильное числовое значение не засчитывается.
- В результате карточка «базофилы / 0–1% / 0,9% / норма» больше не получает `2` только из-за формы слова «базофил».


## 2026-10-08 — тренажёр заполнения таблицы норм крови

- В раздел «Тренажёры» гистологии добавлен отдельный тренажёр **«Нормы крови»**.
- Основа — таблица «Показатели лейкоцитарной формулы в %» из `4.Кровь.docx`: 7 строк × 5 возрастных колонок = **35 ячеек** для самостоятельного заполнения.
- Студент сначала заполняет всю таблицу без эталона, затем нажимает **«Проверить себя»** и получает подсветку верных/ошибочных/пропущенных ячеек и общий результат.
- При проверке не учитывается формат записи: `0,5–5` и `0.5-5` равнозначны, знак `≈` для приблизительных значений можно не вводить.
- Нормы не расширялись внешними справочниками: использованы только значения из исходного `4.Кровь.docx`.


## 2026-10-08 — тренажёр свободного ответа по смыслу

- В раздел «Тренажёры» добавлен режим **«Ответ по смыслу»** для самостоятельной проверки подготовки.
- Вопрос показывается обычным текстом без вариантов ответа; студент отвечает своими словами, как на занятии.
- Проверка не требует дословного совпадения: ответ сопоставляется с ключевыми смысловыми группами, орфография и регистр не влияют.
- После проверки показываются процент понимания, найденные/пропущенные ключевые идеи и эталонный ответ из `4.Кровь.docx`.
- Первый набор содержит 12 вопросов по теме «Кровь»: функции и состав крови, гемограмма, лейкоцитарная формула, форменные элементы, классификация и морфо-функциональные признаки лейкоцитов, термины изменений.


## 2026-10-08 — фото-препараты крови и алгоритм определения

- Добавлен отдельный режим **«Препараты крови»** в тренажёры гистологии.
- В него включены реальные локальные фотографии из базы препаратов: нейтрофил, лимфоцит, моноцит, тромбоциты, а также сравнительные препараты «эозинофил + нейтрофил» и «лимфоцит + моноцит».
- Для каждого препарата студент сначала отвечает самостоятельно, затем открывает разбор: ключевые морфологические признаки, функция и признаки, по которым клетку не следует путать с другой.
- Методика определения опирается на `4.Кровь.docx`, атлас/учебный материал и уже импортированную базу препаратов; многоклеточные изображения используются только как сравнительные учебные препараты, а не как неоднозначная одиночная карточка идентификации.


## 2026-10-08 — blood sources + SpaceWeb textbooks integration
- BloodPreparationTrainer.tsx теперь использует реальные trainer-фото через защищённый API/ImageLightbox, а не прямые frontend-пути к изображениям.
- В карточках препаратов добавлены источник, ориентир «куда смотреть», пошаговый алгоритм определения, морфология, функция и признаки для дифференциации.
- Карточки опираются на 4.Кровь.docx и дополнительную учебную памятку; сравнительные фото остаются именно сравнительными.
- Для SpaceWeb добавлен защищённый каталог PDF: content/histology/source-materials/Учебники/.
- Frontend раздела «Материалы» автоматически показывает PDF из «Учебники» с сохранением исходных имён файлов; запись в Supabase для самого PDF не требуется.
- Доступ к книгам ограничен авторизацией и специальностью МБХ; путь к файлу проверяется на traversal и выдаётся inline как PDF.
- Точная проверка конкретных atlas-файлов не подменена догадкой: в предоставленных архивах отдельные atlas-картинки с таким именем не обнаружены, поэтому в тренажёр не добавлены выдуманные «atlas» источники.


## 2026-10-09 — admin database console / external SQL connections
- Добавлена защищённая админская консоль /admin/database.
- Основная БД Supabase отображается как встроенное подключение; её server-side реквизиты не выдаются браузеру для редактирования.
- Добавлены профили SpaceWeb: PostgreSQL pg4.sweb.ru:5433, БД ryazansev3, пользователь ryazansev3; MySQL 8 127.0.0.1:3308, БД ryazansev3, пользователь ryazansev3.
- Из сайта доступны настройка подключения, проверка соединения, просмотр таблиц и схем, чтение/поиск строк, вставка, изменение и удаление строк, а также SQL editor.
- Изменяющие SQL-операции требуют явного подтверждения; разрешён один SQL-оператор за запуск; опасные операции чтения файлов/выгрузки запрещены.
- Пароли внешних БД не показываются обратно и хранятся на backend только в зашифрованном виде.
- В Supabase создана отдельная public.admin_db_connections; RLS включён, прямой доступ anon/authenticated закрыт.
- Реальные подключения SpaceWeb пока не тестировались без пароля: профили заполнены по предоставленным реквизитам, поле пароля остаётся пустым до ввода секрета администратором.


## 2026-10-09 — общая отработка по гистологии

- 🟡 В Supabase сохранены 33 повторяющиеся отработки на 09.10.2026–29.01.2027: понедельник 16:30–18:00, пятница 15:30–16:00.
- 🟡 Записи фактически добавлены только в активное расписание МБХ-201, semester 3. Запрос пользователя — общая отработка для всех групп первого семестра; распространение на все группы ещё не выполнено.
- 🟡 Проверка отображения на сайте и мобильных устройствах не выполнена.
- ⚠️ До расширения охвата сверить неоднозначность «первый семестр» vs фактически выбранный semester 3.
- Подробности и дальнейшие действия: docs/HISTOLOGY-MAKEUP-SCHEDULE-2026-10-09.md.


## Functional audit Pass 41 — 2026-10-09
Full findings, source references, data counts and the ordered corrective plan: [docs/FUNCTIONAL-AUDIT-2026-10-09-PASS41.md](docs/FUNCTIONAL-AUDIT-2026-10-09-PASS41.md).

No broad cleanup or Supabase data modification was done in this pass. Do not mark security, media, runtime, or browser items complete until their target-environment checks pass.


## Functional security Pass 42 — 2026-10-09
The live trainer answer-key mitigation and remaining runtime acceptance gates are documented in [docs/SECURITY-FIX-2026-10-09-PASS42.md](docs/SECURITY-FIX-2026-10-09-PASS42.md). Do not mark the trainer flow fully accepted until Vercel + SpaceWeb and authenticated end-to-end checks pass.


## Reliability Pass 43 — 2026-10-09
API timeout and stale-cache signalling are fixed in source at `77b0f4a1` and included in the Vercel production READY deployment `a56d3fdb`; browser behavior still needs verification. Details: [docs/RELIABILITY-FIX-2026-10-09-PASS43.md](docs/RELIABILITY-FIX-2026-10-09-PASS43.md).
