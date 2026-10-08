# PROJECT SOURCE-OF-TRUTH AUDIT — 2026-10-07

## Цель

Этот документ фиксирует не только реализованные функции, но и **архитектурные правила, пользовательские требования и остаточные риски**, которые были найдены при сверке текущего GitHub-кода, существующих audit-документов и логики продукта.

Документ нужен, чтобы при следующих изменениях не потерять смысл проекта и не принять частичную реализацию за завершённую.

---

# 1. Предметная модель

## 1.1. Каждый предмет — отдельный контекст

Постоянное правило:

> Гистология имеет собственный банк вопросов и собственные тесты. Химия имеет собственный банк вопросов и собственные тесты. Будущие предметы работают так же.

Идентичность предмета должна определяться каноническим `subject_id`/UUID; slug используется как routing/display hint, а не как единственный глобальный идентификатор.

## 1.2. База вопросов и тест — разные сущности

**База вопросов:**
- полный опубликованный банк;
- правильный ответ виден без запуска теста;
- поиск/фильтрация/пагинация;
- темы и вопросы только текущего предмета;
- открытие вопроса не создаёт попытку;
- жалоба привязывается к `question_id`.

**Тест:**
- отдельная попытка;
- сохранение ответов;
- серверная проверка;
- результат;
- история.

Это нельзя объединять в одну state machine.

---

# 2. Жалобы на вопросы

Реализован и зафиксирован отдельный поток:

`question → report → question_id → admin/problems → correction`

API:

`POST /api/v1/questions/{id}/report`

Категории включают неверный ответ, формулировку, несколько правильных ответов, отсутствие правильного ответа, опечатку и другое.

Жалоба должна работать:
- из базы вопросов;
- из теста;
- из подготовки.

Администратор является единственным контуром обработки/изменения содержимого.

---

# 3. Умная проверка свободного ответа

Единый `AnswerGradingService` используется для обычных тестов и preparation.

Правила:
- MCQ проверяется детерминированно;
- точное нормализованное совпадение не вызывает AI;
- орфография и регистр не должны влиять на результат;
- для свободного ответа AI сравнивает смысл, а не буквальную строку;
- допускаются синонимы, нормальные сокращения, другой порядок слов и грамматические формы;
- при недостаточной уверенности результат не должен превращаться в ложный правильный/неправильный;
- ошибка AI не должна терять ответ пользователя;
- финальный score рассчитывается сервером.

AI — **не обязательная часть каждого ответа**. Детерминированный путь имеет приоритет.

---

# 4. Историческая воспроизводимость тестов

После старта теста/preparation используются immutable question snapshots.

Нельзя пересчитывать старую попытку по текущему содержимому вопроса после того, как администратор его исправил.

Сохраняются:
- group context;
- academic session;
- context version;
- question snapshot;
- answer snapshot для preparation.

Это обязательное правило для истории.

---

# 5. Академический контекст

Основной контекст:

`user → group → course/semester → academic session → subject → schedule lesson`

Правила:
- если активная группа одна — она может определиться автоматически;
- если групп несколько и `group_id` не указан — нельзя молча выбирать первую;
- subject UUID должен проверяться внутри выбранного group context;
- lesson/schedule entry должен проверяться относительно group/subject/date;
- progress, planner, attendance, homework, tests и preparation должны использовать один контекстный контракт.

Нельзя использовать название предмета как надёжный идентификатор.

---

# 6. Расписание + задания

Текущее приложение уже имеет planner/homework/attendance поверх schedule, но продуктовый целевой UX должен быть зафиксирован отдельно:

> **Расписание и Задания должны восприниматься пользователем как единый учебный план.**

Целевой сценарий:

`дата → занятие/предмет → задания этого занятия → создать/посмотреть → выполнить/сдать → статус`

В расписании пользователь должен сразу видеть:
- предмет;
- дату;
- пару;
- домашнее задание;
- статус выполнения;
- возможность открыть/сдать задание.

При создании задания из контекста занятия дата и subject должны подставляться из выбранного schedule entry.

Это является **целевым UX-контрактом**, даже если текущая реализация ещё требует доведения до полностью единого интерфейса.

---

# 7. Homework state

В коде существует личный completion state и submission state.

Каноническое пользовательское состояние уже вычисляется как:
- `pending`;
- `done`;
- `submitted`;
- `returned`;
- `graded`.

Правило:

> UI не должен показывать противоречивые статусы из двух таблиц.

`homework_progress.completed` и `homework_submissions.status` остаются физически разными источниками, но наружу должен выходить один derived `my_status`.

---

# 8. Schedule session integrity — остаточный риск

В историческом audit-коде отмечено, что `schedule_entries.session_id` может быть nullable и не все исторические записи были автоматически reconciled с academic session.

Это не считать закрытым только потому, что текущий resolver умеет выбирать session.

