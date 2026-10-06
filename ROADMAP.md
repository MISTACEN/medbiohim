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


## Audit update — 2026-10-06 — Master Plan / Pass 14

Главный архитектурный план: `docs/INTEGRATION-MASTER-PLAN-2026-10-06.md`.

**Pass 14: 🟡 IN PROGRESS** — foundation реализован, но core-домены ещё не все переведены на единый context contract.

Уже реализовано:
- ✅ `AcademicContextResolver::resolveGroup()`;
- ✅ `resolveSubject()` по authoritative UUID;
- ✅ `resolveAcademicSession()`;
- ✅ `resolveLesson()`;
- ✅ `resolveForRequest()`;
- ✅ `semester / academic_year / academic_year_id / session_id / schedule_id / lesson_id`;
- ✅ `context_version` и расширенный `context_key`;
- ✅ запрет implicit выбора первой группы;
- ✅ planner resolver import gap исправлен;
- ✅ SRS cards route undeclared `subjectId` исправлен;
- ✅ progress DB failure больше не маскируется пустым успешным ответом.

Остаётся:
- 🟡 перевести planner/schedule/progress/attendance на единый context object;
- 🟡 убрать slug-only identity из practice/search/lectures и legacy content paths;
- 🟡 unified published-test resolver для tests/preparation;
- 🟡 context-aware cache versioning;
- 🟡 пройти PHP/TypeScript/build/route audit после изменений;
- 🟡 доказать exact artifact на SpaceWeb.

Следующий фактический проход: **Pass 15 — Core academic flow**.
Подробности: `docs/IMPLEMENTATION-AUDIT-2026-10-06-PASS14.md`.
