# MEDBIOHIM ROADMAP

> Единый план проекта и источник порядка по задачам.  
> Обновляется вместе с изменениями в коде/БД.  
> Дата актуализации: **2026-10-06**.

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
- числовое состояние проекта хранится в `docs/LIVE-PROJECT-SNAPSHOT-2026-10-06.md`; roadmap/status не должны копировать устаревающие live counts.
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
- ✅ shared API refresh deduplicated; app bootstrap can recover a valid refresh session;
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
- ✅ two malformed bird-blastula links reconstructed from supplied source archive;
- 🟡 пройти UI smoke-test атлас → материал → документ → назад;
- 🟡 решить 404/502 локальных медиа на SpaceWeb;
- ⬜ сделать окончательную матрицу: тема → лекция → препарат → ЭМ → вопросы → тест.

---

## 6. Тесты и банк вопросов

**Статус: 🟡 IN PROGRESS**

### Уже сделано
- ✅ 735 опубликованных questions (live Supabase, 2026-10-05);
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
- ✅ массовая проверка целостности test → questions проведена; после dedup 118 однозначных связей восстановлены;
- ✅ malformed bird-blastula links reconstructed from supplied source; source answer retained verbatim and documented for review.
- ✅ пользовательские отчёты об ошибках вопроса: student UI + preparation + bank + admin problem center.

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


# Audit hardening update — 2026-10-05

- ✅ live Supabase RLS init-plan warnings reduced to 0;
- ✅ question_reports SELECT policies consolidated to reporter-or-admin;
- ✅ trainer_feed_answers RLS uses init-plan-safe auth.uid();
- ✅ admin_change_log and content_versions admin policies use init-plan-safe auth.uid();
- 🟡 44 unindexed FK advisor findings remain informational/performance work;
- 🟡 leaked-password protection remains a Supabase Auth setting to enable;
- ✅ public smoke workflow strengthened for /, /tests, /schedule, /subjects, /materials, /trainers and public API surfaces;
- 🟡 final production verdict still waits for green CI + Vercel READY + SpaceWeb/media smoke.


# Runtime regression update — 2026-10-05

- ✅ live preparation mode constraint now allows sequential;
- ✅ global loading indicator covers shared API requests across pages, not only tests;
- ✅ concurrent 401 refresh race hardened;
- ✅ subject/ticket Supabase REST transient retries added;
- ✅ supplied Гистология.zip inspected and used for malformed histology reconstruction;
- 🟡 newest post-fix Vercel deployment must be confirmed READY;
- 🟡 actual authenticated production smoke remains required because the connector cannot inspect the user's browser token/session.


- 2026-10-05: Histology ZIP cross-audit completed through current 3rd semester; materials UI now includes all source documents, next-semester content is retained but hidden by default, legacy DOC HTML mirrors prepared for SpaceWeb, and published duplicate test/question cleanup continued. SpaceWeb media upload remains a manual infrastructure step.


## Audit update — 2026-10-05, current-semester content reconciliation

### Гистология
Live active subject is **2 курс / 3 семестр**.

Current verified live counts:
- ✅ 14 modules / 19 plan topics;
- ✅ 80 published materials;
- ✅ 261 source rows from `Гистология.zip`;
- ✅ 178 preparation photo sources;
- ✅ 28 electronogram trainer cards with source documents/captions;
- ✅ 206 trainer cards total;
- ✅ 169 trainer cards explicitly marked current-plan;
- ✅ 37 future/out-of-current-plan cards retained but hidden by default;
- ✅ 273 published questions, 194 archived;
- ✅ 0 published source-less questions;
- ✅ 76 published exam questions;
- ✅ 8 published tests + 1 archived duplicate;
- ✅ 5 ticket banks retained;
- 🟡 0 generated tickets because source ZIP does not provide canonical ticket grouping.

### Materials
- ✅ complete source-document layer registered in Supabase;
- ✅ Materials categories separated into Schemes / EM / Methodicals / Tests / Exam / Photos;
- ✅ default UI is current 3rd semester;
- ✅ future content is retained and shown through “Весь курс”;
- ✅ module/topic-first sorting;
- ✅ mobile/iPhone form controls normalized to a light scheme;
- ✅ DOCX/HTML/image/PDF viewer paths covered;
- 🟡 physical SpaceWeb document payload upload remains external.

### SpaceWeb
Prepared archive:
`MEDBIOHIM_histology_spaceweb_3sem_content_patch.zip`

It contains the source DOC/DOCX/GIF layer from `Гистология.zip` plus HTML mirrors for legacy `.doc`. Existing photo/EM deployment media is intentionally not duplicated.

### Next acceptance test
After the archive is physically placed on SpaceWeb:
`/subjects → Гистология → Материалы → DOC/DOCX → Фото препаратов → back`
must be checked on iPhone and desktop. Only then move the Histology Materials item from 🟡 to ✅.


### Гистология — экзаменационный банк, Pass 8
- ✅ Current 3rd-semester exam bank reconciled to **366 published exam_questions**: 350 canonical rows + 16 unique ZIP additions.
- ✅ ZIP additions are deduplicated against the canonical bank; 100 exact-text duplicates are archived, while 16 unique additions remain published.
- ✅ Canonical bank subject links were restored after detecting 350 rows with `subject_id = NULL`; all 366 published rows now point to the active histology subject.
- ✅ 0 published exam questions without a source.
- 🟡 Future respiratory/skin/urinary/reproductive/later GI source questions remain retained in source documents but unpublished until the next-semester plan is activated.
- 🟡 Ticket banks remain metadata-only; `tickets=0` because no canonical ticket grouping manifest exists in the supplied source archive.


---

# 13. Student-first architecture — «от студентов для студентов»

**Статус: 🟡 IN PROGRESS — новая продуктовая ось**

Главный принцип MEDBIOHIM теперь формулируется так:

> Сайт не должен быть только «электронным деканатом» или CMS. Это рабочее учебное пространство, которое студенты наполняют и используют вместе.

Основной контур:

`Студент → аккаунт → учебная группа → расписание → предмет → занятие → ДЗ → выполнение → прогресс`

Дополнительный контур:

`Telegram группы → бот → сообщение/фото → распознавание → предмет → занятие → ДЗ → сайт`

