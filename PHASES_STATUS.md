# MEDBIOHIM — PHASES STATUS

> Актуально на **2026-10-07**.  
> Source of truth: `main` + живой Supabase + целевые deployment environments.  
> Подробный план: [ROADMAP.md](ROADMAP.md).

## Статусы

- ✅ DONE
- 🟡 IN PROGRESS
- 🔴 BLOCKED
- ⬜ TODO
- ⚪ DEFERRED

---

| Фаза | Состояние | Что это значит |
|---|---|---|
| 0. Source of truth / sync | 🟡 | GitHub/Supabase/SpaceWeb/Vercel связаны, но требуется финальный production smoke-test |
| 1. Auth / account | 🟡 | основные flow есть, требуется end-to-end проверка |
| 2. Schedule | 🟡 | core готов, требуется финальная проверка UI/чередований |
| 3. Subjects architecture | 🟡 | предметный hub реализован, остальные subject flows доводятся |
| 4. Histology | 🟡 | основной контент есть, нужна финальная сверка и media verification |
| 5. Tests / Question Bank | 🟡 | engine и данные есть, нужен audit UX/admin |
| 6. Materials | 🟡 | subject-level materials + DOCX viewer есть, нужен file/media polish |
| 7. Admin CMS | 🟡 | базовые инструменты есть, quick-edit контента ещё доводится |
| 8. AI Tutor | 🔴 | provider chain есть, но runtime availability не закрыта |
| 9. Chemistry | 🟡 | core на main, экспериментальные части в beta |
| 10. UI system | 🟡 | основной UI стабилен; Aero Glass — beta |
| 11. SpaceWeb media | 🟡 | backend route готов, физические media links требуют smoke-test |
| 12. Documentation | 🟡 | новая система документов создаётся сейчас |

---

## Уже фактически закрыто

- ✅ Supabase project используется как основной DB.
- ✅ main — production branch.
- ✅ beta — experiment branch.
- ✅ subject-level navigation.
- ✅ histology canonical subject cleanup.
- ✅ 350 histology exam questions.
- ✅ 5 histology ticket banks.
- ✅ 27 published histology materials.
- ✅ histology trainer feed and atlas data.
- ✅ test-key resolution via `source_key`.
- ✅ backend deployment workflow.
- ✅ document viewer route for histology materials.
- ✅ trainer atlas → detailed materials navigation.
- ✅ Aero Glass вынесен в отдельную beta-theme, не включён по умолчанию.

## Главные открытые блокеры

### 🔴 AI
Provider availability/runtime ещё не подтверждён end-to-end.

### 🟡 Media
Trainer feed image endpoints всё ещё требуют закрытия 404/502.

### 🟡 Production
Последний frontend change должен пройти Vercel build + smoke-test.

### 🟡 CMS
Нужно довести быстрые правки вопросов/материалов/занятий.

---

## Правило обновления

После каждой законченной крупной задачи:

1. изменить статус в `ROADMAP.md`;
2. изменить статус в этом файле;
3. при необходимости обновить `SYNC_STAMP.md`;
4. только после проверки ставить ✅.


## 2026-10-04 deep audit status

Большинство ранних P0, найденных первым аудитом, уже закрыто.

| Фаза | Текущий статус |
|---|---|
| 0. Source of truth / sync | 🟡 | target-environment verification remains |
| 1. Auth / account | 🟡 | code path stable, final login/logout smoke remains |
| 2. Schedule | 🟡 | backend/editor stable, final target smoke remains |
| 3. Subjects architecture | 🟡 | subject filtering/progress/advanced tests path fixed |
| 4. Histology | 🟡 | content integrated; physical media smoke remains |
| 5. Tests / Question Bank | 🟡 | sequential/options/typecheck path fixed; full published-test audit remains |
| 6. Materials | 🟡 | histology DOCX/image viewer works; generic document coverage remains |
| 7. Admin CMS | 🟡 | false-zero fallbacks reduced; material/trainer/version UI still needs completion |
| 8. AI Tutor | 🔴 | external provider runtime still unresolved |
| 9. Chemistry | 🟡 | core implemented, broader data/content still beta |
| 10. UI system | 🟡 | no current functional blocker; Aero Glass remains beta |
| 11. SpaceWeb media | 🟡 | physical trainer media verification remains |
| 12. Documentation | 🟡 | deep audit registry now current |

## Verification evidence

Latest fully completed code-check before the newest documentation-only commit:
- TypeScript: ✅
- Next.js production build: ✅
- PHP syntax: ✅ (93 files)
- predeploy audit: ✅ no escaped-newline, no retired /api-compat calls, homework API-only
- smoke: ✅

The newest code-check after the Deep Audit documentation commit is running separately.
## Deep audit 3 override — 2026-10-04

- Source/sync → 🟡 code cleanup substantially complete; deployment convergence still pending.
- Schedule → 🟡 route duplication removed; CI backend syntax green; production delivery pending.
- Histology → 🟡 trainer content integrity is clean in Supabase; physical media still requires target-environment smoke.
- Tests → 🟢 DB integrity check shows no orphan links and no published tests without questions; UI CI is being re-run after cleanup fixes.
- Admin CMS → 🟡 content validator + audit rollback exist; dedicated editors remain polish work.
- AI Tutor → 🔴 upstream/provider availability unresolved.
- Materials → 🟡 histology DOCX viewer exists; generic subject-wide DOCX/PDF viewer is still a product task.
- Deployment → 🔴 current Vercel production deployment is behind current main.

