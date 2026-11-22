# Модульная архитектура MEDBIOHIM — зафиксированная схема

**Срез:** 7 ноября 2026, base commit `be763295` (`main`). **Ревизия:** 2026-11-22 — добавлены §12.10–12.13 (методички, диагностикум, офлайн, src/shared), бюджеты расширены на src/components и src/lib (registry/loc-budgets.json v3).
**Статус:** схема зафиксирована; идёт поэтапный перенос. **Сделано (этап A2, химия):** UI химии живёт в `src/modules/subjects/submodules/chemistry/` с публичным баррелем, старые пути удалены, импорты переведены на баррель, границы проверяет `test/module-boundaries.test.mjs`. БД, RLS и API не менялись.
**Связанные документы:** [../PROJECT-MAP.md](../PROJECT-MAP.md) — где что лежит сейчас; [SHARED-COMPONENT-REGISTRY.md](SHARED-COMPONENT-REGISTRY.md) — реестр общих компонентов (контракт, проверяется `test/component-registry.test.mjs`); [../API-CONTRACTS.md](../API-CONTRACTS.md) — контракты API.

---

## 1. Что есть сегодня (факты, не планы)

| Слой | Объём | Комментарий |
|---|---|---|
| `src/app/` | 86 `page.tsx`, ~24 000 строк | маршруты и монолиты (`schedule/page.tsx` — 1221, `subjects/[id]/page.tsx` — 1084, `tests/preparation/[id]` — 983) |
| `src/components/` | 132 `*.tsx`, ~31 500 строк, 30 доменных папок | де-факто уже модули: `lectures` (4405), `trainers` (3481), `chemistry` (2718), `university` (1742), `teacher` (1594), `ui` (1265) |
| `src/lib/` | ~23 800 строк | транспорт, `api/<домен>.ts`, `endpoints.ts` — единственное место строк `/api/v1/*` |
| `src/shared/` | `file-engine/`, `permissions/` | зачаток общей папки, два барреля |
| `workers/api/src/routes/` | 71 файл, ~20 400 строк, ~168 маршрутов | `routes/teacher/` уже разнесён на 6 файлов — образец для остальных |
| Баррели (`index.ts`) | 5 | `chemistry`, `ui`, `shared/file-engine`, `shared/permissions`, `lib/question-types` |

Вывод: доменное деление **уже есть на уровне папок компонентов и api-клиентов**, но нет (а) публичных границ между модулями, (б) единого места для «общего», (в) правила «страница — тонкая точка входа». Отсюда дубли (`chem/` и `chemistry/`, `builder/` vs `editor/`), монолиты-страницы и импорты «через забор» (`components/tests` → `components/lectures/...`).

---

## 2. Целевая схема

```text
src/
  app/                      маршруты: только сборка страницы из модуля (≤200 строк)
    subjects/[id]/...
  modules/                  ← новое: домен целиком в одном месте
    <module>/
      ui/                   компоненты (бывший src/components/<module>)
      model/                типы, чистая логика, селекторы, сортировки
      api/                  клиентские вызовы (бывший src/lib/api/<module>.ts)
      lib/                  доменные утилиты
      index.ts               ПУБЛИЧНАЯ поверхность модуля (единственное, что можно импортировать снаружи)
  shared/                   общее, не принадлежащее ни одному домену
    ui/ file-engine/ permissions/ question-types/
  lib/                      инфраструктура: fetch/refresh, endpoints.ts, форматтеры
workers/api/src/
  modules/<module>/         серверное зеркало модуля (образец — routes/teacher/)
  routes/                   сборка Hono-роутов
```

### Правила (проверяемые, а не пожелания)

1. **Направление зависимостей:** `app → modules → shared/lib`. Обратного импорта нет.
2. **Между модулями — только через `modules/<x>/index.ts`.** Импорт `@/modules/tests/model/grader` из `modules/lectures` запрещён; либо это `shared`, либо явный контракт в барреле.
3. **`app/<route>/page.tsx` ≤ 200 строк.** Всё крупное живёт в `modules/<module>/ui`. Монолиты из §1 переносятся по одному, без переписывания поведения.
4. **`src/lib/endpoints.ts` остаётся единственным местом строк `/api/v1/*`** (контракт проверяется `test/endpoints-registry.test.mjs`).
5. **Новый общий элемент сначала попадает в `shared/` и в реестр** (`docs/architecture/registry/components.json`), и только потом подключается модулями.
6. **Сервер повторяет деление:** `workers/api/src/modules/<module>/`, сборка — в `routes/`. Проверки прав остаются в `lib/permissions.ts` и `lib/teacher-scope.ts`, не внутри модулей.

---

## 3. Реестр модулей

Приоритет: **P1** — трогаем первыми (высокая ценность, низкий риск), **P3** — в конце.

| Модуль | Что входит | Откуда берём сейчас | Приоритет |
|---|---|---|---|
| `subjects` | каталог предметов, карточка предмета, подмодули-предметы (химия, математика, физиология, гистология…) | `app/subjects/*`, `components/subjects`, `chemistry`, `physiology`, `embryology` | **P1** |
| `tests` | движок тестов, банк, билеты, практика, карточки, подготовка | `app/tests|tickets|practice|cards`, `components/tests`, `lib/question-types` | **P1** |
| `lectures` | лекции, рендер, экзамен-режим, редактор | `app/lectures`, `components/lectures`, `editor` | P2 |
| `materials` | материалы, библиотека, читалка, файлы, импорт | `app/materials|library|reader`, `components/library|reader`, `shared/file-engine` | P2 |
| `trainers` | тренажёры, атлас, микропрепараты, гистология | `app/trainers|atlas`, `components/trainers` | P2 |
| `labs` | интерактивные лабораторные | `app/labs`, `components/labs` | P3 |
| `schedule` | расписание, звонки, iCal, планировщик | `app/schedule`, `components/schedule` | P2 |
| `homework` | ДЗ, задания, отработки, сдача | `app/homework|assignments`, `components/constructor` (частично) | P2 |
| `progress` | прогресс, академическое состояние, журнал | `app/progress|academic|journal` | P3 |
| `community` | лента, комментарии, жалобы | `app/community`, `components/community` | P3 |
| `workshop` | мастерская, версии, модерация | `app/workshop`, `components/workshop` | P2 |
| `teaching` | кабинет преподавателя (обзор, тесты, назначения, студенты) | `app/teacher`, `components/teacher`, `routes/teacher/` | P1 |
| `admin` | админ-консоль (users, access, content, database, audit) | `app/admin/*`, `components/admin` | P3 |
| `account` | вход, сессии, настройки, привязки, удаление | `app/login|register|settings|auth`, `components/auth` | P2 |
| `university` | портал вуза, импорт, сохранённое | `app/university`, `components/university` | P3 |
| `search` | поиск и подсказки | `app/search`, `lib/api/search` | P2 |
| `shared` | UI-кит, редактор, типы вопросов, файлы, права | `components/ui`, `shared/*`, `lib/question-types` | **P1** (каркас) |

---

## 4. «Предметы» вместо «Химии»

Сейчас химия — отдельный раздел верхнего уровня (`app/chemistry/{elements,lab,practice,tools}`), хотя это предмет, а не раздел платформы. Целевая модель:

