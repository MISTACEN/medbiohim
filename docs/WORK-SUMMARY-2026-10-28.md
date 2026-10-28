# Выполнение планов аудита — 28.10.2026

Продолжение работы по [TECH-AUDIT-PLAN-2026-10-27.md](TECH-AUDIT-PLAN-2026-10-27.md),
[PRODUCT-AUDIT-PLAN-2026-10-27.md](PRODUCT-AUDIT-PLAN-2026-10-27.md) и
[SITE-AUDIT-FULL-2026-10-27.md](SITE-AUDIT-FULL-2026-10-27.md).
Часть волны 0 и MA1–MA7/SA1/FD1–FD2 были закрыты ранее (см. коммиты `091f9b17…` и
[architecture/ci-history.md](architecture/ci-history.md)). В этот день закрыто следующее.

## 🔴 P0

### D2/H1 — вкладка «Химия» в /tests всегда была пустой
`workers/api/src/routes/tests.ts` читал несуществующую таблицу `chemistry_master`
и маскировал ошибку ответом `ok({items: []})` — 200 и пусто, месяцами.

- Роут `/tests/chemistry-master` переписан: читает реальный каталог
  `chemistry_master_documents`, разворачивает его jsonb-контент в плоский список,
  поддерживает фильтры UI (q/kind/formula) и пагинацию, ошибку БД отдаёт как
  `DB_UNAVAILABLE` 503, а не «тихий пустой список». Элементы OCR-выгрузки
  (kind: mcq/match/open, answer_raw) нормализуются к контракту клиента;
  ответ не додумывается — нет answer → `answer_status: unprepared`.
- `/tests/curriculum-map` больше не прячет ошибку БД за пустым 200 (анти-паттерн §4.9).
- Контрактные тесты в `workers/api/test/contracts.test.js` фиксируют оба правила
  (реальная таблица + честная ошибка); все 139 тестов воркера зелёные.
- Данные: `tools/chem/export_master_catalog.py` собрал из OCR-транскрипций
  сборника ДВГМУ 2016 (части I–III) сид **[20261028_chemistry_master_v2_seed.sql](20261028_chemistry_master_v2_seed.sql)** —
  **556 позиций** (288 тестов / 74 соответствия / 194 открытых задания), 112 с ответом.
  Аддитивный upsert версии `2026-10-28-v2-tests`, прод-банки tests/questions не трогает.
  **Требуется применить SQL к Supabase** — после этого вкладка «Химия» наполняется.
  Формулы сохранены в текстовом виде как распознаны; пометки `[СТРУКТУРА: …]`
  требуют постраничной сверки со сканом до попадания в scoring (правило Pass 26A).

### D1/0.3 — страница «Задания» вместо redirect
`/homework` был `redirect("/schedule")`, хотя таб «ДЗ» в мобильной навигации вёл
именно на него и у API есть роутер заданий на 21 маршрут.

- Написана настоящая страница `src/app/homework/page.tsx`: список ДЗ группы
  (`listHomeworks`), фильтры Активные/Просроченные/Выполненные/Все со счётчиками,
  сдача текстового ответа (`submitHomework`), отметка о выполнении
  (`setHomeworkDone`), пустые состояния с CTA, `ErrorState` с повтором, скелетоны.
- В `src/lib/api.ts` добавлена `listHomeworkSubmissions(id)`.

### FD4 — оценки и комментарии преподавателя
В карточке задания на `/homework` показываются оценка, комментарий преподавателя
(`teacher_comment`) и статусы сдач из `/homeworks/:id/submissions` — данные,
которые бэкенд возвращал, а UI нигде не показывал. В `/schedule` блок `HomeworkGrade`
уже был добавлен ранее.

## 🟠 P1

### D30 — UUID предметов в URL статики (404 в консоли)
`resolveSubjectSlug` возвращал неизвестную строку (в т.ч. UUID) как есть →
браузер бил в `/content/portals/ticket-banks/<uuid>.json` → 404.
UUID-подобные строки теперь не считаются слагом: без имени слаг пуст
(`loadTicketBank` на пустой слаг не ходит), слаг берётся из имени предмета.

