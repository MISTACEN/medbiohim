# SpaceWeb → Cloudflare Worker: аудит паритета

**Дата:** 2026-10-22  
**Статус:** аудит выполнен по исходникам; production-проверка и деплой не выполнялись.

## 1. Что сравнивалось

- Старый PHP-бэкенд: ветка `origin/spaceweb-backend`, `backend/config/routes/*.php` (37 файлов, 198 уникальных пар `method + path`).
- Текущий канонический Worker: `workers/api/src/index.ts`, `workers/api/src/routes/*.ts` (42 файла), включая вложенные маршруты `admin.ts` → `admin-parity.ts` и `admin-database.ts`.
- Фронтенд-контракты: `src/lib/api.ts`, `src/lib/features-api.ts`, `src/lib/content-api.ts`, страницы `cards`, `practice`, `admin/tools`, `admin/content-import`, `materials/source`.

Автоматическая сверка путей даёт много ложных срабатываний из-за вложенных Hono-роутов и legacy-алиасов, поэтому ниже перечислены только проверенные вручную расхождения.

## 2. Критично: фронтенд уже вызывает отсутствующие маршруты

Это не «на будущее», а реальные разрывы текущего контракта. Их стоит исправлять первыми.

| Приоритет | Старый контракт | Что использует фронтенд | Текущий Worker | Риск |
|---|---|---|---|---|
| P0 | `GET /api/v1/srs/summary` | `src/lib/features-api.ts` → `srsSummary()` | Есть только `GET /api/v1/srs` | Страница `/cards` не получает сводку |
| P0 | `POST /api/v1/srs/ensure` | `srsEnsure()` | Нет | Нельзя сгенерировать карточки из вопросов |
| P0 | `GET /api/v1/srs/cards` | `srsListCards()` | Нет (есть только `/srs` и `/srs/due`) | Список личных/общих карточек не работает |
| P0 | `POST /api/v1/srs/cards` | `srsAddCard()` | Нет | Нельзя добавить личную карточку |
| P0 | `POST /api/v1/srs/review` | `srsReview()` | Есть только `POST /api/v1/srs/:id/review` | Повторение карточки уходит в 404 |
| P0 | `DELETE /api/v1/srs/cards/:id` | `srsDeleteCard()` | Нет | Нельзя удалить карточку |
| P0 | `GET /api/v1/notes` + `POST /api/v1/notes` | `src/lib/api.ts` → `listNotes()`, `upsertNote()`; страница `/practice` | Нет | Заметки к вопросам не загружаются и не сохраняются |
| P0 | `GET /api/v1/admin/presence` | `adminPresence()`; `/admin/tools` | Есть только `POST /api/v1/presence/heartbeat` | Админ-панель получает 404 |
| P0 | `POST /api/v1/admin/import/curriculum` | `adminImportCurriculumXlsx()`; `/admin/content-import` | Нет | Импорт XLSX учебного плана не работает |
| P1 | `GET /api/v1/content-sources/:id` | `src/lib/content-api.ts`; `/materials/source` | Нет | Страница источника материала получает 404 |
| P1 | `GET /api/v1/admin/lectures/:id` | legacy-контракт админки | Нет (есть список, PATCH, publish/reject/delete) | Старые клиенты не могут открыть одну лекцию |
| P1 | `GET /api/v1/site` | публичные настройки сайта и объявления | Нет; есть только `PUT /api/v1/admin/site` | Старый публичный контракт неполный |

### Почему SRS и заметки особенно важны

`src/lib/features-api.ts` и `src/app/cards/page.tsx` уже написаны под полный старый SRS-контракт. Текущий `workers/api/src/routes/srs.ts` реализует только три операции и не возвращает `summary`, `ensure`, `cards` и `review` в ожидаемом формате. Это функциональная регрессия, а не просто отсутствующий admin endpoint.

Аналогично `/practice` вызывает `listNotes()` и `upsertNote()`; без Worker-маршрута `/notes` заметки к вопросам не работают.

## 3. Средний приоритет: старые функции без текущего фронтенд-контракта

| Старый контракт | Текущий Worker | Комментарий |
|---|---|---|
| `POST /api/v1/groups/:id/members` | Нет | Управление участниками группы; нужен только если UI снова включит добавление в группу |
| `POST /api/v1/admin/users/:id/course` | Нет | Смена курса пользователя; в текущем UI не найдена |
| `PUT /api/v1/admin/subject-plans` | Нет | Редактирование subject plan; UI редактора нет |
| `GET /api/v1/calculators/:id` | Нет (есть список и `/:id/compute`) | Детальная карточка калькулятора старого контракта |
| `GET /api/v1/histology/source/:id` | Нет (есть `source-materials` и `source-file`) | Старый прямой отдающий маршрут; текущий API использует другие имена |
| `GET /api/v1/admin/content/question-integrity` | Нет | Диагностика целостности вопросов; полезна для админки |
| `POST /api/v1/telegram/webhook` | Нет в каноническом Worker | У Telegram есть отдельный worker; нельзя включать второй webhook без решения по архитектуре |
| `GET /api/v1/admin/db/meta`, `/admin/db/tables`, `/admin/db/:id`, `POST/PATCH/DELETE` | Частично: есть `/admin/db/audit` и `/admin/db/audit/:id/rollback`; полноценный DB API — `/admin/database/*` | Legacy-алиасы намеренно не восстанавливать без отдельного security review |
| `GET /api/v1/admin/database/:id/rows/:id`, `POST/PATCH` | Текущий `/admin/database/:id/rows/:table` работает по имени таблицы, а не по ID строки | Нужна отдельная сверка semantics перед alias-маршрутами |