```text
/subjects                        каталог предметов (есть)
/subjects/<slug>                 карточка: план, тесты, материалы, тренажёры
/subjects/<slug>/chemistry/...   подмодуль химии (таблица Менделеева, лаборатория, практика, инструменты)
/subjects/<slug>/math/...        подмодуль математики (появится)
```

Правила перехода:

- `chemistry` становится **подмодулем** `modules/subjects/submodules/chemistry`, а не самостоятельным модулем: у него нет собственной навигации и прав.
- Контракт подмодуля: `{ slug, title, tabs: [{key,label,view}], api }` — карточка предмета рендерит вкладки из реестра подмодулей, новый предмет = новая запись, без правки страницы.
- Старые URL сохраняются **редиректами 308**: `/chemistry`, `/chemistry/elements`, `/chemistry/lab`, `/chemistry/practice`, `/chemistry/tools` → соответствующие `/subjects/<slug>/chemistry/...`. Ни одна закладка и ссылка из поиска не ломается.
- ✅ `components/chemistry` переехал в подмодуль (12 компонентов + баррель), внешние импорты идут только через баррель. `components/chem` (исторический дубль, 154 строки) удаляется на следующем этапе после проверки, что все импорты идут через баррель.
- Химические данные и `lib/chemistry/` остаются на месте: это модель предмета, её не переписываем.

---

## 5. Общая папка (`shared/`) — как в неё попадать

Идея «сначала в общую папку, потом подключаем в модуль» фиксируется так:

**Повышение до `shared/`:**
1. элемент нужен ≥2 модулям (или модулю и `app/`);
2. у него стабильный публичный контракт (параметры, типы, поведение);
3. он зарегистрирован в `docs/architecture/registry/components.json` (`id`, `version`, `compatible_modules`, `owner`);
4. он не знает о ролях, БД и конкретном предмете (иначе это модуль, а не shared).

**Понижение из `shared/`:** остался один потребитель → элемент возвращается в модуль и удаляется из реестра (`deprecated` + `replaced_by`, затем удаление).

**Запрещено класть в `shared/`:** страницы, хуки с сетевыми вызовами конкретного домена, типы одного домена «на всякий случай». Это главный источник будущей свалки.

---

## 6. Кабинет преподавателя в этой схеме

Кабинет уже реализован и в целевой схеме — модуль `teaching`:

- страницы `app/teacher/*` — тонкие, данные из `modules/teaching/api`;
- сервер уже разнесён: `workers/api/src/routes/teacher/{core,tests,assignments,assigned-tests,students,_shared}.ts` — **это образец для остальных модулей**;
- область видимости — `lib/teacher-scope.ts` (`loadTeacherScope` / `isWithinTeachingScope`), роли — `lib/permissions.ts` (`MANAGERS = ["admin","moderator"]`, `teacher` не админ);
- изоляция: `modules/teaching` **не импортирует** `workshop` и `admin` — ни UI, ни API. Скрытие разделов в навигации не считается защитой: сервер отдаёт 403 (`moduleGate`), это проверяется тестами;
- результаты студентов — только по своим/подключённым тестам, детализация 1–4 — `result_detail_levels`; ручной проверки открытых ответов нет, финальный вердикт даёт AI.

Что осталось по кабинету (не входит в перенос): живые проверки под ролью `teacher` на проде — нужен тестовый аккаунт с паролем (сейчас есть только студенческий e2e-аккаунт без пароля).

---

## 7. Как переносить без поломок

1. **Шим-реэкспорт:** старый путь (`src/components/<module>/X.tsx`) превращается в `export * from "@/modules/<module>/ui/X";` на один релиз. Ни один импорт не ломается, перенос идёт файл за файлом.
2. **`git mv` вместо «переписать»:** сначала физический перенос, отдельным коммитом — только правка импортов. Смешивать перенос и изменение поведения запрещено.
3. **Порядок:** каркас и правила → `shared` → `subjects` (с химией) → `tests` → остальные P2 → P3.
4. **Один модуль = один PR/этап.** После каждого: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:unit`, `cd workers/api && npm run check`. Для серверных переносов дополнительно — smoke `/health` и один реальный маршрут модуля на проде.
5. **Откат:** этап обратим `git revert` (только переносы и шимы), БД и API не затрагиваются.

---

## 8. Оценка объёма в токенах

Расчёт от фактов §1: ~100 000 строк исходников TS/TSX (≈1,2 млн токенов самого кода), 1 строка ≈ 12 токенов. Сессия агента — 120–200k контекста, поэтому работа делится на заходы.

### Вариант A — физическое разнесение с шимами (рекомендуемый)

Агент не перечитывает каждую строку: он читает граф импортов, делает `git mv`, правит импорты, добавляет баррели.

| Этап | Содержание | Вход, токенов | Выход, токенов | Заходов |
|---|---|---:|---:|---:|
| A0 | каркас `modules/`, правила, ESLint-границы, баррели-заглушки | 60–90k | 15–25k | 1 |
| A1 | `shared`: ui, question-types, file-engine, permissions | 90–140k | 25–40k | 1–2 |
| A2 | `subjects` + подмодуль химии + редиректы | 250–350k | 60–90k | 2–3 |
| A3 | `tests` (+tickets/practice/cards) | 300–420k | 70–110k | 3 |
| A4 | `lectures` + `editor` + `materials/library/reader` | 380–520k | 90–130k | 3–4 |
| A5 | `trainers/atlas`, `labs`, `embryology`, `physiology` | 260–360k | 60–90k | 2–3 |
| A6 | `schedule`, `homework/assignments`, `progress` | 260–360k | 60–90k | 2–3 |
| A7 | `teaching`, `workshop`, `account`, `search` | 280–380k | 65–95k | 2–3 |
| A8 | `admin` (крупнейшая поверхность, 24 страницы) | 300–420k | 70–100k | 3 |
| A9 | сервер: `workers/api/src/modules/*` по образцу `routes/teacher/` | 300–420k | 70–100k | 3 |
| A10 | чистка дублей (`chem/`), редиректы, документы, проверки | 80–120k | 20–35k | 1–2 |
| **Итого A** | | **≈ 2,6–3,8 млн** | **≈ 0,6–0,9 млн** | **≈ 24–33** |

Практический ориентир: **~3–4 млн токенов суммарно**, из них 70 % — чтение. Это ~25–30 заходов по 120–150k.

### Вариант B — перенос с переписыванием компонентов

Если по ходу ещё и переписывать монолиты (1221-строчный `schedule`, 1084-строчный `subjects/[id]`, `admin.ts` на 1445 строк) — к варианту A добавляется чтение + генерация каждого файла (≈2× объём кода):

**≈ 7–10 млн токенов, 45–60 заходов.** Делать только для конкретных монолитов и только когда модуль и так трогается по задаче.

### Вариант C — минимальный (только каркас и границы)

Каркас, `shared`, ESLint-границы, перевод 2–3 самых больных страниц на модули, остальное остаётся: **≈ 0,5–0,8 млн токенов, 4–6 заходов.** Даёт 80 % пользы (новый код сразу ложится правильно), но старые папки остаются.

### Что это значит по моделям

Количество токенов одинаково для GPT-класса и DeepSeek — различается цена за токен и длина контекста (у DeepSeek кэш повторного префикса дешевле, что для переносов с большим объёмом чтения выгодно). Стоимость в деньгах считать по тарифу на дату работы; в токенах ориентир — из таблицы выше.

---

## 9. Куда ложится остальной backlog

| Задача из истории | Модуль | Что это значит на практике |
|---|---|---|
| Сортировка тестов/вопросов по темам занятий | `tests/model` | группировка по `lessonKey` в модели, страницы не меняются |
| Объединить задания и расписание в один экран | `schedule` + `homework`, общий `shared/agenda` | единый компонент «день → предмет → ДЗ», два API остаются раздельными |
| Разбор учебных файлов и перенос вопросов в БД | `materials` (импорт) + `shared/file-engine` | импорт — отдельный подмодуль, пишет через серверный API, не из браузера |
| Перенос функций на Cloudflare | `modules/*/api` + `endpoints.ts` | меняется только реализация маршрута, UI и контракт ответа те же |
| Кабинет преподавателя | `teaching` | §6 |
| Химия → предметы | `subjects` | §4 |

---

## 10. Границы задачи

- Никаких изменений БД, RLS, миграций и API-контрактов в рамках переноса.
- Никакого изменения поведения страниц: только расположение файлов, импорты и баррели.
- `main` — единственная ветка; один этап = один коммит/PR с зелёными проверками из §7.4.
- Секреты и `.env` не читаются и не коммитятся.

---

## 11. Проверки после каждого этапа

```bash
npm run typecheck
npm run lint
npm test                      # включает test/endpoints-registry.test.mjs и test/component-registry.test.mjs
npm run test:unit
npm run predeploy:audit
cd workers/api && npm run check
```

Плюс вручную: открыть затронутый раздел на проде, проверить консоль и один реальный запрос модуля.

---

## 12. П2: реестр подмодулей, fitness-тесты, кэш списков, ADR

Сделано 2026-11-19. Решения зафиксированы в [adr/](adr/README.md): 0001 —
реестр подмодулей, 0002 — кэш списков.

### 12.1. Реестр подмодулей предмета

```text
src/modules/subjects/
  registry.json      данные: slug, title, summary, subjectSlugs, tabs[{key,label,hint,href}]
  registry.ts        типы + доступ: getSubmodule, requireSubmodule, submoduleForSubject, submoduleTab
  index.ts           публичная поверхность модуля (единственный вход снаружи)
  submodules/<slug>/ подмодуль: index.ts + <Pascal>Module.tsx
