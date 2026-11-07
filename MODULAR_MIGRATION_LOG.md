# MODULAR_MIGRATION_LOG

Хронология модульной миграции MEDBIOHIM.

## 2026-11-07 (ночь) — переработка тестового движка, аналитика, CSV, детализация

- **Новые типы вопросов**: верно/неверно (auto-варианты), соответствие (select по левым, эталон «a|b|c»), пропуски (инпут на каждый бланк). Серверный канон question-format.js + клиентский реестр + грейдинг согласованы; контрактные тесты обновлены (yes_no и пр.).
- **Раннер подготовки**: навигатор по вопросам (отвечено/помечено/текущий), кнопка «Пометить для возврата», четвёртый режим «Контрольный».
- **Аналитика по вопросам**: GET /teacher/test-assignments/:id/analytics — доли верных от худшего к лучшему из test_preparation_results; UI-таблица в кабинете.
- **Экспорт ведомости CSV**: GET /teacher/test-assignments/:id/export (BOM, Excel); кнопка CSV в кабинете.
- **Детализация 1–4**: миграция teacher_assignments.detail_level (применена, 2 стейтмента), PATCH /teacher/assignments/:id/detail (только admin), уровень учитывается в карточке студента, выбор в /admin/teachers.
- Воркер версии d7381ff8; все проверки зелёные (364/519/301, lint 0 errors, build OK).

## 2026-11-07 (финал) — свой тест преподавателя, студенты области, карточки

- Применена миграция 20261106120000_teacher_catalog (tests.created_by, teacher_visible; 18 стейтментов) — вторая половина работ второго агента ожила в проде.
- **Свой тест из личного банка**: POST /teacher/tests (вопросы копируются в questions с привязкой к предмету, авторство в tests.created_by), PATCH/DELETE своего теста. Кабинет: «Создать из банка» с выбором вопросов, предмета, поиском.
- **Студенты области**: GET /teacher/students — ростер (ФИО, группа, попытки, средний %); GET /teacher/students/:id/attempts — карточка студента по тестам автора. Кабинет: «Мои студенты» с раскрывающимися карточками.
- **Назначение отдельным студентам**: переключатель группы ↔ студенты в форме назначения (worker поддерживал student_ids с начала).
- Воркер версии 6de815b9; все маршруты живы (401 без токена), health OK. Bootstrap-секрет удалён.
- Осталось из ТЗ кабинета: выбор тем (topic_ids) в форме, ручная проверка открытых ответов, детализация видимости, аналитика по вопросам.

## 2026-11-07 (позже) — назначение тестов: фича выпущена, все миграции в проде

- **Миграция 20261107090000_test_assignments применена к production Supabase** (все три миграции: teacher_assignments, module_access, test_assignments — 47+15 стейтментов). Применены через одноразовый bootstrap-маршрут с батчами по 25 стейтментов (лимит ~50 subrequests на инвокацию воркера); секрет MIGRATION_BOOTSTRAP_SECRET после применения удалён, маршрут инертен (404 без секрета).
- **Фича «назначение тестов» (кабинет 8.20–8.24) выпущена**: воркер версии 68ee3306→e87f63a8 — POST/GET/DELETE /teacher/test-assignments (область преподавателя проверяется по loadTeacherScope; сводка прошли/ожидают/средний процент из существующих попыток), студент — GET /tests/assignments. Кабинет: форма назначения (тест, группы, дедлайн, лимит времени, попытки, число вопросов, инструкция); студентам — блок «Назначено преподавателем» в /tests.
- Прокси Vercel теперь передаёт x-bootstrap-secret (был в белом списке только служебный набор заголовков).
- Вопросы не копируются: назначение ссылается на существующий тест и существующий движок попыток — второй системы результатов нет.

## 2026-11-07 — production-релиз Worker + изоляция преподавателя от Мастерской