### D31 — рассинхрон слагов клиент/сервер (404 на /subjects/organic_chemistry)
Клиент канонизировал слаг (`chemistry_organic_physical` → `organic_chemistry`),
сервер искал точным `eq("slug", …)`. В `workers/api/src/routes/subjects.ts`
добавлен список алиасов и поиск `slug in (variants)` — оба написания находят предмет.

### D33 — presence-heartbeat 16 % трафика круглосуточно
Heartbeat в `AppShell` теперь бьётся только при `document.visibilityState === "visible"` —
ночью со свёрнутой вкладкой трафик прекращается.

### D34 — всплески 401 при протухшем токене
Уже закрыто ранее единым single-flight refresh (см. аудит-план, D8/1.2).

## CI (A-волна)

- В `code-check.yml` добавлен шаг `test:physiology` (задача 1.7).
- Typecheck воркера уже отдельным job (1.8 — закрыто ранее).

## Что уже было закрыто к началу дня (проверено по коду)

Волна 0: error/global-error/not-found/loading.tsx, TopBar-поиск через `router.push`,
`ChemicalFigure` (конверт {ok,data}), удаление 15 write-workflow (A4), lint-гейт (A2/A3),
типизация AuthProvider/page.tsx, MA1 роль-гейт (`AdminGate`), MA2, MA3–MA7, SA1
(смена пароля с текущим + отзыв сессий), FD1 (поиск-контракт), FD2 (group_id),
FD3 (провайдеры тьютора), D10/D8.

## Проверки

- `npx tsc --noEmit` — 0 ошибок
- `npx eslint src` — 0 errors / 33 warnings
- `npm test` (7 файлов), `test:api-failover`, `test:physiology` — зелёные
- `workers/api`: typecheck 0 ошибок, 139/139 тестов

## Осталось из волны 0 (требует живого окружения ❓)

- Применить `docs/20261028_chemistry_master_v2_seed.sql` к Supabase.
- D3: проверить `POST /admin/schedule/save` под студенческим токеном (в выгрузке логов нет ни одной попытки).
- 0.11: воспроизвести React error #130 в `next dev` (статически не локализуется).
- 0.12: 503 `/admin/lectures` и `/lesson-plan` — нужен `wrangler tail medbiohim-api`.
- 0.8: судьба `public/library/histology` (202 МБ вне git, в коде не используются).

---

# Живая верификация в проде (28.10.2026, вечер)

## Сид применён к прод-БД

`import_legacy_sql` (Supabase RPC) применил сид успешно. В каталоге теперь
**992 позиции**: старый документ v1 (436) + новый v2 (556). Повторная генерация
сида устранила 74 пустых текста у match-заданий (строка-инструкция не была
распознана OCR — восстановлена стандартной формулировкой «Установите
соответствие между позициями», пары сохранены).

## CI и деплои

- `c69c3777`: все проверки и оба деплоя (Worker + Vercel) — success.
- `dc916308` и `84ce05d1`: деплои success.

## Проверено в живом проде (браузер + API под студенческой сессией)

- `/homework` — новый раздел работает: фильтры со счётчиками, пустое состояние
  с CTA (у тест-студента 0 заданий — ожидаемо).
- `/tests?view=chemistry` — **банк живой: 992 задания, пагинация 83 страницы**,
  бейджи «ответ подготовлен»/«формула сохранена», поиск «алкалоиды» → 40 позиций.
- `/tests/curriculum-map` — 109 пунктов.
- Плитки «Задания» на главной переведены с `/schedule` на `/homework` (84ce05d1).

## Найдено и починено по ходу живой проверки

- **409 на /subjects/organic_chemistry** (после alias-фикса): в БД один предмет
  занимает **три активные строки** под слагом-алиасом `chemistry_organic_physical`
  (1к/2с, 2к/4с, 2к/3с) — канонического слага нет вовсе. Дедупликация теперь
  по курсу/семестру профиля студента (или `?course/?semester`), 409 остаётся
  только при настоящей неоднозначности (fba6209c).