```

- Источник истины — `registry.json`. Карточка предмета берёт подмодуль через
  `submoduleForSubject(slug)`; регулярка по названию осталась только запасным
  вариантом для предметов, которых в реестре нет.
- Новый подмодуль: `node scripts/new-module.mjs math --title "Математика" --subject math_analysis --tab limits:Пределы`.
  Генератор пишет каталог, баррель, скелет UI (вкладки читает из реестра) и
  запись в реестр; занятый слаг, занятый предмет или существующий каталог — отказ.
  `--dry-run` показывает план без записи.
- Инварианты (`test/subject-submodules.test.mjs`): уникальные слаги и вкладки,
  предмет не принадлежит двум подмодулям, каждая `href` ведёт на существующую
  `page.tsx`, вкладки химии совпадают с `SECTIONS` в `ChemistryModule` по
  порядку и дословно.

### 12.2. Architecture fitness-тесты

`test/architecture-fitness.test.mjs` + `scripts/audit-loc.mjs`:

| Правило | Лимит | Baseline |
|---|---|---|
| `src/app/**/page.tsx` | 200 строк | 48 файлов зафиксированы, расти нельзя |
| файл `workers/api/src/routes/**/*.ts` | 400 | 21 файл зафиксирован |
| файл `src/modules/**/*.{ts,tsx}` | 400 | 2 файла зафиксированы |
| каждый файл маршрутов | — | должен импортироваться из `workers/api/src/index.ts` |
| `src/modules` | — | без циклов импортов, без импортов `src/app` и чужих модулей |

Baseline — «крыса»: файл, уже превысивший лимит, записан в
`docs/architecture/registry/loc-budgets.json` по текущему размеру. Обновлять
только осознанно: `node scripts/audit-loc.mjs --write` (сначала посмотреть отчёт
без `--write`). Удалённый файл из baseline убирается — на это есть отдельная
проверка. Так правило работает сразу и не требует сначала разнести все монолиты.

Текущее состояние на момент записи: 40 страниц, 22 файла маршрутов и 2 файла
модулей сверх лимита; крупнейшие страницы — `tutor` (561), `teacher` (556),
`admin/teachers` (533), `tests/bank/[id]` (526); из воркера — `tests.ts` (991),
`lectures.ts` (792), `telegram-trainer.ts` (789). Эти файлы — очередь на
разнесение, а не разрешение расти. Из очереди выбыли `schedule` (959 → 83, §12.5),
`subjects/[id]` (884 → 55, §12.6), `ai.ts` (1366 → 21), `study-prep.ts`
(1301 → 28), главная, подготовка к тестам, `admin/attestations`, `workshop`,
`university/import` и `search` (§12.7).

### 12.3. Кэш и пагинация списков

- `workers/api/src/lib/cache.ts`: именованные политики `{ttlSeconds, staleSeconds}`.
  Свежая запись — из кэша, устаревшая — сразу из кэша + обновление в
  `waitUntil`, промах — загрузчик. Нет Redis / ошибка чтения или записи —
  fail-open, запрос идёт в БД. Ключ `cache:v1:<политика>:<hash>` не зависит от
  порядка параметров.
- `workers/api/src/lib/pagination.ts`: `limit`/`offset` необязательные.
  Без них тело ответа прежнее (`{items}`); с ними — `{items, page:{limit,offset,total,has_more}}`.
  Мусор в параметрах зажимается, а не роняет запрос.
- Применено к `GET /subjects` (каталог): кэшируется выборка из Supabase,
  дедупликация по слагу выполняется после кэша. Контракт без `limit`/offset не
  изменился.

**Ограничение:** политику нельзя включать для ответов, зависящих от роли или
персональных данных (сдачи, оценки, сообщения) — ключ кэша роли не знает.

### 12.4. ADR

`docs/architecture/adr/`: `README.md` (индекс и правила), `0000-template.md`,
`0001-submodule-registry.md`, `0002-list-cache-policy.md`. Запись после принятия
не переписывается — изменение оформляется новым ADR.

### 12.5. Разнесение `schedule/page.tsx`

`src/app/schedule/page.tsx` 959 → 83 строки. Перенос без изменения поведения и
разметки:

| Файл | Строк | Что внутри |
|---|---:|---|
| `components/schedule/model.ts` | 122 | чистые правила: статусы ДЗ (`homeworkState`/`homeworkStateLabel`), группировка по датам, фильтры планировщика, ДЗ занятия, недели семестра, подписи видов событий |
| `components/schedule/useSchedulePage.ts` | 507 | состояние, запросы (`getScheduleMeta` → `listSchedule` + `getStudentPlanner`, `getLessonPlan`), обработчики ДЗ/посещаемости, производные значения; тип `ScheduleController` |
| `components/schedule/ScheduleHeader.tsx` | 39 | группа/курс/семестр, источник данных, время Хабаровска, переключение недели |
| `components/schedule/HomeworkPlanner.tsx` | 111 | свёрнутый планировщик: поиск, фильтр по предмету и статусу, перенос срока |
| `components/schedule/RecoveryPanel.tsx` | 23 | «что нужно подтянуть» |
| `components/schedule/WeekView.tsx` | 75 | недельная сетка, карточки, линия «сейчас» |
| `components/schedule/DayView.tsx` | 70 | pill-дни и список занятий дня |
| `components/schedule/MonthView.tsx` | 86 | календарь месяца и колонка выбранного дня |
| `components/schedule/SemesterView.tsx` | 44 | метрики, прогресс, таймлайн недель |
| `components/schedule/LessonDrawer.tsx` | 201 | панель занятия: ДЗ, ответ и вложения, добавление ДЗ с умной вставкой, план, посещение |

Правила, которые держат перенос:

- `components/schedule/model.ts` не импортирует React — правила проверяемы отдельно;
- `test/now-parts.test.mjs` следит за цепочкой расчёта времени: хук → `components/schedule/utils` → `@/lib/now-parts` (свой расчёт времени в расписании запрещён);
- LOC-бюджет страницы обновлён вниз: `schedule/page.tsx` больше не в `loc-budgets.json`, лимит 200 применяется к нему как к обычной странице.

Живьём страница не открывалась: проверены типы, тесты и статический бюджет; визуальную сверку нужно сделать в браузере.

### 12.6. Разнесение `subjects/[id]/page.tsx`

Карточка предмета: 884 → 55 строк. Перенос без изменения поведения и разметки:

| Файл | Строк | Что внутри |
|---|---:|---|
| `useSubjectPage.ts` | 416 | состояние страницы, вкладка из `?tab=`/`#hash`, цикл статуса темы, открытие лекции/материала, навигация разделов; тип `SubjectController` |
| `subject-loaders.ts` | 176 | две волны загрузки: `loadSubjectCore` (каталог, предмет, план, тесты) и `loadSubjectAux` (зачётка, материалы, прогресс, лекции); типы `Subject`, `Module`, `SubjectCoreLoad` |
| `SubjectHeader.tsx` | 101 | шапка: название, нагрузка, зачётка, верхняя навигация и чипсы подразделов |
| `SubjectPortalPanels.tsx` | 65 | вкладки «Платформы», «Рецепты», «Структуры», «Коллоквиум», «Занятия» |
| `SubjectStudyPanels.tsx` | 164 | вкладки «План», «Экзамен / Билеты», «Тесты», «База вопросов», «Лекции», «Материалы» |
| `SubjectPracticePanels.tsx` | 102 | вкладки «Тренажёры», «Препараты», «Лабораторные», «Аттестации», «Прогресс» |
| `MaterialReader.tsx` | 46 | модальная читалка материала |

