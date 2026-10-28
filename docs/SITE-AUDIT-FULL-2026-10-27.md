# MEDBIOHIM — полный аудит сайта по разделам и план развития

**Дата:** 27.10.2026
**Объект:** `medbiohim-main` (ветка `main`)
**Статус:** аудит. Код в рамках аудита не изменялся.
**Связанный документ:** [TECH-AUDIT-PLAN-2026-10-27.md](TECH-AUDIT-PLAN-2026-10-27.md) — там разобран **исходный чек-лист** (P0/P1/P2 + дизайн + химия). Настоящий документ — **обход всего продукта по разделам и файлам**: что есть, что сломано, что не подключено, что нужно добавить.

---

## 0. Как читать

- Разделы идут в том же порядке, в каком пользователь их видит: оболочка → главная → учёба → прочее → админка → API → БД → интеграции → CI.
- У каждой строки файла: **что делает → состояние → что сделать**.
- Метки: 🔴 блокирует / 🟠 важно / 🟡 стоит сделать / ⚪ уже в порядке / ❓ требует проверки на живом окружении (статически подтвердить нельзя).
- Оценки в человеко-днях (дн.) — для одной задачи, без учёта ревью.

---

## 1. Метод: что реально проверено сейчас

| Проверка | Команда | Результат |
|---|---|---|
| Типы | `npx tsc --noEmit` | **exit 0, ошибок нет** |
| Линт фронта | `npx eslint src` | **0 errors / 33 warnings** |
| Тесты | `npm run test:api-failover`, `test:physiology` | **оба зелёные** |
| Страницы | `find src/app -name page.tsx` | 59 страниц, из них **53 — `"use client"`** (SSR/SEO нет) |
| Обязательные файлы App Router | `loading/error/not-found/global-error` | **0 файлов** |
| Метаданные | `export const metadata / generateMetadata` | **только 1 общий в `layout.tsx`** |
| SEO | `robots.txt`, `sitemap`, `favicon`, `manifest`, `src/app/icon*` | **ничего нет** |
| Мёртвый код компонентов | grep имени файла по всему `src` | `ui/Confetti.tsx`, `university/ExternalPlatforms.tsx` |
| Мёртвый код API-клиента | grep имени функции по `src` | **17 неиспользуемых экспортов** `api.ts` |
| Ролевой гейт воркера | разбор `workers/api/src/routes/*.ts` | `gate()` есть в `admin.ts`, `admin-database.ts`, `admin-attestations.ts`; **в `admin-schedule.ts` — 0 вызовов** |
| Миграции | `ls database/migrations` + `supabase/migrations` | **122 + 6 в двух разных каталогах** |
| Статика | `du -sh public` | **206 МБ**, из них **202 МБ `public/library/histology` — в `.gitignore`** |
| CI | `ls .github/workflows` | 26 workflow; **lint не запускается ни в одном** |
| **Live API-лог** | разбор выгрузки `/admin/api-logs` (CSV) | 731 запрос за 8,5 ч; **p50 = 1455 мс, p95 = 2119 мс**; 16 ошибок (2,19 %); **`error_code` пуст в 731/731** |
| **Консоль браузера** | сообщения с `medbiohim.vercel.app` | 404 статики, 2×503, 502, React #130; DevTools-шум отфильтрован |

Ограничение: живые HTTP-проверки (RLS, реальные запись/чтение, обходы) в песочнице не выполнялись — такие пункты помечены ❓.

---

## 2. Карта репозитория — пять подсистем

```
medbiohim/
├── src/                  Next.js 15 (App Router) — 173 .ts/.tsx, 59 страниц
├── src/app/api/          7 route handlers (прокси + химия + вуз + gemini)
├── workers/api/          Cloudflare Worker (Hono) — ЕДИНСТВЕННЫЙ прод API, 49 route-файлов
├── integrations/
│   ├── cloudflare-api/   legacy Worker (JS) → это «shadow»/MEDBIOHIM_UPSTREAM
│   ├── telegram-bot*     бот (Cloudflare Worker)
│   └── browser-extension/ Chrome MV3-импортёр
├── backend/              PHP 8 (SpaceWeb) — legacy, 109 файлов, 6 тестов
├── database/migrations   122 SQL-миграции (Supabase)
├── supabase/migrations   ещё 6 SQL-миграций (другой каталог!)
├── public/               206 МБ статики (202 МБ — вне git)
├── test/                 8 node-тестов фронта
└── .github/workflows     26 workflow
```

**Ключевой риск архитектуры: четыре параллельных реализации одних и тех же API.**
Прод — `workers/api`; legacy — `integrations/cloudflare-api` (живёт как fallback по 501); PHP — `backend/` (по `next.config.ts` уже не используется: `X-Medbiohim-Api-Mode: cloudflare-only`); плюс `src/app/api/*` — собственные Next.js route handlers. Каждый новый эндпоинт придётся писать минимум в двух местах либо честно закрывать legacy.

---

## 3. Оболочка приложения (глобальное)

| Файл | Строки | Что делает | Состояние и что сделать |
|---|---|---|---|
| `src/app/layout.tsx` | 39 | Корневой layout, `ThemeProvider → AuthProvider → AppShell` | 🟡 Один `metadata` на всё приложение, `lang="ru"` ✅, но `data-theme="classic-light"` захардкожен в HTML → **FOUC до гидрации**. Сделать inline-скрипт, который ставит тему из `localStorage` до первого кадра. Добавить `icons`, `manifest`, `openGraph`. |
| `src/app/globals.css` | 795 | CSS-переменные, 7 тем, утилиты `.card/.btn-*/.input` | 🔴 Строка 1 — **блокирующий `@import` Google Fonts** (двойной RTT, влияет на LCP). 🟠 Шрифт объявлен дважды и по-разному (`globals.css:147` vs `tailwind.config.ts:37-43`). 🟡 Статусные цвета объявлены (`.badge-success/-danger/-warning`) и **не используются нигде**. |
| `src/app/schedule-now.css` | 30 | Правила для «текущего» занятия | ⚪ узкий, без замечаний |
| `layout/AppShell.tsx` | 69 | Каркас: Sidebar/TopBar/MobileNav, presence-heartbeat раз в 60 с | 🟠 `if (!mounted) return <div/>` → **первый кадр всегда пустой** (блюр/прыжок). Решение: рендерить скелетон вместо пустого div либо убрать клиентский гейт (тема всё равно применяется через CSS-переменные). 🟡 heartbeat глобальный — перенести на видимую вкладку (`document.visibilityState`). |
| `layout/Sidebar.tsx` | 151 | 11 пунктов + 3 нижних (Настройки/Помощь/Админ) | 🟡 Уже `router`-ссылки ✅, `pathname.startsWith` ✅. Но **11 пунктов — перегрузка**, «Учебный план» и «Аттестации» дублируют иконку `ClipboardList`. Активный пункт отличается только подложкой — добавить левую полоску/жирность. Сгруппировать: Учёба / Академия / Сообщество / Система. |
| `layout/TopBar.tsx` | 41 | Поиск, курс/семестр, тема, колокол объявлений, профиль | 🔴 `window.location.href = /search?q=` — **полная перезагрузка** (`TopBar.tsx:31`). 🟠 `pageTitle` — цепочка из 7 `startsWith` (строка 29), при добавлении раздела ломается молча; вынести в `page.tsx`-метаданные. 🟡 Индикатор «новых объявлений» — статичная розовая точка, всегда горит. 🟡 Нет Cmd/Ctrl+K. |
| `layout/MobileNav.tsx` | 65 | Bottom tab bar из 6 пунктов | 🔴 Пункт **«ДЗ» ведёт на `/homework`, а тот делает `redirect("/schedule")`** — пользователь попадает в расписание, ожидая задания. Либо вернуть нормальную страницу ДЗ, либо перекинуть таб на `/schedule` и переименовать. |
| `theme/ThemeProvider.tsx` | 161 | 7 тем (`aero/aurora/medical/crystal-glass`, `classic-light/dark`, `midnight`) | 🟡 `applyDom` вызывается в `useEffect` → мигание. Нет явного «переключателя системной темы ↔ ручной» в TopBar для не-classic тем (только ссылка в Настройки). |
| `auth/AuthProvider.tsx` | 195 | Сессия, `refresh`, роли | 🔴 Внутри есть `<a href="/">` (строка 175) — единственная внутренняя «якорная» ссылка. 🟠 `refreshSession` обходит single-flight (см. §13). 🟡 `useEffect` с запросом без `AbortController`. |
| `auth/AuthHashCatcher.tsx` | 34 | Ловит `#access_token` после OAuth-редиректа | ⚪ |
| `ui/Skeleton.tsx` | 14 | Скелетон | 🟡 используется только в 3 страницах из 59 — нужен везде |
| `ui/GlobalLoadingBar.tsx` | 44 | Полоса прогресса | ⚪ |
| `ui/LoadingBar.tsx` | 13 | То же локально | 🟡 дублирует GlobalLoadingBar |
| `ui/ServiceNoticeBanner.tsx` | 32 | Баннер деградации сервиса | ⚪ используется на главной и прогрессе |
| `ui/RadialProgress.tsx` | 43 | Круговой прогресс | ⚪ только в `/progress` |
| `ui/Confetti.tsx` | 58 | Конфетти | ⚪ **не используется нигде** — удалить или подключить к завершённой аттестации |

---

## 4. Студенческие разделы — по файлам

### 4.1 Главная `/` — `src/app/page.tsx` (671)

| | |
|---|---|
| Что есть | Дашборд: приветствие, «Сейчас важно», блоки расписания/ДЗ/объявлений, `ServiceNoticeBanner`, `Skeleton` на загрузке ✅ |
| Состояние | 🟠 **Самый тяжёлый файл после предмета.** 22 `any`/`as any`. Загрузка — 3+ параллельных `api()` без `AbortController`, при уходе со страницы — setState на размонтированном компоненте. Ошибки частично показываются текстом ✅, но `payload.degraded` прячет причину. |
| Сделать | Разбить на `DashboardBlocks/*`; ввести `useApiRequest` (см. §14, волна 2); добавить «пустые состояния с CTA» для незалогиненного (`Гость`). |