## 4. Намеренно не восстанавливать как есть

| Старый контракт | Решение | Причина |
|---|---|---|
| `POST /api/v1/admin/claim-admin` | Не восстанавливать | Bootstrap-секрет и повышение до admin через публичный endpoint — высокий риск. Первый admin должен назначаться контролируемо через Supabase/ops |
| `GET /api/v1/admin/db/*` (сырые таблицы) | Не восстанавливать автоматически | Прямой DB-доступ должен идти через `/admin/database/*` с явной проверкой прав и аудитом |
| `POST /api/v1/telegram/webhook` в основном Worker | Не добавлять без архитектурного решения | Уже есть отдельный Telegram worker; два webhook-получателя создают неопределённость и риск пропуска событий |
| `GET /api/v1/site` как «всё в одном» | Сначала уточнить контракт | Нужно разделить публичные `site`/`announcements` и admin-запись, иначе легко случайно раскрыть CMS-данные |

## 5. Что уже перенесено и не требует действий

По исходникам текущего Worker подтверждены, в частности:

- auth/me, dashboard, subjects, groups, schedule, lesson-plan, curriculum;
- homework/submissions, planner, academic, attendance;
- lectures, materials, tests/preparation, tickets, questions, favorites, search;
- trainings, trainers, progress, sessions, settings, community, calculators;
- AI, chemistry, storage, files;
- admin: overview, questions, lectures (кроме GET одной), users/roles, Telegram admin, content import/package, files, schedule, announcements;
- admin parity: community, homeworks, materials, problem-center, question-reports, site write, content archive/move, db audit;
- admin database: connections, tables, schema, rows, SQL;
- histology: source-materials, source-file;
- public health/meta.

## 6. Рекомендуемый порядок восстановления

1. **SRS compatibility layer** — привести `srs.ts` к контракту `summary/ensure/cards/review/delete`, сохранив текущие `/due` и `/:id/review` как алиасы.
2. **Notes** — `GET/POST /notes` с `user_id` из JWT и RLS-проверкой.
3. **Admin presence** — `GET /admin/presence?within=...` на базе Redis/heartbeat, с ролями admin/moderator/teacher.
4. **Curriculum XLSX import** — либо Worker-маршрут, либо явно отключить кнопку в админке с понятным сообщением. Сейчас UI обещает функцию, которой нет.
5. **Content source detail** — `GET /content-sources/:id` с проверкой specialty/MBH, как в старом PHP.
6. **Legacy admin aliases** — только после тестов и security review; не восстанавливать raw DB и claim-admin.
7. **Telegram webhook** — решить отдельно: один получатель, fail-closed secret, идемпотентность.

## 7. Статус после восстановления контрактов (2026-10-22)

Проверено по исходникам и локальному `wrangler dev`:

- **SRS восстановлен полностью** — `srs.ts` снова отдаёт `summary`, `ensure`, `cards` (GET/POST), `review`, `DELETE /cards/:id`; старые `/srs`, `/srs/due`, `/srs/:id/review` оставлены алиасами. Review больше не пишет в несуществующую таблицу `srs_reviews`, а обновляет карточку, как старый PHP.
- **Заметки добавлены** — `workers/api/src/routes/notes.ts`, `GET/POST /notes` с owner-scoping по JWT и существующей RLS-политикой `notes_own`.
- **Админ-presence добавлен** — `GET /admin/presence?within=` с проверкой ролей admin/moderator/teacher, читает heartbeat-ключи из Redis.
- Пункты из списка «не хватает критических endpoints» **уже существуют в репозитории**: admin questions CRUD (`GET/POST/PUT/DELETE /admin/questions`), версионирование (`PUT /admin/question-bank/:id`), `POST /admin/content/package/import`, `POST /admin/content/import`, `POST /admin/schedule/import`, а также `academic` (sync/state/ai-plan), `planner`, `materials/:id/file-url` и `materials/:id/file`. Старые файлы `domain.php`/`domain_rest.php` — это CRUD групп и предметов, а не управление доменами; отдельной функции «custom domain» в старом бэкенде нет.
- **Production Worker отстаёт от репозитория:** `POST /admin/content/package/import` на `medbiohim-api` отвечает `501 ROUTE_NOT_MIGRATED`, хотя маршрут есть в коде. То есть часть «пропавших» endpoints — это незадеплоенная версия, а не отсутствующий код.

Остаётся открытым: `POST /admin/import/curriculum` (XLSX-парсинг в Worker не реализован), `GET /content-sources/:id`, публичный `GET /site`.

Локальная проверка: Worker-маршруты отвечают `401` без токена (а не `404/501`); 4 новых контрактных теста проходят. Полный набор тестов Worker содержит 2 падающих теста про страницы предметов — они существовали до этих изменений и связаны с переработкой тестового хаба.

## 8. Проверка

- Аудит основан на статическом сравнении исходников, а не на production-трафике.
- `npm run typecheck` и `npm run build` для фронтенда проходят (с существующими warning’ами ESLint в старых файлах).
- Новые Worker-маршруты в этом изменении не добавлялись: сначала зафиксирован аудит и приоритеты.
- Перед восстановлением любого маршрута нужны контрактные тесты, проверка RLS и smoke на реальном JWT без логирования токена.
