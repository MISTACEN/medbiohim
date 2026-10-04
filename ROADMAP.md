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

Актуальные документы:
- docs/FULL-AUDIT-2026-10-04.md — первый полный аудит;
- docs/DEEP-AUDIT-2-2026-10-04.md — повторный аудит скрытых следов функций и UI coverage;
- docs/UNFINISHED-REGISTRY.md — актуальный реестр;
- docs/API-COVERAGE-2026-10-04.md — API coverage.

## Что из старых P0 уже закрыто

- ✅ literal escaped newline в HistologyTrainer.tsx;
- ✅ frontend /api-compat calls удалены;
- ✅ homework mock-data удалён;
- ✅ sequential bank flow синхронизирован с preparation;
- ✅ structured question options поддерживаются preparation/test flows;
- ✅ admin schedule save идёт через реальный /admin/schedule;
- ✅ frontend/ и spaceweb_upload/ удалены;
- ✅ dead mock/fixture/UI artifacts удалены;
- ✅ legacy QuestionBank service удалён;
- ✅ false-zero admin question/progress fallbacks закрываются explicit errors/degraded state.

## Что осталось

### P1 — target environment
- 🟡 проверить последнюю Vercel сборку;
- 🟡 проверить последнюю SpaceWeb backend deployment;
- 🟡 закрыть trainer media 404/502 физическим media smoke-test;
- 🟡 проверить AI provider chain end-to-end.

### P2 — product/architecture
- 🟡 общий document viewer для поддерживаемых форматов;
- 🟡 material metadata editor;
- 🟡 trainer card editor;
- 🟡 content version history/rollback UI;
- 🟡 bulk content validation;
- 🟡 duplicate route consolidation;
- ⚪ generic learning_sessions layer — удалить после проверки legacy consumers;
- 🟡 расширение chemistry data/content.

## Current CI baseline

Последний полностью завершённый code-check перед самым новым documentation-only commit:
- ✅ TypeScript;
- ✅ Next.js production build;
- ✅ PHP syntax (93 files);
- ✅ predeploy audit: no escaped-newline, no retired /api-compat, homework API-only;
- ✅ smoke.

Новый code-check после Deep Audit commit запущен отдельно; его итог нужно дождаться перед финальным production verdict.

## Порядок дальше

1. Дождаться зелёного code-check.
2. Проверить Vercel/SpaceWeb.
3. Закрыть media.
4. Закрыть AI provider runtime.
5. Потом делать P2 product/architecture cleanup.
# Deep audit 3 — 2026-10-04

Полный новый отчёт: docs/DEEP-AUDIT-3-2026-10-04.md.

### Исправлено в третьем проходе
- ✅ shadowed domain routes consolidated;
- ✅ broken /admin/lectures/assist removed;
- ✅ legacy schedule writes removed;
- ✅ duplicate schedule import removed;
- ✅ generic session frontend helpers removed;
- ✅ search-param static-render risk removed from admin/settings;
- ✅ live Supabase integrity checked: no orphan test links, no missing material files, no missing trainer image paths.

### Remaining real work
- 🔴 delivery lag: Vercel production still points to an older commit;
- 🟡 SpaceWeb deploy must complete once on the final stable commit;
- 🟡 histology media requires real SpaceWeb/B2 file smoke;
- 🔴 AI provider runtime availability requires credentials/upstream access;
- 🟡 generic DOCX/PDF viewer for non-histology materials;
- 🟡 mobile schedule agenda;
- 🟡 polished subject-plan/material/trainer-card editors and visual version history.
## P0 blockers confirmed

- ✅ literal escaped newline in HistologyTrainer fixed; latest Code Checks are green.
- ✅ active frontend /api-compat calls removed.
- ✅ sequential bank/preparation contract is covered by current preparation flow.
- ✅ homework production mock fallback removed.
- ✅ admin schedule save uses real /admin/schedule.
- 🟡 remaining P0-class work is external/runtime verification (media and AI credentials) rather than failing CI.

## P1/P2 cleanup confirmed
