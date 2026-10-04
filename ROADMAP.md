# MEDBIOHIM ROADMAP

> Единый план проекта и источник порядка по задачам.  
> Обновляется вместе с изменениями в коде/БД.  
> Дата актуализации: **2026-10-04**.

## Как читать статус

- ✅ **DONE** — реализовано и проверено в живой системе.
- 🟡 **IN PROGRESS** — часть готова, требуется доработка или проверка.
- 🔴 **BLOCKED** — есть конкретный блокирующий дефект/зависимость.
- ⬜ **TODO** — ещё не делали.
- ⚪ **DEFERRED** — сознательно отложено.

Правило: задача получает ✅ только после проверки результата в целевом окружении. Сам факт коммита не считается проверкой.

---

## 0. Source of truth и порядок работы

**Статус: 🟡 IN PROGRESS**

Цепочка проекта:

`GitHub main → Vercel → SpaceWeb API → Supabase`

Правила:
- `main` — стабильный источник для production.
- `beta` — только эксперименты.
- данные предметов и контента считаются актуальными только после проверки Supabase.
- файлы/медиа, которые физически лежат на SpaceWeb, документируются отдельно.
- перед крупными изменениями сначала обновляем roadmap/status.

---

## 1. Базовая платформа и авторизация

**Статус: 🟡 IN PROGRESS**

### Уже сделано
- ✅ React/Next.js frontend в корне репозитория.
- ✅ PHP backend в `backend/`.
- ✅ Supabase подключён.
- ✅ Auth flow и текущая структура пользовательских ролей существуют.
- ✅ Основные API-модули: auth, me, groups, subjects, tests, homeworks, files.
- ✅ Исправлен legacy test-key resolution (`local:` / `source_key`).
- ✅ Исправлен `AccountSettingsService::getPreferences()`.
- ✅ Настроен deployment workflow backend → SpaceWeb.
- ✅ TLS для HTTP-клиента больше не отключается автоматически.

### Осталось
- 🟡 пройти полный smoke-test логин → dashboard → logout;
- 🟡 проверить production после последнего frontend commit;
- 🟡 зафиксировать единую схему env/secrets для Vercel + SpaceWeb;
- 🟡 устранить оставшиеся runtime 404/502 по медиа.

---

## 2. Главная / общий shell

**Статус: 🟡 IN PROGRESS**

- ✅ Sidebar / TopBar / AppShell существуют.
- ✅ Страница предмета использует единый контекст предмета.
- ✅ Базовая визуальная система сохранена стабильной.
- 🟡 **Aero Glass** добавлена только как **β-тема**, не как production default.
- ⬜ после стабилизации функционала провести отдельный UI-аудит всех страниц.

---

## 3. Расписание

**Статус: 🟡 IN PROGRESS**

### Уже сделано
- ✅ расписание берётся из Supabase;
- ✅ group-aware загрузка;
- ✅ День / Неделя / Месяц / Семестр;
- ✅ выделение текущего занятия;
- ✅ карточка занятия с темой;
- ✅ subject/lesson-plan связь;
- ✅ в Supabase для гистологии есть 37 schedule entries.

### Осталось
- 🟡 production smoke-test после последних изменений;
- 🟡 проверить все чередующиеся пары и объединённые пары визуально;
- 🟡 довести mobile view до полноценного agenda-режима;
- ⬜ отдельный polish расписания после функциональной стабилизации.

---

## 4. Архитектура предмета

**Статус: 🟡 IN PROGRESS**

Цель:

`Предмет → Учебный план → Билеты → Тесты → Практика → Лекции → Материалы → Микропрепараты → SRS → Прогресс`

### Уже сделано
- ✅ разделы остаются внутри выбранного предмета;
- ✅ не нужно заново выбирать предмет при переходах;
- ✅ гистология использует canonical active subject;
- ✅ пустая дублирующая запись `histology` на 4 семестр отключена;
- ✅ canonical active subject: 2 курс / 3 семестр.

### Осталось
- 🟡 одинаковый UX для всех предметов;
- 🟡 связать элементы учебного плана с контентом предмета;
- ⬜ предметная страница как единый learning hub.

---

## 5. Гистология