See docs/DEEP-AUDIT-3-2026-10-04.md.
### Current CI evidence

Latest main Code Checks for commit 84d4684a013660e9c6a8e0d624edaae9ab4f7c13:
- frontend TypeScript: ✅
- Next.js production build: ✅
- escaped-newline guard: ✅
- backend PHP syntax: ✅
- smoke: ✅
- backend/source archives: ✅

The previous failing check was caused by a missing adminValidateContent import in src/app/admin/tools/page.tsx. It is fixed and the final Code Checks run is green.

See docs/FULL-AUDIT-2026-10-04.md.


## 13. Student-first / Telegram

| Подфаза | Статус | Фактическое состояние |
|---|---|---|
| 13.1 Student identity | 🟡 | Auth exists; Telegram account linking needs end-to-end verification |
| 13.2 Group membership | 🟡 | groups + memberships + group-aware schedule/homework exist; join flow needs hardening |
| 13.3 Lesson context | 🟡 | schedule entries exist; dedicated Telegram message → lesson resolver absent |
| 13.4 Telegram webhook | 🟡 | implemented in PHP; production webhook not proven |
| 13.5 Telegram chat binding | 🟡 | admin UI + DB schema implemented; live chats = 0 |
| 13.6 Telegram message ingestion | 🟡 | service + schema implemented; live messages = 0 |
| 13.7 OCR / vision | 🟡 | code path exists; runtime provider availability must be tested |
| 13.8 Homework classification | 🟡 | heuristic + LLM second pass exists |
| 13.9 Homework creation | 🟡 | repository/API path exists; live homeworks = 0 |
| 13.10 Attachments | 🟡 | attachment schema/import path exists; live attachments = 0 |
| 13.11 Telegram registration | 🔴 | custom Telegram auth trace exists, but full bot /start → account → group flow is not proven |
| 13.12 Student-generated content | ⬜ | product direction; moderation/confirmation model not complete |

### Telegram acceptance gate

The feature is not DONE until a real group test proves:

`Telegram → webhook → stored message → group resolution → subject resolution → lesson resolution → homework → attachment → website`

and:

`Telegram /start → identity link → group membership → schedule → homework`

## 14. Student-generated learning ecosystem

| Capability | Status |
|---|---|
| Student creates/updates own/group homework | 🟡 |
| Student submits homework | 🟡 |
| Student marks homework done | 🟡 |
| Student contributes notes/materials | ⬜ |
| Student suggests content correction | ⬜ |
| Peer confirmation | ⬜ |
| Starosta moderation | ⬜ |
| Change history / attribution | 🟡 foundation exists via content/audit structures |
| Group knowledge feed | ⬜ |

## Updated phase ordering

After current stability blockers:

1. **Student identity + group membership**
2. **Telegram registration/linking**
3. **Telegram → lesson resolver**
4. **Telegram → homework production smoke**
5. **Student contribution + moderation**
6. **Progress based on real activity**
7. **UI polish**


## 2026-10-06 — Pass 14–17 second verification

A second pass was performed against current main + live Supabase after the implementation and subsequent Pass 18–22 hardening.

| Pass | Status | Current result |
|---|---|---|
| Pass 14 — AcademicContext | 🟢 | group/subject/session/lesson/context_version contract is implemented and live invariants are clean |
| Pass 15 — Core academic flow | 🟢 | planner/schedule/attendance/homework/test/progress are group-scoped; homework has one canonical derived status |
| Pass 16 — Preparation | 🟢 | preparation start, membership, sequential bank progress and terminal transitions are context-safe |
| Pass 17 — Test integrity | 🟢 | server-side answers/scoring and immutable attempt/preparation snapshots are live and verified |

### Live second-pass invariants

- active test attempts missing academic snapshot: **0**;
- active preparation sessions missing academic snapshot: **0**;
- test answers outside attempt snapshot: **0**;
- preparation results without answer snapshot: **0**;
- foreign-group test attempts: **0**;
- foreign-group preparation sessions: **0**;
- schedule ↔ academic session/year/semester mismatches: **0**.

One historical submitted test attempt from before the snapshot migration has no score/context/snapshot. It is retained unchanged because reconstructing an answer or score would fabricate history. It is classified as a **legacy historical anomaly**, not a current-flow defect.

### Additional hardening in this pass

- HomeworkRepository::listForUser() now returns canonical my_status and my_status_source.
- planner uses the same derived status contract.
- pending / done / submitted / returned / graded is now the shared semantic vocabulary for student homework state.

Detailed second verification: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS14-17-SECOND-VERIFY.md.

### Release gate

Passes 14–17 are closed at implementation + live DB invariant level. They are **not** a substitute for the final target-environment gate: PHP/TypeScript/build, authenticated browser smoke, Vercel READY and SpaceWeb artifact/runtime verification remain separate.

## 2026-10-06 — Pass 18: Historical preparation integrity

| Контур | Статус | Состояние |
|---|---|---|
| Preparation scoring source | 🟢 | immutable session snapshot |
| Preparation answer snapshot | 🟢 | stored per result |
| Preparation AI historical correctness | 🟢 | uses stored answer snapshot |
| Active context integrity | 🟢 | live DB gap counts = 0 |
| CI execution evidence | 🟡 | no workflow run for latest commit |
| SpaceWeb/PHP runtime | 🟡 | must be verified in actual deployment |
| Next.js build | 🟡 | must be verified after latest frontend changes |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS18.md.


