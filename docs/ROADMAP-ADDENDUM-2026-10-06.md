# MEDBIOHIM — ROADMAP ADDENDUM: скрытые разрывы и следующий этап — 2026-10-06

## Главная цель

Перевести проект от стадии «много реализованных функций» к стадии **связной образовательной системы, где каждая функция имеет полный жизненный цикл**.

## 1. Сначала стабилизация

### P0
- 🔴 подтвердить текущий main через GitHub Code Check;
- 🔴 подтвердить Vercel READY на актуальном commit;
- 🔴 проверить SpaceWeb auth/router/media;
- 🔴 пройти login → group → schedule → subject → test → homework → progress → logout.

Новые функции не должны маскировать production regressions.

---

## 2. Report / moderation system

### P0 — сделать следующим крупным функциональным блоком

Целевой контур:

`student report`
→ `context snapshot`
→ `admin queue`
→ `review`
→ `work item`
→ `edit`
→ `validation`
→ `publish`
→ `resolve`
→ `student notification`.

### Обязательные данные report

- reporter;
- question;
- test/bank;
- preparation session;
- mode;
- question position;
- student's answer;
- question snapshot;
- created_at;
- status;
- reviewer;
- resolution;
- work item.

### Acceptance

Жалоба из каждого тестового режима должна появляться в админке с достаточным контекстом для исправления без повторного поиска вручную.

---

## 3. Новая архитектура админки

Не расширять текущую боковую панель бесконечно.

### Главные разделы

**Главная**
- критические проблемы;
- новые жалобы;
- pending works;
- validation errors;
- system health.

**Учебная структура**
- пользователи;
- группы;
- предметы;
- учебный план;
- расписание;
- посещаемость.

**Контент**
- тесты;
- вопросы;
- экзамен;
- билеты;
- материалы;
- тренажёры;
- лекции.

**Модерация**
- жалобы;
- работы;
- student content;
- confirmation queue.

**Интеграции**
- Telegram;
- AI;
- storage/media.

**Импорт**
- Excel;
- package;
- migration;
- validation.

**Система**
- health;
- presence;
- audit;
- DB tools;
- rollback.

---

## 4. Unified Content Item

Создать концепцию единого контентного объекта.

Для вопроса администратор должен видеть:

- текст;
- варианты;
- правильные ответы;
- тип;
- предмет;
- модуль;
- тему;
- источник;
- тесты, где используется;
- жалобы;
- историю;
- статус публикации;
- архив;
- версии.

Это устранит разрыв между question editor, test editor и problem center.

---

## 5. Documentation source of truth

Текущие counts не должны вручную дублироваться в нескольких документах.

Создать автоматический snapshot:

- дата;
- commit;
- subjects;
- tests;
- questions;
- exam_questions;
- materials;
- trainer cards;
- ticket banks;
- reports;
- work items;
- Telegram rows;
- migration state.

ROADMAP хранит **статус**, а snapshot хранит **цифры**.

---

## 6. Student-first development

После moderation:

1. identity;
2. group membership;
3. schedule;
4. homework;
5. tests;
6. progress;
7. student contribution.

Каждая новая функция должна быть привязана к группе/занятию, если это учебное действие.

---

## 7. Telegram

После identity/group:

`Telegram → group → date/time → schedule entry → subject → homework`.

Нужен отдельный `TelegramHomeworkResolver`.

Низкая уверенность:

**candidate → confirmation → published homework**,

а не автоматическое создание официального ДЗ.

---

## 8. Definition of Done

Функция считается DONE только если:

- UI есть;
- API есть;
- DB persistence есть;
- права проверяются;
- RLS проверен;
- loading/error/empty states есть;
- mobile state есть;
- повторная отправка безопасна;
- refresh/recovery работает;
- администратор получает нужный контекст;
- пользователь получает результат;
- E2E сценарий пройден.

---

## Приоритет продвижения проекта

### Этап A — Stability
Production / auth / deployment.

### Этап B — Trust
Reports / moderation / audit / versioning.

### Этап C — Content
Unified question/test/material editing + validation.

### Этап D — Student workflow
Group → schedule → homework → tests → progress.

### Этап E — Automation
Telegram registration + lesson resolver + homework.

### Этап F — Community
Student-generated knowledge + moderation.

### Этап G — Polish
Mobile, performance, animations, Aero Glass beta.

**Не наоборот.**

UI-полировка не должна опережать стабильность и доверие к учебным данным.


---

## Дополнение после SITE-WIDE hidden-gap pass

### Новые P1, найденные именно сценарным аудитом

- Исправить Admin → «Банк вопросов тестов»: /tests сейчас редиректит на /subjects.
- Запретить slug-only идентификацию предмета там, где в БД существуют одинаковые slug для разных семестров/курсов.
- OAuth-провайдеры в Settings отображать только по backend-confirmed availability.
- Сообщество: добавить student-side report/edit/delete и понятный moderation lifecycle.
- Homework: явно определить resubmission/replace submission после первой сдачи.
- Progress: доказать изменение метрик реальными действиями пользователя.
- Materials: унифицировать открытие DOCX/PDF/image/HTML/original и degraded state физически недоступного файла.
- Tests: E2E пройти все входные пути, а не только отдельный API.