Правила, которые держат перенос:

- панели вкладок не знают о загрузке: всё приходит через `SubjectController`;
- вкладка по-прежнему одна на страницу: каждая панель рендерит только свою `tab` и не дублирует условия;
- `test/d9-cancelled-pages.test.mjs` собирает исходник страницы **и файлы её домена, которые она импортирует** (явная карта «страница → домен»), поэтому проверка `useApiRequest` действует и после переноса, а старые компоненты домена в проверку не попадают; расписание добавлено в список проверяемых страниц;
- карточка предмета ушла из `loc-budgets.json` (71 → 69 записей) и теперь подчиняется общему лимиту 200 строк.

Живьём страница не открывалась: проверены типы, тесты и статический бюджет.


### 12.7. Разнесение очереди: страницы, воркеры, импорт и поиск

Восемь целей из списка разнесены механически — разметка и поведение
перенесены один-в-один, изменилось только расположение кода.

| Было | Стало | Строк | Куда |
|---|---:|---:|---|
| `src/app/page.tsx` | 55 | 846 | `components/home/`: `dashboard-model.ts`, `useHomeDashboard.ts`, `HomeHero.tsx`, `HomeSignedOut.tsx`, `HomeWidgets.tsx` |
| `tests/preparation/[id]/page.tsx` | 65 | 1114 | `components/test-prep/`: `answers.ts`, `view.ts`, `usePreparation.ts`, `PreparationModePicker`, `PreparationResults`, `QuestionNavigator`, `ChoiceAnswer`, `OtherAnswers`, `AnswerVerdict`, `QuestionCard`, `PreparationRunner` |
| `workers/api/src/routes/ai.ts` | 21 | 1366 | `routes/ai/`: `helpers.ts`, `study-context.ts`, `providers.ts`, `conversations.ts`, `chat.ts`, `notes.ts` |
| `workers/api/src/routes/study-prep.ts` | 28 | 1301 | `routes/study-prep/`: `planning.ts`, `daily-quests.ts`, `plan-routes.ts`, `quest-routes.ts` |
| `admin/attestations/page.tsx` | 87 | 745 | `components/admin/attestations/`: `model.ts`, `useAttestationEditor.ts`, `AttestationListPanel`, `StageItemEditor`, `AttestationEditorPanel` |
| `workshop/page.tsx` | 160 | 713 | `components/workshop/`: `model.ts`, `WorkshopFile.tsx`, `useWorkshopPage.ts`, `WorkshopComposer.tsx`, `WorkshopDetail.tsx` |
| `university/import/page.tsx` | 114 | 635 | `components/university/import/`: `model.ts`, `useUniversityImport.ts`, `UploadCard`, `DestinationCard`, `PreviewSection` |
| `search/page.tsx` | 76 | 606 | `components/search/`: `model.ts`, `useSearchPage.ts`, `SearchForm.tsx`, `SearchSuggestions.tsx`, `SearchResults.tsx` |
| `useSubjectPage.ts` | 416 | 541 | загрузка вынесена в `components/subjects/subject-loaders.ts` |

Правила, которые держат перенос:

- баррели воркеров по-прежнему называются `ai` и `studyPrep` и реэкспортируют
  публичные хелперы (`buildLectureContext`, `normalizeChatMode`, `PREP_KINDS`,
  `prepReadinessForEvents`), поэтому имена импортов не менялись;
- тесты, читавшие текст одного файла, получают актуальный источник:
  `workers/api/test/ai-source.js` и `domain-source.js` для воркеров,
  `page-source.js` для страниц. Хелпер страниц теперь раскрывает импорты
  `@/components/...` рекурсивно (до трёх уровней), иначе проверки по тексту
  «проходили» бы по пустому месту после второго переноса;
- сами проверки не ослаблены: те же строки ищутся в тех же по смыслу местах;
- из `loc-budgets.json` ушли все разнесённые страницы (69 → 64 записи), лимит
  200 строк применяется к ним как к обычным страницам.

Проверки: `npx tsc --noEmit` — чисто; `npm test` — 366/367 (падает только
`histology-content` из-за отсутствующих исходников методички в worktree);
`npm run test:unit` — 721/721; `cd workers/api && npm run check` — 515/515;
`node --test test/architecture-fitness.test.mjs` — 6/6; eslint по изменённым
каталогам — 0 ошибок и 0 предупреждений.