## 2026-10-06 — Pass 19: Progress / History / Preparation

| Контур | Статус | Состояние |
|---|---|---|
| Preparation historical reads | 🟢 | GET/finish/AI используют immutable session snapshot |
| Preparation answer snapshot | 🟢 | live results без answer_snapshot = 0 |
| Progress terminal statuses | 🟢 | submitted учитывается как завершённая попытка |
| Progress DB failure handling | 🟢 | silent empty fallback удалён |
| Test history group scope | 🟢 | history фильтруется по test_attempts.group_id |
| Bank group propagation | 🟢 | bank + preparation передают group_id |
| Runtime/build verification | 🟡 | требует реального target environment |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS19.md.


## 2026-10-06 — Pass 20: Test / Preparation API contract

| Контур | Статус | Состояние |
|---|---|---|
| Test answer-key exposure | 🟢 | detail/start/finish/history не отдают immutable answer snapshot |
| Preparation snapshot exposure | 🟢 | start/get/save/finish скрывают server snapshot |
| Historical preparation review | 🟢 | completed flow использует immutable snapshot |
| Progress/history contract | 🟢 | submitted + group-scoped history |
| Legacy ProgressService | 🟡 | не используется как runtime source, но файл остаётся cleanup trace |
| Runtime/build/browser verification | 🟡 | следующий gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS20.md.


## 2026-10-06 — Pass 21: Deployment / cross-group

| Контур | Статус | Состояние |
|---|---|---|
| Bank progress group isolation | 🟢 | sequential session выбирается только внутри group_id |
| Live snapshot/context invariants | 🟢 | все проверенные gaps = 0 |
| GitHub code-check definition | 🟢 | PHP + route smoke + frontend checks существуют |
| CI evidence | 🟡 | workflow runs отсутствуют в доступном API |
| Vercel runtime | 🟡 | 403 permissions prevent deployment verification |
| SpaceWeb runtime | 🟡 | отдельный target gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS21.md.


## 2026-10-06 — Pass 22: Legacy / fake-success cleanup

| Контур | Статус | Состояние |
|---|---|---|
| Admin partial-success fallback | 🟢 | fail-closed 503 |
| Legacy ProgressService | 🟢 | removed; no runtime consumer |
| Stub/placeholder scan | 🟢 | executable fake states distinguished from legitimate UI |
| Historical docs traces | 🟡 | source-of-truth cleanup remains |
| Runtime/build/browser verification | 🟡 | target environment required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS22.md.


## 2026-10-06 — Pass 23: route / legacy cleanup

| Контур | Статус | Состояние |
|---|---|---|
| Duplicate /api/v1/me | 🟢 | legacy profile_rest removed from registration and deleted |
| Canonical profile route | 🟢 | domain_rest.php is the single registered /api/v1/me handler |
| Orphan SupabaseRestProfile | 🟢 | removed; no runtime consumer |
| Runtime/build/browser verification | 🟡 | target environment still required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS23.md.


## 2026-10-06 — Pass 24: Curriculum-linked tests

| Контур | Статус | Состояние |
|---|---|---|
| Test curriculum map API | 🟢 | module/topic hierarchy with question/test counts |
| Academic context isolation | 🟢 | group/course/semester/specialty scoped |
| Test topic metadata | 🟢 | module/topic titles returned |
| Question bank topic filter | 🟢 | filter by canonical topic UUID/title |
| Untagged question safety | 🟢 | shown as unclassified; no guessing |
| Detailed plan coverage | 🟡 | currently complete only where module/topic hierarchy is imported |
| Remaining question tagging | 🟡 | controlled mapping required |
| PHP/Next/browser/runtime | 🟡 | target environment verification required |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS24.md.


## 2026-10-06 — Pass 25: full current-semester mapping

| Контур | Статус | Результат |
|---|---|---|
| Current-semester question mapping | 🟢 | 655/655 have canonical topics |
| Current-semester test mapping | 🟢 | 30/30 have canonical topics |
| Histology lesson mapping | 🟢 | 206 previously untagged mapped; 47 explicitly outside current plan |
| Chemistry lesson mapping | 🟢 | 1.1–3.13 taxonomy mapped to canonical topics |
| Lesson dates | 🟢 | verified current calendar dates attached where available |
| Out-of-calendar safety | 🟢 | marked explicitly, not falsely assigned |
| Ticket-bank integrity | 🟢 | untouched |
| Runtime/build/browser | 🟡 | separate verification gate |

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS25.md.


## 2026-10-07 — Pass 26: Chemistry master catalog

| Контур | Статус | Состояние |
|---|---|---|
| Source archive audit | 🟢 | 7 scanned PDFs / 142 pages checked; no usable native PDF text layer |
| Unified chemistry catalog | 🟢 | Supabase `chemistry_master_documents` created |
| Open tasks | 🟢 | 260 canonical organic-chemistry open tasks included |
| Current test questions | 🟢 | 176 published chemistry test questions included with options/answers |
| Formula preservation | 🟢 | textual chemical formulas/reactions retained verbatim where source text contains them |
| Image-only structural/skeletal formulas | 🟡 | must be confirmed from original page images before generating answer formulas |
| Full archived test-section import | 🟡 | source contains additional OCR-sensitive questions; controlled expansion remains |
| Curriculum mapping | 🟢 | canonical topic/plan links retained for imported current questions |
| Runtime/build/browser | 🟡 | separate target-environment gate remains |

Detailed report: `docs/IMPLEMENTATION-AUDIT-2026-10-07-CHEMISTRY-MASTER-CATALOG.md`.