### 4.2 Учёба

| Файл | Стр. | Что делает | Состояние → действие |
|---|---|---|---|
| `subjects/page.tsx` | 255 | Каталог предметов, фильтр курс/семестр | 🟡 фильтры теряются при переходе назад (нет query-параметров) |
| **`subjects/[id]/page.tsx`** | **1033** | **Самый большой файл проекта.** 16 вкладок (`plan/lessons/tickets/tests/practice/lectures/materials/trainer/trainers/labs/attestations/progress/colloquium/portal/chem/latin`), захардкоженные библиотеки физиологии, статические планы JSON | 🔴 Файл-монолит: 22 `any`, ~40 импортов компонентов, смешаны данные и рендер. **Обязательно разбить** на `SubjectPage` + модули вкладок (`app/subjects/[id]/(tabs)/*`). 🟠 `PHYSIOLOGY_LIBRARY` и `STATIC_PLANS` — контент в коде → перенести в `src/data/` или в БД. 🟡 `?tab=` работает ✅ (старые ссылки живы). |
| `subjects/[id]/lessons/page.tsx` | 7 | редирект на `?tab=lessons` | ⚪ заглушка-совместимость |
| `subjects/[id]/colloquium/page.tsx` | 7 | редирект на `?tab=colloquium` | ⚪ (в файле CRLF-переносы — мелочь) |
| `subjects/[id]/tests/page.tsx` | 73 | вкладка тестов | 🟡 дублирует `TestsHub` |
| `subjects/[id]/attestations/[slug]/page.tsx` | 74 | одна аттестация | 🟡 нет `generateMetadata` — ссылка в мессенджере без превью |
| `tests/page.tsx` | 335 | Хаб тестов + история попыток + вкладка «Химия» | 🔴 Вкладка «Химия» **всегда пустая** (см. §13, `tests.ts:227` — несуществующая таблица `chemistry_master`, ошибка замаскирована в `ok({items:[]})`). |
| `tests/bank/[id]/page.tsx` | 520 | Банк вопросов с прогрессом | 🟡 `any` ×2, пагинация без URL-состояния |
| `tests/preparation/[id]/page.tsx` | 740 | **Живой режим подготовки** (`startPreparation/savePreparation/finishPreparation`) | 🟡 15 `any`; `window.location.search` вместо `useSearchParams` → нельзя предзагрузить/поделиться ссылкой |
| `practice/page.tsx` | 862 | Практика: вопросы, избранные, заметки | 🟠 23 `any` — второй по «грязности» файл. Вынести `useQuestionPractice`. |
| `tickets/page.tsx` | 217 | Экзаменационные билеты (`generateTicket`) | ⚪ |
| `cards/page.tsx` | 274 | SRS-карточки (SM-2) | 🟡 **нет ссылки из Sidebar** — доступен только по прямому URL/из предмета |
| `lectures/page.tsx` | 113 | Список лекций | ⚪ |
| `lectures/[id]/page.tsx` | 101 | Лекция + `LectureRenderer` | 🟡 нет `generateMetadata` |
| `materials/page.tsx` | 200 | Материалы с фильтрами | ⚪ использует `Skeleton` ✅ |
| `materials/source/page.tsx` | 15 | Метаданные первоисточника | 🟡 код в одну строку, `any`, `window.location.search`; переформатировать и типизировать |
| `progress/page.tsx` | 131 | Прогресс + `RadialProgress` | ⚪ есть fallback-сообщение ✅ |
| `curriculum/page.tsx` | 246 | Учебный план | 🟡 3 `any` |
| `academic/page.tsx` | 166 | Академическое состояние + AI-план | 🟡 |
| `attestations/page.tsx` | 34 | Список аттестаций | ⚪ тонкая обёртка над `AttestationList` |
| `trainers/page.tsx` | 22 | Заглушка → редирект в `next.config.ts` на `/subjects` | ⚪ удалить файл и правило редиректа вместе |
| `trainers/feed/[subject]/page.tsx` | 289 | Лента микропрепаратов (гистология и др.) | 🟡 |
| `trainers/feed/histology/page.tsx` | 7 | обёртка `HistologyTrainer` | 🟡 |
| `labs/page.tsx` | 28 | Интерактивные лабораторные | ⚪ тонкая обёртка |
| `calculators/page.tsx` | 267 | Калькуляторы | 🟠 Только перечень/простые расчёты — **см. §15: ABG, анионный разрыв, клиренс, Михаэлис–Ментен, АТФ не реализованы** |
| `search/page.tsx` | 188 | Поиск по платформе | 🟠 приходит только через `window.location.href` (полная перезагрузка), нет Cmd/Ctrl+K, нет клавиатурной навигации результатов |

### 4.3 Прочее (не «учёба»)

| Файл | Стр. | Состояние → действие |
|---|---|---|
| `community/page.tsx` | 152 | ⚪ посты/комменты. 🟡 нет пагинации и «ленивой» загрузки |
| `tutor/page.tsx` | 145 | 🟠 AI-тьютор: зависит от `/api/ai/gemini` (Vercel) **и** `/api/v1/ai` (Worker) — два разных провайдера. Выбрать один. |
| `university/page.tsx` | 220 | 🟡 хаб вуза, ходит в `/api/university` (собственный route handler, кэш `no-store`) |
| `university/import/page.tsx` | 634 | 🟠 Импорт из ЕИОС/сайта — большой клиентский компонент, вынести логику в `src/lib/university` |
| `university/saved/page.tsx` | 34 | ⚪ |
| `extension/page.tsx` | 121 | ⚪ страница установки расширения (серверная) |
| `latin/page.tsx` | 20 | ⚪ обёртка `LatinRecipes` |
| `chemistry/page.tsx` | 7 | ⚪ обёртка `ChemistryWorkbench` — **рабочий стол химии живёт тут, а не в `/chem`** |
| `homework/page.tsx` | 5 | 🔴 **`redirect("/schedule")`** — раздел ДЗ не существует как страница, хотя `MobileNav` ведёт именно на него и в API есть целый роутер `homework.ts` (447 строк, 21 маршрут) |
| `help/page.tsx` | 20 | 🔴 **Заглушка.** Три абзаца текста, из них «Архитектура: Vercel + SpaceWeb + Supabase + B2» — **устаревшая и противоречит `next.config.ts`** (`cloudflare-only`). Нужны реальный FAQ, контакты, статус сервиса, «как сообщить о проблеме». |
| `login/page.tsx` | 294 | 🟠 `window.location.href` после входа (полная перезагрузка) → `router.replace` + `router.refresh()` |
| `register/page.tsx` | 126 | 🟡 то же |
| `auth/callback/page.tsx` | 53 | 🟠 OAuth callback, тоже `window.location.*` |
| `settings/page.tsx` | 410 | см. §5 |

---

## 5. Настройки аккаунта `/settings` — 410 строк

**Что есть сейчас:** профиль (имя/почта), смена пароля, способы входа (email/Google/custom/Telegram, отвязка), привязка Telegram (одноразовая ссылка на 10 минут), «Уведомления и медиа», формат отображения тестов (`trainer_layout`), 7 тем, режим восстановления `?recovery=1`.

**Чего не хватает (по приоритету):**

| # | Пробел | Приоритет |
|---|---|---|
| 1 | **Нет раздела «Конфиденциальность и данные»**: экспорт своих данных (JSON/CSV), удаление аккаунта, список активных сессий/устройств. Приложение хранит токены в `localStorage` — сессии нигде не показываются. | 🟠 |
| 2 | **Нет настроек уведомлений как таковых**: секция называется «Уведомления и медиа», но это только переключатели медиа. Нет выбора: пуш о новых ДЗ, об изменении расписания, об объявлениях, тихие часы. | 🟠 |
| 3 | **Нет 2FA / истории входов.** `workers/api/src/routes/auth.ts` — 413 строк, но TOTP/WebAuthn не реализованы. | 🟡 |
| 4 | **Нет настроек приватности профиля** (кто видит моё имя в сообществе/кто может писать). | 🟡 |
| 5 | **Нет локали/языка** — интерфейс захардкожен на русском, переключателя нет (ок, если продукт только RU — тогда хотя бы зафиксировать в `README`). | ⚪/🟡 |
| 6 | Технически: `useEffect` читает `window.location.search` вместо `useSearchParams`; `saveAccountPreferences` и `getAccountSettings` живут в отдельном `settings-api.ts` — **хороший образец**, его стоит повторить для остальных API. | 🟡 |

**Бэкенд:** `backend/src/Services/AccountSettingsService.php` (238) + `workers/api/src/routes/settings.ts` (447 строк, 29 маршрутов) + `supabase/migrations/20261013171940_create_user_preferences.sql` — настройки продублированы в PHP и в Worker. Выбрать источник истины (Worker) и пометить PHP как legacy.

---

## 6. Админ-панель `/admin` — 16 разделов

**Каркас:** `admin/layout.tsx` (14) + `components/admin/AdminNav.tsx` (134) — единый список `ADMIN_SECTIONS`, используется и для бокового меню, и для плиток дашборда. Это **хорошее решение** ✅: новый раздел = одна запись в массиве.

### 6.1 Сводная таблица