Проверено дополнительно: dev-сервер (`next dev`) отдаёт 200 для всех восьми
маршрутов (`/`, `/search`, `/university/import`, `/subjects/[id]`,
`/tests/preparation/[id]`, `/workshop`, `/admin/attestations`, `/tests`) — в
HTML нет ошибок рендера, лог dev-сервера чистый; разнесённые виды (`SearchForm`,
`SearchResults`, `PreparationResults`) рендерятся в jsdom из своих данных.
Полная визуальная сверка в браузере недоступна без `.env.local`: клиентский
`AuthProvider` уводит неавторизованного пользователя на `/login`, а Supabase в
рабочей копии не настроен, поэтому страницы под авторизацией не открываются.

### 12.8. Очередь на разнесение (снимок 2026-11-19, base `fab432d9`)

Восемь целей §12.7 закрыты; ниже — всё, что осталось сверх LOC-лимитов на
ту же дату. Цифры сняты командой `node scripts/audit-loc.mjs` и продублированы
машиночитаемо в `docs/architecture/registry/loc-budgets.json` (baseline: файл
зафиксирован по текущему размеру, расти ему нельзя).

Итого: **40 страниц** сверх 200 строк, **22 файла маршрутов** сверх 400,
**2 файла модулей** сверх 400. Крупнейшие: `tutor` (561), `teacher` (556),
`tests.ts` (991).

**Страницы (`src/app/**/page.tsx`)** — 40 файлов сверх лимита 200 строк.

| № | Файл | Строк |
|---:|---|---:|
| 1 | `src/app/tutor/page.tsx` | 561 |
| 2 | `src/app/teacher/page.tsx` | 556 |
| 3 | `src/app/admin/teachers/page.tsx` | 533 |
| 4 | `src/app/tests/bank/[id]/page.tsx` | 526 |
| 5 | `src/app/admin/tests/page.tsx` | 518 |
| 6 | `src/app/admin/schedule/page.tsx` | 509 |
| 7 | `src/app/subjects/[id]/lesson/[n]/page.tsx` | 503 |
| 8 | `src/app/admin/test-questions/page.tsx` | 484 |
| 9 | `src/app/admin/test-import/page.tsx` | 455 |
| 10 | `src/app/admin/academic/page.tsx` | 441 |
| 11 | `src/app/login/page.tsx` | 440 |
| 12 | `src/app/admin/access/page.tsx` | 416 |
| 13 | `src/app/teacher/preview/[id]/page.tsx` | 410 |
| 14 | `src/app/tests/page.tsx` | 384 |
| 15 | `src/app/settings/data/page.tsx` | 382 |
| 16 | `src/app/homework/page.tsx` | 359 |
| 17 | `src/app/admin/moderation/page.tsx` | 325 |
| 18 | `src/app/subjects/page.tsx` | 314 |
| 19 | `src/app/admin/audit/page.tsx` | 313 |
| 20 | `src/app/study/page.tsx` | 313 |
| 21 | `src/app/trainers/feed/[subject]/page.tsx` | 310 |
| 22 | `src/app/admin/tools/page.tsx` | 302 |
| 23 | `src/app/group/page.tsx` | 264 |
| 24 | `src/app/study/import/page.tsx` | 260 |
| 25 | `src/app/admin/telegram/page.tsx` | 259 |
| 26 | `src/app/admin/groups/page.tsx` | 253 |
| 27 | `src/app/admin/users/page.tsx` | 249 |
| 28 | `src/app/curriculum/page.tsx` | 247 |
| 29 | `src/app/tests/attempt/[testId]/page.tsx` | 247 |
| 30 | `src/app/materials/page.tsx` | 238 |
| 31 | `src/app/lectures/[id]/learn/page.tsx` | 235 |
| 32 | `src/app/lectures/page.tsx` | 234 |
| 33 | `src/app/admin/content-package/page.tsx` | 230 |
| 34 | `src/app/university/page.tsx` | 230 |
| 35 | `src/app/bookmarks/page.tsx` | 228 |
| 36 | `src/app/tickets/page.tsx` | 227 |
| 37 | `src/app/admin/announcements/page.tsx` | 226 |
| 38 | `src/app/admin/ai-usage/page.tsx` | 221 |
| 39 | `src/app/journal/page.tsx` | 209 |
| 40 | `src/app/admin/workshop/page.tsx` | 202 |

**Файлы маршрутов воркера** — 22 файлов сверх лимита 400 строк.

| № | Файл | Строк |
|---:|---|---:|
| 1 | `workers/api/src/routes/tests.ts` | 991 |
| 2 | `workers/api/src/routes/lectures.ts` | 792 |
| 3 | `workers/api/src/routes/telegram-trainer.ts` | 789 |
| 4 | `workers/api/src/routes/trainers.ts` | 716 |
| 5 | `workers/api/src/routes/settings.ts` | 667 |
| 6 | `workers/api/src/routes/search.ts` | 659 |
| 7 | `workers/api/src/routes/staff.ts` | 658 |
| 8 | `workers/api/src/routes/srs.ts` | 618 |
| 9 | `workers/api/src/routes/homework.ts` | 590 |
| 10 | `workers/api/src/routes/export.ts` | 571 |
| 11 | `workers/api/src/routes/study-prep/plan-routes.ts` | 562 |
| 12 | `workers/api/src/routes/auth.ts` | 550 |
| 13 | `workers/api/src/routes/card-packs.ts` | 542 |
| 14 | `workers/api/src/routes/teacher/assigned-tests.ts` | 512 |
| 15 | `workers/api/src/routes/labs.ts` | 469 |
| 16 | `workers/api/src/routes/study-prep/planning.ts` | 460 |
| 17 | `workers/api/src/routes/materials.ts` | 455 |
| 18 | `workers/api/src/routes/community.ts` | 451 |
| 19 | `workers/api/src/routes/ai/helpers.ts` | 421 |
| 20 | `workers/api/src/routes/telegram-ingest.ts` | 404 |
| 21 | `workers/api/src/routes/admin-schedule.ts` | 402 |
| 22 | `workers/api/src/routes/block8.ts` | 401 |

**Файлы модулей (`src/modules/**`)** — 2 файлов сверх лимита 400 строк.

| № | Файл | Строк |
|---:|---|---:|
| 1 | `src/modules/subjects/submodules/chemistry/PeriodicTable.tsx` | 614 |
| 2 | `src/modules/subjects/submodules/chemistry/LabBench.tsx` | 517 |

Порядок разумного захода: сначала маршруты воркера (`tests.ts`, `lectures.ts`,
`telegram-trainer.ts`, `trainers.ts`) — они повторяют уже отработанный шаблон
баррель + домены и проверяются тестами воркера; затем страницы админки
(`admin/teachers`, `admin/tests`, `admin/schedule`, `admin/test-questions`,
`admin/test-import`, `admin/academic`) — у них общий паттерн «панель + хук +
модель»; `tutor`/`teacher` — в последнюю очередь, там больше всего поведения.

Инварианты при разнесении те же, что в §12.5–§12.7: переносы механические,
тесты читают домен, имена роутеров и публичные реэкспорты сохраняются,
LOC-бюджет обновляется только вниз.

### 12.8.1. Прогресс разнесения — 2026-11-19

Разнесено **22 файлов маршрутов воркера** (проверено: `npx tsc --noEmit` чисто,
`cd workers/api && npm run check` — 529/529):