- Тест-пользователи, созданные для проверки, удалены из Auth (probe-сессии 200 OK).

## Ограничения

- «Supabase Preview»-проверка в CI отменена: у проекта исчерпан месячный лимит
  1000 git push events (это про preview-ветки Supabase, не про прод).
- React error #130 и 503 `/admin/lectures` — по-прежнему требуют живой отладки
  (`next dev` / `wrangler tail`), статически не локализуются.

---

# Второй заход (28.10.2026, ночь): D3, корень 503, FD5/FD7, MA13

Работа двумя параллельными суб-агентами (сверка статусов всех задач волн 0–1
и расследование 503) плюс ручные фиксы. Полная таблица статусов задач — в
диалоге; главное: волна 0 TECH закрыта целиком, D7/D8/C2/E4 закрыты,
MA1–MA3/MA5/MA6/MA9/MA12/SA1/FD1–FD4/FD6 закрыты.

## 🔴 D3 закрыт — роль-гейт на всех хендлерах admin-schedule

Аудит ошибался частично: `save` и `rollback` уже гейтились `isAdmin`, но
`GET versions`, `PATCH entries/:id`, `DELETE entries/:id`, `GET analytics` —
нет (последние два — реальные мутации расписания). Все 6 хендлеров теперь
гейтятся; контрактный тест `every admin-schedule handler is staff-gated`
фиксирует это навсегда. 140/140 тестов воркера.

## 🔴 Корень 503 на /lesson-plan и /admin/lectures найден (D35 закрыт)

Цепочка: клиент расписания шлёт в `/lesson-plan` русское имя предмета → воркер
находит первый матч по slug → в БД предмет занимает **три активные строки** под
слагом-алиасом `chemistry_organic_physical` → `.maybeSingle()` на нескольких
строках = PostgREST `PGRST116` → throw → маскированный 503. Эмпирически
подтверждено прямым доступом к прод-БД (RLS-дамп политик, счётчики строк).

Фиксы:
- `lesson-plan.ts` — детерминированный выбор предмета (`order course/semester, limit 1`),
  как уже сделано в `plans.ts`;
- `admin.ts readLectures()` — то же для ключа `lectures` (миграция
  `20261008_histology_lecture_05_blood.sql` вставляет его беззащитным insert)
  + `console.error` в catch;
- миграция `20261028_site_content_key_unique.sql` — **уникальный индекс на
  `site_content.key`**, применена к прод-БД (исключает рецидив от слепых INSERT);
- 16 молчаливых `catch` в `admin.ts` теперь логируют ошибку сервера — следующий
  503 оставит след в `wrangler tail`.

Диагностическая таблица `_audit_policies_dump` после работы удалена из БД.

## 🟡 Быстрые победы из сводки суб-агента

- **MA13**: legacy-пресеты SpaceWeb удалены из SQL-консоли (`DEFAULT_CONNECTIONS` пуст,
  панель аудита MA3 в /admin/audit заменяет страховку миграции).
- **FD5**: стрик SRS персистентен (`mbh:srs_streak` в localStorage, валидация даты),
  бейдж «стрик: N дней» рядом со «сегодня N».
- **FD7**: у селектора посещаемости бейдж «самоотчёт» — отметка ставится студентом
  без подтверждения преподавателя (политика честности данных).

## Верификация

- tsc: 0 ошибок (фронт + воркер); eslint: 0 errors; root-тесты 159/159; воркер 140/140.
- Проверки, которые нельзя было сделать статически ❓ → осталось только
  React #130 в `next dev` (единственный пункт волны 0 без движения).

---

# Третий заход (28.10.2026, ночь): волны 1–3 пакетом, работа с 2 суб-агентами

## Закрыто пакетом (коммит «feat: волны 1–3 пакетом»)

- **C6–C7 (волна 1)**: `window.location.search` → `useSearchParams` в 11 файлах
  (login, materials/source, practice, search, settings, subjects/[id], tests,
  tests/bank/[id], AuthHashCatcher, HistologyTrainer, AuthProvider) — по образцу
  cards/page.tsx с Suspense-границами; `next build` прогнан агентом — ни одна
  страница не упала. Grep = 0. OAuth-hash-логика не тронута.
