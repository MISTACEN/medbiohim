# Передача состояния: MEDBIOHIM × PdfMentor (2026-11-21)

Снимок рабочей копии, а не гарантия production. Датированные документы и этот
файл описывают состояние на дату: перед работой сверяйся с `main` и `git status`.

**Статус на 2026-11-22 (см. §8):** пакет закоммичен и задеплоен
(`f05f43ac → e0f7f656`), миграции применены, секрет-килл-свич задан,
ролевая приёмка в браузере пройдена (админ/студент/преподаватель), найдено
и закрыто 4 прод-бага. Остались: PdfMentor-side приёмка в живом dev-контуре
и решение по 152-ФЗ (чек-лист включения в §8).

- Base commit: `f05f43ac` (`feat: Bridge API для PdfMentor — SSO-токен, регистрация маршрута`)
- Ветка: `main`, ничего не закоммичено и не запушено
- Незакоммичено: **65 путей** — 26 изменённых, 39 новых (миграции, API, UI, тесты, общие модули, документы, включая этот файл)

---

## 1. Снимок проверок

| Проверка | Команда | Результат |
| --- | --- | --- |
| Типы | `npm run typecheck` (`npx tsc --noEmit`) | 0 ошибок |
| Frontend unit | `npm run test:unit` (vitest) | 754/754 (73 файла) |
| Контрактные тесты | `npm test` (`node --test "test/**/*.test.mjs"`) | 371/371 |
| Worker | `cd workers/api && npm run check` | 568/568 |
| Lint | `npm run lint` | 0 ошибок, 41 предупреждение (существовавшие) |
| Сборка | `npm run build` | успешно, маршрут `/admin/preparation-guides` в выводе |
| Pre-deploy | `node scripts/predeploy-audit.mjs` | FAIL 0, WARN 1 — локально нет PHP CLI (legacy-проверка уходит в CI) |
| Аудит контента | `node scripts/audit-duplicates.mjs` | 28 замечаний — baseline до наших изменений (сырой LaTeX, общий набор `chem` на двух предметах); не связано со слиянием |

Полный гейт в безопасном порядке (`tsc` → `npm test` → `test:unit` → worker → `lint` →
`build` → `predeploy-audit`) прогнан 2026-11-21 после всех правок: всё зелёное.

**Готовность к коммиту (2026-11-21, base `f05f43ac`, 65 путей):** tsc 0; `npm test`
371/371; `test:unit` 754/754 (73 файла); worker 568/568; lint 0 ошибок / 41
предупреждение; `npm run build` успешен; `predeploy-audit` FAIL 0 / WARN 1 (нет PHP
CLI локально); `wrangler deploy --dry-run` собирает бандл 6590 KiB с общими модулями
`src/shared` — без деплоя. Это те же шаги, что выполняет CI перед деплоем.

**Не проверено вживую:** браузер (атлас, диагностикум, `/mentor`, `/admin/preparation-guides`),
реальный SSO-обмен с PdfMentor, открытие документа через читалку, офлайн-очередь на
устройстве, поведение на production. Всё перечисленное — задача приёмки (M5), а не
доказанное свойство.

---

## 2. Что сделано по пакетам

### P0-A / P0-B — SSO Bridge (готово)

- `workers/api/src/routes/mentor/{index,model,store}.ts` — `GET /api/v1/mentor/config`,
  `POST /sso`, `POST /sso/exchange`, `POST /context`; одноразовый код в Redis (`getdel`),
  HMAC `"<ts>.document:<file_id>:<user_id>"`, адрес PdfMentor только из `PDFMENTOR_URL`.
- `src/app/mentor/page.tsx`, `src/lib/mentor-sso.ts` — единая форма `form_post`, общая для
  `/mentor` и страницы материала.
- Тесты: `workers/api/test/mentor-bridge.test.js`.
- Без `BRIDGE_SECRET`/`PDFMENTOR_URL` маршруты отвечают 503, остальной API жив;
  `MENTOR_ENABLED=0` — аварийный выключатель встроенного режима.

### P0-C — Document Bridge, половина MEDBIOHIM (готово)

- `POST /api/v1/mentor/documents/access` — проверка прав на файл и выдача разрешения.
- `GET /api/v1/mentor/documents/:id/content` — поток байтов телом ответа, без редиректа
  на подписанный URL; права перепроверяются на каждом чтении, поэтому отзыв доступа
  действует сразу.