Следующая schedule-проверка должна гарантировать:
- group;
- course;
- semester;
- academic session;
- date;
- schedule version

не противоречат друг другу.

---

# 9. Хранение файлов

## Supabase Free

Используется прежде всего как:
- PostgreSQL;
- metadata;
- questions/tests;
- users/groups/academic data;
- content references.

Не требуется складывать весь большой media archive в Supabase.

## SpaceWeb

Физический Histology media root:

`/public_html/content/histology/`

Большие JPG/PNG/DOCX могут храниться здесь.

Каноническая схема:

`Supabase metadata → PHP API → SpaceWeb physical file`

См.:
`docs/HISTOLOGY-CONTENT-MANIFEST.md`

---

# 10. Histology content

Подтверждено:
- 206 trainer cards;
- 178 preparation cards;
- 28 EM;
- 28 EM captions;
- физический root на SpaceWeb;
- source-materials;
- electronograms;
- em alias;
- 5_Фотографии препаратов.

Исходный `content.zip`:
- 444 файлов;
- 323 JPG;
- 62 PNG;
- 4 JPEG;
- 52 DOCX;
- 389 изображений;
- 207 уникальных binary images после дедупликации.

Остаточная проверка:

`archive → SpaceWeb file → source_key/imagePath → API → HTTP/MIME`

Пока нельзя считать все 206 карточек полностью verified только по наличию metadata.

---

# 11. Materials

Metadata в Supabase и физический файл — разные уровни.

Особенно важно для ранее выявленной проблемы:
- документы могут присутствовать в archive;
- metadata Materials может присутствовать;
- но `external_url`/physical path может отсутствовать или быть неправильным.

Поэтому для Materials обязательна проверка:
`material → physical file → API/URL → HTTP 200 → MIME`.

---

# 12. Chemistry master catalog

Единый каталог химии:
- 260 open tasks;
- 176 published test questions;
- 436 элементов;
- provenance по источникам;
- formula preservation policy.

Исходные scanned PDFs не имеют надёжного native text layer; OCR не считается единственным источником истины.

Структурные формулы нельзя выдумывать по плохому OCR.

Production questions не должны заменяться master catalog автоматически: каталог является additive/source/provenance layer, пока отдельно не принято решение сделать его scoring source.

---

# 13. Roles и доступ

Основные роли:
- student;
- teacher;
- moderator;
- admin.

Админские изменения должны быть защищены server-side role check, а не только скрытием кнопки во frontend.

Обычный авторизованный пользователь может:
- изучать свою предметную базу;
- видеть правильные ответы;
- отправлять жалобы.

Обычный пользователь не должен получать административное право редактировать canonical question bank.

---

# 14. Auth и release gate

Наличие routes в GitHub не означает рабочий production auth.

Обязательный release gate:
- register;
- login;
- refresh/logout;
- `/api/v1/me`;
- roles;
- groups;
- course/semester;
- production bearer auth.

Особенно важно после исторических регрессий:
- `AccountSettingsService::getPreferences()`;
- Router type mismatch;
- duplicate `/api/v1/me`.

---

# 15. Runtime/deployment truth

Нельзя считать production готовым только потому, что GitHub содержит исправленный код.

Текущий документированный gate:
- GitHub workflow definition существует;
- доступных workflow runs для последних изменений недостаточно для доказательства green CI;
- Vercel connected API ранее возвращал 403 для deployment operations;
- SpaceWeb runtime является отдельным target gate.

Правило:

> source verified ≠ deployed verified.

Для релиза нужен fingerprint/commit, который совпадает:
`GitHub → Vercel/SpaceWeb runtime`.

---

# 16. Build quality

В `next.config.ts` сейчас включено:

- `eslint.ignoreDuringBuilds = true`;
- `typescript.ignoreBuildErrors = true`.

Это означает:

> успешный production build сам по себе не доказывает отсутствие TS/ESLint ошибок.

CI должен отдельно выполнять typecheck/lint. После очистки ошибок suppression следует вернуть в strict mode.

---

# 17. Timezone

В проекте исторически используется `Asia/Vladivostok` для расписания/дашборда и некоторых legacy data utilities.

Это соответствует текущему учебному контексту Хабаровска, но является hardcoded application setting.

Правило на будущее:
- timezone должна быть централизованной настройкой academic context;
- frontend/backend/data import не должны независимо хардкодить разные timezone;
- изменение timezone не должно менять сохранённые UTC timestamps неконтролируемо.

---

# 18. Mobile UX

Mobile responsive код существует, но автоматическое browser proof ещё не является полноценным доказательством.

Обязательные контрольные устройства/режимы:
- iPhone Safari;
- Android Chrome;
- desktop Chrome/Edge/Firefox/Yandex;
- Windows/macOS;
- light/dark;
- admin pagination;
- tests/preparation;
- trainers;
- Materials;
- schedule/homework.