## 2026-10-07 — Pass 26A: ответы/формулы химии

| Контур | Статус | Результат |
|---|---|---|
| Master catalog | 🟢 | 436 элементов |
| Open tasks | 🟢 | 260 сохранены |
| Test questions | 🟢 | 176 сохранены с ответами/вариантами |
| Prepared answers | 🟢 | 40 элементов |
| Structural-formula answers | 🟡 | 19 подготовлены из текста; визуальная проверка ещё нужна |
| Production scoring answers | 🟡 | `exam_questions.answer` намеренно не изменён |
| Remaining open-task answers | 🟡 | 220 требуют подготовки и проверки |
| RLS | 🟢 | включён для master catalog |


## 2026-10-07 — Pass 26B: две методички химии

| Контур | Статус | Результат |
|---|---|---|
| Методическое пособие №1 | 🟢 | Органическая и физическая химия; контрольные вопросы/задания |
| Методическое пособие №2 | 🟢 | Минаева/Пронкина; задачи, упражнения и тестовые задания по органической химии |
| Source registry | 🟢 | `chemistry_source_documents` содержит отдельные provenance-записи |
| Unified catalog | 🟢 | оба источника представлены в общем каталоге |
| Duplicate handling | 🟢 | одинаковый текст не удаляется без проверки происхождения |
| Source attribution | 🟡 | неустановленный источник не приписывается догадкой |


### Pass 27 — Химический банк на сайте (2026-10-07)
- 🟢 Добавлен API `GET /api/v1/tests/chemistry-master` с поиском, типом задания, фильтром сохранённых формул и пагинацией.
- 🟢 На странице «Тесты и билеты» выведен единый банк из 436 элементов.
- 🟢 В карточке сохраняются вопрос, ответ (если подготовлен), источник, номер источника и статус ответа.
- 🟢 Формульные задания визуально помечаются; неподготовленные ответы явно показываются как требующие решения.


## 2026-10-07 — Storage architecture clarification: Supabase Free + SpaceWeb media

Зафиксирована окончательная модель хранения проекта:

| Слой | Роль |
|---|---|
| Supabase Free | БД, Auth, RLS, metadata, связи, вопросы/тесты, учебный план, trainer cards |
| SpaceWeb | физическое тяжёлое media: фото, изображения препаратов, электронограммы, крупные документы |
| GitHub | код, миграции, документация, небольшие декларативные контентные артефакты |
| Vercel | frontend и deployment, не постоянное media-хранилище |

Для большого content.zip действует правило: **не требуется загружать весь архив в чат целиком**. Его можно анализировать и переносить частями; полнота архива не должна зависеть от лимита вложения чата.

По текущему content.zip:
- 444 фактических файлов;
- 389 изображений;
- 207 уникальных изображений после дедупликации;
- 206 trainer feed cards уже есть в Supabase;
- 28 EM представлены в данных;
- физические файлы должны быть подтверждены отдельно на SpaceWeb.

Важно: наличие записи в Supabase не считается доказательством наличия физического файла. Финальный media gate:
Supabase metadata → API → SpaceWeb → HTTP 200.

public.files/Supabase Storage не являются обязательным местом для всех histology images. Использование их для всего архива не требуется и не должно делаться автоматически из-за ограничения бесплатного Supabase.

Статус: 🟡 DB/content metadata в основном синхронизированы; SpaceWeb physical media verification остаётся отдельным target-environment этапом.


## 2026-10-07 — SpaceWeb media root подтверждён

По прямому скриншоту файловой системы SpaceWeb подтверждено физическое наличие Histology media root под /public_html/....

В корне видны:
- source-materials;
- electronograms;
- em;
- 5_Фотографии препаратов;
- дополнительный каталог с Unicode/URL-encoded именованием;
- README.md.

Поэтому физический архив не следует считать отсутствующим только потому, что его нет в GitHub или public.files Supabase.

| Проверка | Статус |
|---|---|
| SpaceWeb media root существует | 🟢 подтверждено |
| Ожидаемая структура каталогов | 🟢 подтверждена |
| Все файлы из исходного content.zip сопоставлены | 🟡 ещё требуется |
| Все 206 trainer cards → физические файлы | 🟡 ещё требуется |
| 28 EM → физические файлы | 🟡 ещё требуется |
| Materials → физические документы/фото | 🟡 ещё требуется |
| Production HTTP media smoke | 🟡 ещё требуется |

Каноническая схема:
Supabase Free → metadata/source_key/path → SpaceWeb physical file → API endpoint.


## 2026-10-07 — Question Library

🟢 Реализована полноценная база вопросов для всех авторизованных пользователей:
- все опубликованные типы вопросов;
- ответы доступны без запуска теста;
- предмет/тип/поиск;
- пагинация;
- жалоба на конкретный вопрос;
- существующий admin problem center и быстрый редактор используются для обработки жалоб.

🟢 `QuestionReport` уже существовал и теперь рассматривается как обязательная часть карточки каждого вопроса, а не только тестового прохождения.


## 2026-10-07 — subject-scoped Question Library

🟢 Из предметной страницы «База вопросов» открывается с фиксированным `subject_slug`. Гистология → только гистология; органическая/физическая химия → только химия. Для гистологии отдельно сохранён тренажёр микропрепаратов. Глобальный вход в базу без subject context допускает ручной выбор предмета.


## 2026-10-07 — Source-of-Truth Audit