- Аудит — `bridge_document_reads`; ошибка записи аудита логируется и не ломает чтение.
- Метаданные файла берутся из реальных колонок: `original_name` (не `name`),
  `sha256` (не `checksum`); `version` отдаётся `null` — MEDBIOHIM не версионирует
  оригинал, номер версии заводит PdfMentor. До правки select обращался к
  несуществующим колонкам — чтение упало бы с 503 только в проде.
- Тесты: `workers/api/test/mentor-documents.test.js`.

### P0-D — Встроенный режим (готово)

- `src/app/mentor/lecture/[materialId]/page.tsx` — карточка материала, SSO в PdfMentor,
  открытие в существующей читалке `/reader?material=…`; второго просмотрщика нет.
- `getMaterial` + `endpoints.content.material(id)`; `markMaterialOpened` сохраняет прогресс.
- Входы в интерфейсе (иначе страницы были недостижимы): пункт «PdfMentor» в сайдбаре
  (`Sidebar.tsx`) и ссылка «PdfMentor: методичка и вход в среду» из PDF-материала
  (`MaterialBody.tsx`); основной путь остаётся через `/reader?material=…`.
- Parity-чеклист замены старого просмотрщика — в `MEDBIOHIM_PDFMENTOR_MIGRATION_PLAN.md` §3.
- Тест: `workers/api/test/mentor-lecture.test.js`.

### P1-E — Методические карточки (готово)

- Миграция `database/migrations/20261120_preparation_guides.sql`: `preparation_guides`,
  `preparation_structures`, RLS, `grant select` для `authenticated` (запись — только
  service-role через админский редактор).
- API: `GET /api/v1/preparations/guides`, `GET /preparations/guides/:key`,
  `GET /preparations/structures`; без миграции отдают `migrated:false` и пустой список.
- UI: `PreparationGuidePanel`, фильтры атласа (`HistologyAtlas.tsx`, `histologyAtlas.ts`).
- Источник данных: `src/data/histology-preparations.json` → SQL через
  `scripts/preparation-guides-sql.mjs` (JSON — не runtime-источник).
- Тесты: `workers/api/test/preparations-guides.test.js`, блок в `histologyAtlas.test.ts`.

### P1-F — Диагностикум (готово)

- Миграция `database/migrations/20261120_diagnosticum.sql`: `diagnosticum_attempts`, RLS по
  `user_id`, колоночные гранты — ключ ответов не читается клиентом.
- API: `GET /diagnosticum`, `POST /start`, `POST /hint`, `POST /answer`, `GET /stats`,
  `GET /mistakes`.
- UI: режим «Диагностикум» внутри тренажёра
  (`/trainers/feed/histology?section=diagnosticum`), `DiagnosticumRunner`,
  `DiagnosticumStats`; `src/app/trainers/diagnosticum/page.tsx` — редирект на
  этот режим (отдельной страницы и отдельной карточки на `/trainers` больше нет).
- Тесты: `workers/api/test/diagnosticum.test.js`, `src/lib/__tests__/diagnosticum-model.test.ts`.

### P1-G — Пятый режим `schema` (готово)

- Режим внутри того же движка (`model.ts`, `MODE_LABELS.schema`), а не отдельный экзаменатор;
  `check (mode in (…,'schema'))` в миграции.
- Тесты обновлены в модели и worker.

### P2-H-lite / P2-I — Повторение ошибок и офлайн (готово)

- `GET /diagnosticum/mistakes` — уникальные `card_id` (до 20) для `/trainers/feed/histology?cards=…`.
- `src/lib/offline/{queue,db,index}.ts` — outbox в IndexedDB, `submitOrQueue`, `flushOutbox`;
  `OfflineIndicator` в `layout.tsx`.
- Идемпотентность: `workers/api/src/lib/idempotency.ts` (Redis, TTL 7 дней),
  `origin` принимается только `"user"`; повтор с тем же `client_id` → `replayed: true`.
- Тесты: `src/lib/__tests__/offline-queue.test.ts`, `workers/api/test/offline-answers.test.js`.

### Админ-редактор методичек (готово)

- `workers/api/src/routes/admin/preparation-guides.ts` — `GET /admin/preparation-guides`
  (`admin`, `moderator`), `PUT /admin/preparation-guides/:key` (только `admin`), upsert по
  `key` через service-role, валидация ключа/названия/списков; без миграции —
  `503 NOT_MIGRATED`. Валидация приведена к ограничениям таблицы: сложность **1–3**
  (`check (difficulty between 1 and 3)`), пустые текстовые поля — `""`, а не `null`
  (`not null default ''`). До этой правки сохранение «4» или пустого органа падало
  на constraint, а не на понятной ошибке.
