# Технический аудит «Медбиохим» и план работ

**Дата:** 27.10.2026
**Ревизия:** `main` @ `2d9861d9` (feat(admin): единый каркас навигации и разделы CMS)
**Объект:** `medbiohim-main` — Next.js 15 / React 19 / Tailwind 3, PHP-backend, Cloudflare Workers API, Supabase.
**Статус документа:** план. В рамках аудита код не изменялся.

---

## 0. Как читать документ

- **Исходный чек-лист** (P0/P1/P2 + дизайн + навигация + химия) проверен пункт за пунктом по текущему коду.
- Каждый пункт получил вердикт: `✅ сделано` / `🟡 частично` / `❌ не сделано` / `⚪ неактуально`.
- Отдельно вынесены **дефекты, которых в чек-листе нет** — они найдены в ходе проверки и часть из них важнее исходных пунктов.
- План разбит на **волны** и **задачи с ID**, у каждой задачи: работа → критерии приёмки (DoD) → оценка в человеко-днях.

---

## 1. Резюме (главное за 2 минуты)

1. **Исходный чек-лист частично устарел.** Он составлен по более старой ревизии: номера строк сдвинуты, а 11 пунктов уже закрыты. Пример: в `src/app/page.tsx` строка 100 — `useState<Dash | null>(null)`, строка 31 — `Record<string, unknown>`; в `AuthProvider.tsx:51` — `useState<AppUser | null>(null)`. `npm run typecheck` проходит с **0 ошибок**.
2. **Typecheck уже фактически блокирует merge**, но косвенно: `code-check.yml` → `npm run predeploy:audit` → `scripts/predeploy-audit.mjs:411-412` (`typecheck` + `build`). А вот **lint не запускается ни в одном workflow**.
3. **`npm run lint` сейчас красный: 147 errors / 327 warnings.** Из них 132 — в gitignored `workers/api/.wrangler/` (мусор), реальных ошибок — **15**; в `src/` — **0 ошибок**.
4. **App Router-обязательные файлы отсутствуют полностью**: нет `loading.tsx`, `error.tsx`, `not-found.tsx`, нет ни одного error boundary (`componentDidCatch`/`getDerivedStateFromError` — 0 совпадений). Любая ошибка рендера в prod = стандартная страница Next.js.
5. **Найдены два реальных функциональных дефекта в химии, не упомянутых в чек-листе:**
   - `ChemicalFigure.tsx:58-63` не разбирает конверт `{ok,data}` Worker'а → **структуры формул в лекциях/тестах/билетах не отображаются никогда** (показывается «Структура недоступна»). Правка ~3 строки.
   - `GET /tests/chemistry-master` (`workers/api/src/routes/tests.ts:227`) читает **несуществующую таблицу** `chemistry_master` и при ошибке молча отдаёт `ok({items:[]})` → вкладка «Химия» в `/tests` **всегда пустая с кодом 200** (баг замаскирован).
6. **Безопасность:** оба токена в `localStorage`; в backend/worker **нет ни одного `Set-Cookie`/`HttpOnly`**, то есть переход на cookies — не «правка фронта», а отдельный проект с изменениями Worker + прокси + CSRF.
7. **Refresh-логика продублирована:** single-flight есть в `api.ts:208-251`, но **3 места обходят его** собственным `fetch('/auth/refresh')` (`api.ts:323`, `:577`, `refreshSession` `:507`) → риск шторма refresh-запросов.
8. **CI-процесс опаснее, чем отсутствие lint:** **15 workflow с `contents: write` и `git push origin HEAD:main`** (`apply-*`, `fix-*`, `restore-*`) пушат в `main` мимо PR и мимо `code-check`.
9. **Дизайн:** статусные цвета используются ad-hoc (`emerald-*` 171, `rose-*` 128, `amber-*` 114 совпадений), при этом `.badge-success/-danger/-warning` объявлены и **не используются ни разу**. Контраст в светлой теме: success **2.54:1**, warning **2.15:1**, danger **3.76:1** — ниже AA.
10. **Производительность/типографика:** Google Fonts подключены блокирующим `@import` (`globals.css:1`), `next/font` не используется; `tabular-nums` — 2 места на 18 таблиц; шрифт `Inter`/`Plus Jakarta Sans` объявлен дважды и по-разному (`globals.css:147` vs `tailwind.config.ts:37-43`).
11. **Навигация:** `window.location.href` в 15 местах, из них реальных «полных перезагрузок» — 4 (`TopBar` поиск, login, register, callback); `<a href="/...">` остался 1 (`AuthProvider.tsx:175`); Sidebar — 11 пунктов, MobileNav — уже bottom-tab-bar из 6.
12. **Химия:** ядро (PubChem → 2D/3D/проекции/механизмы) работает; отсутствуют периодическая таблица, VSEPR/гибридизация, ABG/Михаэлис–Ментен/Аррениус/АТФ, пошаговые решения, генератор задач, химические симуляции, экспорт. При этом в БД лежат **10 мёртвых таблиц `chemical_*`** без единого упоминания в коде.

**Итоговая оценка объёма:** ~95–125 человеко-дней на всё; критический путь до «здорового» состояния (волны 0–1) — **~3 недели** одного разработчика.

---

## 2. Метод и что реально проверено

| Проверка | Команда/способ | Результат |
|---|---|---|
| Типы | `npx tsc --noEmit` | exit 0, ошибок нет |
| Линт (src) | `npx eslint src -f json` | 0 errors, 33 warnings |
| Линт (весь репозиторий, 290 файлов) | `npx eslint .` | 147 errors / 327 warnings |
| Обязательные файлы App Router | glob `src/app/**/{loading,error,not-found,global-error,template}.tsx` | 0 файлов |
| Error boundaries | grep `componentDidCatch|getDerivedStateFromError` | 0 |
| Полные перезагрузки | grep `window.location.(href|assign|replace)` | 15 совпадений |
| Внутренние `<a>` | grep `<a ... href="/` | 1 (`AuthProvider.tsx:175`) |
| `window.location.search` | grep | 9 файлов (вместо `useSearchParams`) |
| Токены | grep `Set-Cookie|HttpOnly|SameSite` в `backend/`, `workers/` | 0 |
| CI-гейты | чтение `.github/workflows/*` (26 файлов) | lint не вызывается нигде |
| Метрики `api.ts` | подсчёт по файлу | 828 строк, 171 функция, 194 строковых пути (148 уникальных), 152 `<any>`, 90 `as any` |
| Контраст | расчёт WCAG по CSS-переменным | см. § 5.1 |
| Химия | чтение `src/lib/chemistry/**`, `workers/api/src/routes/chemistry.ts`, SQL-миграций | см. § 7 |