| Раздел | Файл (стр.) | Что умеет | Пробелы |
|---|---|---|---|
| Дашборд | `admin/page.tsx` (116) | Счётчики (`adminOverview`) + плитки всех разделов | 🟡 Счётчики — сырой `Record<string,number>`, ключи не типизированы; нет графиков/динамики |
| Расписание | `admin/schedule/page.tsx` (426) | Сетка drag-and-drop, импорт XLSX, сохранение | 🔴 **См. §13.5: воркер-роуты `/admin/schedule/*` не имеют `gate()` вообще** ❓. 🟡 нет просмотра версий/rollback в UI (бэкенд `admin-schedule.ts` умеет `versions`/`rollback` — UI не подключён) |
| Предметы и группы | `admin/academic/page.tsx` (207) | CRUD предметов, групп, курс/семестр | 🟡 массовых операций нет |
| Тесты | `admin/tests/page.tsx` (550) | Тесты → предметы → темы, вопросы, публикация | 🟡 второй по размеру файл админки; ручная привязка вопросов, нет drag-and-drop порядка |
| Вопросы тестов | `admin/test-questions/page.tsx` (18) | Фильтр по иерархии, редактирование, архив | 🟡 **18 строк кода в одну строку** — нечитаемо, `any`; отдельная страница, хотя логика дублирует `admin/tests` |
| Экзаменационные билеты | `admin/questions/page.tsx` (115) | CRUD `exam_questions` | ⚪ |
| AI-лекции | `admin/lectures/page.tsx` (121) | Генерация, редактирование, публикация/отклонение | 🟡 Внутри `RichLectureEditor` (867) и `LectureLearningEditor` (207) — крупные, но живут в списке строками |
| Аттестации | `admin/attestations/page.tsx` (660) | Полный CRUD аттестаций и этапов | 🟡 **крупнейшая страница админки**, нужен раздел на `components/attestations/*` |
| Пользователи | `admin/users/page.tsx` (133) | Роли, группа/курс/семестр | 🟠 Нет поиска/фильтра/пагинации при реальном числе пользователей; нет смены роли «себе» с защитой от потери последнего админа |
| Объявления и сайт | `admin/announcements/page.tsx` (130) | CRUD объявлений + `adminUpdateSite` (тексты главной) | 🟡 нет предпросмотра главной, нет расписания публикации |
| ДЗ/файлы/диагностика | `admin/tools/page.tsx` (301) | Presence, `validateContent`, File&Storage аудит, health, вкладка `AdminMissingTools` | 🟡 `AdminMissingTools` (62) — **заголовок «Missing» уже не соответствует**, это основной инструмент ДЗ/материалов/сообщества. Переименовать и расширить (оценка работ упомянута в коде: `GradeBox`) |
| Импорт тестов (Excel) | `admin/content-import/page.tsx` (101) + `template.ts` | Excel → тесты/вопросы | 🟡 |
| Импорт контента | `admin/content-package/page.tsx` (229) | Пакет документов/материалов/препаратов | 🟡 нет отката импорта в UI |
| Telegram → ДЗ | `admin/telegram/page.tsx` (66) | Привязка чатов, webhook | 🟡 нет статуса последних сообщений/ошибок |
| База / SQL | `admin/database/page.tsx` (40) + `AdminDatabaseConsole` (745) | Подключения, схема, строки, SQL-редактор | 🟠 **SQL-редактор — самое опасное оружие в продукте.** Нужны: журнал выполненных запросов в UI, обязательное подтверждение `DROP/DELETE/TRUNCATE`, ограничение на `SELECT`-only по умолчанию. `adminDbAudit` / `adminRollbackAudit` **уже написаны в `api.ts`, но не подключены к UI** |
| Журнал API | `admin/api-logs/page.tsx` (4) | Просмотр буфера `sessionStorage` | 🔴 Файл **4 строки** — весь код в одну строку; журнал **только текущей вкладки**, т.е. для диагностики прод-инцидента почти бесполезен. Нужен серверный журнал (см. §14, волна 1) |
| Проблемы и жалобы | `admin/problems/page.tsx` (31) | Очередь жалоб, исправление вопроса, «работы» | 🟡 код в одну строку, `any` ×5; `labels` — `const labels:any` |

### 6.2 Что есть в API, но не подключено к админке (быстрые победы)

Это прямой ответ на «не связано / не обновлено, но нужно»:

| Существует в бэкенде | Где | UI |
|---|---|---|
| Аудит изменений БД + откат | `api.ts:730 adminDbAudit`, `:731 adminRollbackAudit` | ❌ не подключён |
| `adminDbMeta` (метаданные таблиц) | `api.ts:736` | ❌ (аргументы намеренно `_args`) |
| Перенос контента между темами | `api.ts:741 adminContentMove` | ❌ |
| `adminDbDeleteByKey` | `api.ts:738` | ❌ |
| История версий расписания + rollback | `workers/api/src/routes/admin-schedule.ts:46,143` | ❌ |
| Аналитика расписания | `admin-schedule.ts:288` | ❌ |
| Статистика кликов по внешним платформам | `api.ts:514 externalPlatformStats` | ❌ |
| Откат содержимого (`content_versions`) | таблица + запись версий в `admin.ts:212` | ❌ UI отката нет |
| `invalidateApiCache` (ручной сброс кэша) | `api.ts:194` | ❌ |
| Конфетти | `ui/Confetti.tsx` | ❌ не используется |

---

## 7. API-слой фронтенда

| Файл | Стр. | Состояние → действие |
|---|---|---|
| **`src/lib/api.ts`** | **828** | 🔴 **Самый проблемный файл проекта.** 181 функция, **172 упоминания `any`**, 194 строковых пути. Содержит одновременно: токены, refresh, кэш, логгер, ретраи, загрузку картинок тренажёров, 40+ admin-обёрток. **17 экспортируемых функций не используются** (см. §1), включая целый блок классических попыток тестов `startTestAttempt/saveTestAnswer/finishAttempt/retryTestAnswerGrading` — фронт перешёл на `preparation`, а легаси остался. → Разделить на `api/http.ts`, `api/auth.ts`, `api/cache.ts`, `api/admin.ts`, `api/content.ts`; удалить мёртвые экспорты; типизировать `ApiResult<T>` вместо `any`. |
| `src/lib/api-failover.mjs` (54) + `.d.mts` | 56 | 🟡 Полностью **не импортируется из `src`** — его тестирует `test/api-failover.test.mjs` как строку в файле. Либо подключить, либо переписать тест на реальный код. |
| `src/lib/settings-api.ts` | 84 | ⚪ Образец для подражания: узкий, типизированный |
| `src/lib/content-api.ts` | 208 | 🟡 Контент/источники; использует `any` в `getContentSource` |
| `src/lib/features-api.ts` | 158 | ⚪ используется в 5 местах (`calculators`, `cards`, `search`, `tutor`, `SubjectTrainersHub`) — глобальный поиск и AI-разговоры живут именно здесь |
| `src/lib/supabase.ts` | 84 | 🟠 Клиент Supabase **на фронте** — для чего? Если ключ anon, ок; если service — критично. ❓ |
| `src/lib/telegram-webapp.ts` | 65 | ⚪ Mini App initData |
| `src/lib/training-payload-sanitizer.mjs` | 69 | ⚪ есть тест ✅ |
| `src/lib/subjectSlug.ts` (131), `portalContent.ts` (189), `physiologyContent.ts` (108), `histologyOrder.ts` (90) | 418 | 🟡 Служебный код, покрыт тестами частично |
| **`src/lib/university/fesmu.ts`** | **1279** | 🟠 Второй по размеру файл. Скрейпер ЕИОС/ФЕСМУ. Есть тесты (`university-verification*.test.mjs`) ✅. Требует явного владельца и rate-limit |
| `src/lib/university/portals.ts` (230), `types.ts` (165), `http.ts` (40) | 435 | ⚪ |
| `src/lib/chemistry/**` | ~900 | ⚪ Структурировано хорошо: `mechanism/`, `projections/`, `rdkitClient`, `threedmolClient`, `pubchem`, `validation` (13 строк — расширить) |
| `src/app/api/v1/[...path]/route.ts` | 146 | ⚪ Прокси только в Cloudflare, таймаут 18 с, `maxDuration=30`, покрыт тестами ✅ |
| `src/app/api/ai/gemini/route.ts` | 116 | 🟠 Параллельный AI-провайдер рядом с `workers/api/src/routes/ai.ts` (271). Выбрать один |
| `src/app/api/chemistry/resolve` (41) + `health` (39) | 80 | 🟠 **Второй резолвер химии** рядом с `workers/api/.../chemistry.ts` и `integrations/cloudflare-api/src/chemistry-resolver.js` — три реализации одной задачи |
| `src/app/api/university/*` (41+18+17) | 76 | 🟡 Обёртки над `lib/university` |

---

## 8. Workers API (`workers/api`) — единый прод-бэкенд

**Топология (зафиксирована в `wrangler.toml`):** `medbiohim-api` = единственный прод; `medbiohim-api-shadow` = только fallback по 501; `medbiohim-telegram` = бот.