- UI: `/admin/preparation-guides`, `src/components/admin/PreparationGuideEditor.tsx`,
  пункт в `AdminNav`.
- Тест: `workers/api/test/admin-preparation-guides.test.js`.

### Починка устаревшей проверки (попутно)

`src/components/portals/__tests__/ArchiveLecturesMerge.test.tsx` был красным на `main` и
блокировал CI-шаг `Unit tests (vitest, jsdom)`. Причина не в коде слияния: тест был зашит
на «8 + 14 = 22» конспекта, а в `lectures-chem.json` сейчас 6 конспектов (в organic — 14).
Проверка переписана на ожидания из самих JSON: точное число кнопок = число уникальных
нормализованных названий, каждый конспект присутствует, дублей нет, один поиск и один
заголовок ленты. Заголовки внутри текста конспекта больше не считаются заголовками ленты.

### Слияние дублей (2026-11-21)

Одна и та же логика жила двумя копиями в разных контурах и уже разошлась.
Объединено без потери функциональности:

- `src/shared/histology/preparation-match.ts` — нормализация ключа и правило
  «гид ↔ карточка» для атласа (`src/lib/histologyAtlas.ts`) и диагностикума
  (`workers/api/src/routes/diagnosticum/model.ts`). Расхождение копий было реальным:
  Worker искал вхождение названия в обе стороны, браузер — только в одну, а карточка
  с пустым названием в Worker совпадала с любым гидом (исправлено). `preparationKey`
  реэкспортируется из `histologyAtlas`, публичный API не менялся.
- `src/shared/lectures/lecture-title.ts` — `normalizeLectureTitle` для
  `ArchiveLectures` (слияние лент портала) и `workers/api/src/lib/lecture-quality.ts`
  (проверка дублей перед публикацией). Взято объединение правил: срезаются и «Тема N»,
  и «Неделя N», и «Конспект»; тест `ArchiveLecturesMerge` больше не держит третью копию.
- Worker импортирует общие модули из `src/shared` (в `lecture-quality.ts` — с
  расширением `.ts`, потому что модуль грузит node-тест). Проверено `wrangler deploy
  --dry-run`: бандл собирается (6590 KiB), импорт резолвится, деплой не выполнялся.

Проверка на данных (чтобы слияние не склеило разные лекции): 144 заголовка порталов
(59 файлов) и 49 CMS-лекций (chemistry 6, histology 19, physiology 24) — до и после
объединённой нормализации **0 новых совпадений**; `audit-duplicates.mjs` даёт те же
28 замечаний, что и до слияния.

Не объединено осознанно — разные правила, слияние изменило бы поведение
(сверено с кодом 2026-11-21, повторный аудит в новой сессии):

- `slugify` в трёх местах: `workers/api/src/routes/subjects.ts` (транслит
  кириллицы, гарантирует непустой ключ), `src/components/tests-hub/model.ts`
  (только латиница), `src/components/teacher/ImportTest.tsx`
  (`slugifySubject`, сохраняет юникод) — три политики ключей.
- `daysBetween`: `study-hub-model.ts` (split без guard) и
  `src/lib/study/agenda.ts` (Date.parse + guard на невалидные даты) —
  разное поведение на краях.
- Нормализация даты сегодня: `study-hub-model.ts` (локальная дата) и
  `src/lib/study/agenda.ts` (UTC) — разные часовые политики.
- Клиентские однострочники (`writeJson`, `clamp`, форматтеры дат ×6) —
  тривиальные, оставлены как есть.

Архитектурная фиксация: в `MODULE-ARCHITECTURE.md` добавлены разделы 12.10–12.13
(методички, диагностикум, офлайн/идемпотентность, `src/shared`), в
`AGENT-OWNERSHIP.md` — пункт 12: `src/shared/**` с одним writer и требованием
прогонять оба контура при изменении общего правила.

### Изменённые общие файлы (26)