🟢 Создан единый документ `docs/PROJECT-SOURCE-OF-TRUTH-AUDIT-2026-10-07.md`, который объединяет правила продукта, архитектуры и release-gates.

🟡 Остаточные зоны не закрыты формально до runtime/browser/physical-media проверки: Histology reconciliation, Materials files, schedule session integrity, единый schedule+homework UX, production auth/runtime, latest CI, strict TS/ESLint, timezone centralization и полный mobile/browser acceptance.


## 2026-10-07 — Zero-cost / full-functionality release gate

| Контур | Статус | Правило |
|---|---|---|
| GitHub Free | 🟢 | source/docs/migrations/CI в бесплатных лимитах |
| Vercel Hobby | 🟢 | frontend/deployment без обязательного Pro |
| SpaceWeb Free | 🟢 | PHP API/runtime и физический контент в бесплатном лимите |
| Supabase Free | 🟢 | DB/Auth/RLS/metadata без обязательного paid plan |
| Backblaze B2 Free | 🟢 | дополнительное object storage в бесплатной квоте |
| Full functionality | 🟡 | функция не должна урезаться ради free-tier; оптимизация обязательна |
| Unexpected billing protection | 🟡 | для каждого сервиса проверять лимиты и поведение после free quota |
| Optional AI | 🟢 | базовая функция не зависит от платного AI |

Главное правило: **не терять функциональность из-за бесплатных лимитов**. Сначала оптимизировать storage, egress, caching, batching, lazy loading, streaming, deduplication и распределение нагрузки.

Полная политика: docs/FREE-TIER-FULL-FUNCTIONALITY-POLICY-2026-10-07.md.


## 2026-10-07 — Admin Data & Storage Control Center

- 🟢 Database Console уже существует и усилен поиском/пагинацией.
- 🟡 Следующий этап: PC-style управление таблицами, relation inspector, bulk dry-run и health checks.
- 🟡 Затем: единый File & Storage Center для SpaceWeb/B2 и сверки с Supabase metadata.
- 🟡 Затем: агрегированный Operations Dashboard с квотами, проверками, экспортами и безопасным rollback.
- 🟢 Архитектурное правило: Supabase — canonical DB; SpaceWeb/B2 — physical object layers; дополнительные бесплатные сервисы — только специализированные дополнения.

Архитектура: `docs/ADMIN-DATA-CONSOLE-ARCHITECTURE.md`.

## 2026-10-07 — Consolidated Remaining Implementation Map

Все ранее обнаруженные незакрытые направления сведены в единый backlog. Статус 🟡 означает «частично реализовано / требуется target-environment verification или finishing», а не «сломано».

| Направление | Приоритет | Статус | Следующий gate |
|---|---:|---|---|
| Production Vercel/SpaceWeb/CI | P0 | 🟡 | READY + green CI + authenticated smoke |
| Auth / roles / RLS / security | P0 | 🟡 | login/refresh/roles/RLS runtime audit |
| Histology physical media | P0 | 🟡 | 444-file + 206-card + 28-EM reconciliation + HTTP 200 |
| Tests / Question Library | P0 | 🟡 | all published tests smoke + subject isolation |
| Schedule + Homework unified UX | P0 | 🟡 | date → subject → lesson → homework → submission/status |
| Materials viewer/files | P1 | 🟡 | DOCX/PDF/media end-to-end |
| Trainers / preparations | P1 | 🟡 | start/resume/finish/result/error-review |
| Admin Content Center | P1 | 🟡 | question/material/lesson/trainer editing + history |
| Admin DB/File/Storage Center | P1 | 🟡 | relations, bulk dry-run, reconciliation, B2/SpaceWeb |
| Mobile/browser acceptance | P1 | 🟡 | iPhone/Android/Windows/macOS matrix |
| Chemistry master completion | P1 | 🟡 | 220 answers + formula visual verification + OCR expansion |
| Smart grading E2E | P1 | 🟡 | deterministic + optional AI + pending/error retry |
| Code quality | P1 | 🟡 | strict TS/ESLint, timezone, legacy cleanup |
| AI tutor/providers | P2 | 🟡 | verified primary + fallback + context-aware tutor |
| Performance/free-tier optimization | P2 | 🟡 | measurements + cache/lazy/batch/dedup |
| Optional free-service aggregation | P2 | 🟡 | permanent-free service audit before integration |
| Release/documentation discipline | P1 | 🟢/🟡 | baseline + roadmap/status on every risky change |

### Required product flows to preserve
- Auth → dashboard → schedule → subject → tests → preparation → result/history.
- Subject → curriculum → question bank → answer/report → admin correction.
- Histology → atlas/trainer → materials/documents/images.
- Schedule → date → subject → homework → submission → derived status.
- Chemistry → curriculum → unified 436-item master bank → provenance/formulas.
- Admin → DB console → content/storage center → audit/rollback.

### Non-regression rule
Stable baseline 8e8fef5c2f661e7e1d625964909307c00c343884 remains the rollback reference. No backlog item may replace a canonical data source or remove working functionality for the sake of free-tier limits.

### Release order
1. P0 target-runtime and authenticated verification.
2. Physical media/material delivery.
3. Tests/question bank/smart grading smoke.
4. Unified schedule + homework flow.
5. Admin/content/storage workspace.
6. Mobile/browser acceptance.
7. Chemistry completion and trainers/preparation finishing.
8. Strict code-quality cleanup.
9. AI tutor and optional free-service aggregation.
10. Final UI polish and release snapshot.