| Файл | Было | Стало | Куда |
|---|---:|---:|---|
| `tests.ts` | 991 | **17** | tests/: 01-catalog, 02-history, 03-banks, 04-attempts, shared, types |
| `telegram-trainer.ts` | 789 | **21** | telegram-trainer/: 01-cards, 02-review, 03-challenge, 04-prefs, 05-formula, 06-morning, shared, types |
| `lectures.ts` | 792 | **19** | lectures/: 01-cloze, 02-catalog, 03-media, 04-slides, 05-detail, shared, types |
| `trainers.ts` | 716 | **15** | trainers/: 01-feed, 02-answer, 03-image, shared, types |
| `settings.ts` | 667 | **17** | settings/: 01-profile, 02-identities, 03-telegram, 04-sessions + profile/identities/telegram/shared/types |
| `search.ts` | 659 | **13** | search/: 01-search, 02-suggest, collect, shared, types + sources/{subjects,preparations,materials,lectures,questions,tickets,packs,tests} |
| `staff.ts` | 658 | **19** | staff/: 01-groups, 02-requests, 03-fixes, 04-topics, 05-notifications, shared, types |
| `srs.ts` | 618 | **23** | srs/: 01-summary, 02-cards, 03-review, 04-delete, 05-due, 06-root, fsrs, shared, types |
| `homework.ts` | 590 | **17** | homework/: 01-create, 02-submit, 03-submissions, 04-edit, shared, types |
| `export.ts` | 571 | **14** | export/: 01-export, 02-deletion, shared, types |
| `study-prep/plan-routes.ts` | 562 | **15** | study-prep/plan/: 01-plan, 02-agent, 03-achievements, shared, types |
| `auth.ts` | 550 | **15** | auth/: 01-session, 02-telegram, 03-me, shared, types |
| `card-packs.ts` | 542 | **17** | card-packs/: 01-list, 02-crud, 03-import, 04-ai, shared, types |
| `teacher/assigned-tests.ts` | 512 | **19** | teacher/assigned-tests/: 01-create, 02-list, 03-delete, 04-analytics, 05-export, types |
| `labs.ts` | 469 | **21** | labs/: 01-templates, 02-start, 03-session, 04-checkpoints, 05-finish, 06-results, shared, types |
| `materials.ts` | 455 | **17** | materials/: 01-list, 02-file, 03-detail, 04-open, shared, types |
| `community.ts` | 451 | **17** | community/: 01-posts, 02-comments, 03-moderation, 04-admin-reports, shared, types |
| `admin-schedule.ts` | 402 | **23** | admin-schedule/: 01-resolve, 02-versions, 03-save, 04-rollback, 05-entry-update, 06-entry-delete, 07-analytics, shared, types |
| `telegram-ingest.ts` | 404 | **12** | telegram-ingest/: 01-health, 02-ingest, shared, types |
| `block8.ts` | 401 | **17** | block8/: 01-invites, 02-invite-accept, 03-join-requests, 04-sos, shared, types |
| `ai/helpers.ts` | 421 | **4** | ai/helpers/: text, media, providers, lecture (баррель переэкспортирует) |
| `study-prep/planning.ts` | 460 | **7** | study-prep/planning/: constants, types, dates, topics, readiness, days, store |

Общий шаблон: баррель (`routes/<name>.ts`) только импортирует домены и регистрирует их в исходном
порядке; обработчики перенесены построчно; общие хелперы и типы — в `shared.ts`/`types.ts`.
Порядок регистрации сохранён, поэтому статичные пути по-прежнему выигрывают у параметрических.

Отдельно `search.ts`: `collect()` на 410 строк стал оркестратором, каждый источник
(предметы, препараты, материалы, лекции, вопросы, билеты, паки, тесты) — в
`search/sources/<kind>.ts` с общим `SourceContext`. Порядок источников и все фильтры
(`include`/`allowed`, `materialHint`, `subjectSlug`) сохранены без изменений.

Тесты, читавшие текст одного файла, переведены на `workers/api/test/<name>-source.js`
(баррель + все файлы домена, рекурсивно). `domain-source.js` рекурсивный — вложенные домены
(`study-prep/plan`, `teacher/assigned-tests`) попадают в проверки. Assert'ы не ослаблены:
там, где сравнивалась *глубина относительного пути* импорта, теперь принимается `..`, `../..`
и т.д. — сам импорт по-прежнему обязателен.

#### Осталось (полный список, 0 + 40 + 2)

Файлы маршрутов сверх 400 строк:



Страницы сверх 200 строк:

- `src/app/tutor/page.tsx` — 561
- `src/app/teacher/page.tsx` — 556
- `src/app/admin/teachers/page.tsx` — 533
- `src/app/tests/bank/[id]/page.tsx` — 526
- `src/app/admin/tests/page.tsx` — 518
- `src/app/admin/schedule/page.tsx` — 509
- `src/app/subjects/[id]/lesson/[n]/page.tsx` — 503
- `src/app/admin/test-questions/page.tsx` — 484
- `src/app/admin/test-import/page.tsx` — 455
- `src/app/admin/academic/page.tsx` — 441
- `src/app/login/page.tsx` — 440
- `src/app/admin/access/page.tsx` — 416
- `src/app/teacher/preview/[id]/page.tsx` — 410
- `src/app/tests/page.tsx` — 384
- `src/app/settings/data/page.tsx` — 382
- `src/app/homework/page.tsx` — 359
- `src/app/admin/moderation/page.tsx` — 325
- `src/app/subjects/page.tsx` — 314
- `src/app/admin/audit/page.tsx` — 313
- `src/app/study/page.tsx` — 313
- `src/app/trainers/feed/[subject]/page.tsx` — 310
- `src/app/admin/tools/page.tsx` — 302
- `src/app/group/page.tsx` — 264
- `src/app/study/import/page.tsx` — 260
- `src/app/admin/telegram/page.tsx` — 259
- `src/app/admin/groups/page.tsx` — 253
- `src/app/admin/users/page.tsx` — 249
- `src/app/curriculum/page.tsx` — 247
- `src/app/tests/attempt/[testId]/page.tsx` — 247
- `src/app/materials/page.tsx` — 238
- `src/app/lectures/[id]/learn/page.tsx` — 235
- `src/app/lectures/page.tsx` — 234
- `src/app/admin/content-package/page.tsx` — 230
- `src/app/university/page.tsx` — 230
- `src/app/bookmarks/page.tsx` — 228
- `src/app/tickets/page.tsx` — 227
- `src/app/admin/announcements/page.tsx` — 226
- `src/app/admin/ai-usage/page.tsx` — 221
- `src/app/journal/page.tsx` — 209
- `src/app/admin/workshop/page.tsx` — 202

Модули сверх 400 строк:

- `src/modules/subjects/submodules/chemistry/PeriodicTable.tsx` — 614
- `src/modules/subjects/submodules/chemistry/LabBench.tsx` — 517

### 12.8.2. Дубли и страницы — 2026-11-19

#### Слитые дубли (было в §12.8.1 как «зафиксировано, ничего не слито»)