Отдельно контролировать:
- чёрные/неуместные области на iPhone;
- наложение текста/теории;
- loading states;
- subject loading;
- answer/preparation delays.

---

# 19. Не смешивать content layers

Нужно различать:

1. canonical DB metadata;
2. GitHub source/config;
3. SpaceWeb physical media;
4. Vercel frontend;
5. production API runtime.

Ошибка одного слоя не должна приводить к выводу, что отсутствует весь контент.

---

# 20. Обязательный reconciliation для контента

Для больших архивов, которые невозможно целиком прикреплять в чат, проверка должна работать по manifest/inventory.

Минимальный отчёт:

| Поле | Нужно |
|---|---|
| source archive path | да |
| physical SpaceWeb path | да |
| Supabase source_key | да |
| DB object/question/material id | да |
| expected MIME | да |
| actual file exists | да |
| HTTP status | да |
| orphan/missing | да |
| duplicate/alias | да |

Это позволяет проверять огромный архив частями без повторной загрузки всего архива.

---

# 21. Документационная дисциплина

Каждое важное продуктовое правило должно иметь один канонический документ.

Не создавать пять документов с разными версиями одного требования.

При изменении логики:
1. изменить код;
2. проверить runtime/DB;
3. обновить канонический документ;
4. при необходимости обновить ROADMAP/PHASES_STATUS;
5. старый audit оставить как исторический отчёт, не выдавая его за текущее состояние.

---

# 22. Что сейчас считать закрытым / открытым

## 🟢 Зафиксировано и реализовано/подтверждено

- предметные банки;
- отдельный режим базы вопросов;
- просмотр правильных ответов без теста;
- жалобы на конкретный вопрос;
- admin problem center;
- immutable test/preparation snapshots;
- server-authoritative scoring;
- optional AI grading;
- academic group context;
- group-scoped tests/progress/planner;
- Supabase Free + SpaceWeb media architecture;
- Histology media root;
- chemistry master catalog/provenance;
- duplicate `/api/v1/me` cleanup.

## 🟡 Зафиксировано, но требует дальнейшей проверки/доведения

- полное физическое reconciliation Histology archive;
- Materials documents/photos → physical files → API;
- schedule session/semester consistency for all historical data;
- единый конечный UX расписание + задания;
- production auth after exact deployment;
- Vercel/SpaceWeb runtime verification;
- CI evidence for latest commit;
- strict TypeScript/ESLint;
- centralized timezone;
- full mobile/browser acceptance;
- проверка всех предметных контекстов на cross-subject leakage.

---

# 23. Главный принцип

MEDBIOHIM — это не набор отдельных страниц.

Канонический пользовательский поток:

`auth → group → semester/session → subject → curriculum topic → materials/questions → practice/test → homework/schedule → progress → complaints/correction`

Каждая сущность должна сохранять свой предметный и академический контекст на всём пути.

Любая новая функция должна пройти проверку:
- subject scope;
- group scope;
- permission scope;
- historical reproducibility;
- source-of-truth;
- mobile UX;
- runtime/deployment.


# 24. Zero-cost / full-functionality architecture

Это обязательное продуктовое ограничение: **$0 обязательных расходов при сохранении полного функционала**.

Канонический бесплатный стек:
- GitHub Free;
- Vercel Hobby;
- SpaceWeb Free;
- Supabase Free;
- Backblaze B2 Free allowance.

Главный принцип: не урезать функцию из-за free-tier. Сначала оптимизировать хранение, кэширование, batching, lazy loading, streaming, дедупликацию и распределение нагрузки.

AI не является обязательной платной зависимостью. Базовые функции должны работать без него; smart grading использует deterministic путь там, где он достаточен.

Для media разрешено выбирать между SpaceWeb и B2 по размеру, нагрузке и лимитам. Supabase не должен становиться обязательным хранилищем большого бинарного архива.

При достижении free-tier лимита нельзя допускать незаметный расход. Нужны лимиты/защита/graceful degradation.

Полная политика: docs/FREE-TIER-FULL-FUNCTIONALITY-POLICY-2026-10-07.md.


# 25. Unified media viewer contract — 2026-10-08

The media viewer is now treated as a cross-platform product contract, not an iPhone-specific patch.

Required architecture:

card/inline image → one unified viewport viewer → controls/zoom/pan/close → optional material action

Forbidden for image viewing:
- nested image modal inside another image modal;
- max-h-[90vh] outer modal that forces the user to scroll to the image;
- reliance on native Fullscreen API as the only way to get a viewport-sized viewer.

Required behavior:
- desktop and mobile use the same viewer contract;
- 100dvh + safe-area;
- explicit controls are visible at first open;
- zoom and reset work without native fullscreen;
- enlarged images can be panned;
- touch uses Pointer Events; native fullscreen is optional enhancement;
- original/high-detail medical images must not be aggressively downscaled by the viewer itself.

Current state: implemented in branch, not target-runtime verified.