### 13.1 Студент как основной участник

- 🟡 регистрация/вход;
- 🟡 привязка к учебной группе;
- 🟡 просмотр группового расписания;
- 🟡 создание и уточнение ДЗ студентами;
- 🟡 отметка «сделано»;
- 🟡 сдача работы;
- 🟡 сообщения/сообщество;
- ⬜ предложения исправлений/дополнений к контенту;
- ⬜ подтверждение информации другими студентами;
- ⬜ история изменений учебной информации;
- ⬜ механика «кто добавил / кто подтвердил / кто исправил».

**Важно:** роль студента не должна превращаться в бесконтрольное редактирование официального расписания или канонического учебного контента. Нужна граница между пользовательским вкладом и официальными данными.

### 13.2 Учебная группа — центральная сущность

Уже есть:
- ✅ `groups`;
- ✅ `group_memberships`;
- ✅ active membership;
- ✅ group-aware schedule;
- ✅ group-aware homework;
- ✅ Telegram chat → group binding.

Нужно довести:
- ⬜ безопасное присоединение по коду/ссылке;
- ⬜ подтверждение участника;
- ⬜ starosta/модератор группы;
- ⬜ несколько групп у одного пользователя без поломки текущего UI;
- ⬜ история членства;
- ⬜ перенос студента между группами;
- ⬜ привязка Telegram-пользователя к аккаунту сайта.

### 13.3 Занятие как связующий объект

Для будущей автоматизации ДЗ недостаточно знать только предмет.

Нужна логика:

`Telegram message → group → date/time → schedule entry → subject → homework`

При этом:
- subject определяется из официального каталога;
- занятие определяется по расписанию и времени/дате сообщения;
- если совпадений несколько — бот не должен угадывать молча;
- при низкой уверенности создаётся **кандидат ДЗ**, а не окончательное ДЗ;
- пользователь/староста может подтвердить или исправить привязку.

Это важнее, чем просто `subject_hint`.

---

# 14. Telegram — регистрация + «Telegram → ДЗ»

**Статус: 🟡 IN PROGRESS — backend foundation есть, production flow не подтверждён**

### Что уже реально есть в коде

- ✅ `TelegramHomeworkService`;
- ✅ webhook endpoint `/api/v1/telegram/webhook`;
- ✅ secret-token проверка;
- ✅ Telegram chat discovery;
- ✅ admin привязка Telegram-чата к учебной группе;
- ✅ хранение Telegram messages;
- ✅ защита от повторной обработки message_id;
- ✅ reply-thread привязка;
- ✅ media-group/album привязка;
- ✅ импорт фото/документов;
- ✅ OCR/vision metadata;
- ✅ AI semantic classification;
- ✅ subject/due hints;
- ✅ создание `homeworks`;
- ✅ связь `telegram_messages → telegram_homework_links → homeworks`;
- ✅ `homework_attachments`;
- ✅ Admin UI `/admin/telegram`;
- ✅ webhook setup из admin;
- ✅ Telegram OAuth/custom provider trace в frontend/auth layer.

### Что показала живая Supabase

На текущей проверке:
- `telegram_bot_chats = 0`;
- `telegram_messages = 0`;
- `telegram_homework_links = 0`;
- `homework_attachments = 0`;
- `homeworks = 0`.

Следовательно, **кодовая foundation готова, но реальная эксплуатация Telegram-контура ещё не доказана**.

### 14.1 Регистрация через Telegram

Целевой UX:

1. Студент открывает бота.
2. Бот объясняет, что MEDBIOHIM использует Telegram для входа/привязки.
3. `/start` выдаёт безопасную ссылку/flow регистрации.
4. Студент подтверждает Telegram identity.
5. Аккаунт MEDBIOHIM создаётся или связывается с существующим.
6. Студент выбирает/вводит код учебной группы.
7. Сайт показывает группу и просит подтверждение.
8. После подтверждения студент получает расписание и ДЗ группы.

**Пока нельзя считать этот сценарий готовым:** в репозитории есть custom Telegram OAuth trace, но отдельного end-to-end bot registration flow с Telegram user ↔ `auth.users.id` ↔ `users` ↔ `group_memberships` не подтверждено.

### 14.2 Распознавание ДЗ из чата

Целевой алгоритм:

1. Получить сообщение.
2. Сохранить raw message.
3. Определить группу по Telegram chat.
4. Определить дату сообщения и автора.
5. Найти ближайшие занятия этой группы по расписанию.
6. Из текста/фото извлечь:
   - предмет;
   - формулировку задания;
   - срок;
   - номер/тему занятия;
   - вложения.
7. Сопоставить предмет с официальным `subjects`.
8. Сопоставить занятие с `schedule_entries`.
9. Оценить confidence.
10. Если confidence высокий — создать ДЗ.
11. Если средний/низкий — создать candidate для подтверждения.
12. Дать старосте/модератору исправить предмет/занятие/срок.
13. После подтверждения показать ДЗ всем участникам группы.

### 14.3 Критический gap текущей реализации

Сейчас сервис умеет выбрать **subject**, но основной автоматический контур ещё не является полноценным `message → конкретное занятие` resolver.

Нужно добавить отдельный слой:
`TelegramHomeworkResolver`

Он не должен смешиваться с OCR/LLM.

Вход:
- `group_id`;
- `telegram_date`;
- `message_text`;
- `subject_hint`;
- `due_hint`.

Выход:
- `subject_id`;
- `schedule_entry_id`;
- `lesson_context`;
- `confidence`;
- `resolution_status = auto|needs_confirmation|unresolved`.

### 14.4 Защита от ошибок

Бот **не должен**:
- создавать ДЗ только потому, что в сообщении есть слово «дз»;
- придумывать дату;
- подменять официальный предмет похожим названием;
- привязывать сообщение к чужой группе;
- публиковать низкоуверенное распознавание как подтверждённый факт;
- создавать дубликаты при повторной доставке Telegram update.

### 14.5 Telegram production acceptance

Для перевода фазы в ✅ нужен реальный тест:

`Telegram chat → webhook → Supabase message → resolver → homework → attachment → website`

и отдельно:

`Telegram /start → account link → group join → schedule/homework`

На каждом шаге должна быть запись/ответ, а не только HTTP 200.

---