- **D3-guards (волна 1)**: `src/lib/guards.ts` — isAnnouncement/isProfile/
  isSubjectCard/isScheduleRow/isTestItem + filterSafe; встроены в границы
  api.ts (listSubjects/listTests/listSchedule/getDashboard) и покрыты 7 unit-тестами.
- **SA9-остаток (волна 2)**: операторские тексты «Supabase»/«Auto Confirm»
  вычищены из UI (content-import, questions, content-package, api-logs,
  schedule, tutor, university/import, AdminDatabaseConsole) — grep видимых
  пользователю «Supabase» = 0.
- **MA7-остаток (волна 2)**: `useUnsavedChanges` подключён в RichLectureEditor —
  несохранённая лекция предупреждает при уходе.
- **FA7 (волна 3)**: /help переписан из заглушки с внутренней архитектурой в
  настоящий FAQ студента (вход, Telegram, расширение, задания, тесты, SRS,
  тренажёры, тема, жалобы на вопросы).
- **MA4-остаток (волна 2)**: клиентская пагинация («Показать ещё») в
  admin/lectures и admin/announcements.
- **MA11 (волна 2)**: поиск по тексту/типу и batch-закрытие выбранных жалоб
  (Исправлено/Отклонить) в admin/problems; labels типизированы.
- **SA7 (волна 2)**: ThemeProvider применяет серверную тему при первом входе,
  когда локального выбора ещё нет — тема переезжает между устройствами.
- **FD8 (волна 2)**: единый расчёт времени и «ближайшей пары» — `src/lib/now-parts.ts`
  (nowParts + pickNextLesson), обе страницы (дашборд и расписание) на одном
  модуле вместо двух разных Intl-форматов; 6 unit-тестов.

## Верификация пакета

- `npx tsc --noEmit` — 0; `npx eslint src` — 0 errors; root-тесты **172/172**;
  `grep window.location.search` — 0; `next build` — успешен.

## CI-инцидент пакета и его урок