**Статус: 🟡 IN PROGRESS — основной текущий контентный приоритет**

Фактическое состояние Supabase на 2026-10-04:
- ✅ 350 `exam_questions`;
- ✅ 5 `ticket_banks`;
- ✅ 206 опубликованных trainer feed cards;
- ✅ 27 опубликованных материалов;
- ✅ 30 карточек относятся к канонической предметной связке тренажёра/атласа;
- ✅ 9 опубликованных тестов по гистологии;
- ✅ 14 модулей учебного плана;
- ✅ 37 записей расписания по гистологии.

### Архитектура
- ✅ **Микропрепараты → Атлас** — полноценный атлас только контента тренажёра.
- ✅ **Микропрепараты → Тренажёр** — режимы выбора тем/карточек, последовательное прохождение, история.
- ✅ подробные файлы ведут в **Материалы**;
- ✅ DOCX viewer реализован;
- ✅ фото и документы доступны внутри предмета.

### Осталось
- 🟡 проверить соответствие всех 30 карточек плану занятий;
- 🟡 проверить все 28 электронограмм и captions;
- 🟡 проверить полноту тестов 96 + 67 без потери существующих тестов;
- 🟡 пройти UI smoke-test атлас → материал → документ → назад;
- 🟡 решить 404/502 локальных медиа на SpaceWeb;
- ⬜ сделать окончательную матрицу: тема → лекция → препарат → ЭМ → вопросы → тест.

---

## 6. Тесты и банк вопросов

**Статус: 🟡 IN PROGRESS**

### Уже сделано
- ✅ 855 опубликованных questions;
- ✅ test/question backend;
- ✅ режим банка;
- ✅ нумерация;
- ✅ последовательное прохождение;
- ✅ history/attempt flow;
- ✅ admin editing groundwork;
- ✅ legacy test IDs через `source_key`.

### Осталось
- 🟡 проверить каждый published test на открытие;
- 🟡 довести admin quick-edit вопросов;
- 🟡 объединить bank / проход / разбор в один UX;
- ⬜ массовая валидация ссылок test → questions;
- ⬜ пользовательские отчёты об ошибках вопроса.

---

## 7. Материалы

**Статус: 🟡 IN PROGRESS**

- ✅ материалы доступны внутри предмета;
- ✅ гистология имеет отдельный materials UI;
- ✅ документы и фото разделены;
- ✅ DOCX можно открывать на сайте;
- ✅ предусмотрен переход к оригиналу/файлам.

Осталось:
- 🟡 полноценный viewer для DOCX без потери структуры;
- 🟡 корректная выдача локальных файлов через SpaceWeb;
- ⬜ связать материалы с темами учебного плана.

---

## 8. AI-тьютор

**Статус: 🔴 BLOCKED / 🟡 IN PROGRESS**

Есть backend chain:
`groq → gigachat → gemini → mistral → openrouter`

Известные проблемы:
- Groq: возможен 403;
- GigaChat: модель переключена на `GigaChat-2-Max`;
- Gemini: direct mode не подходит для RU SpaceWeb, нужен proxy;
- Mistral: требуется повторная диагностика runtime body;
- OpenRouter: возможен security-policy 403.

План:
1. ⬜ привести provider health к фактическому runtime состоянию;
2. ⬜ выбрать гарантированный primary provider;
3. ⬜ оставить fallback chain;
4. ⬜ проверить AI chat end-to-end;
5. ⬜ затем связывать AI с предметом/темой/вопросом.

---

## 9. Chemistry

**Статус: 🟡 IN PROGRESS**

- ✅ chemistry engine / PubChem resolver на main;
- ✅ basic chemistry routes;
- ✅ educational projection renderers;
- 🟡 часть сложных экспериментальных UI остаётся в beta;
- ⬜ стабилизировать все chemistry tests;
- ⬜ устранить/проверить provider-related AI errors внутри chemistry flow.

---

## 10. Admin / CMS

**Статус: 🟡 IN PROGRESS**

Уже есть:
- ✅ users/roles;
- ✅ schedule CMS;
- ✅ subjects;
- ✅ content/work tools;
- ✅ question admin groundwork.