`AGENTS.md`, `AGENT-OWNERSHIP.md`, `API-CONTRACTS.md`, `docs/architecture/MODULE-ARCHITECTURE.md`,
`src/app/layout.tsx`, `src/app/trainers/page.tsx`, `src/components/admin/AdminNav.tsx`,
`src/components/trainers/HistologyAtlas.tsx`, `src/components/trainers/useTrainerFeedPage.ts`,
`src/lib/__tests__/histologyAtlas.test.ts`, `src/lib/api/admin.ts`, `src/lib/api/content.ts`,
`src/lib/content-api.ts`, `src/lib/endpoints.ts`, `src/lib/histologyAtlas.ts`,
`workers/api/src/env.ts`, `workers/api/src/index.ts`, `workers/api/src/routes/admin/index.ts`,
`workers/api/src/routes/mentor.ts`, `workers/api/src/routes/trainers/02-answer.ts`,
`workers/api/test/helpers/admin-routes.js`,
`src/components/portals/__tests__/ArchiveLecturesMerge.test.tsx`,
`src/components/portals/ArchiveLectures.tsx`, `workers/api/src/lib/lecture-quality.ts`,
`src/components/layout/Sidebar.tsx`, `src/components/materials/MaterialBody.tsx`.

Новые пути перечислены в разделе 7 (этап M3) — они же входят в коммит интегратора.

---

## 3. Что осталось в MEDBIOHIM

0. **Страж перед применением**: `node --test test/migration-idempotency.test.mjs` —
   проверяет, что в миграциях есть `if not exists`, `drop policy if exists` и RLS
   на каждой новой таблице (3 теста, без базы).
1. **Применить 3 миграции** (аддитивные, ничего не удаляют):
   `20261120_preparation_guides.sql`, `20261120_diagnosticum.sql`,
   `20261120_bridge_document_reads.sql`. SQL-файл не доказывает применение — проверять
   запросом к таблицам.
2. **Сид методичек не отдельный шаг**: `20261120_preparation_guides.sql` уже содержит
   18 карточек и словарь структур с `on conflict … do update`, то есть повторное
   применение безопасно. Генератор `scripts/preparation-guides-sql.mjs` воспроизводит
   файл из `src/data/histology-preparations.json` байт-в-байт; после правки JSON файл
   нужно перегенерировать, а точечные правки допустимы через `/admin/preparation-guides`.
3. **Секреты Worker**: `BRIDGE_SECRET`, `PDFMENTOR_URL`; `MENTOR_ENABLED` не задавать
   (включён) либо `1`. Значения — только в Cloudflare, не в репозитории и не в чате.
4. **Коммит интегратора** — 54 пути, один осмысленный коммит или серия по пакетам.
5. **Живая приёмка** (M5): атлас с методичками, диагностикум (5 режимов), `/mentor`,
   `/mentor/lecture/:id`, читалка, офлайн-ответ и повтор после восстановления сети.
6. **Сопоставление гидов с `trainer_feed_cards.id`** локально не проверяется: карточки
   живут в Supabase, а в репозитории нет их снимка. Нужен read-only запрос к
   production/staging после M1; до этого работает нормализация названий.
7. **Намеренно не сделано**: второй просмотрщик документов, вторая система выделений,
   второй каталог микропрепаратов — это территория PdfMentor и существующих
   `trainer_feed_cards` / `trainer_atlas_cards`.

---

## 4. Что осталось в PdfMentor (вне этого репозитория)

1. `external_sources` — приём внешних документов MEDBIOHIM.
2. Приём содержимого документа и его версий.
3. Открытие внешнего документа внутри PdfMentor (сейчас страница материала честно
   говорит, что передача не включена).
4. Маршруты `register` / `version` / `result` / `sync` по
   `docs/architecture/MEDBIOHIM_PDFMENTOR_API_CONTRACT.md`.
5. Выделения и заметки — только на стороне PdfMentor.
6. Решение по 152-ФЗ до передачи содержимого документов вне dev (сейчас запрещено).

---

## 5. Деплой сейчас: возможен, но при условиях

Технически деплой возможен, однако **не из рабочей копии и не раньше миграций**:
воркфлоу запускаются только на push в `main`.

Порядок:

1. **Коммит интегратора** в `main` (только назначенный maintainer, не агент).
2. **Миграции** в Supabase — SQL-редактор/CLI, по одной, с проверкой таблиц после каждой.
3. **Секреты Worker** `BRIDGE_SECRET`, `PDFMENTOR_URL` (`wrangler secret put` или панель).
4. **Push в `main`**:
   - `.github/workflows/deploy-medbiohim-api.yml` — при изменениях `workers/api/**`:
     typecheck → тесты → `wrangler deploy` (только `medbiohim-api`);
   - `.github/workflows/deploy-vercel-frontend.yml` + GitHub-интеграция Vercel — фронтенд;
   - `.github/workflows/code-check.yml` — блокирующие проверки.