# 15. Student-generated content / community

**Статус: ⬜ TODO / product direction**

Сайт «от студентов для студентов» должен позволять безопасно добавлять:

- ⬜ уточнения к ДЗ;
- ⬜ полезные материалы;
- ⬜ конспекты;
- ⬜ заметки к занятию;
- ⬜ сообщения группы;
- ⬜ предложения исправлений;
- ⬜ вопросы по предмету;
- ⬜ подтверждение/опровержение информации.

Модель доверия:

`student contribution → moderation/confirmation → shared group knowledge`

Не смешивать это с каноническим импортом учебных материалов.

---

# 16. Updated project dependency map

```
                         ┌─────────────────────┐
                         │      STUDENT        │
                         └──────────┬──────────┘
                                    │
                         auth / Telegram link
                                    │
                 ┌──────────────────▼──────────────────┐
                 │          USER + MEMBERSHIP          │
                 │ users → group_memberships → groups  │
                 └───────────────┬─────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
           SCHEDULE           SUBJECT          COMMUNITY
                │                │
                └────────┬───────┘
                         ▼
                    LESSON CONTEXT
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
       HOMEWORK       MATERIALS       TESTS
          │
          ▼
    SUBMISSIONS / DONE
          │
          ▼
       PROGRESS

Telegram group
      │
      ▼
  Telegram Bot
      │
      ▼
telegram_messages
      │
      ▼
OCR / semantic classifier
      │
      ▼
Homework Resolver
      │
      ├──────────────→ subject_id
      │
      ├──────────────→ schedule_entry_id
      │
      └──────────────→ due_at
                       │
                       ▼
                    HOMEWORK
                       │
                       ▼
                    STUDENT
```

### Архитектурный приоритет

1. 🔴 **Production stability** — auth/router/media/deployment.
2. 🔴 **Student identity + group membership**.
3. 🔴 **Telegram registration/linking**.
4. 🔴 **Telegram → lesson resolver → homework**.
5. 🟡 Student-generated content/community.
6. 🟡 Admin moderation/confirmation.
7. 🟡 Progress/analytics around real student activity.
8. 🟢 UI polish / Aero Glass после функциональной стабилизации.

### Новое правило карты

Любая новая функция должна отвечать на три вопроса:

1. **Кто студент?**
2. **К какой учебной группе и занятию относится действие?**
3. **Как результат попадает обратно в учебный процесс?**

Если на эти вопросы нет ответа, функция не считается интегрированной в MEDBIOHIM.


## Audit update — 2026-10-06 — Pass 14–17 second verification

**Статус: 🟢 CLOSED at implementation + live-invariant level.**

Pass 14–17 уже были реализованы в main, а последующие Pass 18–22 закрыли часть оставшихся P1. Второй проход 06.10 проверил именно текущий код и живую Supabase, а не только исторические отчёты.

### Pass 14 — AcademicContext
- 🟢 canonical group/subject/session/lesson/context_version contract;
- 🟢 explicit group selection for multi-group users;
- 🟢 UUID-authoritative subject identity;
- 🟢 active schedule/lesson resolution;
- 🟢 no current foreign-context gaps.

### Pass 15 — Core academic flow
- 🟢 planner/schedule/attendance use selected group;
- 🟢 homework submission retry/state transitions are safe;
- 🟢 active test attempt uniqueness is enforced;
- 🟢 progress is group-scoped;
- 🟢 homework now exposes one canonical derived my_status.

### Pass 16 — Tests / Preparation
- 🟢 preparation start validates group + subject context;
- 🟢 question membership is restricted to the session;
- 🟢 sequential bank progress is group-scoped;
- 🟢 terminal state transitions are guarded.

### Pass 17 — Test integrity / reproducibility
- 🟢 answers are persisted server-side;
- 🟢 final score is calculated server-side;
- 🟢 test attempts store immutable question/answer snapshots;
- 🟢 test attempts and preparation sessions store group/session/context version;
- 🟢 preparation result answer snapshots are populated;
- 🟢 normal test/preparation responses do not leak answer keys.

### Second-pass live invariants
- active attempt snapshot gaps: **0**;
- active preparation snapshot gaps: **0**;
- answers outside immutable snapshots: **0**;
- preparation answer snapshot gaps: **0**;
- foreign-group attempts/sessions: **0**;
- schedule ↔ academic session/year/semester mismatches: **0**.

There is one historical submitted attempt from 02.10.2026 created before snapshot migration with no saved answers, score or academic context. It is intentionally retained as a legacy historical anomaly; reconstructing its score/context would fabricate history.

Detailed verification: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS14-17-SECOND-VERIFY.md.

**Release caveat:** these passes are closed in code + live DB. Final PHP/TypeScript/build/browser/Vercel/SpaceWeb verification remains a separate deployment gate.

## Audit update — 2026-10-06 — Pass 18

Pass 18: 🟢 historical test/preparation integrity / 🟡 runtime verification pending.

- ✅ preparation scoring reads immutable session question snapshots;
- ✅ preparation result stores answer snapshot;
- ✅ AI review uses historical answer snapshot;
- ✅ live DB invariants show no active attempt/preparation context gaps;
- 🟡 GitHub Actions has no run attached to the latest commits;
- 🟡 PHP/Next build and SpaceWeb smoke test remain mandatory before final green gate.

Detailed report: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS18.md.


## 2026-10-06 — Pass 19: Progress / History / Preparation contract

- 🟢 preparation GET/finish/AI review теперь используют immutable question snapshots;
- 🟢 preparation results сохраняют answer_snapshot;
- 🟢 /progress считает submitted attempts завершёнными;
- 🟢 DB error в test history больше не превращается в ложный пустой progress;
- 🟢 test history строго scoped по test_attempts.group_id;
- 🟢 bank/preparation frontend передают group_id в bank-progress;
- 🟢 live active-context invariants остаются нулевыми;
- 🟡 один legacy submitted attempt от 2026-10-02 не имеет group_id и намеренно не приписан к группе;
- 🟡 PHP/Next/build/runtime verification после Pass 19 ещё обязательна.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS19.md.


## 2026-10-06 — Pass 20: Test / Preparation API contract