| Функция | Было копий | Куда слито |
|---|---:|---|
| `constantTimeEqual` | 6 (4 в маршрутах + 2 в lib) | `lib/timing.ts`; маршруты (`telegram`, `telegram-digest`, `telegram-ingest/shared`, `telegram-trainer/shared`) импортируют/реэкспортируют из lib |
| `escapeHtml` | 2 | `lib/html-escape.ts` |
| `getCallerRoles` | 2 (`labs`, `admin-schedule`) | `lib/caller-roles.ts` |
| `bodyJson` | 4 (`admin/shared`, `my-lectures`, `my-questions`, `my-tools`) | `lib/request-body.ts` |

Осознанное исключение: `lib/telegram-initdata.ts` и `lib/telegram-widget.ts` остаются
самодостаточными (без импортов) — это зафиксировано тестом
`telegram initData module stays dependency-free and log-free`. Их локальные
`constantTimeEqual`/`hmacSha256`/`normalizeUserId` — часть инварианта, а не дубли.

Осталось не слито: `getJson` (`histologyContent` ↔ `physiologyContent`), `readJson`
(`study/page` ↔ `StudySection`, разные слои — сервер/клиент), storage-хелперы во фронтенде
(4 файла), `postHttps`/`unauthorized` в GigaChat-пути (сейчас не находятся как отдельные
функции — проверять при следующем проходе).

#### Страницы: разнесено 40 из 40 (вторая волна — 2026-11-20)

Вторая волна разнесла оставшиеся 38 страниц по единому паттерну
(page.tsx = тонкая shell, `useXxxPage.ts` = состояние/запросы, компоненты секций,
`model.ts` = общие типы). Первая волна — journal, ai-usage (см. ниже).

| Кластер | Страниц | Куда вынесено |
|---|---:|---|
| admin/tests (bank, admin tests/questions/import/academic, catalog, attempt) | 7 | `src/components/tests-hub/`, `src/components/admin/tests-hub/`, `src/components/test-prep/` |
| admin-панели (teachers, schedule, access, moderation, audit, tools, telegram, groups, users, announcements, content-package, workshop) | 12 | `src/components/admin/panels/`, `src/components/admin/schedule-hub/` |
| студенческие (tutor, teacher, preview, login, homework, study, study/import, group, curriculum) | 9 | `src/components/tutor/`, `src/components/teacher/`, `src/components/auth/`, `src/components/homework/`, `src/components/study/`, `src/components/group/`, `src/components/curriculum/` |
| контентные (subjects lesson/catalog, settings/data, trainers/feed, materials, lectures, lectures/learn, university, bookmarks, tickets) | 10 | `src/components/subjects/lesson|catalog/`, `src/components/settings/`, `src/components/trainers/`, `src/components/materials/`, `src/components/lectures/`, `src/components/university/`, `src/components/bookmarks/`, `src/components/tickets/` |

Крупнейшая из страниц после сплита — 126 строк (teacher). Все ≤ 200.

#### Модули: разнесено 2 из 2

| Модуль | Было | Стало | Куда |
|---|---:|---:|---|
| `chemistry/PeriodicTable.tsx` | 614 | **21** (обёртка) | `chemistry/periodic/` (model, usePeriodicTable, ячейка/сетка/фильтры/легенда/детали) |
| `chemistry/LabBench.tsx` | 517 | **48** (обёртка) | `chemistry/lab/` (model, ui, Titration/Electrochemistry/Spectroscopy) |

#### Маршруты воркера

0 файлов сверх лимита 400: все домены разнесены на подпапки
(`admin/`, `admin-parity/`, `admin-schedule/`, `ai/`, `auth/`, `block8/`, `card-packs/`,
`community/`, `export/`, `homework/`, `labs/`, `lectures/`, `materials/`, `search/`,
`settings/`, `srs/`, `staff/`, `study-prep/`, `teacher/`, `telegram-*`, `tests/`,
`trainers/`, `workshop/` и др.).

#### Бюджеты и стражи

- `registry/loc-budgets.json` v2: исключений нет, лимиты: страницы 200,
  маршруты 400, модули 400. Новые исключения — только через ADR.
- `test/architecture-fitness.test.mjs` (6 тестов): бюджеты, достижимость маршрутов,
  циклы импортов в modules, границы модулей.
- D9-страж (`test/d9-cancelled-pages.test.mjs`) обходит транзитивный граф
  импортов домена (до 3 хопов) и дополнен картой второй волны;
  `SubjectAssignments.tsx` мигрирован на `useApiRequest` (последний ручной
  `cancelled`-флаг в графе страниц).
- Контракт-тесты воркера читают страницы через `test/page-source.js`
  (`readPageWithDomain`, транзитивный обход) — код вызовов API теперь в хуках,
  контракты продолжают проверяться.

#### Дедупликация хелперов (§12.8.1) — итог

| Хелпер | Дубли | Канон |
|---|---:|---|
| `constantTimeEqual` | 3 | `lib/timing.ts`; telegram-initdata/widget — намеренные копии (parity-инвариант, тест `dependency-free`) |
| `hmacSha256` | 2 | `lib/timing.ts` (канон); telegram-либы — намеренные копии |
| `escapeHtml` | 4 | `lib/html-escape.ts` |
| `bodyJson` | 4 | `lib/request-body.ts` |
| `getCallerRoles` | 4 | `lib/caller-roles.ts` |
| `readJson` | 2 | не дубль: разные функции (Request vs Response) |

Слито 2026-11-20 (вторая волна дедупликации):
- `getJson` ×4 (histology/physiology/portal/subject-plan) → канон
  `src/lib/content-json.ts` (`fetchContentJson`, no-cache + signal);
  политики кэша остались у каждого модуля;
- download-хелпер ×4 (features-api / api/teacher / chemistry/export /
  lectures/exportLecture) → канон `src/lib/download.ts` (`downloadBlob`);
  URL-кэши картинок (files.ts, workshop.ts) — не скачивания, не тронуты;
- `escapeHtml` ×3 фронтенда (LectureRenderer / chemistry/formula /
  exportLecture) → канон `src/lib/html-escape.ts` (concat-форма).

Кандидат «periodic-table.ts осиротел» снят: файл используется страницами
`/periodic` и `/tools` (PeriodicTableView смонтирован).

#### Исправленные по ходу дефекты

- `moduleGate`: опция `denyRoles` принималась, но игнорировалась (workshop
  закрывался для teacher «случайно», через общую teacher-ветку). Опция реализована
  после специализированных веток — исходы для текущих вызывающих не изменились.
- ESM-импорты типов как значений (`AuthVariables`, `TeacherEnv`) в сплит-файлах —
  tsc их прощает, а node ESM падает; переведены на `type`-импорты.
- lint: 294 warnings (после сплитов) → 38 (7 осознанных `<img>`, остальное —
  немые параметры/пропуски верификатора).

## 13. Правила добавления новых функций (2026-11-20)

Главная цель: новая функция добавляется независимо, без правки десятков
несвязанных файлов. Куда что ложится:

### Новый подмодуль предмета
```bash
node scripts/new-module.mjs <slug> --title "Название" \
  [--subject <slug-предмета>] --tab <key>:<Label> [--dry-run]
```
Генератор создаёт `submodules/<slug>/` и дописывает в `registry.json`.
Скелет читает вкладки из реестра — код модуля править не нужно.
Проверка: smoke-цикл 2026-11-20 (генерация → typecheck + subject-submodules
11/11 + fitness 6/6 → откат). Подсказка вкладки обязательна: генератор
подставляет дефолт, если `--tab-hint` не передан.