5. **Приёмка после деплоя**: `GET /api/v1/health`; `GET /api/v1/preparations/guides` →
   `migrated:true`; `GET /api/v1/diagnosticum` → непустые разделы; `GET /api/v1/mentor/config`
   → `bridge_signed:true`; открыть `/trainers` (атлас), `/trainers/diagnosticum`, `/mentor`.

Деградация без шагов 2–3 (не блокирует остальной сайт):

- методички — пустой список, `migrated:false`;
- диагностикум — 503 на `/start` (страница покажет ошибку);
- `/mentor/*` — 503, остальной API работает;
- аудит бриджа — молча не пишется (ошибка только в логах Worker).

Откат: `MENTOR_ENABLED=0` возвращает старый путь без деплоя; revert коммита откатывает
код; таблицы аддитивные, удалять их не нужно.

Риски: 54 пути одним коммитом (сложнее ревью — лучше серия по пакетам); миграции и
секреты не идемпотентны «сами по себе» — повторять вручную; production-проверка
обязательна, зелёный CI не доказывает работу SSO.

---

## 6. Инструкция для следующего ИИ-агента

### Прочитать до первой правки

1. `AGENTS.md` — правила, запреты, порядок проверок.
2. `AGENT-OWNERSHIP.md` — кто владеет какими путями (один владелец на файл).
3. `API-CONTRACTS.md` §8–10 — контракт PdfMentor, микропрепараты, офлайн/идемпотентность.
4. `docs/architecture/MEDBIOHIM_PDFMENTOR_MIGRATION_PLAN.md` — пакеты работ и статусы.
5. Этот файл — что уже сделано и в каком порядке деплоить.

### Жёсткие правила

- Не пушить в `main`, не создавать PR/ветки, не деплоить без явного поручения.
- Не применять SQL/миграции, не менять секреты, DNS, storage — отдельное разрешение.
- Не читать, не выводить и не коммитить `.env`, токены, service-role ключи.
- Не добавлять второй просмотрщик документов, вторую систему выделений, второй каталог
  микропрепаратов.
- Один владелец на файл; результат — patch/diff + отчёт, не «сделал и забыл».

### Карта модулей

| Область | Где |
| --- | --- |
| Bridge/SSO/документы | `workers/api/src/routes/mentor/*`, `src/lib/mentor-sso.ts`, `src/app/mentor/*` |
| Методички | `workers/api/src/routes/preparations.ts`, `src/components/trainers/PreparationGuidePanel.tsx`, `src/data/histology-preparations.json`, `scripts/preparation-guides-sql.mjs` |
| Диагностикум | `workers/api/src/routes/diagnosticum/*`, `src/lib/diagnosticum-api.ts`, `src/components/trainers/Diagnosticum*.tsx`, `src/app/trainers/diagnosticum` |
| Админ-редактор | `workers/api/src/routes/admin/preparation-guides.ts`, `src/components/admin/PreparationGuideEditor.tsx` |
| Офлайн | `src/lib/offline/*`, `src/components/pwa/OfflineIndicator.tsx`, `workers/api/src/lib/idempotency.ts` |
| Миграции | `database/migrations/20261120_*.sql` |

### Проверки (реальные скрипты)

```bash
npx tsc --noEmit                     # или npm run typecheck
npm test                             # 368 контрактных тестов
npm run test:unit                    # vitest
cd workers/api && npm run check      # 566 тестов Worker
npm run lint
npm run build
node scripts/predeploy-audit.mjs
```

### Ловушки

- **Не запускать `npm run build` и `npx tsc --noEmit` параллельно** — падает
  `TS6053 .next/types/... not found`. После прерванной сборки нужен `rm -rf .next`.
- Сборка идёт 2–4 минуты: запускать в фоне с логом и ждать `BUILD:`.
- Окружение Windows/Git Bash: пути и `/tmp` работают, но `cmd`-синтаксис — нет.
- `ArchiveLecturesMerge.test.tsx` падал не по таймауту, а из-за устаревшего ожидания
  «22 конспекта»: данных стало 20. Исправлен 2026-11-21 (ожидания выводятся из JSON).
  Иногда плавает `LectureView.chem-panel.test.tsx` — в одиночном прогоне проходит;
  не «чинить» ослаблением проверок.
- `getTrainerImageUrl(id)` асинхронный; deep-link атласа — `?cards=<id,id>`.
- Новые файлы ≤400 строк (`test/architecture-fitness.test.mjs`), статусные цвета — только
  токенами `--status-*` (`test/status-tokens.test.mjs`).