- 🟢 закрыты API leaks: test_attempts.question_snapshot больше не отдаётся клиенту;
- 🟢 preparation session.question_snapshot больше не отдаётся через start/get/save/finish;
- 🟢 эталоны подготовки доступны после завершения через исторический snapshot;
- 🟢 my attempts теперь SELECT-ит только публичные поля без answer snapshot;
- 🟢 старый ProgressService найден как неиспользуемый legacy trace, source of truth остаётся progress_rest;
- 🟡 PHP/Next/browser/runtime verification ещё обязательны.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS20.md.


## 2026-10-06 — Pass 21: Deployment gate / cross-group audit

- 🟢 bank-progress sequential session теперь строго scoped по canonical group;
- 🟢 live invariants после исправления: active context/snapshot gaps = 0;
- 🟢 GitHub code-check workflow существует и содержит PHP syntax + route registration + frontend audit;
- 🟡 GitHub workflow query не показывает runs для latest commits;
- 🟡 Vercel connected account возвращает 403 на list/create deployment, поэтому production deployment не форсировался;
- 🟡 SpaceWeb runtime gate ещё не подтверждён.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS21.md.


## 2026-10-06 — Pass 22: Legacy / stub / fake-success audit

- 🟢 admin users/homeworks no longer silently return partial data after primary-store failure;
- 🟢 unused legacy `ProgressService` removed together with its unused platform import;
- 🟢 TODO/placeholder/null/empty scans classified semantically rather than mass-editing legitimate UI/empty states;
- 🟡 historical documentation traces remain and are scheduled for source-of-truth reconciliation;
- 🟡 runtime/build/browser gate remains unconfirmed.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS22.md.


## 2026-10-06 — Pass 23: route / legacy cleanup

- 🟢 найден и устранён duplicate GET /api/v1/me: одновременно регистрировались profile_rest.php и domain_rest.php;
- 🟢 из routes.php удалена регистрация legacy profile_rest.php;
- 🟢 удалены orphan profile_rest.php и SupabaseRestProfile.php, которые возвращали неполный fallback-профиль;
- 🟢 canonical /api/v1/me теперь проходит через UserRepository::profileBundle() с существующим REST fallback;
- 🟡 полный PHP/Next/browser/runtime gate всё ещё требует target-environment проверки;
- 🟡 продолжается аудит остальных legacy fallback/import traces.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS23.md.


## 2026-10-06 — Pass 24: Tests / questions by lesson topic

- 🟢 added canonical curriculum topic map to the tests API;
- 🟢 map is scoped by the user's group/course/semester/specialty;
- 🟢 tests expose module/topic names and ordering metadata;
- 🟢 tests page now shows “Темы занятий → что готовить” with question/test counts;
- 🟢 question banks can be filtered by lesson topic;
- 🟢 untagged questions are explicitly reported instead of being guessed into topics;
- 🟡 detailed lesson-plan rows are still missing for subjects whose topic hierarchy has not been imported;
- 🟡 remaining untagged questions require controlled curriculum mapping;
- 🟡 PHP/Next/browser/SpaceWeb runtime verification remains mandatory.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS24.md.


## 2026-10-06 — Pass 25: full current-semester curriculum mapping

- 🟢 all 655 published questions in current 2nd-year/3rd-semester histology + organic/physical chemistry have canonical topics;
- 🟢 all 30 published tests in those subjects have canonical topics;
- 🟢 histology 206 previously untagged questions mapped by specimen/content, with 47 explicitly kept outside the current 18-week plan;
- 🟢 chemistry question taxonomy 1.1–3.13 mapped to canonical curriculum topics using source provenance;
- 🟢 chemistry 18-lecture calendar linked to topic dates where the current plan confirms them;
- 🟢 questions/tests outside the current calendar remain visible and explicitly marked rather than being falsely attached to a lesson;
- 🟢 tests UI shows date, topic, question/test counts and extra/out-of-calendar status;
- 🟢 no ticket-bank UUIDs or question answers/text were changed;
- 🟡 runtime/build/browser gate remains to be verified.

Подробно: docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS25.md.


## 2026-10-07 — Pass 26: единый химический каталог из исходных файлов

- 🟢 проверен загруженный архив из 7 сканированных PDF: 142 страницы; обычный PDF text layer отсутствует, поэтому OCR не используется как единственный источник истины;
- 🟢 использованы ранее выверенные документы проекта с повторной сверкой исходного архива: `organic_chemistry_open_tasks_fixed.sql` и итоговая расшифровка вопросов/тестов;
- 🟢 в Supabase создан `chemistry_master_documents` — единый канонический документ для органической и физической химии;
- 🟢 в единый каталог собраны 260 открытых заданий + 176 опубликованных тестовых вопросов = 436 элементов;
- 🟢 для тестов сохранены варианты и правильные ответы;
- 🟢 для открытых заданий исходный текст, номер, тема и привязка к плану сохранены; пустой ответ не заменяется выдуманным решением;
- 🟢 химические формулы/реакции, которые присутствуют в текстовом источнике, сохраняются; формулы, существующие только как изображение, не восстанавливаются по догадке;
- 🟡 задания «Напишите структурные/скелетные формулы» требуют отдельного подтверждения формул по оригинальным изображениям страниц перед заполнением эталонных ответов;
- 🟡 полный архивный тестовый раздел источника содержит больше вопросов, чем текущий canonical test set; расширять production bank нужно отдельным контролируемым импортом, чтобы не занести OCR-ошибки;
- 🟢 ticket banks не изменялись.

Подробно: `docs/IMPLEMENTATION-AUDIT-2026-10-07-CHEMISTRY-MASTER-CATALOG.md`.


## 2026-10-07 — Pass 26A: эталонные ответы и формулы

- 🟢 в единый Supabase-каталог добавлены подготовленные ответы для 40 элементов;
- 🟢 19 формульных элементов получили отдельное текстовое представление структурных формул;
- 🟡 формулы пока имеют статус `prepared_from_text`, а не визуально подтверждённой: исходные сканы нужно проверить постранично перед использованием в автоматической проверке;
- 🟢 production `exam_questions.answer` не перезаписывался;
- 🟢 каталог защищён RLS и доступен на чтение авторизованным пользователям;
- 🟡 остаётся обработать ответы остальных 220 открытых заданий и провести визуальную проверку формул/стереохимии.


