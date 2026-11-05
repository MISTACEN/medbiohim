# MODULAR_MIGRATION_STATUS

Статус реализации модульного плана на 2026-11-06. Base commit: `8524a1f1` (`docs: document target modular architecture`). Все проверки выполнены на рабочем дереве поверх `main` до интеграционных коммитов.

Статусы: DONE (реализовано и подтверждено проверками), PARTIAL (часть готова, указано чего не хватает), NOT DONE, BLOCKED, NOT VERIFIED (нет доказательства, PASS заявлять нельзя).

## Фазы плана (§12)

| Фаза | Статус | Доказательство |
|---|---|---|
| A. Baseline | DONE | `git rev-parse HEAD` = `8524a1f1`; рабочее дерево содержало незакоммиченную реализацию этапов B–H, проверенную заново в этом проходе |
| B. Карта зависимостей | DONE | [MODULAR_MIGRATION_MAP.md](MODULAR_MIGRATION_MAP.md); аудит — docs/architecture/SHARED-LAYER-AUDIT-2026-11-05.md |
| C. Core/permissions | DONE | workers/api/src/lib/permissions.ts, teacher-scope.ts, content-access.ts; тесты workers/api/test/permissions.test.js, teacher-scope.test.js; src/shared/permissions |
| D. Shared | DONE | src/components/ui (Button, Badge, Modal, Tabs, DataTable, ConfirmDialog, barrel), src/components/questions/{AnswerOption,CheckResultPanel}, src/lib/question-types, реестр docs/architecture/registry/components.json; тесты test/ui-barrel, test/component-registry, test/question-type-registry, src/components/questions/__tests__ |
| E. Subjects/content model | DONE | Каталог и структура предметов существовали и сохранены; запись каталога ограничена admin (workers/api/src/routes/subjects.ts `isCatalogAdmin`) |
| F. File Engine | DONE (просмотр) | src/shared/file-engine/{detection,formats,limits,security,xml,text,office/*}, viewers (FilePreview, DocxViewer, PptxViewer, SheetViewer, ArchiveViewer, TextViewer); подключён в materials и library/UserFiles; тест src/lib/__tests__/file-engine.test.ts |
| G. Доменные модули | DONE | Страницы переведены на общий UI (admin/*, tests/*, tickets, practice, bookmarks, materials, settings, workshop и компоненты); поведение не менялось |
| H. Teacher Workspace | PARTIAL | Кабинет: workers/api/src/routes/teacher.ts + src/app/teacher + src/lib/api/teacher.ts; назначения: src/app/admin/teachers. Нет: авторский preview-режим теста, отдельный научный редактор преподавателя (см. BACKLOG) |
| I. Admin | DONE | Admin-консоль отделена: Sidebar показывает Admin только admin; admin/overview — STRICT_ADMINS; группы/каталог/расписание/членство — admin-only; назначение преподавателей — src/app/admin/teachers |
| J. Регрессия | PARTIAL | Автотесты зелёные (см. ниже); e2e/roles.spec.ts написан, но требует тестовых аккаунтов; миграция не применена к production |

## Автопроверки (точные команды, exit code 0)

- `npm run typecheck` — чисто.
- `npm run lint` — 0 errors, 61 warning (существующие, не из новых файлов).
- `npm run test:unit` (vitest) — 43 файла, 519 тестов, 0 fail.
- `npm test` (node --test test/**/*.test.mjs) — 341 pass, 0 fail.
- `cd workers/api && npm run check` — typecheck + тесты, 341 pass, 0 fail.
- `npm run build` — success (exit 0).

## Границы статуса

- production Worker/Vercel не деплоился; живые Supabase RLS/grants не проверялись — NOT VERIFIED.
- Миграция `20261105090000_teacher_assignments.sql` написана, но не применена ни к одной БД — ожидает отдельного разрешения (fail-closed поведение Worker уже покрыто тестами).
- Личная студенческая функциональность (homework, my-lectures, my-questions, заметки, закладки, Мастерская) сохранена; регрессия подтверждена юнит-тестами, но не живым прогоном по аккаунтам.