## 2026-10-07 — P0 implementation pass

🟢 Кодовые исправления: curriculum-map exception handler и связь учебного плана с topic metadata восстановлены.

🟡 Production gate: Vercel build-rate-limit; GitHub Actions/runtime smoke пока без подтверждённого зелёного результата.

Следующий gate: CI → Vercel READY → SpaceWeb runtime → authenticated smoke → следующий P0 контент/расписание.


## 2026-10-07 — P0 verification/fix cycle continuation

- 🟢 Vercel commit `59e38d9664645556bd2fca64ea6d97f998a5f200` достиг READY; combined GitHub status для него — Vercel success.
- 🟢 HealthChecker hardened: public health no longer exposes DB host/port/user or raw connection diagnostics.
- 🟢 Histology Materials: authenticated SpaceWeb physical-file fallback added to generic Materials page; dedicated HistologyMaterials already uses authenticated file loading.
- 🟢 Schedule + Homework: source/UI audit confirms current schedule page already selects a concrete date + subject and creates homework with that subject/date/group context; planner returns homework, attendance and recovery in one response.
- 🟡 Latest post-READY commits currently cannot receive a new Vercel deployment because of external `build-rate-limit`; therefore those latest fixes remain source-verified until a READY deployment exists.
- 🟡 SpaceWeb physical-file HTTP verification and authenticated production smoke remain open gates.


## 2026-10-07 — verification cycle

- 🟢 Supabase: `public.chemistry_source_documents` теперь защищена RLS.
- 🟢 Supabase policy: только `authenticated SELECT`; записи остаются server-side.
- 🟢 Security advisor повторно проверен: критический `rls_disabled` для этой таблицы устранён.
- 🟡 Supabase Auth: остаётся отдельное предупреждение Leaked Password Protection; это следующий security hardening gate.
- 🟡 Subject isolation: обнаружены повторяющиеся `subjects.slug` (в том числе histology=2, chemistry_organic_physical=3); нельзя делать глобальную уникальность slug без миграции контекста. Следующий шаг — authoritative subject UUID/context в search/question-bank boundary.

## 2026-10-07 — media optimization requirement
- 🟡 Added Media Optimization Pipeline to roadmap.
- 🟡 Target architecture: original → optimized master → thumbnails/responsive derivatives → client.
- 🟡 WebP/AVIF for images; WebM/AV1/VP9 reserved for video/animation, not ordinary photos.
- 🟡 Server-side processing, checksum deduplication, EXIF stripping, responsive sizes, cache headers and storage/egress metrics are required.
- 🟡 Existing Atlas/content and Materials physical-file architecture must remain compatible.


## 2026-10-07 — Media quality/readability gate

🟡 Media Optimization остаётся IN PROGRESS. Дополнительно зафиксировано:

- content-aware classification вместо единого quality profile;
- несколько compression/quality candidates для значимых изображений;
- отдельная проверка мелкого текста, подписей, формул и учебных деталей;
- выбор самого лёгкого кандидата, прошедшего quality/readability threshold;
- автоматический переход на менее сжатый вариант при провале проверки;
- fallback на original, если ни один derivative не проходит quality gate;
- при неопределённости quality-check запрещено рисковать читаемостью;
- original не удаляется ради экономии размера, если нужен zoom/восстановление/архив;
- DONE только после проверки реальных фото препаратов, ЭМ, атласа, лекционных материалов и 1080p-видео на mobile/desktop.


## 2026-10-07 — Pass 28: subject isolation hardening

| Контур | Статус | Результат |
|---|---|---|
| exam_questions | 🟢 | subject_id authoritative filter added; slug remains fallback |
| Ticket generation | 🟢 | bank subject UUID preferred |
| Question Library catalog | 🟢 | preserves distinct subject UUIDs even with duplicate slugs |
| Global Search | 🟢 | supports authoritative subject_id boundary |
| Admin content package | 🟢 | ambiguous duplicate slug is rejected without explicit UUID |
| Live ticket-bank integrity | 🟢 | current banks have matching subject UUIDs with their question pools |
| Frontend subject propagation | 🟡 | slug-only legacy entry points still need migration to UUID context where available |
| Vercel/SpaceWeb runtime | 🟡 | latest commits remain source-verified until READY deployment/runtime smoke |


## 2026-10-07 — Pass 28A: Question Library UUID propagation

| Контур | Статус | Результат |
|---|---|---|
| Question Library frontend | 🟢 | передаёт subject_id, если UUID известен |
| Legacy slug-only context | 🟢 | безопасный auto-resolve только при единственном matching subject_id |
| Ambiguous subject slug | 🟢 | не угадывается; пользовательский выбор остаётся доступен |
| Full legacy entry-point migration | 🟡 | требуется отдельный cleanup по старым ссылкам |


## 2026-10-07 — Pass 29: Smart grading state machine

| Контур | Статус | Результат |
|---|---|---|
| Deterministic grading | 🟢 | exact/normalized path before AI |
| Optional AI fallback | 🟢 | AI does not define whether a test can be completed |
| Pending/error semantics | 🟢 | completion is allowed; unresolved answer remains stored |
| Normal test retry | 🟢 | dedicated regrade endpoint + score recalculation |
| Preparation retry | 🟢 | dedicated retry endpoint for one/all unresolved answers |
| Frontend authority | 🟢 | Test/Preparation UI reads server grading result |
| AI review after preparation | 🟢 | separate optional analytics, not a completion dependency |
| Real test E2E | 🟡 | requires target-runtime authenticated smoke |