### Чек-лист перед правкой блока

1. `git rev-parse --short HEAD` и `git status --short` — зафиксировать base.
2. Сверить путь с `main` и владельцем (`AGENT-OWNERSHIP.md`).
3. Прочитать контракт блока в `API-CONTRACTS.md`.
4. Изменить минимально; не дублировать существующий механизм.
5. Прогнать релевантные проверки из списка выше (не все подряд).
6. В отчёте: base commit, пути, команды и результаты, что не проверено, риски, patch.

### Формат отчёта

```
base: <sha>
изменено: <пути>
проверки: <команда> → <результат>
не проверено: <браузер/SSO/устройство/…>
риски: <миграции не применены / секреты не заданы / …>
patch: <diff или ссылка>
```

---

## 7. Этапы по отдельности

### MEDBIOHIM

| Этап | Вход | Выход | Критерий готовности |
| --- | --- | --- | --- |
| M1. Миграции | 3 SQL-файла (сид методичек внутри) | Таблицы `preparation_guides` (18 карточек), `preparation_structures`, `diagnosticum_attempts`, `bridge_document_reads` + RLS/гранты | `select` из каждой таблицы отвечает; `select count(*) from preparation_guides` = 18; гранты соответствуют миграции |
| M2. Секреты | `BRIDGE_SECRET`, `PDFMENTOR_URL` | `/mentor/config` → `bridge_signed:true` | секреты не в репозитории, `/mentor/*` не 503 |
| M3. Интеграция | 54 пути | Коммит(ы) в `main` | CI зелёный: typecheck, тесты, lint, build, worker |
| M4. Деплой | Коммит + секреты | Worker и Vercel обновлены | `deploy-medbiohim-api` успешен; production отдаёт новый SHA |
| M5. Приёмка | Прод | Атлас, диагностикум, `/mentor`, читалка, офлайн | Ручной проход по сценариям без ошибок в консоли |

Список путей для M3: 26 изменённых файлов из §2 и 39 новых — миграции
`20261120_*.sql`, `docs/architecture/MEDBIOHIM_PDFMENTOR_*.md`, `scripts/preparation-guides-sql.mjs`,
`src/app/{admin/preparation-guides,mentor,trainers/diagnosticum}`, `src/components/{admin/PreparationGuideEditor,pwa/OfflineIndicator,trainers/DiagnosticumRunner,trainers/DiagnosticumStats,trainers/PreparationGuidePanel}`,
`src/data/histology-preparations.json`, `src/lib/{diagnosticum-api,mentor-sso}.ts`,
`src/lib/offline/`, `src/lib/__tests__/{diagnosticum-model,offline-queue}.test.ts`,
`workers/api/src/lib/idempotency.ts`, `workers/api/src/routes/{preparations,diagnosticum.ts}`,
`workers/api/src/routes/{admin/preparation-guides,diagnosticum/,mentor/}`,
`workers/api/test/{admin-preparation-guides,diagnosticum,mentor-bridge,mentor-documents,mentor-lecture,offline-answers,preparations-guides}.test.js`.

### PdfMentor (отдельный проект)

| Этап | Вход | Выход | Критерий готовности |
| --- | --- | --- | --- |
| P1. Внешние источники | Контракт §8 | `external_sources`, приём документа и версий | документ из MEDBIOHIM регистрируется и читается |
| P2. Открытие документа | P1 + SSO-обмен | Документ открывается внутри PdfMentor | нет редиректа на второй просмотрщик MEDBIOHIM |
| P3. Выделения и заметки | P2 | Разметка хранится в PdfMentor | заметки не дублируются в MEDBIOHIM |
| P4. Обратная синхронизация | P2/P3 | `result`/`sync` прогресса | прогресс доходит до MEDBIOHIM идемпотентно |

Порядок между проектами: M1–M2 можно делать параллельно с P1; M3–M5 — после того как
PdfMentor подтвердит контракт §8, иначе страница материала останется честной заглушкой.

---

## 8. Выполнение передачи (2026-11-21/22)

### Что сделано

- **M1 — миграции применены** (Supabase MCP, ledger): `prep_guides_20261120_schema`,
  `diagnosticum_20261120`, `bridge_document_reads_20261120` + сид методичек через
  `execute_sql` порциями. Верификация: `preparation_guides` = 18, `preparation_structures`
  = 37, данные сверены с `src/data/histology-preparations.json` полем-в-поле скриптом
  (поймана и исправлена 1 опечатка транскрипции); RLS/гранты проверены запросами
  (`answers` не читается `authenticated`/`anon`, `bridge_document_reads` закрыт от клиентов).
  Усиление: миграция диагностicum дополнена `revoke all from anon` (дефолтные гранты
  Supabase оставляли anon SELECT; файл в репо обновлён симметрично).