**Ограничение:** поведенческие тесты в песочнице не запускались (`node --test` не может спавнить процессы — EPERM). Все выводы по тестам — статические (наличие файлов, подключение к CI).

---

## 3. Статус исходного чек-листа

### 3.1 P0 — типы и сборка

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 1 | `npm run typecheck` + strict | ✅ | `strict: true`, exit 0 | — |
| 2 | `page.tsx:32` `useState(null)` | ✅ | `page.tsx:100` уже `useState<Dash \| null>(null)` | — |
| 3 | `page.tsx:10` `Record` | ✅ | `page.tsx:31` `Record<string, unknown>` | — |
| 4 | `AuthProvider.tsx:18` `useState(null)` | ✅ | `AuthProvider.tsx:51` `useState<AppUser \| null>(null)` | — |
| 5 | `api.ts:7-8` `any` в `AcademicState` | ❌ | `api.ts:6-18` — 10 полей `any` | типизировать домен, § 6 D1 |
| 6 | `as SomeType` → type guards | 🟡 | 264 приведения `as Type` в `src`, из них ~99 в `api.ts`; guards отсутствуют | § 6 D3 |
| 7 | CI: typecheck + lint блокируют merge | 🟡 | typecheck идёт внутри `predeploy:audit`; lint — нигде | § 6 A1–A3 |

### 3.2 P0 — навигация

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 8 | `TopBar` `window.location.href` → `router.push` | ❌ | `TopBar.tsx:31` (поиск) | § 6 C1 |
| 9 | Заменить `<a href="/` на `<Link>` | 🟡 | остался 1: `AuthProvider.tsx:175` | § 6 C5 |
| 10 | Sidebar/MobileNav — `<Link>`, не `<a>` | ✅ | оба на `next/link` | — |

### 3.3 P0 — обязательные файлы App Router

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 11 | `app/loading.tsx` | ❌ | нет; скелетон только внутри страниц | § 6 B3 |
| 12 | `app/error.tsx` | ❌ | нет; error boundary отсутствует в принципе | § 6 B1 |
| 13 | `app/not-found.tsx` | ❌ | нет | § 6 B2 |
| 14 | `loading.tsx` во вложенных тяжёлых маршрутах | ❌ | нет ни одного | § 6 B3 |

### 3.4 P1 — безопасность и надёжность

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 15 | `localStorage` → HttpOnly cookies | ❌ | нет `Set-Cookie` ни в PHP, ни в Worker; прокси прозрачный | § 6 E1–E3 |
| 16 | Обработка истечения refresh | 🟡 | single-flight есть; 3 обхода; `INVALID_REFRESH` чистит токены только в одном пути | § 6 D8 |
| 17 | `AbortController` / `cancelled` в `useEffect` | 🟡 | в `request()` контроллер есть; в `AuthProvider.bootstrap` — нет; на страницах — частично | § 6 D9 |
| 18 | «setState on unmounted» | 🟡 | часть страниц с флагом `cancelled`, часть без | § 6 D9 |
| 19 | Ошибки без стектрейса | 🟡 | стектрейсов нет, но утекают `HTTP 500`, «не загружены в Supabase», англ. `compound not found` | § 6 B4–B5 |
| 20 | Унифицировать retry | ❌ | `isTemporaryAuthFailure` локален в `AuthProvider`; generic retry отсутствует | § 6 D7 |

### 3.5 P2 — архитектура и тесты

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 21 | `src/lib/endpoints.ts` | ❌ | 194 строковых пути, 148 уникальных, реестра нет | § 6 D4 |
| 22 | Разделить `api.ts` | ❌ | 828 строк, 171 функция, 28 типов | § 6 D5 |
| 23 | `useApiRequest` / TanStack Query | ❌ | ручные `loading/error/retry` в каждой странице | § 6 D6 |
| 24 | Unit-тесты guards/утилит | ❌ | нет раннера вообще (ни jest/vitest/playwright) | § 6 G1–G2 |
| 25 | Интеграционные тесты навигации | ❌ | нет | § 6 G3 |
| 26 | `test:api-failover` + `test:physiology` в CI | 🟡 | failover — да; physiology — нет; ещё 5 root-тестов не подключены никуда | § 6 A5 |

### 3.6 P2 — дизайн

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 27 | Токены статусов | 🟡 | есть `--success/--danger/--warning`, нет ok/pending/neutral; `.badge-*` мертвы | § 5.1 |
| 28 | Статус = цвет + иконка + текст | 🟡 | точки без подписи: `TopBar.tsx:36`, `AttestationRunner.tsx:337-345` | § 5.1 |
| 29 | Контраст ≥ 4.5:1 | ❌ | success 2.54, warning 2.15, danger 3.76, `text-slate-400` 2.56, границы 1.19 | § 5.1 |
| 30 | Бренд ≠ статус | 🟡 | синий используется и как бренд, и как «информация» | § 5.1 |
| 31 | `tabular-nums` | ❌ | 2 места на 18 таблиц | § 5.2 |
| 32 | Кириллица в шрифте | 🟡 | `@import` Google Fonts; `Inter` есть, `Plus Jakarta Sans` — без гарантии кириллицы; `next/font` 0 | § 5.2 |
| 33 | «ёлочки», em/en-dash | 🟡 | 84 «ёлочки», тире ок; `...` вместо `…` в части мест | § 5.2 |
| 34 | Единицы рядом с числом | 🟡 | `BloodNormTableTrainer`: значения в %, `%` в шапке нет | § 5.2 |
| 35 | Два режима плотности | ❌ | нет | § 5.3 |
| 36 | Скелетоны вместо спиннеров | 🟡 | `SkeletonCards` в 3 страницах; `animate-spin` в 47 файлах | § 5.3 |
| 37 | Пустые состояния с CTA | 🟡 | 45 пустых состояний, CTA у ~4 | § 5.3 |
| 38 | Ошибки текстом + «Повторить» | 🟡 | текст есть, retry-кнопок почти нет | § 5.3 |
| 39 | Тёмная тема `#0f1115` / `#e5e7eb` | 🟡 | classic-dark `#0b1220`/`#e5e7eb`, midnight `#0f0a1a` — близко, но не спецификация | § 5.4 |
| 40 | Контраст в тёмной теме | ✅ | 14.33 / 6.92 / статусы 6.41–10.63 | — |
| 41 | Приглушённые статусы | ✅ | пастельные 34d399 / f87171 / fbbf24 | — |
| 42 | Явный переключатель темы | ✅ | 7 тем, выбор в `/settings`, `localStorage` + сервер | — |