### Новая страница
1. `src/app/<route>/page.tsx` — тонкая shell (≤200 строк, цель ≤130):
   композиция, Suspense, гейты входа. Server-компонент с metadata —
   metadata остаётся в shell.
2. `src/components/<домен>/use<Feature>.ts` — состояние и запросы через
   `useApiRequest` (D9: никаких ручных `cancelled`-флагов).
3. `src/components/<домен>/model.ts` — общие типы и чистые хелперы.
4. Секции UI — отдельные компоненты с явными props.
Стражи: `audit-loc.mjs` (лимит 200), `test/d9-cancelled-pages.test.mjs`
(транзитивный обход домена до 3 хопов).

### Новый маршрут воркера
1. Файл в `workers/api/src/routes/<домен>/` (лимит 400 строк) или субфайлы
   `01-<crud>.ts` + `shared.ts` + `types.ts` по образцу существующих доменов.
2. Guard обязателен: `requireAuth`/`requireAdmin`/`requireTeachingCapability`
   для закрытых, `rateLimit` для публичных по замыслу. Страж:
   `workers/api/test/route-guards.test.js` (allowlist — только с комментарием
   почему).
3. Эндпоинт — в реестр эндпоинтов (`src/lib/endpoints.ts`), контракт-тест —
   в `workers/api/test/contracts.test.js`.

### Новые общие хелперы
Один канонический файл в `lib/` (как `timing.ts`, `html-escape.ts`,
`request-body.ts`, `caller-roles.ts`, `cache.ts`, `pagination.ts`). Дубли
функций запрещены исключением: самодостаточные parity-копии (см. §12.8.1,
telegram-initdata/widget) — только с тестом-инвариантом.

### Кэш списков
Только для ответов, одинаковых для всех ролей и редко меняющихся
(ADR-0002): политика в `CACHE_POLICIES`, `cached(...)` в маршруте,
`store: getRedis(c.env)`. Свежесть/оценки/сообщения кэшировать нельзя.

### 12.9. PdfMentor bridge

`workers/api/src/routes/mentor.ts` — оболочка (`export { default } from
"./mentor/index"`), реализация в `routes/mentor/`:

| Файл | Ответственность |
|---|---|
| `model.ts` | TTL кода, нормализация `PDFMENTOR_URL`, HMAC, constant-time сравнение |
| `store.ts` | одноразовые коды: Upstash `getdel`, память — только dev-фоллбек |
| `index.ts` | `config`, `sso`, `sso/exchange`, `context`; rate-limit и аудит |

Правила: подпись проверяется до расходования кода; код не попадает в query и
логи; без `BRIDGE_SECRET` обмен закрыт (fail-closed), а не «работает как-нибудь».
Контракт — `MEDBIOHIM_PDFMENTOR_API_CONTRACT.md`, тест —
`workers/api/test/mentor-bridge.test.js`. Фронтенд `/mentor` отправляет код
POST-формой (form_post) и не содержит адресов PdfMentor в коде.

### 12.10. Микропрепараты: методички

Каталог препаратов остаётся в `trainer_feed_cards` / `trainer_atlas_cards`;
методички — отдельная таблица, не второй каталог.

| Файл | Ответственность |
|---|---|
| `workers/api/src/routes/preparations.ts` | `GET /preparations/guides`, `/guides/:key`, `/structures`; без миграции — `migrated: false`, а не 503 |
| `src/lib/histologyAtlas.ts` | индекс гидов, `guideForCard`, фильтры атласа (структура → орган → ткань → сложность) |
| `src/components/trainers/PreparationGuidePanel.tsx` | единственная панель методички: атлас и диагностикум |
| `workers/api/src/routes/admin/preparation-guides.ts` | чтение (`admin`, `moderator`) и upsert по `key` (`admin`, service-role) |

Контент правится в `src/data/histology-preparations.json`, SQL собирается
`scripts/preparation-guides-sql.mjs` (идемпотентные upsert-ы); точечные правки —
через `/admin/preparation-guides`. Второй просмотрщик/панель не заводится.

### 12.11. Диагностикум

Один движок и пять режимов — `identify`, `structures`, `differential`, `complex`,
`schema`; отдельный «экзаменатор» не создаётся.

| Файл | Ответственность |
|---|---|
| `routes/diagnosticum/model.ts` | сборка задания и ключа, подбор карточки с изображением |
| `routes/diagnosticum/grading.ts` | проверка набора, баллы, 4 уровня подсказок |
| `routes/diagnosticum/shared.ts` | загрузка гидов/карточек/структур, чтение попытки |
| `routes/diagnosticum/index.ts` | обзор разделов, `POST /start` |
| `routes/diagnosticum/session.ts` | `/hint`, `/answer`, `/stats`, `/mistakes` |

Ключ ответа живёт в `diagnosticum_attempts.answers` и не входит в колоночные
гранты — до ответа его нет в браузере. Попытка закрывается один раз (повтор — 409).
UI — **формат заданий** внутри тренажёра (`/trainers/feed/histology?format=identify`,
`DiagnosticumRunner`, `DiagnosticumStats`): в настройках тренажёра выбирается
«Карточки препаратов» либо один из режимов диагностикума; отдельной вкладки и
отдельной страницы нет, `/trainers/diagnosticum` только редиректит на тренажёр. Атлас, тренажёр и диагностикум делят один банк
препаратов; ошибки уходят в повторение через `?cards=` того же тренажёра,
второй режим повторения не заводится.

### 12.12. Офлайн-очередь и идемпотентность

| Файл | Ответственность |
|---|---|
| `src/lib/offline/{db,queue,index}.ts` | IndexedDB-outbox: порядок, остановка на сети, снятие окончательных 4xx, лимит 200 |
| `src/components/pwa/OfflineIndicator.tsx` | «ждут сети: N», автоотправка при `online`, ручная кнопка |
| `workers/api/src/lib/idempotency.ts` | результат по `client_id` в Redis, TTL 7 дней |

`origin` принимается только `"user"` (иначе 422); повтор с тем же `client_id`
возвращает прежний результат с `replayed: true`, а не второй ответ. Service worker
не кэширует `/api/` и `/auth/` — персональные данные в Cache Storage не попадают.

### 12.13. Общие модули браузер ↔ Worker (`src/shared`)

Правило, которое обязано совпадать на клиенте и на сервере, живёт в `src/shared`
и импортируется обоими контурами; две копии такого правила запрещены (исключение —
самодостаточные parity-копии с тестом-инвариантом, §12.8.1).

| Модуль | Общее правило |
|---|---|
| `src/shared/histology/preparation-match.ts` | нормализация ключа препарата и «гид ↔ карточка» (атлас и диагностикум) |
| `src/shared/lectures/lecture-title.ts` | сравнимое название лекции (лента портала и проверка дублей перед публикацией) |

Модули чистые: без DOM, БД и `process.env`. Worker импортирует их относительным
путём; в файле, который грузит node-тест напрямую, расширение `.ts` обязательно.
Тесты: `src/lib/__tests__/preparation-match.test.ts`,
`src/components/portals/__tests__/ArchiveLecturesMerge.test.tsx`.