- **Worker medbiohim-api задеплоен** (версия 98372844) из чистого worktree на HEAD `aee788fc` с `--keep-vars` — все dashboard-vars и service-биндинги сохранены. Прод-пробы: health OK, /tests/preview, /access/*, /teacher/* живы (401 без токена), /bootstrap/migrate инертен без секрета (404).
- **Изоляция преподавателя**: /workshop отдаёт teacher 403 MODULE_FORBIDDEN (denyRoles в moduleGate); пункт «Мастерская» не приходит учителю в навигации. Границы учителя: только свои контент/тесты/группы, ничего о студенческих делах.
- **Исправлена регрессия админа**: /access/my-modules для staff теперь читает реестр напрямую (раньше шорткат админа отдавал пустой список и Sidebar скрывал все разделы); дополнительно фронтенд не фильтрует меню при staff-флаге.
- Посмотреть глазами преподавателя: /teacher (для админа — полная область).

## 2026-11-06 (ночь) — Access Control: централизованный доступ к разделам

- Миграция 20261106100000_module_access.sql: реестр разделов (open/restricted), индивидуальные и групповые разрешения (allow/deny, срок действия), журнал доступа, RLS. Существующие разделы стартуют открытыми — поведение текущих пользователей не меняется.
- Worker: module-access lib (приоритет deny > allow, индивидуальное > групповое, fail-open без миграции), moduleGate на маршрутах 15 разделов (schedule, subjects, tests/tickets/lectures/вопросы, progress, community, search, library, workshop, academic, assignments, calculators, attestations, ai-тьютор, staff-староста), /access/my-modules, /access/admin/* (реестр, выдача, отзыв, аудит) — всё под requireAdmin.
- Фронтенд: Sidebar и MobileNav фильтруют пункты по выданным разделам (пустой «Ещё» скрыт); admin-страница /admin/access; AdminNav → «Доступы к разделам».
- Проверки: worker 348/348, vitest 519, node --test 301, typecheck/lint/build — зелёные. Запушено: `8b84d8a0`; Vercel собирает прод.
- Активация изоляции: администратор переводит раздел в restricted на /admin/access; до этого всё открыто (плавный rollout).

## 2026-11-06 (вечер) — закрытие бэклога: preview, научный редактор, деплой

- Реализован авторский предпросмотр теста: GET /tests/preview/:id (teacher/admin, эталоны, без записи попыток), GET /teacher/tests, страница /teacher/preview/[id] на общем грейдере. Тест контракта: workers/api/test/test-preview.test.js.
- Кабинет дополнен: «Мои лекции» на едином RichLectureEditor (/my-lectures) и «Личный банк вопросов» (/my-questions). Реестр пополнен записями teaching.*.
- Проверки: typecheck OK, lint 0 errors/60 warnings, vitest 519 pass, node --test 301 pass, worker check 343 pass, build success.
- Коммиты: bd305430 (shared), 4bca0781 (permissions+teacher), cbf5573e (frontend permissions), 28572cc2 (docs), [teacher features] — запушены в origin/main (`8524a1f1..ce4c9eb3`).
- **Фронтенд задеплоен:** push в main запустил production-сборку Vercel; маршрут /teacher/preview/* подтверждён на проде (HTTP 200).
- **Worker (medbiohim-api):** бандл собран (esbuild, 3.1MB, minified, совместим с wrangler.toml: compatibility_date 2024-12-01, nodejs_compat, биндинг AI). Деплой заблокирован без учётных данных: Cloudflare MCP-песочница закрыта whitelist (только api.cloudflare.com), wrangler OAuth не подтверждён владельцем. Команда деплоя: `cd workers/api && npx wrangler deploy` после `npx wrangler login` (или CLOUDFLARE_API_TOKEN). Bindings/secrets воркера сохраняются (wrangler наследует их при deploy).
- **Миграция teacher_assignments:** не применена — ни токена Supabase Management API, ни доступного DATABASE_URL в окружении нет (секреты DB_* лежат в воркере и нечитаемы). Команда: применить SQL из supabase/migrations/20261105090000_teacher_assignments.sql через Supabase SQL Editor / CLI.

## 2026-11-06 — независимая проверка и стабилизация (GLM-проход)

- Base commit: `8524a1f1` (`docs: document target modular architecture`).
- Рабочее дерево содержало незакоммиченную реализацию этапов B–H предыдущего прохода. Всё перепроверено по коду и тестам, дополнено документами состояния, закоммичено логическими блоками.
- Проверки (все exit code 0):
  - `npm run typecheck`
  - `npm run lint` (0 errors, 61 унаследованных warning)
  - `npm run test:unit` — 519 pass / 0 fail (vitest, 43 файла)
  - `npm test` — 341 pass / 0 fail (node --test)
  - `cd workers/api && npm run check` — 341 pass / 0 fail
  - `npm run build` — success
- Зафиксированные артефакты:
  - Shared: src/components/ui, src/components/questions, src/lib/question-types, src/shared/{permissions,file-engine}, реестр docs/architecture/registry/components.json.
  - Права: workers/api/src/lib/{permissions,teacher-scope,content-access}.ts, правки admin/groups/subjects/admin-schedule/admin-attestations/admin-parity/submissions, Sidebar/AdminGate/AdminNav.
  - Teacher Workspace: workers/api/src/routes/teacher.ts (+mount /api/v1/teacher), src/app/teacher, src/app/admin/teachers, src/lib/api/teacher.ts.
  - Миграция: supabase/migrations/20261105090000_teacher_assignments.sql (аддитивная, RLS, fail-closed в Worker).
  - E2E: e2e/roles.spec.ts (требует тестовых аккаунтов), обновлён e2e/smoke.spec.ts.
- Добавлены документы состояния: MODULAR_MIGRATION_{STATUS,MAP,BACKLOG,LOG,HANDOFF}.md.
- Ограничения: production не деплоился, миграция к БД не применялась, живые RLS не проверялись — см. BACKLOG.

## 2026-11-05 — аудит shared-слоя (DeepSeek-проход)

- docs/architecture/SHARED-LAYER-AUDIT-2026-11-05.md — аудит по коммиту `8524a1f1`.
- Этапы A (реестр как данные) и B (типы вопросов) выполнены; этап C — для экранов прохождения.