## 2026-10-07 — Pass 26B: две методички химии

- 🟢 подтверждено, что химический массив состоит минимум из **двух самостоятельных методических источников**;
- 🟢 источник 1: «Учебно-методическое пособие по органической и физической химии» ДВГМУ;
- 🟢 источник 2: Н.Н. Минаева, С.А. Пронкина — «Сборник задач, упражнений и тестовых заданий по органической химии» ДВГМУ;
- 🟢 в Supabase создан `chemistry_source_documents` с раздельной provenance-записью обоих источников;
- 🟢 единый master catalog хранит оба источника в `source_documents`;
- 🟢 совпадающие задания не удаляются автоматически как дубли: сначала сохраняется происхождение из методички;
- 🟡 конкретные элементы без надёжной source attribution не будут искусственно приписываться методичке.


### Pass 27 — Химический банк на сайте
- 🟢 Единый каталог химии подключён к странице «Тесты и билеты».
- 🟢 Добавлены поиск, фильтры «задание/тест» и «формулы сохранены», пагинация и раскрытие вопроса/ответа.
- 🟢 Ответы без подготовленного решения не выдаются за проверенные; формулы не восстанавливаются догадкой.


## 2026-10-07 — Storage architecture clarification: Supabase Free + SpaceWeb media

> Важное инфраструктурное правило проекта: Supabase используется на бесплатном плане и является БД/слоем метаданных, а тяжёлые изображения, фотографии препаратов, электронограммы и другие крупные медиа по возможности хранятся на SpaceWeb. Supabase Storage/B2 не считаются обязательным хранилищем для этих файлов.

### Каноническое разделение

- **Supabase Free** — PostgreSQL, Auth, RLS, связи, метаданные контента, вопросы, тесты, учебный план, trainer cards, source_key, пути/идентификаторы медиа.
- **SpaceWeb** — физические файлы большого объёма: фотографии, изображения микропрепаратов, электронограммы и документы, когда их хранение в репозитории или бесплатном Supabase нецелесообразно.
- **GitHub** — код, миграции, документация и небольшие декларативные/контентные артефакты; не использовать как обязательное хранилище всего большого архива.
- **Vercel** — frontend/deployment; не считать Vercel источником постоянного пользовательского media storage.

### Ограничение исходных архивов

Полный content.zip может быть слишком большим для загрузки в чат. Это не означает, что контент нужно урезать: архив рассматривается как источник, а его содержимое должно быть перенесено/разложено по канонической архитектуре частями.

Для content.zip уже подтверждено:
- 444 фактических файлов;
- 389 изображений;
- 207 уникальных наборов байтов после удаления дублей;
- Supabase содержит 206 trainer feed cards, включая 28 EM по назначению;
- физический media-layer должен проверяться отдельно на SpaceWeb.

### Правило для Histology media

Для гистологии каноническим физическим источником остаётся `/public_html/content/histology` на SpaceWeb (или путь из HISTOLOGY_MEDIA_ROOT), а Supabase хранит карточки, captions, metadata и ссылки/source_key.

**Не переносить все изображения из content.zip в public.files только ради формального соответствия.** Это нарушило бы выбранную бесплатную архитектуру и увеличило бы зависимость от лимитов Supabase.

### Release gate

Физическое наличие файла на SpaceWeb считается отдельным обязательным smoke-test:
Supabase metadata → API media route → SpaceWeb file → HTTP 200/image.

Статус: 🟡 требуется финальная проверка/синхронизация физического media-layer на SpaceWeb.


## 2026-10-07 — подтверждён физический Histology media root на SpaceWeb

Получено прямое подтверждение из файлового менеджера SpaceWeb: каталог Histology media физически присутствует под /public_html/... и содержит ожидаемую структуру:

- source-materials/;
- electronograms/;
- em/ — alias/совместимость электронограмм;
- 5_Фотографии препаратов/;
- дополнительный каталог с URL/Unicode-encoded именованием;
- README.md.

Это означает, что ранее сформулированный вывод «физические media отсутствуют» был слишком сильным: отсутствие этих бинарных файлов в GitHub и таблице public.files не означает, что их нет на SpaceWeb.

### Текущий статус media

- 🟢 физический Histology media root на SpaceWeb подтверждён;
- 🟢 структура каталогов соответствует README/content package;
- 🟡 требуется инвентаризация фактических файлов внутри каталогов и сопоставление с 206 trainer cards / 28 EM / Materials;
- 🟡 требуется HTTP smoke-test нескольких реальных image/document paths через production API;
- 🟡 требуется проверить, что backend HISTOLOGY_MEDIA_ROOT указывает именно на этот физический каталог.

Каноническая модель остаётся:
Supabase Free = metadata/DB → SpaceWeb = physical media → API = controlled delivery.


## 2026-10-07 — полноценная база вопросов без запуска теста

Раздел `/practice` переведён из режима только «практики» в полноценную **Базу вопросов** для всех авторизованных пользователей.

- опубликованные вопросы доступны напрямую, без создания test_attempt/preparation session;
- по умолчанию загружаются все типы опубликованных вопросов, а не только `ticket`;
- есть фильтр предмета, типа и поиск по тексту;
- есть постраничная навигация для полного банка;
- правильный ответ загружается отдельно от режима прохождения теста и доступен при просмотре вопроса;
- у каждого вопроса остаётся `QuestionReport` — жалоба привязана к конкретному `question_id`;
- жалобы обрабатываются админским `/admin/problems`, где вопрос можно быстро исправить;
- запуск теста для просмотра/изучения вопроса не требуется.

Архитектурное правило: **просмотр базы вопросов ≠ попытка теста**. Открытие вопроса не должно менять прогресс, результат или историю попыток.


## 2026-10-07 — изоляция банков по предметам

База вопросов и тестовая часть теперь рассматриваются как предметные контексты: переход из конкретного предмета передаёт его `subject_slug`, поэтому банк вопросов загружается только для этого предмета. Для гистологии и химии не смешиваются вопросы, ответы и тесты. Прямой общий `/practice` без контекста сохраняет возможность выбрать предмет вручную.


## 2026-10-07 — Project Source-of-Truth Audit

Проведена сверка кода, пользовательской логики и существующих документов. Создан канонический обзор архитектурных правил и остаточных release-gates:

`docs/PROJECT-SOURCE-OF-TRUTH-AUDIT-2026-10-07.md`

Зафиксированы как постоянные правила: независимые банки по предметам, база вопросов ≠ тест, жалоба → question_id → admin correction, optional AI grading, immutable history snapshots, единый academic context, Supabase Free как DB/metadata + SpaceWeb как physical media, расписание + задания как единый целевой UX, content reconciliation, runtime/deployment truth, strict build gate, timezone и mobile/browser acceptance.

Отдельно отмечены остаточные 🟡 проверки, которые нельзя выдавать за полностью закрытые только по наличию кода в GitHub.


## 2026-10-07 — Zero-cost + full-functionality policy

**Новый обязательный архитектурный принцип:** полный запланированный функционал должен сохраняться при **$0 обязательных расходов**.

Бесплатный стек:
- GitHub Free;
- Vercel Hobby;
- SpaceWeb Free;
- Supabase Free;
- Backblaze B2 Free allowance.

Правило оптимизации: при лимитах сначала применять caching, pagination, lazy loading, streaming, batching, deduplication, metadata/binary separation и распределение media между SpaceWeb/B2. Не урезать пользовательский сценарий только ради free-tier.

AI остаётся optional: deterministic/local path должен сохранять базовый функционал без платного AI.

Любой новый сервис проходит проверку permanent free vs trial, квоты, egress, поведение после лимита и риск автоматического расхода.

Полная политика: docs/FREE-TIER-FULL-FUNCTIONALITY-POLICY-2026-10-07.md.


## 2026-10-07 — Admin Data & Storage Control Center

Supabase остаётся единственным основным источником истины. Админская консоль развивается как единый интерфейс управления данными и физическими объектами, без создания второй canonical БД.

### A — Database Console
- 🟢 `/admin/database`: whitelisted tables, редактирование, импорт/экспорт, audit/rollback;
- 🟢 добавлен поиск по значениям и пагинация;
- 🟡 desktop/PC-style интерфейс: дерево таблиц, сортировка, фильтры, закрепление ключей, инспектор строки, связи;
- 🟡 bulk-edit с dry-run и валидацией;
- 🟡 health/reconciliation проверки.

### B — File & Storage Center
- 🟡 SpaceWeb file tree и проверка существования;
- 🟡 B2 object browser через бесплатный API;
- 🟡 Supabase metadata ↔ физический объект reconciliation;
- 🟡 MIME/размер/checksum, дубликаты и orphan-файлы;
- 🟡 безопасные move/rename/archive/delete;
- 🟡 отдельная проверка Histology `content/histology` и Materials.

### C — Unified Operations Dashboard
- 🟡 состояние Supabase/SpaceWeb/B2/Vercel;
- 🟡 квоты бесплатных ресурсов;
- 🟡 ошибки интеграций и проверки;
- 🟡 export/backup snapshots;
- 🟡 журнал операций и безопасный rollback.

### D — Free-service extensions
Другие бесплатные сервисы подключаются только как дополнения: кэш, push, поиск, OCR, мониторинг, аналитика, backup и т.п. Они не создают вторую БД и не становятся обязательными для работы MEDBIOHIM.

Подробная архитектура: `docs/ADMIN-DATA-CONSOLE-ARCHITECTURE.md`.

## 2026-10-07 — Consolidated Remaining Implementation Map

Этот блок фиксирует все ранее найденные, но ещё не закрытые направления. Ничего из уже работающего функционала не считается кандидатом на удаление только ради упрощения или free-tier.

### 1. Release / production verification — P0
- 🟡 подтвердить последний Vercel deployment как READY;
- 🟡 выполнить production smoke: login → /me → dashboard → logout;
- 🟡 authenticated smoke для schedule, subjects, tests, preparation, question bank, materials, trainer/atlas и admin;
- 🟡 подтвердить актуальный backend на SpaceWeb и отсутствие рассинхрона GitHub → SpaceWeb;
- 🟡 проверить PHP runtime, роутер, env/secrets и OPcache;
- 🟡 получить фактический CI result для актуального HEAD.

### 2. Auth / security — P0/P1
- 🟡 полный auth regression после исправлений /api/v1/me;
- 🟡 refresh/re-login и concurrent 401 recovery;
- 🟡 production roles/claims/group membership;
- 🟡 leaked-password protection в Supabase Auth;
- 🟡 отсутствие bootstrap/admin secrets в production;
- 🟡 финальный аудит RLS и 44 оставшихся advisor findings по FK-индексам;
- 🟡 server-side защита всех admin/data mutations.

### 3. Расписание + Задания — единый learning flow
Целевой UX: Расписание → дата → предмет → занятие → задания/домашняя работа → выполнение/сдача → статус.
- 🟡 объединить «Задания» и «Расписание» в единый пользовательский сценарий;
- 🟡 создание/редактирование homework из контекста даты и subject;
- 🟡 единый статус submitted/done/returned/graded;
- 🟡 attendance по паре: присутствовал / уважительная / болезнь / неуважительная;
- 🟡 knowledge gaps по предмету;
- 🟡 проверить schedule_entries ↔ academic_sessions/year/semester для исторических данных;
- 🟡 month/week overlap и чередующиеся/объединённые пары;
- 🟡 mobile agenda mode.

### 4. Histology — physical content completion
- 🟡 сопоставить все 444 файлов content.zip с физическими файлами SpaceWeb;
- 🟡 сопоставить 206 trainer cards с реальными image paths;
- 🟡 проверить все 28 EM и captions;
- 🟡 проверить Materials → DOCX/JPG/PNG physical objects → API HTTP 200 + MIME;
- 🟡 закрыть trainer media 404/502;
- 🟡 atlas → material → document/image → back smoke;
- 🟡 итоговая матрица тема → лекция → препарат → ЭМ → вопросы → тест;
- 🟡 не переносить весь архив в Supabase Storage только ради формальной синхронизации.

### 5. Materials / documents
- 🟡 единый viewer для DOCX/PDF и поддерживаемых форматов;
- 🟡 сохранить структуру документа, изображения и навигацию;
- 🟡 material metadata editor;
- 🟡 связать материал с canonical curriculum topic;
- 🟡 physical-file reconciliation и orphan detection;
- 🟡 streaming/lazy loading больших файлов.