Следом:
- ⬜ единый Content Center;
- ⬜ quick edit question/answer;
- ⬜ edit material;
- ⬜ edit lesson;
- ⬜ edit trainer card;
- ⬜ audit/history изменений;
- ⬜ массовые операции.

---

## 11. Media / SpaceWeb

**Статус: 🟡 IN PROGRESS**

- ✅ backend media route;
- ✅ B2 integration exists;
- ✅ prepared clean `content/histology` package;
- 🟡 physical histology media still require SpaceWeb-side verification;
- 🟡 trainer feed image 404/502 must be closed.

---

## 12. Documentation / cleanup

**Статус: 🟡 IN PROGRESS**

Новая система:
- `ROADMAP.md` — что делаем и в каком порядке;
- `PHASES_STATUS.md` — текущее состояние фаз;
- `docs/README.md` — карта документов;
- `BRANCHES.md` — правила main/beta;
- `docs/ACTIVE-EXPERIMENTS.md` — только актуальные beta-эксперименты.

Временные GPT handoff / base64 artifact docs больше не должны быть source of truth.

---

# Порядок следующих работ

## NEXT 1 — Stability
1. ⬜ Vercel production build/smoke.
2. ⬜ login/logout.
3. ⬜ dashboard.
4. ⬜ schedule.
5. ⬜ subject page.
6. ⬜ tests.
7. ⬜ histology atlas/materials.
8. ⬜ media.

## NEXT 2 — Histology completion
1. ⬜ EM/captions audit.
2. ⬜ plan ↔ content mapping.
3. ⬜ tests/question bank audit.
4. ⬜ material viewer polish.

## NEXT 3 — Admin CMS
1. ⬜ questions quick-edit.
2. ⬜ materials edit.
3. ⬜ lessons edit.
4. ⬜ trainer cards edit.

## NEXT 4 — AI
1. ⬜ provider health.
2. ⬜ guaranteed primary provider.
3. ⬜ fallback.
4. ⬜ context-aware tutor.

## NEXT 5 — UI
1. ⬜ only after functionality is stable.
2. ⬜ Aero Glass remains beta until explicitly promoted.
3. ⬜ audit every screen against one design system.

---

# Definition of Done

Проект не считается «готовым», пока:

- [ ] production build зелёный;
- [ ] login работает;
- [ ] Vercel → SpaceWeb → Supabase работает;
- [ ] расписание работает;
- [ ] каждый раздел предмета открывается без повторного выбора предмета;
- [ ] тесты/банк работают;
- [ ] материалы открываются;
- [ ] histology atlas/trainer work end-to-end;
- [ ] media 404/502 закрыты;
- [ ] admin can fix content;
- [ ] AI has at least one verified provider;
- [ ] документация отражает фактическое состояние.


# Audit update — 2026-10-04

Полный отчёт: docs/FULL-AUDIT-2026-10-04.md.
Реестр: docs/UNFINISHED-REGISTRY.md.
API audit: docs/API-COVERAGE-2026-10-04.md.

## P0 blockers confirmed
- P0: literal escaped newline in src/components/trainers/HistologyTrainer.tsx:248 breaks Code Checks before typecheck/build.
- P0: historical /api-compat layer in src/lib/api.ts is used by real user/admin flows.
- P0: sequential bank flow does not match the preparation page contract.
- P0: preparation UI does not match structured question/options returned by backend.
- P0: homework has a production mock fallback.
- P0: admin schedule save uses the missing /api-compat route.

## P1/P2 cleanup confirmed
- P1: two backend deploy workflows.
- P1: divergent spaceweb_upload copy.
- P1: trainer media 404/502.
- P1: AI provider runtime failures.
- P2: stale frontend shadow tree.
- P2: unused Sparkline.tsx.
- P2: unused chemistry fixtures.
- P2: stale deploy/hotfix docs.
- P2: organic chemistry placeholder ID map.

## Revised next order
1. Clean runtime/API and restore green Code Checks.
2. Fix preparation and sequential modes.
3. Remove production mock fallbacks.
4. Consolidate deploy/source copies.
5. Close media and AI.
6. Remove dead/legacy code and stale docs.
7. Return to product roadmap.