### 3.7 P2 — формы и графики

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 43 | Label над полем | 🟡 | 112 `<label>` против 105 `placeholder=`; есть явные placeholder-as-label | § 5.5 |
| 44 | Ошибки под полем | ❌ | `aria-invalid` / `aria-describedby` — 0; ошибки только баннером | § 5.5 |
| 45 | Единицы в label/суффикс | ❌ | нет ни одного суффикса | § 5.5 |
| 46 | Автосохранение черновика | ❌ | только прогресс аттестации; `beforeunload` — 0 | § 5.5 |
| 47 | Оси с подписями и единицами | ❌ | единственный график — SVG-донат `RadialProgress` | § 5.6 |
| 48 | Референсные зоны заливкой | ❌ | нет | § 5.6 |
| 49 | Палитра для дальтоников | ❌ | жёсткие `#10B981/#6366F1/#F59E0B` | § 5.6 |
| 50 | Tooltip с точным значением | ❌ | нет | § 5.6 |
| 51 | Экспорт CSV рядом с графиком | ❌ | CSV только ad-hoc в админке | § 5.6 |

### 3.8 P1 — навигация (UX)

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 52 | Sidebar 11 → 6-7 | ❌ | `Sidebar.tsx:28-40` — ровно 11 | § 5.7 |
| 53 | Группировка по смыслу | ❌ | плоский список | § 5.7 |
| 54 | 5-6 плоских + «Ещё» | ❌ | нет | § 5.7 |
| 55 | Активный пункт через `startsWith` | ✅ | `Sidebar.tsx:91-92` | — |
| 56 | Усилить активный пункт | ✅ | `.app-sidebar-active` + тень; MobileNav — верхняя полоска | — |
| 57 | Поиск в MobileNav | ❌ | нет (есть в TopBar) | § 5.7 |
| 58 | Bottom tab bar | ✅ | `MobileNav.tsx` — 6 пунктов | — |
| 59 | Cmd/Ctrl+K | ❌ | нет | § 5.7 |
| 60 | Результаты поиска — клиентская навигация | ❌ | `TopBar.tsx:31` — полная перезагрузка | § 6 C1 |
| 61 | Единый язык интерфейса | 🟡 | UI русский; англ. шапки в админке (`MIME`, `Storage`, `Refs`, `SHA-256`); англ. ошибки API | § 5.2 |
| 62 | Хлебные крошки | ❌ | нет | § 5.7 |
| 63 | Сохранение позиции скролла | ❌ | нет | § 5.7 |
| 64 | `usePathname` vs `useSearchParams` | 🟡 | `useSearchParams` в 4 файлах, `window.location.search` — в 9 | § 6 C6–C7 |

### 3.9 P2 — химия

| # | Пункт | Статус | Факт | Действие |
|---|---|---|---|---|
| 65 | Интерактивная таблица 118 элементов | ❌ | нет; нет и таблицы `chemical_elements` | § 7 H3 |
| 66 | Визуализатор молекул + VSEPR/гибридизация | 🟡 | 2D/3D/проекции есть; VSEPR и гибридизации нет | § 7 H4 |
| 67 | ABG, анионный разрыв, клиренс креатинина | 🟡 | anion gap, Cockcroft-Gault, CKD-EPI — есть; ABG — нет | § 7 H5 |
| 68 | Кинетика (Михаэлис, Аррениус) | ❌ | нет | § 7 H5 |
| 69 | Расчёт АТФ | ❌ | нет | § 7 H5 |
| 70 | Пошаговые решения | ❌ | нет (`calculators.js` отдаёт только результат) | § 7 H5 |
| 71 | Валидация ввода/единиц | 🟡 | серверная валидация min/max есть; конверсии единиц и подсказок нет | § 7 H5 |
| 72 | Виртуальная лаборатория | ❌ | `labs` — учебные сессии, не симуляции; `lab_type` без `chemistry` | § 7 H7 |
| 73 | Банк задач + генератор вариантов | 🟡 | UI-вкладка есть, но данные всегда пустые (см. § 4, дефект B); генератора нет | § 7 H6 |
| 74 | Привязка к учебному плану/аттестациям | 🟡 | ChemPlan есть; в `AttestationRunner` хим. директивы рендерятся сырым текстом | § 7 H9 |
| 75 | Экспорт PDF/CSV | ❌ | PDF-стека нет; CSV — только админка | § 7 H8 |

**Итого:** 11 ✅ / 26 🟡 / 38 ❌ из 75.

---

## 4. Дефекты, которых нет в исходном чек-листе

Отсортированы по влиянию. Это то, что стоит починить раньше части пунктов P1/P2.

### 4.1 🔴 P0 — структуры формул не отображаются нигде, кроме Workbench

`src/components/chemistry/ChemicalFigure.tsx:58-63` ожидает «плоский» ответ `{molecule, error}`, а Worker отдаёт конверт `{ok:true, data:{molecule}}` (`workers/api/src/lib/response.ts`, `routes/chemistry.ts`). Условие `if (!res.ok || data.error || !data.molecule)` истинно всегда → компонент рисует «Структура недоступна» с текстом `[object Object]`.