| Модуль | Оценка |
|---|---|
| `src/index.ts` (198) | ⚪ Чистый: 49 роутеров, CORS, security headers, request id, 501 → upstream-fallback, `notFound`/`onError` |
| `src/middleware/auth.ts` (75) | 🟠 `requireAuth` / `requireAdmin` / `optionalAuth`. **`requireAdmin` не используется ни в одном роуте** (проверено grep) — все админ-роуты используют `requireAuth` + ручной `gate()`. Это работает, но означает, что **забытый `gate()` = дыра** |
| `src/middleware/cors.ts` (36) / `security.ts` (11) | 🟡 `security.ts` — 11 строк; проверить, что реально ставит HSTS/CSP/X-Content-Type |
| `src/middleware/` нет rate-limit | 🟠 `backend/src/Support/RateLimiter.php` (39) есть в PHP, в Worker — нет. `/auth/login`, `/ai/*`, `/chemistry/resolve` без ограничений |
| `routes/admin.ts` (1084, 73 маршр.) | 🟡 `gate()` присутствует в основных хендлерах; нужен **сквозной тест «студент получает 403 на каждый /admin/*»** |
| `routes/admin-schedule.ts` (332, 15 маршр.) | 🔴 **`gate()`/`hasRole()` не вызываются ни разу.** Опирается только на `requireAuth` + RLS. ❓ Проверить на живом: либо студент пишет в расписание, либо (если RLS с SELECT-политикой `schedule_entries_read_v3`) **сейв расписания падает для всех** |
| `routes/admin-database.ts` (293) | ⚪ `gateAdmin()` на всех 10 хендлерах ✅ |
| `routes/admin-attestations.ts` (160) | ⚪ `gate()` на всех ✅ |
| `routes/admin-parity.ts` (569) | 🟡 Дублирует покрытие `admin.ts`; 35 `requireAuth`/`gate`. Стоит проверить, не остался ли там legacy-контракт |
| `routes/tests.ts` (447) | 🔴 `:227` — чтение **несуществующей таблицы `chemistry_master`** с `catch → ok({items:[]})` |
| `routes/auth.ts` (413) | 🟠 Refresh/logout; **нет инвалидации refresh-токенов при logout на сервере** ❓ |
| `routes/ai.ts` (271) | 🟡 20 маршрутов, мульти-провайдер, есть нормальные 503 |
| `routes/srs.ts` (494) | ⚪ крупный, но однородный |
| `routes/settings.ts` (447) | ⚪ |
| `routes/trainers.ts` (573) + `trainer-atlas.ts` (191) | 🟡 **Два роутера с одинаковыми путями `/feed`, `/feed/:id`, `/answer`** — `trainer-atlas` смонтирован как `/admin/atlas`, но логика почти дублирует `trainers`. Рефакторинг в общую функцию |
| `routes/chemistry.ts` (66, **1 маршрут**) | 🟡 Тонкая обёртка; основная логика — в Next route handler |
| `routes/homework.ts` (447, 21 маршрут) | ⚪ API полностью есть → **см. §4.3: страницы ДЗ нет** |
| `routes/labs.ts` (447), `materials.ts` (420), `questions.ts` (349) | ⚪ |
| `test/*` (10 файлов) | 🟡 Контрактные тесты есть, но **нет теста ролевого гейта** и **нет e2e сценария** |

---

## 9. PHP-бэкенд (`backend/`, legacy)

- 109 файлов PHP, 6 регрессионных тестов, все гоняются в CI ✅ (`code-check.yml` → job `backend`).
- По `next.config.ts` фронтенд **больше не ходит в PHP** (`cloudflare-only`). PHP остаётся источником для `deploy-backend.yml` на SpaceWeb ❓.
- 🔴 **Дублирование:** `backend/config/routes/*.php` (35 файлов) и `workers/api/src/routes/*.ts` (49 файлов) описывают одни и те же сущности. В репо есть `docs/API-ROUTE-PARITY-AUDIT-2026-10-19.md` — значит, сверка уже велась.
- 🟠 `backend/` **исключён из ESLint** (`eslint.config.mjs`) и `tsconfig` исключает `workers/api/**`, `integrations/**`, `scripts/**` — т.е. `npm run typecheck` **не проверяет воркер и legacy**. Воркер проверяется отдельным workflow (`fix-worker-typecheck.yml`) — убедиться, что он required для merge.
- 🟡 Известный дефект из архива: `HomeworkRepository.php:22` в корневой копии архива (не в `backend/`).

**Решение (нужно принять):** объявить PHP «read-only legacy» с датой отключения, либо выделить его как эксплуатируемую подсистему. Сейчас он висит между двумя состояниями и потребляет CI-время.

---

## 10. База данных и миграции

- **Два каталога миграций:** `database/migrations` (122 файла) и `supabase/migrations` (6 файлов). В `database/` уже есть **дублирующиеся номера** (`002_tests_homework.sql` и `002_trainer_atlas_module.sql`). → Свести в один каталог (`supabase/migrations` как канонический) и нумеровать префиксом даты.
- **Мёртвые таблицы химии:** `chemical_aliases, chemical_functional_groups, chemical_molecules, chemical_properties, chemical_questions, chemical_reaction_steps, chemical_reactions, chemical_sources, chemical_spectra, chemical_topics` — создаются в `database/migrations/chemical_engine_beta*.sql` и **не упоминаются ни в `src`, ни в `workers/api/src`** (проверено grep). Либо подключить, либо удалить.
- `chemistry_master` — читается в `workers/api/src/routes/tests.ts:227`, но **не создаётся ни в одной миграции**.
- **RLS:** политики есть на 17 файлах; найдены `*_read_v3` для `schedule_entries`/`schedules` **без write-политик** ❓ (см. §8).
- Дампов/бэкапов схемы в репо нет; `scripts/audit-supabase-source-of-truth.sql` — есть, но не запускается в CI.

---

## 11. Интеграции

| Подсистема | Путь | Состояние → действие |
|---|---|---|
| Telegram-бот | `integrations/telegram-bot*`, `routes/telegram.ts` (95), `lib/telegram-initdata.ts` (299) | 🟡 Тесты initData есть ✅. Нет страницы «мой бот» для студента (только привязка в настройках) |
| Браузерное расширение | `browser-extension/`, страница `/extension` | 🟡 MV3, ~13 КБ, самораспространение. Не опубликовано в Chrome Web Store. Импорт идёт через `/integrations/imports` (10 маршрутов) ✅ |
| Legacy Cloudflare API | `integrations/cloudflare-api/` (40+ файлов) | 🟠 Это `MEDBIOHIM_UPSTREAM` — живой fallback. **Любое исправление надо делать в обоих местах**, иначе fallback отдаёт старое поведение. Минимум — пометить `README` и добавить CI-проверку расхождения |
| Внешние платформы | `src/data/external-platforms.ts` (202), `components/university/ExternalPlatformLinks.tsx` | 🟡 `ExternalPlatforms.tsx` (137) **не используется** — удалить |
| Vercel | `vercel.json`, `deploy-vercel-frontend.yml` | ⚪ регион `fra1` |
| Cloudflare | `deploy-medbiohim-api.yml`, `deploy-cloudflare-shadow.yml` | 🟡 теневой деплой лучше убрать из привычного набора |

---

## 12. CI/CD, тесты, статика

**26 workflow.** Ключевые:

| Workflow | Что делает | Проблема |
|---|---|---|
| `code-check.yml` | typecheck+build (через `predeploy:audit`), PHP-тесты, контрактные тесты воркера, проверки прокси | ✅ хороший, но **`npm run lint` не вызывается нигде** |
| `apply-*.yml` (6), `fix-*.yml` (5), `restore-*.yml` (3) | **пушат прямо в `main`** (`git push origin HEAD:main`) | 🔴 обходят PR и `code-check`. Либо перевести на PR, либо сделать их `workflow_dispatch` только |
| `deploy-*.yml` (5) | деплои | 🟡 нужны `environment:` с required reviewers |
| `optional-integrations-check.yml` | опциональные проверки | ⚪ |

**Тесты:**
- Фронт: 8 файлов в `test/` — но 5 из 7 в `code-check` гоняются как `node --test` по **строкам исходников**, а не по поведению.
- Воркер: 10 файлов в `workers/api/test/`.
- PHP: 6 файлов.
- **Нет:** e2e (Playwright), тестов ролевых гейтов, тестов навигации App Router, тестов type guards.
- В `package.json` есть `test:physiology` и `test:api-failover` — **не подключены к `code-check` как отдельные шаги?** `test:api-failover` подключён ✅, `test:physiology` — нет.

**Статика `public/` (206 МБ):**

| Путь | Размер | В git? | Проблема |
|---|---|---|---|
| `public/library/histology/*.pdf` (5 файлов) | **202 МБ** | ❌ в `.gitignore` | 🔴 В проде этих файлов **нет**, и **нигде в коде на них нет ссылок** — это 202 МБ мёртвого локального груза. Перенести в Supabase Storage / Upstash Blob и подключить в UI, либо удалить |
| `public/library/physiology/*` (8 файлов) | ~31 МБ | ✅ | 🟠 Файлы до **12.2 МБ** (`serdce-sosudistaya.doc`) отдаются как есть; `.doc`/`.pdf` в вёрстке открываются в новой вкладке без предпросмотра. Стоит отдавать через `Content-Disposition` и класть в Blob |
| `public/content/**` | 4.3 МБ, 44 файла | ✅ | ⚪ JSON-контент (планы, банки билетов) |
| `public/downloads/` | 16 КБ | ✅ | ⚪ |

**SEO/шеринг — ничего нет:** нет `robots.txt`, `sitemap.xml`, `favicon`, `manifest`, `src/app/icon*`, `generateMetadata` на страницах. 53 из 59 страниц — клиентские, значит заголовок вкладки везде одинаковый. Для платформы, куда кидают ссылки в чат группы, это заметный пробел.

---

# ЧАСТЬ 2. СВОДНЫЙ СПИСОК ДЕФЕКТОВ

## 🔴 P0 — чинить первым

| ID | Где | Суть |
|---|---|---|
| **D1** | `MobileNav.tsx` ↔ `homework/page.tsx` | Пункт «ДЗ» ведёт на `redirect("/schedule")`. В API — полноценный `homework.ts` (21 маршрут). Страницы ДЗ не существует. |
| **D2** | `workers/api/src/routes/tests.ts:227` | Несуществующая таблица `chemistry_master` + `catch → ok({items:[]})` = «вкладка Химия всегда пустая, ошибка замаскирована». |
| **D3** | `workers/api/src/routes/admin-schedule.ts` (все 15 маршрутов) | Нет ни `gate()`, ни `hasRole()`. ❓ Либо дыра для любого авторизованного, либо сейв расписания невозможен из-за RLS без write-политик. **Проверить на живом в первые же сутки.** |
| **D4** | 15 workflow `apply-*`/`fix-*`/`restore-*` | Прямой `git push` в `main` мимо PR и мимо `code-check`. |
| **D5** | `src/app/**` | Нет `loading.tsx`, `error.tsx`, `not-found.tsx` — любая ошибка рендера = стандартная страница Next.js без кнопки «Повторить». |
| **D6** | `TopBar.tsx:31`, `login`, `register`, `auth/callback` | Полные перезагрузки (`window.location.href`) вместо `router.push/replace`. |
| **D7** | `public/library/histology` (202 МБ) | В gitignore → в проде нет; в коде не используются. Мёртвый груз, вводящий в заблуждение. |
| **D8** | `.github/workflows` | `npm run lint` не запускается ни в одном workflow, хотя это заявлено как гейт. |
| **D30** | `src/lib/subjectSlug.ts:104-107` | `resolveSubjectSlug` **возвращает неизвестную строку как есть** (`return canonicalSubjectSlug(raw)`), в т.ч. UUID. Из-за этого `/subjects/[id]` при неудачной загрузке предмета строит `slug = "67f64120-…"` → браузер бьёт в `/content/portals/ticket-banks/67f64120-….json` → **404 в консоли (дважды в логе)**. Лечится одним условием: неизвестный → `""`. |
| **D31** | `workers/api/src/routes/subjects.ts:45-51` + `src/lib/subjectSlug.ts` | **Клиент канонизирует слаг, сервер — нет.** Клиент строит ссылку `/subjects/organic_chemistry`, а Worker ищет `eq("slug","organic_chemistry")` без алиасов → **404 (дважды в живом логе)**, при том что `/subject-plans/chemistry_organic_physical` отвечает 200. Рассинхрон каталога и ссылок. |

## 🟠 P1 — безопасность и надёжность

| ID | Где | Суть |
|---|---|---|
| D9 | `api.ts:19-36` | Токены в `localStorage`; ни одного `Set-Cookie`/`HttpOnly` во всём проекте |
| D10 | `api.ts:215-251` и обходы `:323`, `:507`, `:577` | Три места лезут в `fetch('/auth/refresh')` мимо single-flight → шторм обновлений |
| D11 | `AuthProvider`, `AppShell`, `page.tsx`, `settings` | `useEffect` с запросами без `AbortController` → setState на размонтированном компоненте |
| D12 | `middleware/auth.ts` | `requireAdmin` не используется; защита держится на ручном `gate()` — нужен автотест «студент → 403 на все /admin/*» |
| D13 | `workers/api` | Нет rate-limit (в PHP есть `RateLimiter`) на `/auth/login`, `/ai/*`, `/chemistry/resolve` |
| D14 | `AdminDatabaseConsole` | SQL-редактор без журнала в UI и без подтверждения деструктивных запросов; `adminDbAudit`/`adminRollbackAudit` не подключены |
| D15 | `admin/api-logs` | Журнал только из `sessionStorage` текущей вкладки — не годится для прод-диагностики. **Дополнено живым логом: поле `error_code` не заполнено ни в одной из 731 записей** — в `request()` (`api.ts:96`) объект `entry` не содержит `errorCode` вообще, читается оно только в `logTrainerImageResponse`. Итог: по журналу нельзя понять, *почему* упали 503/502/404 |
| **D32** | Прод, 731 запрос за 8,5 ч | **Медленный API: p50 = 1455 мс, p95 = 2119 мс, p99 = 3383 мс, max = 12 389 мс.** Медиана в 1,5 с на обычный GET — это основной UX-баг проекта |
| **D33** | `AppShell.tsx:30-38` | **113 heartbeat'ов = 16% всего трафика**, идут **круглосуточно** (в логе 02:36–03:07 и 08:04–08:34 UTC — ночь), p95 = 2513 мс, max = 12 389 мс. Не проверяют `document.visibilityState` |
| **D34** | Прод | **8 × 401 тремя всплесками** (02:36 — сразу 5 запросов, 08:02 — 2, 10:22 — 1), после которых всё становится 200. Живое подтверждение D10: access token истекает, запросы уходят до refresh |
| **D35** | `/admin/lectures` 503, `/lesson-plan` 503 | `readLectures()` читает `site_content.key='lectures'` и бросает при ошибке БД → 503 с `DB_UNAVAILABLE`. Клиент получает 503 **без кода ошибки** (см. D15). Причина — на стороне Worker (вероятно RLS на `site_content`; миграция `20261015113039_admin_site_content_access` уже была) → нужен серверный лог |
| **D36** | `/admin/telegram/set-webhook` 503 | `TELEGRAM_NOT_CONFIGURED` — не дефект кода, а отсутствующие `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_URL` в переменных Worker. Но UI показывает это как красную ошибку без объяснения |
| D16 | 53/59 страниц — клиентские | Нет SSR/SEO/превью ссылок; один `metadata` на всё приложение |
| D17 | `src/lib/supabase.ts` | Клиент Supabase во фронтенде — проверить, что используется только anon-ключ и RLS |

## 🟡 P2 — поддерживаемость

| ID | Суть |
|---|---|
| D18 | `api.ts` — 828 строк / 181 функция / 172 `any`; 17 мёртвых экспортов |
| D19 | `subjects/[id]/page.tsx` — 1033 строки, 16 вкладок, контент в коде |
| D20 | Два каталога миграций, дубли номеров |
| D21 | 10 таблиц `chemical_*` мёртвые; `chemistry_master` не существует |
| D22 | Три резолвера химии (Next route, Worker, legacy Worker) |
| D23 | `help/page.tsx` — заглушка с устаревшей архитектурой в тексте |
| D24 | Мёртвые компоненты: `ui/Confetti`, `university/ExternalPlatforms`; неиспользуемый `api-failover.mjs` |
| D25 | `tsconfig` исключает `workers/api`, `integrations`, `scripts` — typecheck их не видит |
| D26 | Нет favicon/robots/sitemap/generateMetadata |
| D27 | Код в одну строку: `admin/api-logs` (4), `admin/problems` (31), `admin/test-questions` (18), `materials/source` (15) — непригодно для поддержки |
| D28 | `admin/tools` содержит «AdminMissingTools» — имя не соответствует содержимому |

---

# ЧАСТЬ 3. ПЛАН РАЗВИТИЯ

## Волна 0 — «стабильность» (≈8–10 дн.)

| # | Задача | DoD | Дн. |
|---|---|---|---|
| 0.1 | **Проверить D3 на живом**: `POST /api/v1/admin/schedule/save` под студенческим токеном → ждать 403; под админским → 200. Если политики RLS нет — добавить write-политику + `gate()` | Тест в `workers/api/test/admin.test.js` падает до фикса, проходит после | 1 |
| 0.2 | Починить `chemistry_master`: либо создать таблицу/перейти на `chemistry_molecules`, либо честно возвращать 500/404 вместо `ok({items:[]})` | `/tests` → вкладка «Химия» показывает данные или явную ошибку; нет «тихого пустого 200» | 1 |
| 0.3 | Починить «ДЗ»: вернуть страницу `/homework` (опор на `listHomeworks` + `getStudentPlanner`) | Клик по табу «ДЗ» показывает задания, а не расписание | 2 |
| 0.4 | App Router-файлы: `loading.tsx` (скелетон), `error.tsx` (кнопка «Повторить»), `not-found.tsx` (ссылка на главную), `global-error.tsx` | Проверка `glob` — 4 файла; ручной тест 404 и ошибки API | 2 |
| 0.5 | Убрать полные перезагрузки: `TopBar` → `router.push`, `login/register/callback` → `router.replace(...)` + `router.refresh()` | `grep -R "window.location.href" src` — только внешние URL | 1 |
| 0.6 | Линт в CI: шаг `npm run lint` в `code-check.yml` (сейчас 0 ошибок в `src` — зелёный сразу) | Workflow красный при новой ошибке | 0.5 |
| 0.7 | 15 `apply-*`/`fix-*`/`restore-*` workflow → `workflow_dispatch` + PR вместо прямого push в `main` | Ни один workflow не содержит `git push origin HEAD:main` | 1 |
| 0.8 | Решить судьбу `public/library/histology` (202 МБ): перенести в Blob+подключить в UI **или** удалить | В репо нет ссылок-призраков; `du -sh public` < 50 МБ | 1 |
| 0.9 | **D30**: `resolveSubjectSlug` возвращает неизвестное как есть → UUID в URL статики | Нет 404 на `/content/portals/ticket-banks/*` в консоли | 0.5 |
| 0.10 | **D31**: синхронизировать слаги — либо `subjects` резолвится через алиасы на сервере, либо клиент строит ссылки по `subject.slug` из БД | `GET /subjects/organic_chemistry` → 200 либо ссылка ведёт на существующий слаг | 1 |
| 0.11 | **React error #130**: воспроизвести в `next dev`, найти компонент-объект, починить | Краш не воспроизводится на 3 сценариях (главная, предмет, админка) | 1 |
| 0.12 | **503 `/admin/lectures` и `/lesson-plan`**: `wrangler tail medbiohim-api` во время воспроизведения → найти реальную ошибку БД | Оба эндпоинта отдают 200 либо честный код ошибки | 1 |
| 0.13 | **Кэш картинок тренажёров** (56 % трафика, p50 1,6 с): `Cache-Control: public, max-age=…, immutable` + `ETag` на `/trainers/feed/:id/image` | Повторная прокрутка ленты не бьёт в Worker | 1 |

## Волна 1 — «надёжность» (≈15 дн.)

| # | Задача | DoD | Дн. |
|---|---|---|---|
| 1.1 | `AbortController`/`cancelled` во всех `useEffect` с запросами (`AuthProvider`, главная, `settings`, `progress`, `materials`) | Нет предупреждений «setState on unmounted»; тест на unmount | 2 |
| 1.2 | Свести refresh в один single-flight (`api.ts:215`), удалить обходы `:323/:507/:577` | При 401 на 5 параллельных запросах уходит ровно один `/auth/refresh` | 2 |
| 1.3 | Ролевой автотест: перебрать все `/admin/*` под студентом → 403 | Тест в `workers/api/test/` зелёный | 2 |
| 1.4 | Rate-limit в Worker (Upstash Redis уже подключён) на `/auth/login`, `/ai/*`, `/chemistry/resolve` | 20-й логин за минуту → 429 | 2 |
| 1.5 | Серверный журнал API: таблица `api_request_log` (или Upstash) + читать её в `/admin/api-logs` | Журнал переживает перезагрузку вкладки и показывает инциденты вчера | 3 |
| 1.6 | Подключить `adminDbAudit` / `adminRollbackAudit` в `AdminDatabaseConsole` + подтверждение для `DROP/DELETE/TRUNCATE` | Каждый SQL виден в журнале, откат одной кнопкой | 3 |
| 1.7 | Подключить `test:physiology` в `code-check` | Шаг в workflow | 0.5 |
| 1.8 | `tsconfig`: убрать `workers/api/**` из `exclude` (или подтвердить, что `fix-worker-typecheck.yml` — required check) | Типы воркера не могут попасть в `main` без проверки | 1 |

## Волна 2 — «архитектура» (≈18 дн.)

| # | Задача | DoD | Дн. |
|---|---|---|---|
| 2.1 | Разбить `api.ts`: `api/http.ts`, `api/auth.ts`, `api/cache.ts`, `api/admin.ts`, `api/content.ts`; удалить 17 мёртвых экспортов | Ни один файл > 300 строк; `grep "as any" src/lib/api.ts` упал в 5 раз | 5 |
| 2.2 | Ввести `useApiRequest` (loading/error/retry/abort) и перевести на неё 10 самых употребительных экранов | Повторяющийся код `setLoading/setError` вычищен | 4 |
| 2.3 | Разбить `subjects/[id]/page.tsx` на модули вкладок | Файл < 300 строк, вкладки в отдельных файлах | 4 |
| 2.4 | Типизация: type guards вместо `as Type` в `api.ts` + доменные типы (`AcademicState` и др.) | `any` в `src/lib` < 30 | 3 |
| 2.5 | Единый каталог миграций + регенерация списка таблиц (`scripts/audit-supabase-source-of-truth.sql` в CI) | Один каталог, дублей номеров нет, CI сравнивает схему с кодом | 2 |
| 2.6 | Решение по PHP: «legacy, deploy-only» или отключение. Убрать дублирующие route-файлы из активного CI-пути | Документ + один required job вместо двух | 1 (на решение) |

## Волна 3 — «продукт и UX» (≈25–30 дн.)

| # | Задача | DoD | Дн. |
|---|---|---|---|
| 3.1 | Sidebar: 11 → 6–7 пунктов по группам (Учёба / Академия / Сообщество / Система) | Тест юзабилити на 3 человек | 2 |
| 3.2 | Глобальный поиск `Cmd/Ctrl + K` (переиспользовать `/search`), клиентская навигация | Нет перезагрузки, работает с клавиатуры | 3 |
| 3.3 | Настройки: экспорт данных, активные сессии, тонкие уведомления, «тихие часы» | Раздел «Конфиденциальность» работает | 4 |
| 3.4 | `generateMetadata` для 8 «ссылочных» страниц (предмет, лекция, аттестация, тест, билет) + `sitemap.ts`/`robots.ts`/иконки | Превью в Telegram у каждой ссылки | 3 |
| 3.5 | Пустые состояния с CTA и «скелетоны вместо спиннеров» на всех таблицах/карточках | Аудит 59 страниц | 4 |
| 3.6 | Статусные токены (`--color-status-*`) + `.badge-*` в работу, контраст ≥ 4.5:1 в обеих темах | Скрипт проверки контраста в CI | 3 |
| 3.7 | `tabular-nums` на всех числовых таблицах, типографские кавычки/dash, единицы рядом с числом | Аудит таблиц | 2 |
| 3.8 | Реальная страница `/help`: FAQ, статус сервиса, «сообщить о проблеме» (связать с `/admin/problems`) | Ссылка в Sidebar ведёт на полезный контент | 2 |
| 3.9 | Админ: подключить rollback версий расписания, аналитику, `adminContentMove`, `externalPlatformStats` в UI | 4 «спящих» эндпоинта доступны из панели | 4 |
| 3.10 | Рефакторинг кода в одну строку (`admin/api-logs`, `admin/problems`, `admin/test-questions`, `materials/source`) | Читаемые файлы, 0 `any` | 3 |

## Волна 4 — «химия как учебный инструмент» (≈20 дн.)

См. также §7 документа TECH-AUDIT (продуктовый роадмап химии). Кратко по разделам:

| Фаза | Содержание | Дн. |
|---|---|---|
| 4.1 «Справочник» | Интерактивная периодическая таблица (118 элементов) → карточка: масса, конфигурация, история, биологическая роль (важно для медпрофиля). Устранить `chemical_*`-мёртвые таблицы: подключить или удалить | 7–9 |
| 4.2 «Расчёты» | Биохимические калькуляторы: газы крови, анионный разрыв, клиренс креатинина, Михаэлис–Ментен, Аррениус, АТФ из глюкозы/ЖК — **с пошаговым решением** и валидацией единиц | 10–12 |
| 4.3 «Практика» | Визуализатор молекул 3D + VSEPR/гибридизация поверх `resolve`; генератор задач с уровнями и тегами; экспорт расчётов в CSV/PDF | 15–20 |

Предусловие: закрыть D2 (один резолвер вместо трёх).

## Волна 5 — «тесты и e2e» (≈10 дн.)

| # | Задача | Дн. |
|---|---|---|
| 5.1 | Playwright: вход → предмет → тест → аттестация → выход; отдельный сценарий «студент заходит в `/admin` → 403» | 4 |
| 5.2 | Unit-тесты на type guards и утилиты расчётов (`api.ts`, `chemistry/validation`) | 2 |
| 5.3 | Контракт-тест: `src/lib/api.ts` ↔ `workers/api/src/routes/*` (путь и метод существуют) | 3 |
| 5.4 | Контраст/доступность в CI (`axe` на 5 ключевых страницах) | 1 |

**Итого: ~95–115 человеко-дней.** Критический путь (волна 0 + D3) — **~2 недели**.

> Дополнительно 27.10.2026 в план добавлена **Часть 6** — задачи **U1–U9** (интеграция портала
> `ozizdvgmu.ru` и точность расписания: специальность/курс/поток/форма обучения), ≈ 11 дн.
> U1–U5 идут в волнах 1 и 3, U6–U8 — в волне 3. Итого с Частью 6: **~106–126 человеко-дней**.

---

# ЧАСТЬ 4. ПРОДУКТОВЫЙ РОАДМП ПО РАЗДЕЛАМ

Что реально добавить, чтобы раздел начал работать на результат (помимо «починить»):

| Раздел | Что есть | Что добавить |
|---|---|---|
| **Расписание** | Сетка, недели, битые часы | Уведомление об изменении пары; «моя неделя» избранного; экспорт в `.ics`/Google Calendar |
| **ДЗ** | API 21 маршрут, страницы нет | Страница ДЗ с дедлайнами, чек-листом, автосохранением черновика ответа и напоминанием за 24 ч |
| **Тесты** | Хаб, банк, режим подготовки | Разбор ошибок («часто путаешь тему X»); повтор через интервальные интервалы поверх `srs_cards` |
| **Аттестации** | Полный CRUD + раннер | Привязка к учебному плану (уже есть `attestation builder`), прогноз готовности, PDF-отчёт |
| **Прогресс** | Круговые диаграммы | График по неделям, сравнение с группой (анонимно), рекомендации «что подтянуть» |
| **Карточки SRS** | SM-2 реализован | **Нет ссылки в навигации** — вынести в Sidebar/предмет |
| **Сообщество** | Посты, модерация | Опросы, закрепление (в коде есть disabled-кнопка «Закрепление недоступно» — поле в схеме отсутствует), упоминания |
| **AI-тьютор** | Два провайдера | Один провайдер, история диалогов (таблица `ai_conversations` уже есть!), привязка к предмету и цитирование источников |
| **Калькуляторы** | Базовые | Биохимические расчёты с пошаговым выводом (см. волну 4) |
| **Химия** | Workbench, 2D/3D, проекции, механизмы | Периодическая таблица, VSEPR, генератор задач, экспорт |
| **Вуз и ЕИОС** | Скрейпинг, импорт, сохранённое | Статус источника, авто-обновление расписания по расписанию (cron), уведомления об изменениях |
| **Материалы** | Каталог + первоисточник | Полноценный предпросмотр PDF/DOC прямо в браузере (сейчас — скачивание 12-МБ `.doc`) |
| **Настройки** | Профиль/вход/темы | Экспорт данных, сессии, тонкие уведомления, приватность |
| **Помощь** | 3 абзаца-заглушки | FAQ, статус сервиса, форма обращения в `/admin/problems` |

---

# Часть 5. Live-логи прод-окружения (27.10.2026)

**Источники:** выгрузка `/admin/api-logs` в CSV (731 запрос, 02:36 → 11:00 UTC) и консоль браузера на `medbiohim.vercel.app`.

## 5.1. Метрики

| Метрика | Значение |
|---|---|
| Всего запросов | **731** |
| Не-2xx | **16 (2,19 %)**: 8×401, 3×503, 2×404, 1×502, 2×network(0) |
| Латентность p50 / p95 / p99 / max | **1455 / 2119 / 3383 / 12 389 мс** |
| Источник | cloudflare 729, unavailable 2, **fallback 0** |
| Поле `error_code` | **0 из 731** — см. D15/D35 |

## 5.2. Распределение трафика

| Endpoint | Доля | p50 | p95 | max |
|---|---|---|---|---|
| `GET /trainers/feed/:id/image` | **412 (56 %)** | 1629 | 2225 | 3794 |
| `POST /presence/heartbeat` | **113 (16 %)** | 607 | 2513 | 12 389 |
| `GET /admin/database/.../rows/*` | 16 | 796 | **3419** | 3419 |
| `GET /groups` | 15 | 591 | 996 | 996 |
| `GET /auth/me` | 10 | 753 | 1160 | 1160 |
| `GET /tests` | 8 | 1379 | 1940 | 1940 |
| `GET /materials` | 4 | 1125 | 2013 | 2013 |

**Три вывода:**

1. **56 % трафика — картинки тренажёров**, каждая в среднем 1,6 с. Путь: браузер → Vercel-прокси → Worker `trainers.ts:363 /feed/:id/image` → Blob/B2 → обратно. Кэширование (`Cache-Control`, `ETag`, CDN) + предзагрузка — самое дешёвое ускорение в проекте: убирает половину запросов и ~1,6 с на каждую карточку.
2. **`/admin/database/.../rows/*` доходит до 3,4 с** — SQL-консоль тянет строки без серверного лимита (пагинация только на клиенте). Ограничение `range()` на стороне Worker.
3. **Медиана 1,45 с на обычный GET** — до работы над «красивым UI» (волна 3) сначала волна 1: кэш, индексы, выборка только нужных колонок.

## 5.3. Все 16 ошибок и диагноз

| Время UTC | Статус | Endpoint | Диагноз | Приоритет |
|---|---|---|---|---|
| 10:59:38 | 503 | `GET /admin/lectures` | `readLectures()` → `site_content.key='lectures'` бросает при ошибке БД (D35) | 🔴 |
| 10:57:58 | 503 | `GET /lesson-plan` | `catch → DB_UNAVAILABLE`, `lesson-plan.ts:145` (D35) | 🔴 |
| 10:57:15 | 502 | `POST /ai/conversations/:id/messages` | апстрим AI-провайдера, `ai.ts:175-184` | 🟠 |
| 10:50:47, 10:50:57 | 404 | `GET /subjects/organic_chemistry` | **рассинхрон слагов клиент/сервер** (D31) | 🔴 |
| 10:27:20 | 503 | `POST /admin/telegram/set-webhook` | `TELEGRAM_NOT_CONFIGURED` — не заданы переменные Worker (D36) | 🟡 |
| 02:36 (×5), 08:02 (×2), 10:22 (×1) | 401 | `auth/me`, `dashboard`, `subjects`, `academic/state`, `heartbeat` | **истёкший access token**, всплесками (D34) | 🟠 |
| 08:01:40, 08:01:52 | 0 | `POST /presence/heartbeat` | таймаут 12 389 мс и 5 339 мс — сеть/свернутая вкладка | 🟡 |

## 5.4. Консоль браузера — что наше, а что нет

| Сообщение | Вердикт |
|---|---|
| `/content/portals/ticket-banks/<uuid>.json` 404 (×2) | **Наш баг, D30**: `loadTicketBank` получает UUID вместо слага |
| `POST .../ai/.../messages 502` | Наш, см. 5.3 |
| `GET /lesson-plan 503`, `GET /admin/lectures 503` | Наш, D35 |
| `POST /admin/telegram/set-webhook 503` | Наш, но это конфиг (D36) |
| **React error #130 (`args[]=object`)** | **Наш, краш рендера**: «element type is invalid, got: object». В минифицированном бандле имя компонента не видно — локализовать в `next dev`. Ставить в волну 0 |
| `react_devtools_backend_compact.js: Cannot send a message through a Bridge that has been shut down` (×100+) | **Не наш баг.** React DevTools Extension после закрытия/переезда вкладки. Не тратить время |
| `Permissions-Policy header: Unrecognized feature: run-ad-auction / join-ad-interest-group / private-aggregation / attribution-reporting` | **Не из нашего `next.config.ts`** (там только `camera=(), microphone=(), geolocation=()`). Добавляет расширение или edge-слой — проверить фактический ответ `curl -I`, к коду проекта отношения не имеет |

## 5.5. Что подтвердилось или опровергнуто

- ✅ **Подтвердилось:** D10 (всплески 401 = шторм refresh), D15 (пустой `error_code`), «журнал непригоден для диагностики».
- ✅ **Новое:** **ни одного запроса через `MEDBIOHIM_UPSTREAM`** за 8,5 часа — shadow-воркер фактически не задействован, его можно выводить из обычного контура (§11).
- ✅ **Новое:** сетевых отказов Worker нет — 0 таймаутов на GET, ни одного 429 (rate-limit не работает вовсе, что и ожидалось: он не реализован, D13).
- ❌ **Не подтверждено:** D3 (ролевой гейт `/admin/schedule`) — в выгрузке только `GET /admin/schedule`, **нет ни одной `POST /admin/schedule/save`**. Проверка обязательна.
- ⚪ **Не видно в логе:** ни одного 403 (вы как админ ни во что не упёрлись — проверки прав для студента в выборке нет).

---

# Часть 6. Интеграция: ОЗиЗ ДВГМУ и точность расписания (27.10.2026)

Добавлено по итогам разбора двух задач: (1) подключения ещё одного вузовского портала
`ozizdvgmu.ru`, (2) претензии к тому, что расписание с сайта вуза не показывает, для какой
специальности, курса и потока предназначен файл.

## 6.1. Что такое `ozizdvgmu.ru` — проверено вживую

Это **Moodle LMS** кафедры общественного здоровья и здравоохранения ДВГМУ (в `meta description`
сайта прямо сказано: «Данное приложение основано на системе управления обучением (LMS) MOODLE»).

| URL | Статус | Что отдаёт без входа |
|---|---|---|
| `/` | 200 | Главная со списком **~25 доступных курсов**, видны преподаватели (Сазонов О. А., Садко Н. В.) |
| `/course/index.php` | 200 | Дерево категорий: `Разное`, `ДВГМУ` |
| `/course/index.php?categoryid=4` | 200 | Полный список курсов в категории + подкатегории: Лечебный факультет, Факультет фармации и биомедицины, Факультет МГФ, Кафедра общественного здоровья, Кафедра физиологии, КС «ИИ в медицине» |
| `/course/view.php?id=28` | 200 → **редирект на `/login/index.php`** | Материалы курса закрыты входом («Some courses may allow guest access») |

Что уже видно публично и полезно:

- **Название курса несёт метаданные**: «Информационные технологии в здравоохранении. МБХ. 2026-27гг.»,
  «ИТвЗ МБХ 2025/26_1», «26/7гг. ИТвЗ для леч. ф-та.», «МБХ, 2к. 02.2021 … факультета фармации и биомедицины»,
  «МГФ.ВО.СР.Заоч / 01.2026 / 34.03.01 Сестринское дело. Бакалавриат. Заочная форма».
  То есть **та же пара «специальность + курс + форма», что и в расписании**, — разбирать теми же правилами.
- **Описание курса, даты начала, преподаватель** — из карточки на главной и из `course/index.php`.
- Дерево категорий **даёт привязку к факультету**, которую у расписания пока нет (см. 6.3).

Чего публично **нет** и брать не нужно: содержимое курса (конспекты, задания, тесты) — за `/login/index.php`.

## 6.2. Что интегрировать

| Уровень | Что | Как |
|---|---|---|
| **Белый, без входа** | Каталог курсов ОЗиЗ: название, описание, преподаватель, дата начала, категория/факультет | Новый адаптер `src/lib/university/oziz.ts` по образцу `fesmu.ts`: только `GET` публичного HTML, серверный кэш 30 мин, provenance, никогда не бросает исключение |
| **Белый** | Карточка сервиса в `/university` | Добавить в `PORTAL`-реестр `src/lib/university/portals.ts` — категория `"lms"` в `ServiceCategory` уже существует, `ServiceGrid` уже умеет `reachable`/`latency` |
| **Белый** | Единая модель: курс ОЗиЗ → факультет/специальность/форма обучения | Переиспользовать разбор, что и для расписания (задача U8), чтобы карточки были сопоставимы |
| **Только клиентский** | Материалы курса | Через браузерное расширение на уже открытой студентом сессии; токен/пароль **не покидают устройство** |
| **⛔ Запрещено** | Автологин, хранение паролей/sesskey/Moodle-токена на сервере, обход гостевого доступа, фоновый обход курсов | Зафиксировано как анти-цель (см. задачу U9) |

Ограничение по `Moodle Web Services API` (`/webservice/rest/server.php`): токен выдаётся только через
`login/token.php` **со своей учётной записи**. Read-only токен допустим лишь если студент сгенерировал
его сам и хранит у себя; на сервер MEDBIOHIM он не тянется ни при каких условиях.

## 6.3. Почему расписание «не показывает специальность, курс и поток»

### Что реально лежит на страницах (проверено 27.10.2026)

**Факультет фармации и биомедицины** — на одной странице **две разные специальности**:

```
Факультет фармации и биомедицины
├─ 33.05.01 Фармация          ─ колонки 1…6 курс → Осенний семестр 2026-2027 → «Занятия и лекции», «Экзамены» …
│                              ─ Весенний семестр 2025-2026 → … → ГИА, График вручения дипломов
└─ 30.05.01 Медицинская биохимия (МБХ) — та же структура, включая «Экзамены по практике»
```

**Медико-гуманитарный факультет** — **три специальности** и формы обучения прямо в текстах ссылок:

```
├─ 39.03.02 Социальная работа     — «Занятия и лекции (очная форма)», «… (заочная форма)», «Экзамены по практике (заочная форма)»
├─ 37.05.01 Клиническая психология
└─ 34.03.01 Сестринское дело      — «… (очно-заочная форма)», «… (инд. план)»
```

**Лечебный факультет** — одной специальности, но **два потока** в текстах ссылок:

```
└─ «Занятия и лекции (1 поток)», «… (2 поток)», «… (1 поток октябрь-январь)», «Лекции (1 поток)»
```

То есть все три измерения — **специальность, курс, поток/форма** — на странице есть, но в разных местах:
специальность это **заголовок секции**, курс это **заголовок колонки таблицы**, поток и форма это
**текст ссылки**.

### Что делает текущий парсер (`src/lib/university/fesmu.ts`)

| Измерение | Источник в коде | Почему не работает |
|---|---|---|
| Специальность | **отсутствует**: в `ScheduleItem` нет поля `program` | Заголовок вида `30.05.01 Медицинская биохимия` — секционный, он **раньше** заголовка «Осенний семестр», поэтому `deriveContext()` (fesmu.ts:917), который берёт ближайший `h1–h4` или «Осенний/Весенний семестр», его **отбрасывает**. Дополнительно `FACULTIES[].program` — одна строка на факультет: `«Фармация 33.05.01»` для обоих направлений, а у МГФ вообще `null` (portals.ts:197, 206) |
| Курс | `deriveCourse(title, stem)` (fesmu.ts:839), `haystack = title + stem` (fesmu.ts:1004) | Текст ссылки — «Занятия и лекции», цифры нет; **колонка `1 курс … 6 курс` не читается вообще**. `course_number` заполняется только если цифра случайно есть в имени файла → такие файлы падают в группу «Общие материалы» |
| Поток | `deriveStream(haystack)` по `title + stem` | Для Лечебного **работает** («1 поток» есть в тексте ссылки) — но только потому, что попал в `title` |
| Форма обучения | **отсутствует** | «(очная форма)» / «(заочная форма)» / «(очно-заочная форма)» у МГФ никуда не выделяются — смешиваются очники и заочники |

### Что делает UI (`src/components/university/SchedulePanel.tsx`)

- **Карточка факультета** (SchedulePanel.tsx:234–248) — только `faculty.title` + `«код · программа»`.
  Ни счётчика файлов, ни списка специальностей, ни указания, что внутри есть потоки/формы.
  То есть «что там внутри» видно **только после клика и загрузки**.
- **Группировка списка** (SchedulePanel.tsx:154) — только по `item.course`, поэтому на странице
  фармации и биомедицины файлы МБХ и фармацевтов лежат **в одной куче**.
- **Чипы в строке** (SchedulePanel.tsx:77–83) показывают `kind/semester/stream/format/context/course`,
  но не специальность и не форму обучения.
- Поиск (SchedulePanel.tsx:158) не ищет по специальности.

## 6.4. Задачи (добавлены в план работ)

| # | Задача | DoD | Волна | Дн. |
|---|---|---|---|---|
| **U1** | Поле `program: string \| null` в `ScheduleItem` + `deriveProgram()`: ближайший preceding-заголовок `/\d{2}\.\d{2}\.\d{2}\s+[А-Яа-яё…]+/`. В `FACULTIES` заменить `program` строкой на `programs: string[]` (`Фармация 33.05.01`, `Медицинская биохимия 30.05.01`, у МГФ — три), fallback если заголовок на странице отсутствует (Лечебный) | На фармбiomед файлы разведены на «33.05.01 Фармация» и «30.05.01 Медицинская биохимия»; на МГФ — на три направления | 1 | 1 |
| **U2** | Курс **из колонки таблицы**: для якоря найти ближайший `<table>`, а в префиксе до него — ближайший `/\d{1,2}\s*(?:-?й)?\s*курс/`; применять, только если `deriveCourse()` по названию/файлу не дал результата | `course_number` заполнен у файлов, в чьём имени нет цифры; на Лечебном 1–6 курс разведены | 1 | 1.5 |
| **U3** | Поле `form: "очная" \| "заочная" \| "очно-заочная" \| null` из текста ссылки + чип в `ScheduleRow` | На МГФ очники и заочники различимы визуально и в поиске | 1 | 0.5 |
| **U4** | Группировка UI: **сначала `program`, потом `course`**; чип `program` в `ScheduleRow`; добавить `${item.program}` в строку поиска | На фармбiomед МБХ-файлы не видны в группе «Фармация» и наоборот | 3 | 1 |
| **U5** | **Превью карточки факультета вместо пустого названия**: в overview payload поле `schedule.faculty_summaries[]` = `{ id, doc_count, courses[], programs[], has_streams, has_forms }`, собирать в том же `Promise.all` (кэш 30 мин уже есть), рисовать чипами на карточке | До клика видно, сколько файлов, какие специальности/курсы, есть ли потоки и формы | 3 | 2 |
| **U6** | Карточка сервиса ОЗиЗ в `portals.ts` (категория `lms`) с `reachable`/`http_status`/`latency` | `/university` показывает статус `ozizdvgmu.ru` рядом с ЕИОС и библиотекой | 3 | 0.5 |
| **U7** | Адаптер `src/lib/university/oziz.ts` + маршрут `/api/university/oziz`: публичные курсы и дерево категорий, кэш 30 мин, provenance, честная пометка «содержимое курса — после входа» | Список курсов с преподавателем и датой отображается, не ломая контракт `UNIVERSITY-INTEGRATION-CONTRACT` | 3 | 3 |
| **U8** | Разбор названий курсов ОЗиЗ на общую модель (`faculty`, `program`, `course`, `form`, `semester`) теми же правилами, что и расписание | Фильтр курсов по факультету работает сопоставимо с расписанием | 3 | 1.5 |
| **U9** | **Ограничение (анти-цель):** не автоматизировать вход в ОЗиЗ/ЕИОС, не хранить пароли, sesskey и Moodle-токены на сервере, не обходить гостевой доступ, не обходить лимиты. Материалы курса — только через расширение на уже открытой сессии студента | Записано в `README` расширения и в Части 7; код не содержит `login/token.php` и автологина | 0 | — |

**Итого по части 6: ≈ 11 человеко-дней.** U1–U3 делаются одним изменением в `fesmu.ts` и закрывают
претензию по расписанию; U5 закрывает «нужно заранее видно, что там»; U6–U8 — саму интеграцию ОЗиЗ.

Рекомендуемый порядок: **U1 → U2 → U4 → U5** (всё по расписанию, одна тема), затем **U6 → U7 → U8**
(ОЗиЗ). U3 и U9 вставляются по ходу.

### 6.5. Статус после реализации (28.10.2026)

**Сделано: U1, U2, U3, U4, U5.** Проверено на сохранённых страницах вуза
(`test/fixtures/fesmu/`) и на живом сайте (`test/fixtures/fesmu/_live-program-smoke.mjs`).

| # | Что сделано | Живой результат |
|---|---|---|
| U1 | `ScheduleItem.program`, `deriveProgram()`, `Faculty.programs[]` | Фармация: 54 файла → «33.05.01 Фармация» и «30.05.01 Медицинская биохимия», **0 без специальности**; МГФ — 3 специальности |
| U2 | `deriveCourseFromTable()` — курс из колонки таблицы, имя файла в приоритете | На всех шести факультетах курсы `1…6` распознаны; файлы без цифры в имени больше не падают в «Общие материалы» |
| U3 | `ScheduleItem.form`, `deriveForm()` + `deriveFormFromCell()` | МГФ: `очная`, `заочная`, `очно-заочная`; у фармации формы нет — флаг не врёт (`has_forms: false`) |
| U4 | Группировка UI «специальность → курс», чип специальности в строке, поиск включает `program`/`form` | Файлы МБХ не видны в группе «Фармация» и наоборот |
| U5 | `schedule.faculty_summaries[]` в overview + чипы на карточке | До клика видно: «54 файла», курсы, специальности, «потоки» / «формы обучения»; недоступный факультет — «состав уточняется» |

Уточнение по реальной разметке (важно для будущих правок): специальность на сайте
ДВГМУ — не заголовок, а абзац `<p><span><b>30.05.01 Медицинская биохимия</b></span></p>`,
а шапка колонок таблицы набрана через `<td>`, а не `<th>`; курс в тексте ссылки
(«Занятия и лекции») отсутствует полностью. Форма обучения («(заочная форма)»)
стоит отдельной строкой под ссылкой, иногда в одной ячейке с очной.

Цена U5: overview теперь читает 6 страниц факультетов (было 4 запроса, стало 10),
но они идут через тот же 30-минутный кэш, частично параллельно (`runPool(3)`) и с
бюджетом 9 с на факультет; недоступный факультет отдаёт `ok: false` и не ломает overview.

Открыто: **U6–U8** (ОЗиЗ) и анти-цель **U9** (уже зафиксирована в README расширения).

---

# Часть 7. Риски и анти-цели

1. **Не разрастать legacy.** Четыре реализации API — главный источник «исправлено здесь, сломано там». Любая новая фича — сначала в `workers/api`, остальное не трогать.
2. **Не добавлять новый storage.** Зафиксировано в ROADMAP: Supabase (источник истины) + Upstash Blob (медиа) + B2 (архив) + Redis (кэш). R2 не нужен.
3. **Не писать в `main` мимо PR** — до волны 0.7 это делают 15 workflow.
4. **Не чинить типы «затиранием»**: `eslint` сейчас показывает 0 ошибок partly потому, что `no-explicit-any` выключен в конфиге. Поднимать аккуратно, вместе с D24.
5. **Не выкладывать 12-МБ файлы в `public/`** — гнать через Blob с `Content-Disposition`.
6. **Не доверять «зелёному CI» как доказательству поведения**: сейчас 5 из 7 проверок — это `grep` по исходникам. Волна 5 обязательна перед крупными рефакторингами.

---

# Приложение A. Проверочные команды

```bash
# типы и линт
npx tsc --noEmit
npx eslint src

# обязательные файлы App Router
find src/app -name "loading.tsx" -o -name "error.tsx" -o -name "not-found.tsx"

# анти-паттерны навигации
grep -RIn "window.location.href" src
grep -RIn '<a href="/' src

# SEO
ls public/robots.txt public/sitemap.xml src/app/icon* src/app/sitemap.ts 2>/dev/null

# мёртвый код
grep -RIn "Confetti\|ExternalPlatforms" src
grep -c "as any" src/lib/api.ts

# ролевой гейт
grep -L "gate(" workers/api/src/routes/admin-*.ts

# миграции в двух каталогах
ls database/migrations | wc -l; ls supabase/migrations | wc -l

# статика
du -sh public/* ; git ls-files public/library | wc -l

# тесты
npm run test:api-failover && npm run test:physiology
```

# Приложение B. Проверки, которые нельзя было сделать статически ❓

**Статус после анализа логов от 27.10.2026:**

1. ❓ **Не проверено:** `POST /api/v1/admin/schedule/save` под студенческим токеном → 403 или 200? (D3) — в выгрузке нет ни одной такой записи.
2. ❓ **Не проверено:** запись в `schedule_entries` под админом — проходит ли RLS?
3. ❓ **Не проверено:** реальные write-политики RLS для `schedule_entries`/`schedules` (в миграциях видна только `*_read_v3`).
4. ❓ **Не проверено:** используется ли `src/lib/supabase.ts` только с anon-ключом.
5. ❓ **Не проверено:** доступность 12-МБ файлов `public/library/physiology` в проде и `Content-Disposition`.
6. ❓ **Частично:** живой сценарий входа — видны 3 всплеска 401 → восстановление, т.е. refresh работает, но с задержкой. Полный прогон (вход → сессия → refresh → выход) не выполнялся.
7. ❓ **Новое:** причина 503 на `/admin/lectures` и `/lesson-plan` — нужен лог на стороне Worker (`wrangler tail medbiohim-api`).
8. ❓ **Новое:** локализовать React error #130 в `next dev` (некомпонент-объект вместо типа).