- **M2 — `MENTOR_ENABLED=0`** задан на Worker `medbiohim-api` через Cloudflare API:
  Document Bridge в проде закрыт до решения по 152-ФЗ (проверено: `/mentor/config`
  → `enabled:false`, `POST /mentor/sso` → 503 MENTOR_NOT_CONFIGURED).
  `BRIDGE_SECRET`/`PDFMENTOR_URL` не заданы (чек-лист включения — ниже).
- **M3 — коммиты**: `bcba86f8` (пакет интеграции, 68 путей), `9187621f` (legacy-тест
  калькуляторов — CI был красным ещё до пакета: `bdbcb1b7` добавил gcs/curb65, тест
  ждал 15), `d2f8fd74` (фикс /answer), `e0f7f656` (фикс IndexedDB-очереди).
- **M4 — деплой**: CI на `d2f8fd74` — code-check ✓, deploy-medbiohim-api ✓,
  Vercel обновляется от пушей; прод подтверждён заголовком `X-Medbiohim-Build`.
- **M5 — ролевая приёмка в браузере** (qa-аккаунты `qa-student/qa-teacher/qa-admin
  @medbiohim.test`, остаются в БД; реальные записи студентов не затронуты):
  админ — выдача роли через `/admin/users`, назначение группы, редактор методичек
  (создание/сохранение с валидацией 1–3 и `""`); студент — реальный ответ в ленте
  (`training_answers`), полный контур диагностикума (hint/answer/409/stats/mistakes
  + разбор в UI), методичка в атласе, `/mentor` честно показывает «не подключён»;
  преподаватель — кабинет, 5 вкладок, границы области. Сценарий «назначение теста
  преподавателем» не прогнан (осталось на приёмку).
- **PdfMentor**: SSO-работа прошлой сессии закоммичена (`e633100`), Document Bridge
  реализован и закоммичен (`67a813f`): таблица `external_sources` (миграции 0005/0006),
  пакет `@pdfmentor/bridge` (единая HMAC-подпись, клиент access/content, ключ
  `external://`), маршруты `/api/bridge/v1/documents/register` и `/:id/version`
  (HMAC, rate limit, идемпотентность), стриминг контента в `/api/sources/:id/file`
  и extract/ocr воркера под пользователем регистрации; docker-compose передаёт
  bridge-env; тесты 130/130, `next build` OK. P4 (results/sync) — следующая фаза.
- **Повторный аудит слияния дублей** в новой сессии: слитые `preparation-match`/
  `lecture-title` консистентны; дополнительно слиты `readJson` ×3 и `daysBetween`
  (study-hub); парити-копия `normalize` в `test/lectures-content.test.mjs`
  синхронизирована с shared-правилом; намеренно разные политики не тронуты.

### Прод-баги, найденные приёмкой (моки их не ловили)

| Баг | Симптом | Фикс | Коммит |
| --- | --- | --- | --- |
| `trainer_feed_cards.id` — text, `diagnosticum_attempts.card_id` — uuid | `/diagnosticum/start` → 503 на живой БД | миграция `20261121_diagnosticum_card_id_text.sql` (+FK, on delete set null) | `3350afc1` |
| `/hint`/`/answer` читали колонку `answers` user-клиентом (колонка вне грантов) | permission denied маскировался в NOT_FOUND | `loadAttempt` через service-клиент + явная проверка `user_id`; инвариант-тест | `3350afc1` |
| `/answer` оборачивал `answers` в `{parts}` второй раз | `key.correct` undefined → INTERNAL | ключ читается как готовый `AnswerKey`; `AttemptRow.answers` типизирован | `d2f8fd74` |
| probe IndexedDB создавал базу без object store | NotFoundError на любой странице → 15 падений playwright-смока | probe с апгрейдом, версия БД 1→2, `flushOutbox` деградирует без unhandled rejection | `e0f7f656` |

### Продолжение (этап Э3, 2026-11-22)