Затронуто: лекции, тесты, билеты, любые встраивания `[chem:…]`/```chem``` (см. `ChemRichText`).
**Правка:** 3 строки (развернуть конверт так же, как `ChemistryWorkbench.tsx:39`). **Тест:** рендер лекции с формулой.

### 4.2 🔴 P0 — вкладка «Химия» в `/tests` всегда пустая, ошибка замаскирована

`workers/api/src/routes/tests.ts:224-231` читает таблицу `chemistry_master`, которой не существует (в миграциях есть только `chemistry_master_documents` и `chemistry_master_item_provenance`). При ошибке БД возвращается `ok({items: []})` — 200 и пусто. Это ровно тот класс «скрывает баги», против которого написан чек-лист.
**Правка:** читать реальную таблицу/вьюху, ошибку отдавать как `error`, добавить smoke-тест контракта.

### 4.3 🟠 P1 — три обхода single-flight refresh

`api.ts:208-251` содержит корректный `refreshPromise`, но `getTrainerImageUrl` (`:323`), `fetchMaterialFile` (`:577`) и `refreshSession` (`:507`) делают собственный `fetch('/auth/refresh')`. При параллельной загрузке 20 изображений и протухшем токене возможен шторм refresh.
**Правка:** один модуль сессии, все пути — через него.

### 4.4 🟠 P1 — CI пишет в `main` мимо ревью

15 workflow (`apply-*`, `fix-*`, `restore-*`) имеют `contents: write` и выполняют `git push origin HEAD:main` по `workflow_dispatch`. Они не проходят `code-check` и не оставляют ревьюируемого diff. `restore-*` восстанавливают код из коммита `835e5e43`.
**Правка:** вывести из эксплуатации, историю — в `docs/`, изменения — только через PR.

### 4.5 🟠 P1 — мигание темы (FOUC) и пустой первый кадр

`layout.tsx:27` жёстко ставит `data-theme="classic-light"`, реальная тема применяется в `useEffect` (`ThemeProvider.tsx:115-126`) — у пользователя тёмной темы белая вспышка. Дополнительно `AppShell.tsx:31-33` до `mounted` отдаёт пустой `div` — весь shell исчезает на первом кадре.
**Правка:** inline-скрипт в `<head>` + SSR-заглушка shell вместо `null`.

### 4.6 🟡 P2 — мёртвый актив в БД и два параллельных резолвера

- 10 таблиц `chemical_*` (`chemical_engine_beta.sql`) не используются ни одним эндпоинтом.
- Богатый Next-роут `/api/chemistry/resolve` (SMILES/InChI/CID, кэш 24 ч, валидация) **не вызывается никем**; живой путь — бедный Worker-роут только по `name/`.
**Правка:** выбрать один контракт; мёртвые таблицы либо оживить (офлайн-каталог), либо удалить.

### 4.7 🟡 P2 — тексты ошибок утекают в UI

- `api.ts:265`: `HTTP ${res.status}` и «Сервер вернул не JSON» показываются баннерами.
- `materials/page.tsx:153`: «Материалы пока не загружены **в Supabase**».
- `ChemistryWorkbench`: «compound not found», «query must contain 1–500 characters» — английские.
- `tests/page.tsx:321`: сырой enum `attempt.status`.

### 4.8 🟡 P2 — шрифты: блокирующий @import и рассинхрон

`globals.css:1` — `@import` Google Fonts (блокирует рендер, нет `preconnect`), `globals.css:147` — `Inter, "Plus Jakarta Sans"`, `tailwind.config.ts:37-43` — наоборот, `Plus Jakarta Sans, Inter`. Плюс `tailwind.config.ts` объявляет `primary: #6366F1`, а `--primary` в classic-light — `#2563eb`: две несовместимые палитры.

### 4.9 🟡 P2 — «пустой успех» вместо ошибки (анти-паттерн)

Помимо § 4.2: `tests.get("/curriculum-map")` (`tests.ts:220`), `adminOverview` при сбое БД и др. отдают `ok({items:[]})`. Это прямо противоречит принципу «не подставлять пустые данные вместо ошибки», который уже принят в `page.tsx` (баннер degraded).
**Правка:** политика «ошибка БД ≠ пустой список», аудит всех `catch → ok([])`.

---

## 5. Дизайн-система: детальный план

### 5.1 Цвет и статусы

**Факты.** Токены `--success/#10b981`, `--danger/#ef4444`, `--warning/#f59e0b` (globals.css:13-15, дубли в tailwind.config.ts:22-24). Классы `.badge-success/-danger/-warning` (globals.css:168-170) не используются. Статусы задаются классами по месту: emerald 171, rose 128, amber 114. В расписании — жёсткие hex (globals.css:377-381, 394).

