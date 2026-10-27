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