### 6. Tests / preparation / Question Library
- 🟡 открыть и smoke-test каждый published test;
- 🟡 объединить банк → прохождение → разбор ошибок в единый UX;
- 🟡 admin quick-edit question/answer/options;
- 🟡 быстрый переход из жалобы к вопросу и исправлению;
- 🟡 строгая subject isolation для histology/chemistry и будущих subjects;
- 🟡 повторно проверить multiple-correct, free text, sequential и history;
- 🟡 сохранить immutable snapshot semantics при будущих редакторах;
- 🟡 историческую старую submitted attempt оставить документированным legacy case без выдумывания истории.

### 7. Smart answer grading
- 🟢 deterministic exact/normalized path;
- 🟢 spelling/orthography ignored;
- 🟢 AI optional;
- 🟡 end-to-end grading на реальном тесте;
- 🟡 pending/error/retry semantics;
- 🟡 multiple-choice без AI;
- 🟡 AI получает только необходимый question + authoritative answer и не раскрывает answer key клиенту.

### 8. Chemistry — completion
- 🟢 unified 436-item master catalog;
- 🟢 provenance for two independent methodicals;
- 🟡 подготовить/проверить оставшиеся 220 open-task answers;
- 🟡 визуально подтвердить 19 formula-heavy prepared answers по исходным страницам;
- 🟡 controlled expansion OCR-sensitive archived test sections;
- 🟡 не заменять production answers неподтверждёнными OCR/formula guesses;
- 🟡 стабилизировать chemistry tests and experimental UI;
- 🟡 проверить chemistry AI/provider-dependent flows.

### 9. Trainers / atlas / preparations
- 🟡 полный browser cycle: start → answer → resume → finish → result → error review;
- 🟡 randomization без дублей и с одним authoritative correct answer;
- 🟡 скрытие captions/answers там, где это требуется режимом экзамена/подготовки;
- 🟡 retry image loading и устойчивость на мобильной сети;
- 🟡 topic/type/count modes: 10/20/50/custom/all;
- 🟡 mobile pagination/list/sidebar.

### 10. Admin / CMS / Content Center
- 🟡 единый Content Center;
- 🟡 question quick-edit;
- 🟡 material editor;
- 🟡 lesson/lecture editor;
- 🟡 trainer-card editor;
- 🟡 content version history + visual rollback;
- 🟡 bulk validation and dry-run imports;
- 🟡 relation-aware row inspector;
- 🟡 DB health/reconciliation;
- 🟡 безопасные bulk operations.

### 11. File & Storage Operations Center
- 🟡 SpaceWeb tree/browser;
- 🟡 B2 object browser;
- 🟡 Supabase metadata ↔ SpaceWeb/B2 object map;
- 🟡 MIME/size/checksum, duplicate/orphan scan;
- 🟡 safe move/rename/archive/delete;
- 🟡 backup/export snapshots;
- 🟡 provider capacity/quota panel;
- 🟡 operation log + safe rollback.

### 12. UI / cross-platform acceptance
- 🟡 iPhone Safari, Android Chrome, Windows Chrome/Edge, Firefox, Yandex, macOS Safari/Chrome;
- 🟡 устранить iPhone dark/misaligned area;
- 🟡 mobile admin pagination and dense data tables;
- 🟡 mobile tests/preparation/trainers/materials;
- 🟡 loading/subject-loading performance and perceived latency;
- 🟡 prevent overlapping theory/visual layers in schedule/content;
- 🟡 one unified design system; Aero Glass remains beta until separately promoted;
- ⬜ final visual audit after functionality is stable.

### 13. Performance / free-tier optimization
- 🟡 measure DB/API/storage/egress before moving workloads;
- 🟡 cache read-heavy metadata;
- 🟡 pagination for large datasets;
- 🟡 lazy-load images/documents/trainers;
- 🟡 streaming for large files;
- 🟡 deduplicate media and metadata;
- 🟡 batch requests and verify indexes;
- 🟡 hard limits / graceful degradation for optional external providers;
- 🟡 no mandatory paid dependency.

### 14. AI tutor / provider layer
- 🟡 provider health endpoint with factual runtime status;
- 🟡 verified primary free/available provider;
- 🟡 preserve fallback chain;
- 🟡 diagnose Mistral/OpenRouter/GigaChat/Groq runtime errors with actual response bodies;
- 🟡 context-aware tutor: subject → topic → question/material;
- 🟡 AI remains optional for core learning/testing flows.

### 15. Code quality / architecture cleanup
- 🟡 fix current TypeScript/ESLint issues before removing build-time bypasses (typescript.ignoreBuildErrors, eslint.ignoreDuringBuilds);
- 🟡 centralize timezone handling;
- 🟡 inspect remaining legacy learning_sessions consumers before deletion;
- 🟡 finish duplicate/dead route and service cleanup audits;
- 🟡 keep API route ownership canonical and documented;
- 🟡 regression tests for subject isolation, snapshots, reports and academic context.

### 16. Documentation / release discipline
- 🟢 stable baseline recorded in docs/STABLE-BASELINE-2026-10-07.md;
- 🟡 every production-impacting change updates roadmap/status and relevant audit;
- 🟡 maintain free-tier capacity register;
- 🟡 maintain runtime deployment checklist;
- 🟡 distinguish repository state, user-observed working state and independently verified runtime;
- 🟡 create release snapshots before risky migrations.

### 17. Optional free-service aggregation — additions only
- 🟡 search permanent-free additions for cache/CDN, push, OCR, monitoring, analytics, search and backup;
- 🟡 each service must have clear quota, egress, retention, sleep/suspension and billing behavior;
- 🟡 supplementary services may enrich data through API but never replace Supabase canonical truth;
- 🟡 failure of an optional service must not break core MEDBIOHIM.

### Execution order
**P0:** production/auth/runtime gate → media delivery → tests/question bank smoke → schedule/homework core.
**P1:** Histology/Materials reconciliation → admin Content Center → trainer/preparation completion → mobile acceptance → chemistry answer completion.
**P2:** AI tutor/provider layer → PC-style storage/operations center → performance/free-tier distribution → optional free-service integrations → visual polish.
**Rule:** no new feature may silently regress the stable baseline; risky changes require a rollback point.


