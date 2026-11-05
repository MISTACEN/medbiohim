# MODULAR_MIGRATION_MAP

Карта: существующие страницы, компоненты, API-маршруты, таблицы → целевые модули. Base commit `8524a1f1` + рабочий проход 2026-11-06.

## Целевая структура

```
src/
  core/            → пока распределено: src/components/auth/AuthProvider, src/lib/api.ts, src/lib/errors.ts
  shared/          → src/shared/permissions, src/shared/file-engine
                     src/components/ui (Button, Badge, Modal, Tabs, DataTable, ConfirmDialog)
                     src/components/questions (AnswerOption, CheckResultPanel)
                     src/lib/question-types (registry, normalize, grade)
  modules/
    subjects       → src/app/subjects, workers/api/src/routes/subjects.ts
    tests          → src/app/tests, src/app/tickets, src/app/practice, workers/api/src/routes/{tests,tickets,questions}.ts
    lectures       → src/components/lectures, workers/api/src/routes/{lectures,my-lectures}.ts
    materials      → src/app/materials, src/components/library/UserFiles, File Engine (src/shared/file-engine)
    trainers       → src/components/trainers, src/components/chemistry, src/components/physiology, Labs, workers/api/src/routes/trainers.ts
    assignments    → src/lib/endpoints.ts (homeworks/submissions), workers/api/src/routes/{submissions,admin-parity}.ts
    schedule       → src/app/schedule, workers/api/src/routes/admin-schedule.ts
    progress       → src/app/progress, workers/api/src/routes/plan-*.ts
    teacher        → src/app/teacher, src/lib/api/teacher.ts, workers/api/src/routes/teacher.ts
    admin          → src/app/admin/*, src/components/admin/*, workers/api/src/routes/admin*.ts, groups.ts
  app/             → Next.js-страницы и layouts (тонкие точки входа, без изменения поведения)
```

`core/` пока не выделена физически: это зафиксированная цель, а не приказ механического переноса (план §4). Аудит совместимости — docs/architecture/SHARED-LAYER-AUDIT-2026-11-05.md.

## Реестр общих компонентов

- Схема и контракт: docs/architecture/SHARED-COMPONENT-REGISTRY.md.
- Данные реестра: docs/architecture/registry/components.json (UI-примитивы, учебные блоки, типы вопросов, редакторы, схемы).
- Страж: test/component-registry.test.mjs — проверяет, что каждая запись реестра ссылается на живой файл.

## Типы вопросов

- Канон: src/lib/question-types/{types,registry,normalize,grade}.ts.
- Единый рендер варианта и панель результата: src/components/questions/AnswerOption.tsx, CheckResultPanel.tsx.
- Потребители (заменённые копии): tests/preparation, tests/bank, tickets, practice, trainers/HistologyQuestionCard, lectures/ExamModePanel, lectures мини-тест, physiology/TestRunner.

## File Engine

- Ядро: src/shared/file-engine (detection — MIME/сигнатура/allowlist; security — лимиты, защита архивов; formats; office — docx/pptx/workbook/sheetGrid/archive; text — безопасный просмотр TXT/MD с XSS-очисткой; xml).
- Viewers: src/shared/file-engine/viewers (FilePreview — диспетчер, DocxViewer, PptxViewer, SheetViewer, ArchiveViewer, TextViewer, SimpleViewers, useFileBytes).
- Точки входа: src/app/materials/page.tsx, src/components/library/UserFiles.tsx. PDF/изображения продолжают использовать существующий встроенный показ + ImageLightbox.
- Приватность: просмотр идёт по авторизованным путям хранилища, оригинал скачивается отдельным действием по правам; публичных выдач не добавлено.

## Права и scope (план §10)

| Слой | Модуль | Содержание |
|---|---|---|
| Worker | workers/api/src/lib/permissions.ts | Роли, capabilities, requireAdmin/requireCapability/requireTeachingCapability; teacher не получает admin-поверхностей |
| Worker | workers/api/src/lib/teacher-scope.ts | Область преподавателя из teacher_assignments + homeworks.assigned_teacher; fail-closed, если таблицы нет |
| Worker | workers/api/src/lib/content-access.ts | Владение контентом: teacher правит только своё; опубликованное — менеджер контента |
| Worker | routes/admin.ts | overview — STRICT_ADMINS; вопросы — CONTENT_MODERATORS; лекции — requireContentOwnership |
| Worker | routes/groups.ts | Все операции записи групп/членства — requireAdmin |
| Worker | routes/subjects.ts | Каталог предметов (POST/PATCH/DELETE) — isCatalogAdmin (admin-only) |
| Worker | routes/admin-schedule.ts | Расписание (save/rollback/entries/analytics) — admin-only |
| Worker | routes/admin-attestations.ts | DELETE аттестаций — admin-only |
| Worker | routes/admin-parity.ts | Удаление ДЗ и файлов — requireContentOwnership (по created_by/uploaded_by) |
| Worker | routes/submissions.ts | grade/return — canReviewSubmission (цепочка попытка → задание → назначение → scope) |
| Worker | routes/teacher.ts | overview/submissions — teacher.results.view; assignments (чтение) — teacher.content.manage; assignments (создание/удаление) — requireAdmin; candidates — requireAdmin |
| Frontend | src/components/layout/Sidebar.tsx | Admin-консоль только admin; «Кабинет преподавателя» — teacher + admin |
| Frontend | src/components/admin/AdminGate.tsx, AdminNav.tsx | Гейт и навигация админ-консоли согласованы с backend |
| Frontend | src/lib/admin/access.ts | STAFF_ROLES сохранён для существующих потребителей; Admin-UI-условия разделены |
| DB | supabase/migrations/20261105090000_teacher_assignments.sql | Таблица назначений, RLS, security-definer хелперы, grants |

## Таблицы и миграции

- `teacher_assignments` (новая, аддитивная): teacher_id → group_id/student_id (ровно одна цель), role (teacher/curator/assistant), created_by; уникальные индексы; RLS: select — сам преподаватель/студент/admin, запись — только admin.
- `homeworks.assigned_teacher` (новая колонка, аддитивная) — явный проверяющий, перекрывает групповую область.
- Существующие таблицы, банки, попытки, результаты, URL — без изменений.

## Связанные документы

- Аудит shared-слоя: docs/architecture/SHARED-LAYER-AUDIT-2026-11-05.md
- Целевая модульная архитектура: docs/architecture/MODULE_ARCHITECTURE.md
- Статус: MODULAR_MIGRATION_STATUS.md; остаток: MODULAR_MIGRATION_BACKLOG.md