**Контраст (расчёт WCAG, светлая тема, фон #fff):**

| Пара | Ratio | Вердикт |
|---|---|---|
| `--text` #0f172a | 17.85 | ✅ |
| `--muted` #64748b | 4.76 | ✅ (на грани) |
| `--muted` на `--primary-soft` | 4.37 | ❌ |
| `text-slate-400` | 2.56 | ❌ (146 вхождений) |
| white на #3b82f6 (конец градиента кнопки) | 3.68 | ❌ |
| `--success` #10b981 | 2.54 | ❌ |
| `--warning` #f59e0b | 2.15 | ❌ |
| `--danger` #ef4444 | 3.76 | ❌ |
| бейдж на 15 % заливке (success/danger/warning) | 2.19 / 3.10 / 1.91 | ❌ |
| `--border` (α 0.08) | 1.19 | ❌ (нужно 3:1 для границ полей) |
| Тёмная тема: text / muted / primary | 14.33 / 6.92 / 4.82 | ✅ |
| Тёмная тема: success / danger / warning | 9.23 / 6.41 / 10.63 | ✅ |
| Midnight: primary #6366f1 | 3.96 | ❌ |

**План.**
1. Ввести семантические токены в `globals.css` для всех 7 тем: `--status-ok`, `--status-warn`, `--status-critical`, `--status-info`, `--status-neutral`, `--status-pending` + пары `-fg`/`-bg`/`-border`.
2. Светлая палитра — 700/800-оттенки: success `#047857` (5.21), warning `#92400e` (6.84), danger `#be123c` (5.72) на фоне `-50`; тёмная — оставить текущие пастельные.
3. `--border` поднять до α ≈ 0.16 в светлой теме; `--input-border` — отдельный токен с ≥ 3:1.
4. Перевести `.badge-*` на токены, добавить иконки (`CircleCheck`, `Clock`, `AlertTriangle`, `Info`) — статус = цвет + иконка + текст.
5. Точечные индикаторы (`TopBar` колокольчик, `AttestationRunner`, `.schedule-current-pill`) — `aria-label` + `sr-only`-текст.
6. Скрипт `scripts/check-contrast.mjs` (парсит CSS-переменные, считает WCAG) + шаг в CI: падение при < 4.5 для текста и < 3.0 для границ.
7. Кодмод ~100 вхождений `text-emerald-*` / `text-rose-*` / `text-amber-*` → `text-[var(--status-*)]`.

**DoD:** 0 вхождений сырых `emerald/rose/amber` в `src/**` (кроме тестовых страниц), скрипт зелёный, все статусные бейджи имеют иконку и текст.

### 5.2 Типографика

1. `next/font/google` → `Inter` с `subsets: ["cyrillic","latin"]`, `display: "swap"`; удалить `@import`; синхронизировать `tailwind.config.ts` (один источник истины). Проверить глифы Ж, Щ, Д, ё, «», —, –, ≈, μ, °, ⁻.
2. `table, .tabular-nums { font-variant-numeric: tabular-nums }` — одной строкой закрывает все 18 таблиц; отдельно — карточки прогресса, баллы, дозировки.
3. Заменить `...` → `…`; унифицировать диапазоны `3,5–5,5` (en-dash, десятичная запятая — русская типографика).
4. Единицы — в шапку колонки (`Нейтрофилы, %`) и/или суффиксом в поле; в графиках — на осях.
5. Русифицировать служебные шапки админки (`MIME` → «Тип», `Storage` → «Хранилище», `Refs` → «Ссылки», `Object key` → «Ключ объекта»); расшифровать «П/я», «С/я» (палочкоядерные/сегментоядерные).

### 5.3 Плотность и состояния

1. `data-density="comfortable|compact"` на `<html>`; CSS-переменные `--cell-py`, `--row-gap`; переключатель в `/settings` + в шапке таблиц; `localStorage: mb_table_density` (уже есть паттерн `mb_app_theme`).
2. Скелетоны: `SkeletonText`, `SkeletonTable`, `SkeletonList`, `SkeletonCard`; заменить `animate-spin` (83 вхождения, 36 — в админке) и «Загрузка…» (48) в: `admin/*`, `trainers/*`, `university/*`, `tests/*`, `materials`.
3. `EmptyState { icon, title, description, action }` — 10 ключевых экранов: тесты, сообщество, материалы, объявления, расписание, ДЗ, прогресс, химия-банк, аттестации, поиск.
4. `ErrorState { title, message, requestId?, retry }` — вместо `HTTP 500`; «Повторить» вызывает сохранённый колбэк загрузки.

### 5.4 Тёмная тема

1. Inline-скрипт в `<head>`: читает `mb_app_theme`, ставит `data-theme` до гидрации (устраняет FOUC).
2. Добавить режим «Системная» (`prefers-color-scheme` + `storage=auto`) — единственный пункт чек-листа, который сейчас consciously отсутствует.
3. Выровнять палитры к спецификации: `#0f1115`/`#e5e7eb` для classic-dark либо задокументировать отклонение (`#0b1220`) как осознанное.
4. Починить primary в Midnight (`#818cf8` даст ~5.5:1).

### 5.5 Формы

1. Компонент `Field`: `label` (всегда над полем), `hint`, `unit` (суффикс справа), `error` под полем, `aria-describedby`, `aria-invalid`, `role="alert"` только при появлении ошибки.
2. Убрать placeholder-as-label в `settings:257-258`, `community:101,107`, `admin/academic:149,164`, `login`/`register` — проверить все 105 `placeholder=`.
3. Автосохранение черновика: `useDraft(key, value)` c debounce 800 мс + индикатор «Черновик сохранён»; минимум для: создание ДЗ, пост в сообществе, ответы на тест, редактор лекций, калькуляторы.

### 5.6 Графики

Сейчас единственная визуализация — SVG-донат без осей, тултипа и `role="img"`.
1. Обёртка `Chart` c `role="img"`, `aria-label` и текстовой сводкой (a11y).
2. Для метрик (`/progress`, `/academic`, химия) — линейные/точечные графики: оси с подписями и единицами, референсные зоны заливкой (`<rect>` с 8–12 % opacity), tooltip с точным значением и единицей.
3. Палитра Okabe–Ito (8 цветов) или Tableau CB10 — зафиксировать в токенах, не хардкодить.
4. Кнопка «CSV» рядом с графиком (Blob + `\uFEFF` для Excel), PDF — через `window.print()` с print-CSS как первый шаг (§ 7 H8).

---

## 6. Инженерный план

### Волна 0 — «стабильность и гейты» (≈8–10 дн., 1 неделя)

| ID | Задача | Работы | DoD | Оценка |
|---|---|---|---|---|
| A1 | Явные шаги CI | В `code-check.yml` отдельные шаги `npm run typecheck`, `npm run lint`, `npm run test:physiology`; кэш npm | PR с ошибкой типа падает с понятным именем шага | 0.5 |
| A2 | Починить lint | 15 реальных ошибок (8 автофиксом), ignores: `.wrangler/**`, `scripts/p0/**`, `browser-extension/**`; `backend/**` оставить | `npm run lint` = 0 errors | 0.5–1 |
| A3 | Lint как гейт | Required check на `main`/`beta`; правило «новый код без новых warnings» | Merge невозможен при красном lint | 0.5 |
| A4 | Вывод write-workflow | 15 файлов → `docs/architecture/ci-history.md`, файлы удалить; правила «изменения только через PR» | В `.github/workflows` нет `contents: write` + `git push` | 1 |
| A5 | Тесты в CI | Подключить все 7 root-тестов (`npm run test` = `node --test test/`) | В CI запускаются все 7 файлов (~120 кейсов), а не только `api-failover` | 0.5 |
| B1 | `error.tsx` + `global-error.tsx` | Клиентские компоненты, `reset()`, `digest` в console, без stack в UI | Ошибка рендера → брендированная страница с «Повторить» | 0.5 |
| B2 | `not-found.tsx` | Со ссылкой на главную и поиском | 404 → своя страница | 0.25 |
| B3 | `loading.tsx` | Корневой (скелетон дашборда) + `subjects/[id]`, `tests/bank/[id]`, `chemistry`, `admin` | Навигация показывает скелетон, нет «белого» перехода | 0.75 |
| H0 | Фикс `ChemicalFigure` | Развернуть конверт `{ok,data}` | Формула в лекции отображается; тест | 0.1 |
| C1 | Поиск без перезагрузки | `router.push('/search?q=…')` в `TopBar` | Переход без полной перезагрузки (проверить по `performance.navigation`) | 0.25 |
| C5 | `<a>` → `<Link>` | `AuthProvider.tsx:175` | grep `<a href="/` = 0 | 0.1 |

### Волна 1 — «надёжность и типы» (≈15 дн., 2–3 недели)

| ID | Задача | Работы | DoD | Оценка |
|---|---|---|---|---|
| D1 | Типы домена | `AcademicState`, `Dashboard`, `Subject`, `TestItem`, `ScheduleEntry` — конкретные интерфейсы вместо `any` (сейчас 10 `any` в `AcademicState`) | `api.ts` без `<any>` на этих методах | 1 |
| D3 | Type guards | `isAnnouncement`, `isProfile`, `isSubjectCard`, `isScheduleRow`, `isTestItem` + использование на границе API | 10 ключевых payload проходят guard; unit-тесты | 2 |
| D8 | Единый refresh | Модуль `src/lib/auth/session.ts`; все 4 пути через него; событие `mbh:session-expired`; редирект с `returnTo` | Тест «20 параллельных 401 → ровно 1 refresh» | 1 |
| D7 | `withRetry` | `src/lib/retry.ts` (экспоненциальная задержка, jitter, только идемпотентные GET, `retryOn`) | `isTemporaryAuthFailure` в одном месте | 1 |
| D9 | Отмена запросов | `useApiRequest` (или `useAsync`) + `AbortController`; миграция топ-10 страниц | Нет `setState` после unmount; отмена при смене маршрута | 2 |
| B4 | ErrorState + словарь ошибок | Маппинг `code → RU` (`NETWORK`, `UPVERS`, `DB_UNAVAILABLE`, `VALIDATION`, …) + `requestId` | 0 технических строк в UI; есть «Повторить» | 1 |
| B5 | Убрать утечки | `HTTP 500`, «Supabase», английские ошибки химии/калькуляторов | grep по технотексту в `src` = 0 | 0.5 |
| C2 | Роутер после логина | `router.replace('/')` + `refresh()` вместо `window.location.href` | Логин без перезагрузки | 0.5 |
| C6–C7 | `useSearchParams` | 9 файлов с `window.location.search` → хук (+ `Suspense` где нужно) | grep = 0; страницы не теряют query | 1.5 |
| E4 | Истечение сессии | Единый UX: «Сессия истекла» → `/login?next=…`; не разлогинивать при 5xx | Ручной сценарий + тест | 1 |
| G1–G2 | Vitest + 30 тестов | `vitest`, `jsdom`, `@testing-library/react`; тесты на `api()`, кэш, refresh, guards, `withRetry` | `npm run test:unit`, покрытие `lib/*` ≥ 60 % | 3.5 |

### Волна 2 — «архитектура и безопасность» (≈18 дн., 3–4 недели)

| ID | Задача | Работы | DoD | Оценка |
|---|---|---|---|---|
| D4 | `endpoints.ts` | Реестр 148 уникальных путей + билдеры с параметрами | 0 строковых путей вне реестра | 1.5 |
| D5 | Разбиение `api.ts` | `api/{client,cache,auth,admin,content,tests,trainers}.ts` + `index.ts` re-export | Импорты `@/lib/api` работают; бандл ±2 %; поведение без изменений | 4 |
| E1 | RFC cookies | Как выставлять `Set-Cookie` на same-origin прокси, CSRF, миграция, откат | Документ + ревью | 1 |
| E2 | Реализация cookies | Worker/прокси ставят `HttpOnly; Secure; SameSite=Lax`; body-токены остаются на переходный период | Логин/refresh/logout на cookies | 4 |
| E3 | Клиент на cookies | `credentials: same-origin`, удаление `localStorage`-токенов, очистка legacy | Нет токенов в `localStorage` | 2 |
| F1–F2 | Статусные токены + контраст | § 5.1 | Скрипт контраста зелёный | 3 |
| F3 | a11y-база | `:focus-visible`, skip-link, `aria-current` в Sidebar, `aria-pressed` для тем | Lighthouse a11y ≥ 95 на 5 страницах | 1 |

### Волна 3 — «полировка UX и продукт» (≈25–30 дн.)

F4 (tabular-nums), F5 (next/font), F6 (типографика), F7 (скелетоны), F8 (EmptyState), F9 (плотность), F10 (Field), F11 (FOUC + системная тема), F12 (графики), C8 (Sidebar 11 → 7), C9 (крошки), C10 (скролл), C11 (Cmd+K), G3 (Playwright smoke), H3–H6 (химия, см. § 7).

### Волна 4 — «химия: практика и выгрузка» (≈20 дн.)

H7 (виртуальная лаборатория), H8 (PDF/CSV), H9 (рендер химии в аттестациях), F13 (автосохранение черновиков).

---

## 7. Химия: продуктовый роадмап

### 7.1 Что уже есть

| Возможность | Статус | Где |
|---|---|---|
| Резолвер имени → PubChem | работает | `src/lib/chemistry/pubchem.ts`, `workers/api/src/routes/chemistry.ts` |
| SMILES/InChI/CID + кэш 24 ч + валидация | **есть, но не вызывается** | `src/app/api/chemistry/resolve/route.ts` |
| 2D (RDKit WASM с CDN, fallback PubChem PNG) | работает | `StructureView.tsx`, `rdkitClient.ts` |
| 3D (3Dmol с CDN + SDF PubChem) | работает | `Mol3DView.tsx`, `threedmolClient.ts` |
| Проекции Фишер/Haworth/Newman/Chair | частично (шаблоны) | `lib/chemistry/projections/*` |
| Механизмы с curly arrows | 2 демо | `lib/chemistry/mechanism/*` |
| Встраивание структур в текст | **сломано** (§ 4.1) | `ChemicalFigure.tsx`, `ChemRichText.tsx` |
| Калькуляторы | 8 клинических | `integrations/cloudflare-api/src/calculators.js` |

### 7.2 Фаза 1 — «справочник» (2–3 недели, ~7–9 дн.)

1. **H0** Фикс `ChemicalFigure` (0.1 д) — сразу возвращает ценность всему контенту.
2. **H1** Починить `/tests/chemistry-master`: реальная таблица/вьюха, ошибка ≠ пусто (0.5 д).
3. **H2** Единый резолвер: Worker принимает `SMILES:`/`InChI=`/CID, кэш на edge (KV/Cache API), таймаут, лимит запросов (1 д).
4. **H3 Периодическая таблица** (4–6 д):
   - данные: `src/data/elements.ts` — 118 записей × 14 полей (символ, имя RU/EN, Z, масса, категория, группа/период, конфигурация, электроотрицательность, температуры, открытие, биологическая роль, токсичность, применение в медицине);
   - источник: IUPAC/CIAAW (атомные массы), конфигурации — собственный датасет, лицензионно чистый;
   - UI: CSS-grid 18×7 + лантаноиды/актиноиды отдельным блоком, фильтр по категории, поиск, клавиатурная навигация, панель элемента, deep-link `/chemistry/elements/[Z]`;
   - тест: 118 элементов, все Z уникальны, массы в допуске.
5. **H4 VSEPR/гибридизация** (2–3 д): по SMILES/3D-конформеру определять стерическое число, геометрию (линейная, тетраэдр, тригонально-бипирамидальная…), гибридизацию, идеальные углы; показывать в 3D подсветкой.

### 7.3 Фаза 2 — «расчёты» (3–4 недели, ~10–12 дн.)

6. **H5 Калькуляторы** (6–8 д):
   - ABG: pH, pCO₂, HCO₃, BE, ожидаемая компенсация (Winter, метаболический/респираторный), mixed-ацидоз; delta-ratio;
   - анионный разрыв — есть, добавить коррекцию на альбумин;
   - кинетика: Михаэлис–Ментен (Vmax/Km по точкам, Lineweaver–Burk, Eadie–Hofstee), типы ингибирования; Аррениус (Ea по k/T);
   - АТФ: глюкоза (30–32 в зависимости от шаттла), β-окисление ЖК, кетоновые тела — с пошаговой стехиометрией;
   - архитектура: спецификация в JSON (`fields[]`, `compute()`, `steps[]`, `reference[]`, `units[]`) → одна страница рендерит любые калькуляторы; конверсия единиц (mmol/L ↔ mg/dL, кПа ↔ мм рт. ст.);
   - пошаговое решение: формула → подстановка → результат → интерпретация;
   - валидация: диапазоны, единицы, подсветка ошибок, предупреждения о нефизиологических значениях;
   - тесты: эталонные векторы из учебников (по 2–3 на калькулятор), клинический дисклеймер.
7. **H6 Банк задач + генератор** (4–5 д): схема `chemistry_questions` уже есть в `chemical_engine_beta.sql` (`difficulty`, теги) — оживить; генератор вариантов (параметризация шаблонов), уровни, привязка к темам учебного плана, интеграция с `AttestationRunner`.

### 7.4 Фаза 3 — «практика» (5–7 недель, ~15–20 дн.)

8. **H7 Виртуальная лаборатория**: расширить `lab_type` значением `chemistry`; три симуляции на SVG/Canvas: титрование (кривая, индикаторы, расчёт pH), электрохимия (Нернст, гальванический элемент), спектроскопия (закон Бугера–Ламберта–Бера, спектры). Каждая — с пошаговым протоколом и проверкой результатов.
9. **H8 Экспорт**: CSV результатов (Blob), PDF — `window.print()` с print-CSS на первом этапе, затем `pdf-lib`/серверный рендер; экспорт протокола лаборатории и расчётов.
10. **H9 Аттестации**: научить `AttestationRunner` рендерить `ChemRichText`/`ChemicalFigure` (сейчас сырой текст).

---

## 8. Порядок работ и зависимости

```
Волна 0 (нед. 1)   A1-A5, B1-B3, C1, C5, H0        ← разблокирует всё остальное
      │
Волна 1 (нед. 2-3) D1, D3, D7-D9, B4-B5, C2, C6-C7, E4, G1-G2
      │                 └─ тесты на api() пишутся до разбиения api.ts
Волна 2 (нед. 4-6) D4, D5, E1-E3, F1-F3
      │                 └─ cookies после D8 (единая сессия) и E4
Волна 3 (нед. 7-10) F4-F12, C8-C11, G3, H3-H6
      │                 └─ дизайн-токены до графиков и химии-UI
Волна 4 (нед. 11-14) H7-H9, F13
```

**Правила порядка:**
- не разбивать `api.ts` до появления тестов (иначе нечем доказать отсутствие регрессий);
- не вводить cookies до единого модуля сессии;
- не строить графики и химию-UI до статусных токенов (иначе двойная переделка);
- H0 — вне очереди, это баг, а не улучшение.

---

## 9. Definition of Done и quality gates

**Для любой задачи:**
1. `tsc --noEmit` — 0 ошибок; `eslint` — 0 новых ошибок; новые `any` запрещены (ratchet-правило).
2. Есть тест: unit для логики, smoke/Playwright для пользовательского сценария.
3. Нет новых `window.location.href` для внутренних переходов, нет `<a href="/…">`, нет `window.location.search` в новых компонентах.
4. Текст в UI — по-русски, без технических кодов; ошибка имеет действие.
5. Контраст новых цветов проверен скриптом; новые числа — `tabular-nums`.
6. Изменение описано в `docs/` (одна строка в changelog).

**Гейты (CI, блокирующие merge):**
- `typecheck` (frontend) + `typecheck` (workers/api, отдельный job);
- `lint` (0 errors);
- `test` — root-тесты (7 файлов) + `workers/api` (10 файлов) + `integrations` (35 файлов);
- `predeploy:audit` — оставить, но декомпозировать: контрактные grep-проверки вынести в отдельный job, чтобы падение было адресным;
- build.

**Целевые метрики через 3 месяца:**
- 0 `errors` в lint; 0 `any` в `AcademicState`/дашборде;
- 100 % маршрутов покрыты `error.tsx`/`loading.tsx` (корневой уровень);
- Lighthouse a11y ≥ 95 на `/`, `/schedule`, `/tests`, `/chemistry`, `/progress`;
- контраст: все пары ≥ 4.5:1 (текст) и ≥ 3:1 (границы);
- тесты: ≥ 60 unit-тестов, 5 Playwright-сценариев;
- p75 LCP < 2.5 с на мобильном; шрифты не блокируют рендер.

---

## 10. Риски и анти-цели

| Риск | Влияние | Митигация |
|---|---|---|
| Медицинские калькуляторы дадут неверный результат | высокая | эталонные тест-векторы, ревью преподавателем, дисклеймер «учебный расчёт» |
| Cookies без CSRF | высокая | `SameSite=Lax` + double-submit токен + ревью безопасности до выката |
| CDN-зависимости (RDKit, 3Dmol) | средняя | ленивая загрузка, pin версий, SRI, fallback на 2D-картинку, CSP с явным allowlist |
| PubChem rate limit (5 req/s) | средняя | edge-кэш, дедупликация запросов, лимит на пользователя |
| Разбиение `api.ts` ломает импорты | средняя | re-export шим + тесты + отдельный PR без функциональных правок |
| 15 write-workflow уже сломали историю | средняя | зафиксировать состояние, запретить, восстановить практику PR |
| Данные 118 элементов — лицензии | низкая | IUPAC/CIAAW (public), собственные описания |
| «Плотность» и темы конфликтуют | низкая | токены + визуальная регрессия на 7 темах |

**Анти-цели (не делать):**
- не переписывать `api.ts` «с нуля» и не тащить TanStack Query, пока нет тестов и `useApiRequest`;
- не добавлять 8-ю тему оформления (их уже 7) — сначала довести контраст существующих;
- не делать «тёмную тему» простой инверсией;
- не включать 3D-молекулы в основной бандл (только lazy/CDN);
- не добавлять `as any` «временно» — ratchet не даст;
- не расширять `labs` химией до появления спецификации `lab_type` и UI-протокола.

---

## Приложение A. Точные адреса ключевых находок

| Находка | Файл:строка |
|---|---|
| `useState` уже типизирован | `src/app/page.tsx:100`, `src/components/auth/AuthProvider.tsx:51` |
| `DashRow` уже `Record<string, unknown>` | `src/app/page.tsx:31` |
| `AcademicState` на `any` | `src/lib/api.ts:6-18` |
| Обходы single-flight refresh | `src/lib/api.ts:323`, `:507`, `:577` |
| «HTTP 500» в UI | `src/lib/api.ts:265` |
| Полная перезагрузка при поиске | `src/components/layout/TopBar.tsx:31` |
| Внутренний `<a>` | `src/components/auth/AuthProvider.tsx:175` |
| 11 пунктов Sidebar | `src/components/layout/Sidebar.tsx:28-40` |
| Активный пункт | `src/components/layout/Sidebar.tsx:91-92` |
| MobileNav (bottom bar) | `src/components/layout/MobileNav.tsx:8-15` |
| Нет error boundary | (0 совпадений по `src`) |
| `window.location.search` | `materials/source:12`, `practice:180`, `search:50`, `settings:71`, `subjects/[id]:169`, `tests/bank/[id]:85`, `tests:48`, `AuthHashCatcher:20`, `HistologyTrainer:107` |
| Блокирующий `@import` шрифтов | `src/app/globals.css:1` |
| Рассинхрон шрифтов | `src/app/globals.css:147` vs `tailwind.config.ts:37-43` |
| Мёртвые бейджи | `src/app/globals.css:168-170` |
| Хардкод палитры расписания | `src/app/globals.css:377-381`, `:394` |
| FOUC темы | `src/app/layout.tsx:27`, `ThemeProvider.tsx:115-126` |
| Пустой shell до mounted | `src/components/layout/AppShell.tsx:31-33` |
| `ChemicalFigure` не разбирает конверт | `src/components/chemistry/ChemicalFigure.tsx:58-63` |
| Несуществующая таблица | `workers/api/src/routes/tests.ts:227` |
| Линт: 132 мусорных ошибки | `workers/api/.wrangler/` (gitignored) |
| Typecheck внутри аудита | `scripts/predeploy-audit.mjs:411-412` |
| 8 калькуляторов | `integrations/cloudflare-api/src/calculators.js:7,17,27,38,50,62,72,83` |
| Мёртвые `chemical_*` таблицы | `database/migrations/chemical_engine_beta.sql:2-49` |

## Приложение B. Проверочные команды

```powershell
# типы и линт
npx tsc --noEmit
npx eslint src
npx eslint .            # сейчас: 147 errors (132 из них — .wrangler)

# обязательные файлы App Router
Get-ChildItem -Recurse src/app -Include loading.tsx,error.tsx,not-found.tsx

# анти-паттерны навигации
Select-String -Path (Get-ChildItem -Recurse src -Include *.tsx).FullName -Pattern 'window\.location\.(href|assign)'
Select-String -Path (Get-ChildItem -Recurse src -Include *.tsx).FullName -Pattern '<a[^>]+href="/'

# контраст (скрипт появится в волне 2)
node scripts/check-contrast.mjs

# тесты (в песочнице с ограничением spawn могут не запуститься)
node --test test/
```

---

*Документ подготовлен по фактическому состоянию репозитория; исходный чек-лист использован как каркас, все утверждения сверены с кодом.*