## 2026-10-07 — P0 implementation pass

Исправлены две найденные регрессии в curriculum-map: повреждённый PHP Throwable handler и потерянная связь topic → curriculum_items для planned_date/item_type. Подробный audit: `docs/IMPLEMENTATION-AUDIT-2026-10-07-P0.md`.

Production gate пока не закрыт: Vercel сообщает `build-rate-limit`; CI/runtime READY не считаются подтверждёнными до фактического успешного запуска.


## 2026-10-07 — P0 verification/fix cycles continued

- 🟢 Vercel production deployment for `59e38d9664645556bd2fca64ea6d97f998a5f200` reached **READY**; GitHub combined status for that commit reports Vercel success.
- 🟢 Repeated source verification found and fixed a real JSX regression in the Chemistry master-bank section and two admin validation defects.
- 🟢 Public health diagnostics were hardened: DB host/port/user and raw connection diagnostics are no longer returned by `HealthChecker`.
- 🟢 Histology Materials now have an authenticated SpaceWeb physical-file fallback when no B2 download URL exists; this preserves the canonical architecture `Supabase metadata + SpaceWeb binary`.
- 🟡 Latest commits after `59e38d9...` are currently blocked from a new Vercel deployment by `build-rate-limit`; they remain source-verified only until a READY deployment is available.
- 🟡 Production authenticated smoke and SpaceWeb runtime verification remain open.


## 2026-10-07 — semantic verification cycle

### Security
- 🟢 `public.chemistry_source_documents` RLS enabled in live Supabase.
- 🟢 Authenticated read-only policy added; server-side writes remain protected.
- 🟡 Supabase Auth Leaked Password Protection remains a separate hardening item.

### Subject/question isolation
- 🟡 Do not make `subjects.slug` globally unique: current data intentionally contains repeated slugs across academic contexts.
- 🟡 Next implementation gate: question/search boundaries must prefer authoritative `subject_id` / academic context and use slug only as a human-facing alias.
- 🟢 Existing histology ticket banks remain untouched by this cycle.

### 18. Media Optimization Pipeline — P1/P2
Цель: уменьшать размер загружаемых изображений и других медиа без заметной потери качества и без нарушения исходных файлов.

- 🟡 единый upload pipeline для Materials, лекций, trainer/atlas, профиля и админского Content Center;
- 🟡 определять реальный MIME/type по содержимому, а не доверять расширению;
- 🟡 изображения: автоматический resize по максимальному разумному разрешению;
- 🟡 выбирать оптимальный web-формат: **WebP** как основной безопасный fallback и **AVIF** для ещё меньшего веса там, где поддержка/качество оправданы;
- 🟡 не использовать WebM для обычных фотографий: WebM — контейнер прежде всего для видео/анимации. Если в конкретном сценарии WebM для image/animation действительно даёт выигрыш, поддержать его экспериментально, но не делать canonical photo format;
- 🟡 видео/анимации: отдельная транскодировка в WebM/AV1/VP9 только при доказанном выигрыше размера и совместимости;
- 🟡 сохранять оригинал только для типов, где он нужен для обучения/архива/редактирования; для обычных preview-фото хранить оптимизированный master + при необходимости thumbnail;
- 🟡 генерировать thumbnail/preview и несколько responsive sizes вместо загрузки огромного оригинала на телефон;
- 🟡 EXIF: удалять GPS и ненужные метаданные из пользовательских фото;
- 🟡 дедупликация по checksum/content hash до повторной загрузки;
- 🟡 лимиты размера/разрешения с понятной ошибкой до тяжёлого upload;
- 🟡 прогресс загрузки + состояние processing + retry;
- 🟡 оптимизация должна выполняться server-side/worker, чтобы слабый телефон не тратил батарею/память на тяжёлую конвертацию;
- 🟡 оригинал и производные файлы связывать через source_file_id/asset family;
- 🟡 MIME/size/checksum/width/height/duration хранить в metadata;
- 🟡 CDN/cache headers для immutable derivatives;
- 🟡 fallback: если конвертация недоступна, исходный поддерживаемый файл всё равно должен корректно сохраниться;
- 🟡 для документов не делать «сжатие любой ценой»: PDF/DOCX оптимизировать отдельно;
- 🟡 сравнить качество/размер на реальных фото препаратов, ЭМ, атласа и лекционных изображениях;
- 🟡 измерять storage + egress до/после оптимизации.

#### Архитектурное правило
**Original → optimized master → thumbnails/responsive derivatives → client.**
Canonical metadata остаётся в Supabase, физические бинарники — в согласованном storage (SpaceWeb/B2). Оптимизация не должна ломать Atlas/content или Materials.

#### Очередность
1. MIME/размер/checksum + безопасный upload.
2. Image optimizer WebP/AVIF + resize + thumbnails.
3. Responsive delivery/cache.
4. Video WebM pipeline.
5. Document/PDF optimization.
6. Дедупликация и storage/egress metrics.
7. Финальный visual/quality regression на iPhone/Android/desktop.


## 2026-10-07 — Media quality safety rule

Для Media Optimization Pipeline зафиксировано обязательное правило **content-aware multi-candidate compression**:

- 🟢 качество нельзя выбирать одной глобальной настройкой;
- 🟢 изображения классифицируются по назначению/содержимому: фото, микропрепарат/ЭМ, атлас, схема, скан, text-heavy, mixed;
- 🟢 для значимых изображений создаются несколько quality/compression candidates;
- 🟢 quality gate отдельно проверяет мелкий текст, подписи, формулы, границы и учебные детали;
- 🟢 выбирается минимальный по размеру кандидат, который проходит quality/readability threshold;
- 🟢 если кандидат не проходит — автоматически выбирается более качественный;
- 🟢 если ни один derivative не проходит — используется оригинал;
- 🟢 при невозможности надёжно подтвердить качество нельзя рисковать читаемостью: fallback идёт на более качественную версию/original;
- 🟢 original не удаляется ради экономии веса, если он нужен для zoom, восстановления или архива;
- 🟡 реализация этого quality gate ещё не считается DONE до runtime/visual проверки на реальных MEDBIOHIM материалах.

Полная политика: `docs/MEDIA-QUALITY-DELIVERY-POLICY.md`.