## 2026-10-07 — Pass 30: file visibility security alignment

| Контур | Статус | Результат |
|---|---|---|
| FileRepository server authorization | 🟢 | group-null no longer means global access |
| Supabase files RLS | 🟢 | owner/public/active-member semantics aligned |
| B2 presign boundary | 🟢 | presign follows server access check |
| Security advisor | 🟢/🟡 | file-policy issue cleared; leaked-password warning remains |
| Runtime authorization smoke | 🟡 | owner/public/group/inactive/unrelated cases still require target environment |


## 2026-10-07 — Pass 31: Histology material viewer access

| Контур | Статус | Результат |
|---|---|---|
| Histology material viewer | 🟢 | MBH specialty check added before physical-file delivery |
| Generic Materials | 🟢 | specialty filtering already present |
| Direct viewer bypass | 🟢 | authenticated user without MBH can no longer use the Histology viewer endpoint |
| Physical media runtime | 🟡 | final SpaceWeb HTTP/browser smoke remains |


## 2026-10-08 — Histology Lecture 05 / practical cross-links

| Контур | Статус | Результат |
|---|---|---|
| Lecture 05 body | 🟢 | «Кровь и лимфа» опубликована в site_content |
| Curriculum link | 🟢 | module/topic UUID привязан к canonical теме Недели 5–6 |
| Preparation links | 🟢 | 8 существующих карточек «Кровь мазок» связаны как учебные cross-links |
| Electronograms | 🟢 | нейтрофильный фагоцитоз + капилляр записаны как релевантные ЭМ |
| Materials | 🟢 | «4.Кровь» + source-backed методический материал связаны |
| Test | 🟢 | «Гистология — общая: кровь», 20 вопросов |
| Exam questions | 🟢 | подтверждённые IDs записаны в lecture metadata |
| Production/browser smoke | 🟡 | требуется target-runtime проверка |
| Automatic related-content UI | ⬜ | следующий product step; пока есть явные ссылки внутри лекции |

Лекция теперь строит не только теоретический текст, а маршрут занятия: **теория → препарат → признак → ЭМ → тест → экзаменационный вопрос**.

Важно: существующие trainer-карточки не были переназначены на другой plan_topic только ради этой связи. Cross-link не меняет canonical учебную принадлежность контента.


## 2026-10-08 — Histology Lecture 05 / Mermaid rendering repair

| Контур | Статус | Результат |
|---|---|---|
| Mermaid source | 🟢 | 11 Mermaid-блоков в `body_md` проверены; лишнее экранирование обратных кавычек и кавычек удалено |
| LectureRenderer | 🟢 | добавлена нормализация импортированного Markdown перед разбором блоков |
| Live Supabase content | 🟢 | `escaped_backticks=0`, `escaped_quotes=0`, `mermaid_blocks=11` |
| Production/browser smoke | 🟡 | требуется после публикации нового frontend commit |


### 2026-10-08 — Lecture 05: links + visual references
- 🟢 Fixed Markdown link rendering in `LectureRenderer`: internal lecture links such as «Микропрепараты» and the 20-question test now become actual clickable anchors.
- 🟢 Added 9 visual blocks to Lecture 05: 5 existing MEDBIOHIM blood-smear preparation images + 4 independent University of Utah WebPath images.
- 🟢 External images are used only as a visual cross-check; canonical MEDBIOHIM trainer cards remain the primary practical material.
- 🟢 Live Supabase lecture updated and verified; only Lecture 05 was touched.
- 🟡 Runtime/browser smoke on deployed Vercel build remains to be confirmed.
\n## 2026-10-08 — Histology Lecture 05: production link/media repair\n\n🟢 По iPhone/Safari smoke со скриншотами подтверждены две реальные причины регрессии:\n- ссылки Markdown в production всё ещё показывались текстом, потому что предыдущая версия regex в LectureRenderer была некорректно экранирована;\n- 5 собственных фото лекции обращались напрямую к /content/histology на Vercel, хотя физические файлы Histology находятся на SpaceWeb и должны проходить через authenticated trainer-media pipeline.\n\n🟢 Исправлено:\n- LectureRenderer получил корректный Markdown-link parser для внутренних и внешних URL;\n- изображения собственных препаратов Lecture 05 переведены на canonical trainer IDs;\n- ImageBlock теперь получает authenticated trainer image через существующий getTrainerImageUrl(), поэтому Authorization не теряется на обычном <img>;\n- live Supabase Lecture 05 обновлена: старых прямых /content/histology/... URL в этих пяти блоках больше нет;\n- создана воспроизводимая миграция database/migrations/20261008_histology_lecture_05_trainer_images_fix.sql;\n- 4 внешних WebPath-фотографии остаются прямыми HTTPS-источниками и продолжают работать без авторизации.\n\n🟡 Не ставить production DONE до нового Vercel READY + повторного iPhone/Safari smoke: ссылки, 5 MEDBIOHIM-фото, 4 WebPath-фото, Mermaid и тестовый переход должны быть проверены именно в deployed build.
 
## 2026-10-08 — Histology Lecture 05: learning UX / photo-text / mini-tests / Atlas viewer

**Статус: 🟡 IN PROGRESS**