### Новая проверка каждого раздела

Перед статусом DONE проверять пять связей:

student identity → academic context → content entity → action/result → recovery/moderation

Если одна связь отсутствует, функция считается partial, даже если UI и endpoint существуют.

### Release gate

Следующий production release не продвигать только по успешной сборке. Нужны одновременно:

1. green Code Check;
2. green smoke;
3. актуальный Vercel READY;
4. актуальный SpaceWeb health/auth smoke;
5. authenticated student smoke;
6. test → report → admin problem center E2E;
7. materials/media smoke;
8. отсутствие новых route/redirect conflicts.


---

## Дополнительный semantic pass — новые задачи

### P0/P1 — Сообщество должно быть group-scoped

Сейчас create/list community flow не передаёт и не фильтрует `group_id`, хотя схема уже предусматривает group context.

Цель:

`student identity → active group → group feed → author → comments → moderation`.

Нельзя оставлять ленту глобальной, если продукт позиционирует её как обсуждение группы.

Также нужно вернуть автора, потому что текущий API может привести UI к fallback «Студент».

### P1 — Посещаемость: self-report ≠ официальный факт

Студент сейчас может сам создать/изменить `present/excused/sick/unexcused`.

Нужно:
- self-reported status;
- confirmed status;
- подтверждение starosta/teacher/admin по политике;
- история изменения.

### P1 — ДЗ: единая модель состояний

Разделить:
- personal completion;
- submission;
- grading;
- return/resubmission.

При нескольких группах создание ДЗ должно работать для выбранной группы, а не автоматически брать первую membership.

### P1 — Прогресс

Зафиксировать единую формулу. Backend сейчас считает overall через subject progress/ledger, тогда как UI объясняет его через ДЗ и тесты.

Дополнительно фильтровать ДЗ по академическому scope пользователя.

### P1 — Practice / Schedule

- Practice: subject UUID вместо slug-only.
- Schedule: active academic session вместо захардкоженного 2026-09-01 → 2027-01-31.
- Schedule timezone должен быть частью академического контекста, а не константой компонента.

### P1 — Личные функции

- Notes: добавить удаление/очистку.
- Favorites: whitelist target types + проверка target existence.

### P1 — Generic sessions

Ввести whitelist status и state transitions, чтобы не повторять класс ошибок вроде недопустимого `cancelled`.

### P1 — AI transparency

Показывать пользователю источник плана:
- AI;
- rule engine;
- cached/stale.

### P2 — Activity E2E

Проверить реальные циклы:
- SRS;
- trainer answers;
- AI chat;
- progress;
- attendance;
- comments.

Пустая таблица не означает broken feature, а непустая таблица не означает complete feature.

## Новый порядок продвижения

1. **Stability** — runtime/auth/deploy.
2. **Trust** — reports/moderation/attendance confirmation.
3. **Academic context** — group/semester/subject identity.
4. **Core learning** — tests/homework/progress.
5. **Community** — posts/comments/student moderation.
6. **Automation** — Telegram/AI/SRS.
7. **UI polish** — mobile/performance/themes.

UI не должен опережать исправление semantic context и lifecycle.


## Pass 4–5 code-contract additions

- P0: prove SpaceWeb runtime artifact matches current Router source; do not mask the router regression by weakening type hints.
- P0/P1: make HomeworkRepository and SupabaseRest fallback enforce the same group/membership/identity semantics.
- P0: distinguish backend unavailable from valid empty data in every fallback chain.
- P1: expand route CI from duplicate detection to first-match shadowing/order conflicts.
- P1: remove/contain Next production build suppression of TypeScript and ESLint errors after CI cleanup.
- P1: replace subject name/slug identity with UUID in planner recovery and SRS.
- P1: verify runtime build fingerprint against exact deployed commit.
- P1: apply the student-first rule consistently: self-service first; optional starosta/group confirmation only for shared or disputed state.

See `docs/SEMANTIC-CODE-AUDIT-2026-10-06-PASS4-5.md` for the full two-pass audit.


## Pass 6 — security/state contract findings

P0: backend service-key routes must independently enforce RLS-equivalent authorization. New concrete gaps: homework submit lacks group-membership check; submitted file_id lacks access check; file upload accepts arbitrary group_id/visibility/specialty context; file download presigns B2 URL without group/visibility authorization; student homework creation contradicts live starosta-only RLS semantics.

P1: apiCached cache keys are path-only and stale fallback is global; restrict stale caching to proven public/stale-safe endpoints and include identity/context where needed. File list/download semantics must be aligned. Community global-vs-group visibility should become explicit.

Full evidence: `docs/SECURITY-STATE-AUDIT-2026-10-06-PASS6.md`.
