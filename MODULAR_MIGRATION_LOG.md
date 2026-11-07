# MODULAR_MIGRATION_LOG

Хронология модульной миграции MEDBIOHIM.

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
