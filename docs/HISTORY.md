# История работ MEDBIOHIM (сжатый журнал)

Сжато из MODULAR_MIGRATION_LOG/HANDOFF/STATUS и архивных статусов (2026-11-05…07). Детали — в [ROADMAP.md](../ROADMAP.md) и [PROJECT-MAP.md](PROJECT-MAP.md); архивные документы — в [docs/archive/](archive/).

## 2026-11-07 — тестовый движок v2, кабинет, монолиты (несколько релизов)

- **Права/Access Control**: routes/teacher/ разделы, moduleGate на 15 разделах, /access/my-modules, /access/admin/* (выдача/отзыв/журнал), /admin/access. Регрессия «пустое меню админа» исправлена (staff получает полный реестр + фронт не фильтрует staff).
- **Кабинет преподавателя**: обзор/работы/оценка, «Мои студенты» (ростер + карточки с попытками), «Создать из банка» (свой тест), «Назначения тестов» (группы ↔ отдельные студенты, дедлайн/время/попытки/число вопросов), «Аналитика» (доля верных по вопросам), «CSV» (ведомость), лекции (RichLectureEditor), личный банк вопросов. Изоляция: Workshop — 403 для teacher.
- **Тестовый движок v2**: типы true_false/matching/cloze (серверный канон + реестр + грейдер), навигатор по вопросам, пометка, режим «Контрольный», авторский preview без записи попыток.
- **Детализация 1–4**: teacher_assignments.detail_level, PATCH /teacher/assignments/:id/detail, выбор в /admin/teachers.
- **Миграции применены к проду** (через одноразовый bootstrap с батчами; секрет удалён): teacher_assignments, module_access, teacher_catalog (tests.created_by/teacher_visible), test_assignments, result_detail_levels.
- **Монолиты**: routes/teacher.ts (1414) → routes/teacher/ (core/tests/assignments/assigned-tests/students/_shared). Остальные кандидаты — ROADMAP §Задача A.
- Воркер: версии …→ b03ea891; все проверки зелёные (worker 364, vitest 519, node 301, lint 0 err, build OK).

## 2026-11-06 — модульность, Shared, права

- Shared-слой: UI-кит (Button/Badge/Modal/Tabs/DataTable), question-types, file-engine (DOCX/XLSX/PPTX/CSV/TXT/архивы + security), AnswerOption/CheckResultPanel, реестр компонентов.
- Права воркера: permissions/teacher-scope/content-access; admin/groups/subjects/schedule/attestations закрыты от teacher; владение контентом; проверка работ по цепочке.
- Access Control: app_modules + user/group_module_access + audit (миграция), moduleGate на маршрутах, /admin/access.
- Мониторинг продов, регрессия админ-меню, e2e/roles.spec, смоук.

## 2026-11-05 — аудит и исходное состояние

- Аудит shared-слоя и архитектуры (SHARED-LAYER-AUDIT, MODULE_ARCHITECTURE — перенесены в archive/).
- Зафиксированы концепция «от студентов для студентов» и границы Teacher Workspace.

## До 2026-11-05 — унаследованное

- Workshop (Smart Paste, пакетная обработка, режимы модерации), Telegram-бот с классификацией ДЗ, химический движок, гистология/физиология/эмбриология, PWA, CI — унаследовано и сохранено; подробности в архиве.