| Область | Статус | Факт |
|---|---|---|
| Lecture 05 source | 🟢 | `site_content(key=lectures)`, id `lec-histology-blood-20261008` |
| Curriculum | 🟢 | module/topic canonical UUID сохранены |
| Markdown renderer | 🟢 | headings, bold, tables, blockquotes, links восстановлены |
| Mermaid | 🟢 | 11 блоков Lecture 05 |
| Canonical trainer photos | 🟢 | 5 lecture photo blocks используют trainer IDs |
| Photo ↔ text | 🟢 | название/метаданные берутся из trainer card |
| Visual checkpoints | 🟢 | изображения распределены по смысловым местам, старый photo wall удалён |
| Mini-tests | 🟢 | 6 блоков после логичных разделов, вопросы из `public.questions` |
| Mini-test grading | 🟢 code/live API | server-side check, answer key не передаётся клиенту |
| Atlas viewer | 🟢 code | centered viewport modal + zoom + close + fullscreen fallback |
| WebPath | 🟢 | 2 external cross-check images |
| Vercel production | 🟡 | нужен READY/build smoke после последних commits |
| SpaceWeb | 🟡 | новые mini-quiz endpoints нужно развернуть |
| iPhone Safari | 🟡 | нужен реальный authenticated smoke |
| Cross-page regression | 🟡 | проверить лекции/атлас/тренажёр/материалы |

### Full ledger
- Lecture 05 curriculum/content sync;
- 8 trainer cross-links;
- 2 EM links;
- 20-question blood test link;
- 9 exam-question links;
- 5 protected trainer image repairs;
- Markdown link repair;
- Mermaid normalization;
- Markdown renderer regression repair;
- canonical trainer-image flow;
- viewport-centered image lightbox;
- Atlas zoom/fullscreen behavior;
- 6 database-backed mini-tests;
- photo-text deduplication;
- contextual visual checkpoints;
- removal of old duplicate photo wall;
- documentation in ROADMAP / SYNC_STAMP / dedicated learning UX document.

### Release gate
До 🟢 DONE проверить deployed/authenticated runtime:
1. Lecture 05 opens;
2. Markdown/table/link rendering;
3. 6 mini-tests load and grade;
4. 5 MEDBIOHIM photos load;
5. photo card text matches canonical trainer card;
6. image viewer is centered on viewport;
7. zoom/close/fullscreen work on iPhone Safari;
8. WebPath images work;
9. 11 Mermaid blocks work;
10. full 20-question blood test still opens.

 
### 2026-10-08 — новое дополнение Lecture 05: возрастные нормы

| Пункт | Статус |
|---|---|
| Возрастная временная шкала | 🟢 |
| Таблица лейкоцитарной формулы по возрастам | 🟢 |
| Гемограмма новорождённого / грудного / взрослого | 🟢 |
| Экспресс-алгоритм возрастной карточки | 🟢 |
| Мини-тест из существующей БД гистологии | 🟢 |
| Различия референсов сохранены как варианты | 🟢 |
| Runtime Safari / production smoke | 🟡 |

Lecture 05 теперь содержит **8 database-backed mini-test blocks** после логичных учебных разделов.


## 2026-10-08 — Image viewer controls

- 🟢 В src/components/media/ImageLightbox.tsx добавлены явные пользовательские кнопки: «Открыть на весь экран», «Уменьшить», «Увеличить», «Сбросить», «Полный экран», «Закрыть».
- 🟢 Кнопка открытия вынесена непосредственно на карточку изображения, чтобы действие было очевидно на мобильном устройстве.
- 🟢 Нативный Fullscreen API используется как дополнительный режим; fixed viewport-lightbox остаётся fallback для Safari.
- 🟡 Не считать production/runtime DONE до Vercel READY и реального iPhone Safari smoke.
- Commit: 7735ff1ccdc21b509ca6e61bb8267d81a3a1a4bf.


## 2026-10-08 — Unified Media Viewer audit / correction

| Контур | Статус | Фактическое состояние |
|---|---|---|
| Atlas outer modal | 🟢 FIXED IN BRANCH | удалён вложенный 90vh + overflow-auto слой |
| Unified viewer | 🟢 CODE | 100dvh, safe-area, controls, zoom/pan, desktop wheel/double-click, touch Pointer Events |
| Native fullscreen | 🟡 ENHANCEMENT | используется только если браузер разрешает; viewer без него остаётся полноценным |
| Lecture viewer | 🟡 | использует общий ImageLightbox, нужен regression smoke |
| Trainer viewer | 🟡 | общий компонент используется, нужен regression smoke |
| Materials viewer | 🟡 | отдельный document/photo modal ещё требует отдельного UX-аудита |
| Windows desktop | 🟡 | обязательный реальный browser smoke |
| iPhone Safari | 🟡 | обязательный реальный authenticated smoke |
| Android Chrome | 🟡 | обязательный touch/pinch smoke |
| Cross-page regression | 🟡 | lecture → atlas → trainer → materials |

Правило: наличие кода не переводит эти пункты в DONE; нужен target-runtime/browser evidence.


### 2026-10-08 — viewer regression cleanup
- 🟢 literal escaped-newline source artifact устранён из `HistologyTrainerParts.tsx`;
- 🟢 legacy photo-rendering ветка Materials удалена после перехода на unified viewer;
- 🟢 image-file preview в Materials использует unified viewer;
- 🟢 retry для недоступного trainer photo добавлен;
- 🟢 blob URL lifecycle для Materials document/PDF/image preview приведён к управляемому состоянию;
- 🟡 CI/Vercel остаются инфраструктурными release blockers: GitHub jobs создаются, но завершаются без steps/logs; Vercel отвечает `build-rate-limit`.