- **Ветка `wip/physiology-colloquium-2026-10-21`** (появилась на GitHub) — не
  feature-ветка, а `git stash`-стек от 2026-10-21: tip `2543f7d9` с тремя
  родителями (`stash` + `index` + `untracked`), база `7d937c12`, main ушел вперёд
  на 601 коммит. Дерево **не собирается**: `workers/api/src/index.ts` импортирует
  `./routes/colloquium`, которого в ветке нет. Merge откатил бы рефакторинг
  (`src/lib/api.ts` 827 строк вместо модульных 42) и вернул удалённые доки.
  Решение: тег `archive/wip-physiology-colloquium-2026-10-21` (работа остаётся
  достижимой, включая UI админки в untracked-родителе `da93d3f9`), remote- и
  локальная ветки удалены; локальный хвост `feat/university-hub` (полностью в
  main, `160 0`) тоже удалён.
- **CI подтверждён по API** для `f5c58187`, `0766eaa2`, `699641b6`, `c0fca053`:
  все рабочие чеки `completed/success`. Хронически красные и не наши
  (`Supabase Preview`, `Workers Builds: medbiohim-telegram`) видны на всех
  коммитах — отдельная инфра-задача, не код.
- **`_probe_fn` удалена**: миграция `20261117_drop_probe_fn.sql` применена
  (DDL прошёл с `lock_timeout='5s'`), `to_regclass('public._probe_fn')` → NULL.
  Функция `medbiohim_finish_test_attempt` на месте.
- **Приёмка M5 пройдена**: qa-teacher импортировал 2 вопроса в личный банк →
  создал тест (published, `created_by` = qa-teacher) → назначил персонально
  qa-студенту (`test_assignments.group_id is null`, `test_assignment_students`) →
  студент увидел назначение в `/tests/assignments`, начал и завершил попытку
  (submitted, 0/2). Кабинет преподавателя показывает «1 назначено, сдали 1 из 1».
- **Перф Э3**: RPC `medbiohim_week_leaderboard` (SQL-агрегация лиги, `service_role`
  only, fallback до миграции); кэш методичек через канонический `cached()` с
  версией контента (правка админа видна сразу); меню тестов читает состав
  параллельными страницами по подсчёту вместо 12 последовательных запросов
  (было 17.6 с на проде при 10 213 связях).
- **Расписание у админа (прод-баг приёмки)**: у админа нет строк в
  `group_memberships`, и `/schedule` отдавал пустой список с `notice:
  no_active_group`, хотя в шапке была выбрана группа — «0 занятий за семестр».
  Теперь админу разрешён явно запрошенный `group_id` (тот же объём, что в
  `/admin/schedule`); студент видит свои группы, чужая — 403; без группы —
  прежний пустой ответ. Тест: `workers/api/test/schedule-access.test.js`.
- **Лига (попутный баг)**: `nextTierFor` возвращал «Серебро» любому с очками —
  подсказка «до следующей лиги» врала. Теперь ближайший порог сверху, на верхней
  лиге `null`.
- **Атлас: 7 методичек без фото (2026-11-22)**: препарат в банке назван иначе
  («Кровь мазок» вместо «Мазок крови», падежи «миелинового нервного волокна»,
  сокращения «Хрящ.тк. Эласт. хрящ», роговица без органа в названии). Правило
  вхождения такие пары не ловит. Добавлены `PREPARATION_ALIASES` в
  `src/shared/histology/preparation-match.ts` — их подхватывают и атлас
  (`indexGuides`), и диагностикум воркера (`pickImageCard`). Без миграции.
  Алиасы закрывают все 18 методичек: у мышцы препарат называется «Мышечная
  тк.Скел. мыш. тк», это тоже алиас, а не новый препарат.

### Что осталось

1. **Чек-лист включения Document Bridge (решение владельца по 152-ФЗ)**:
   задать в Cloudflare `BRIDGE_SECRET` + `PDFMENTOR_URL` → поднять `MENTOR_ENABLED`
   до `1` (удалить секрет или `MENTOR_ENABLED=0`) → приёмка SSO-обмена и чтения
   документа. Деплой не нужен — секреты читаются рантаймом.
2. **Живой dev-смоук PdfMentor** (SSO + открытие внешнего документа между
   локальными инстансами): в этой среде не выполнен — `infra:dev` требует
   не-администратора Windows или Docker; механика покрыта юнит/PGlite-тестами,
   полный e2e отложен до доступной среды.
3. P4 (results/sync) — на стороне MEDBIOHIM после подтверждения контракта.
4. Сопоставление 18 гидов с реальными `trainer_feed_cards.id` — read-only запрос
   к Supabase (нормализация названий работает до этого).
5. ~~Назначение теста преподавателем qa-студенту~~ — выполнено 2026-11-22, см. ниже.
