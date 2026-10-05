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