Первый пуш пакета (`dfb6d9cd`) упал в CI: `npm run lint` гоняет `eslint .` по
всему репо, а мои unit-тесты объявляли переменную `module` — правило
`no-assign-module-variable`. `npx eslint src` это не ловит, потому что тесты
лежат вне src. Переименовано в `moduleShim` (`43ad77a4`), code checks зелёные.
Правило для будущих тестов: в test/** не называть переменные `module`/`exports`.

## Живая проверка пакета в проде

- /help — новый FAQ отдаётся с деплоя Vercel;
- /search?q=гистология — чтение query через useSearchParams работает,
  фильтры рендерятся;
- деплой выполнен интеграцией Vercel (проверяющий workflow на test-only коммит
  не запускается по paths — это ожидаемо).

## Осталось из планов (не начато)

D1 (типы домена), D9-хук useApiRequest, G1 (vitest), B4-внедрение ErrorState
на остальные страницы, MA8 (полный редактор вопросов), MA10 (атомарная сборка
вариантов), SA2–SA6/SA8/SA10 (email-flow, аватар, сессии, экспорт, QR, magic link),
React #130, волны 3–4 химии (H3–H9), FA-улучшения продукта.

---

# Сессия 5. Расширение без хрупких парсеров + личный трекер отработок

Основание: итоговый вердикт разбора сторонних платформ («что отсюда взять») и
docs/EXTERNAL-PLATFORMS-REVERSE.md. Сделано три вещи, все — про «глубоко по
данным, мелко по чужим ПДн».

## 1. Импорт переехал из site_content в свою таблицу (`imported_sources`)

- `database/migrations/20261028_imported_sources.sql` — приватная таблица
  (`user_id` → `auth.users`, RLS owner-only на select/insert/update/delete,
  дедупликация по `content_hash = sha256(url)`), плюс разовый перенос старых
  ключей `site_content` `extimport:<user>:<hash>`.
- Миграция **применена к прод-БД**, старые записи перенесены (1 строка).
- `workers/api/src/routes/integrations.ts`: чтение/запись/удаление — по
  `imported_sources` и `user_id` из JWT; legacy-ключи `site_content` читаются
  только в своём префиксе и удаляются через тот же API, пока очередь не пуста.
  `body.user_id` не читается нигде.

## 2. Расширение: декларативная карта источников + перехват без хрупких парсеров

- `browser-extension/src/content/sources.json` — селекторы, лимиты, правила
  типов и regex даты вынесены из кода. `selectors` источника дополняют `common`
  (массивы конкатенируются, строки заменяют), поэтому редизайн платформы —
  правка одного JSON, а не `analyzer.js`.
- `browser-extension/src/content/interceptor.js` — новый content script в
  **MAIN**-мире на `document_start`: оборачивает `fetch` и `XMLHttpRequest`,
  складывает из JSON-ответов только пары `{title, url}` и отдаёт их в
  isolated-мир через `CustomEvent` (**строкой**, потому что объекты `detail`
  не переживают границу миров).
- Границы перехвата (анти-цель U9): включается только по кнопке «Разобрать
  страницу», выключается при закрытии превью, импорте или по TTL 100 с; только
  свой origin; только JSON; URL c `login|logout|auth|token|session|captcha`
  пропускаются; куки, заголовки и тела запросов не читаются; ничего никуда не
  отправляется — находки живут в памяти вкладки и попадают в обычное превью с
  бейджем «сеть».
- `analyzer.js` переведён на карту источников, добавлен буфер сетевых находок;
  `popup.js` показывает их отдельным бейджем и снимает перехват при закрытии.
- Тесты: обновлён `workers/api/test/integrations.test.js` (два content script,
  MAIN-мир раньше analyzer, карта источников вместо зашитых хостов, новый тест
  на «перехват только по кнопке, только свой origin, без куки/заголовков/тел»);
  harness `test/bridge-extension.test.mjs` подставляет реальный `sources.json`
  вместо модульного загрузчика — сам код анализатора исполняется как есть.

## 3. Личный трекер отработок (`/assignments`)

- `database/migrations/20261028_my_assignments.sql` — приватная таблица
  (`subject`, `topic`, `due_date`, `status in (passed|failed|pending|retake_needed)`,
  `grade`, `note`, `source in (manual|csv)`), unique
  `(user_id, subject, topic, due_date)`, RLS owner-only. Применена к прод-БД.
- `workers/api/src/routes/assignments.ts` — `GET /` (фильтр по статусу, сводка),
  `POST /` (одиночная запись или пакет до 200, upsert по натуральному ключу),
  `PATCH /:id`, `DELETE /:id`; всё `requireAuth`, `user_id` только из JWT.
- `src/app/assignments/page.tsx` — сводка, фильтры со счётчиками, ручное
  добавление, инлайн-смена статуса, правка оценки/срока/заметки, удаление,
  CSV-импорт с предпросмотром. CSV разбирается **на клиенте** (`;`, `,`, таб;
  заголовок пропускается; `дд.мм.гггг` → ISO; русские слова статусов
  распознаются) — на сервер уходит уже только своя строка.
- Навигация: пункт «Отработки» в сайдбаре, плитка на главной, заголовок в
  TopBar.

## Верификация

- `npx tsc --noEmit` — 0 ошибок; `npm run lint` — 0 errors (45 прежних warning);
  root-тесты **172/172**; worker-тесты **143/143**; `npm run build` расширения —
  успешен (`interceptor.js` 7.8 KiB, `analyzer.js` 15 KiB).
- Миграции применены к прод-БД: `imported_sources` и `my_assignments` отвечают
  по REST, legacy-запись перенесена.

## Что осталось по этому направлению

- Живая проверка `/assignments` под реальным токеном (401 без токена проверяется
  после деплоя; CRUD — под временной сессией).
- Официальный API вуза/ЕИОС — по-прежнему долгосрочная цель; расширение читает
  только то, что студент уже открыл.
- `ozizdvgmu.ru` (Moodle ОЗиЗ) — задачи U6–U8 из docs/SITE-AUDIT-FULL-2026-10-27.md,
  не начаты.
