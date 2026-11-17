# История работ MEDBIOHIM (сжатый журнал)

Сжато из MODULAR_MIGRATION_LOG/HANDOFF/STATUS и архивных статусов (2026-11-05…07). Детали — в [ROADMAP.md](../ROADMAP.md) и [PROJECT-MAP.md](PROJECT-MAP.md); архивные документы — в [docs/archive/](archive/).

## 2026-11-17 — портал предмета: паразитология

- Банк `parasitology-tests.json` расширен из исходного тренажёра «на сайт/паразиты»: +2 набора (18 гельминтов, 29 членистоногих), 8 диагностических параметров на вид, 87 вопросов КР. Старые 4 набора из `biotestkr` не тронуты.
- `MatchingTrainer`: третий режим «Контрольная» (мгновенная проверка ответа), тип `PortalMatchingTest.quiz` в `portalContent.ts`.
- Генератор `scripts/build-parasitology-bank.mjs` — воспроизводимая пересборка из источника (дедуп по id, извлечение `quiz`).
- Зависимости обновлены в пределах semver (next 15.5.29, vitest 5.1.0, postcss/autoprefixer/eslint-config-next — патчи). Мажоры (Next 16, Tailwind 4, TS 7) не поднимались.
- MC-банк паразитологии из `вопросы.txt`: 59 вопросов с 4 вариантами и подтверждённым ответом (15 тем-видов), `mc-biology-parasitology-arthropods-mc` + запись в `mc-index.json`; парсер `scripts/build-parasitology-mc.mjs`.
- Сверено покрытие остального: физика (`ticket-banks/physics.json`) включает все 89 вопросов из `physics.js` — интегрировать нечего; физиология (8 методичек + Агаджанян), гистология, латынь, хим-SDF и hoba уже в сайте.
- Неорганическая химия: вкладка «Оценка» с критериями экзамена и обзорами модулей 1–5 (`hoba-extra.json`, сборка `scripts/build-hoba-extra.mjs`); добавлен аудит `scripts/audit-portal-content.mjs` на легаси-разметку и ссылки на старые `.html`.
- Архивные лекции: убран легаси-хаб `bio-topic8` (навбар, модалки входа, ссылки на старые пути); в химии названия лекций вместо имён файлов (`topic1.html`), лабораторная по константе диссоциации переписана как конспект с формулами и ссылкой на `/chemistry/lab` — скрипты внутри `dangerouslySetInnerHTML` не исполняются, поэтому встроенный калькулятор был мёртвым.
 (11 уникальных файлов, 1.93 ГБ, sha256 + object key), сборка — `scripts/build-media-manifest.mjs`, дубли по sha256 отбрасываются. Загрузка не выполнялась (нужны secrets).
- Тест `src/components/portals/__tests__/MatchingTrainer.test.tsx` (5 кейсов) на режим «Контрольная»; полный прогон: vitest 710, node --test 335.
- Проверки: typecheck, lint (0 ошибок), build — зелёные; банк отдаётся 200, режимы «Таблица/Экзамен/Контрольная» проверены в браузере, MC-банк — в списке тестов биологии. Документация: `docs/PORTAL-CONTENT-SOURCES.md`.

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
