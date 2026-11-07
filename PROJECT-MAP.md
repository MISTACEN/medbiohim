# Карта проекта MEDBIOHIM — где что лежит

Обновлена: 2026-11-07. Ориентир для человека, который открыл репозиторий впервые.

Сопутствующие главные документы: [ROADMAP.md](ROADMAP.md) — план/этапы/остаток; [docs/HISTORY.md](docs/HISTORY.md) — история. Технические контракты: [docs/WORKERS-TOPOLOGY.md](docs/WORKERS-TOPOLOGY.md), [docs/COOKIES-RFC-E1.md](docs/COOKIES-RFC-E1.md), [docs/architecture/SHARED-COMPONENT-REGISTRY.md](docs/architecture/SHARED-COMPONENT-REGISTRY.md). Архив старых документов: [docs/archive/](docs/archive/).

## Как устроен проект (30 секунд)

Это **модульный монолит** из 4 слоёв. Каждый учебный домен (тесты, лекции, предметы, расписание, кабинет преподавателя…) повторяется на каждом слое с одним и тем же именем:

```
Браузер
  src/app/<домен>/            → страница (маршрут) — тонкая точка входа
  src/components/<домен>/     → интерфейс домена
  src/lib/api/<домен>.ts      → клиент API (fetch-обёртки, типы)
  src/lib/endpoints.ts        → ЕДИНСТВЕННОЕ место со строками путей /api/v1/*
      ↓ same-origin /api/v1/*
  src/app/api/v1/[...path]/route.ts  → прокси Vercel → Cloudflare
      ↓
  workers/api/src/routes/<домен>.ts  → серверная логика + проверка прав
      ↓
  supabase/migrations/        → схема БД + RLS; Supabase — источник истины
```

**Правило навигации:** ищешь «расписание» — смотри `src/app/schedule`, `src/components/schedule`, `workers/api/src/routes/schedule.ts`. Всё.

## Слой страниц: `src/app/` (56 разделов)

| Папка | Что это |
|---|---|
| `page.tsx`, `layout.tsx` | Главная и каркас (сайдбар, мобильная навигация) |
| `login/`, `register/`, `auth/` | Вход/регистрация (Supabase Auth + Telegram) |
| `schedule/`, `subjects/`, `progress/`, `community/` | Основные разделы студента |
| `tests/`, `tickets/`, `practice/` | Тесты: подготовка, банк, билеты, практика |
| `lectures/`, `materials/`, `library/`, `reader/`, `bookmarks/` | Лекции и материалы + читалка |
| `academic/`, `curriculum/`, `assignments/`, `homework/` | Учебный план, отработки, ДЗ |
| `atlas/`, `histology/`, `embryology/`, `chemistry/`, `labs/`, `trainers/`, `cards/`, `latin/` | Предметные модули и тренажёры |
| `teacher/` | **Кабинет преподавателя** (обзор, тесты, назначения, студенты, лекции, банк вопросов) |
| `admin/` | Админ-консоль: users, access (доступы к разделам), teachers (назначения + детализация), groups, tests, questions, lectures, schedule, workshop, database (SQL-консоль), audit, api-logs… |
| `settings/`, `help/`, `changelog/` | Личное: настройки, помощь |
| `search/`, `calculators/`, `journal/`, `builder/`, `extension/` | Инструменты |
| `api/v1/[...path]/route.ts` | Прокси → Cloudflare Worker |

## Общий слой: `src/shared/` и `src/lib/`

| Место | Что там |
|---|---|
| `src/shared/file-engine/` | Просмотр файлов внутри сайта (DOCX/XLSX/PPTX/CSV/TXT/архивы), детекция, security |
| `src/shared/permissions/` | Роли и capabilities на клиенте |
| `src/components/ui/` | UI-кит: Button, Badge, Modal, Tabs, DataTable, ConfirmDialog (+ barrel `index.ts`) |
| `src/components/questions/` | Рендер варианта ответа и панель результата (общие для всех тестов) |
| `src/lib/question-types/` | Реестр типов вопросов, нормализация, грейдер (single/multiple/true_false/numeric/match/cloze/ordering/open) |
| `src/lib/learning/` | Единая модель активностей и проверок |
| `src/lib/api/` | Клиенты по доменам (`tests.ts`, `teacher.ts`, `access.ts`…) + `client.ts` (fetch, токен, refresh) |
| `src/lib/endpoints.ts` | Все URL API — менять пути только здесь |
| `src/lib/auth/` | Сессия, токен, refresh |
| `src/hooks/` | `useModuleAccess`, `useApiRequest` и др. |
| `src/components/editor/RichLectureEditor.tsx` | **Единый научный редактор** (формулы, chem, таблицы, индексы, вложения) |
| `src/components/chemistry/`, `src/lib/chemistry/` | Химический рендер (ChemRichText), формулы |

## Сервер: `workers/api/`

| Файл | Что там |
|---|---|
| `src/index.ts` | Сборка приложения; здесь же moduleGate на разделах (Access Control) |
| `src/lib/permissions.ts` | Роли → capabilities → проверок (requireAdmin/requireTeachingCapability) |
| `src/lib/teacher-scope.ts` | Область преподавателя (teacher_assignments + assigned_teacher) |
| `src/lib/content-access.ts` | Владение контентом (teacher правит только своё) |
| `src/lib/module-access.ts` + `module-access-rules.ts` | Access Control разделов (deny > allow, сроки, fail-open без миграции) |
| `src/routes/teacher/` | Кабинет — каталог: `core.ts` (обзор/работы/кандидаты/предметы), `tests.ts` (свои тесты), `assignments.ts` (области+детализация), `assigned-tests.ts` (назначения тестов/аналитика/CSV), `students.ts` (ростер/карточки), `_shared.ts` (хелперы); сборка в `index.ts` |
| `src/routes/tests.ts`, `preparation.ts` | Тестовый движок: попытки, сессии подготовки, preview, назначения студентам |
| `src/routes/access.ts` | /access/my-modules + админ-CRUD доступов + журнал |
| `src/routes/admin*.ts` | Админ-поверхности (users, content, parity, schedule, attestations…) |
| `src/routes/bootstrap-migrate.ts` | ⚠️ ОДНОРАЗОВЫЙ бутстрап миграций (инертен без секрета; кандидат на удаление) |
| `test/` | Контрактные тесты маршрутов и логики |
| `wrangler.toml` | Конфиг воркера: имя, vars, services, cron |

## БД: `supabase/migrations/`

Применялись к проду все: `20261105090000_teacher_assignments` (области учителей), `20261106100000_module_access` (доступы к разделам), `20261106120000_teacher_catalog` (tests.created_by), `20261107090000_test_assignments` (назначения тестов), `20261107130000_result_detail_levels` (уровни 1–4).

## Мутные места (честно)

1. **`chem/` vs `chemistry/`** — два компонентных каталога (историческое); химию ищи в обоих.
2. **`builder/` vs `constructor/`-наследие vs `editor/`** — конструктор контента и редактор лекций — разные вещи.
3. **`tests/` vs `tickets/` vs `practice/` vs `cards/`** — три входа в один тестовый движок (подготовка/билеты/практика).
4. **Права в двух местах**: `src/lib/admin/access.ts` (легаси-проверка Admin UI) и `src/shared/permissions` (новая модель) — клиентские дубли, сервер один (`permissions.ts` воркера).
5. **`src/core/` не выделен физически** — auth в components, права в shared, api-клиент в lib. Это осознанная цель, не сделана.
6. **70 файлов роутов воркера** — кабинет уже в подпапке routes/teacher/ (образец разнесения); остальные домены ищутся по имени файла. Следующие кандидаты: admin.ts (1445 строк — telegram+lectures+questions+users+files в одном; сейчас в работе у второго агента), workshop.ts (787), admin-parity.ts (680).
7. **Страницы-монолиты фронтенда**: schedule/page.tsx (1221), subjects/[id]/page.tsx (1084, 40 импортов), settings/page.tsx (869), page.tsx (836), practice/page.tsx (829) — при доработке этих разделов выносить крупные куски в src/components/<домен>/.

---

## ⚠️ Спорные и требующие решения владельца места

Полный реестр, чтобы знать, ЧТО разбирать и КОГДА. Пока не решено — работает текущая реализация.

| # | Место | Конфликт/вопрос | Текущая реализация | Что нужно решить |
|---|---|---|---|---|
| 1 | **Индивидуальные результаты у преподавателя** | Часть XV ТЗ: «запретить преподавателю просмотр индивидуальных результатов»; прямая директива владельца: «показывать ФИО и результаты по его тестам» | ФИО + проценты + попытки видны (карточки студентов) | Подтвердить: ФИО разрешены (директива действует) или вернуться к агрегатам |
| 2 | **Аналитика по вопросам** | ТЗ: «выключена по умолчанию, не расширять без разрешения» | Реализована и включена в кабинете (доля верных на вопрос) | Оставить включённой или скрыть за флагом |
| 3 | **Ручная проверка открытых ответов тестов** | §13.1 исключала ручную проверку; 8.39–8.42 её требует; для ДЗ проверка есть | Для тестов — только автопроверка/эталон; ручной проверки нет | Разрешить ручную проверку открытых ответов тестов? |
| 4 | **Порог малой выборки N=5** | Предварительное значение из обсуждений | Не реализован (агрегаты показываются при любых N) | Подтвердить N и включить «Мало данных» |
| 5 | **Полномочия старосты** | Перечень действий в пределах группы не утверждён | Существующие: состав группы, поток/подгруппа, ДЗ (без смены курса/года) | Утвердить точный перечень |
| 6 | **Открытые ответы: модель проверки** | Авто по критериям vs семантическая (AI) vs только ручная | Точное совпадение + терпимость к опечаткам + AI по эталону; неверное AI не засчитывает | Достаточно ли текущей модели |
| 7 | **OCR журнала** | Какие академические сведения сохранять и кому доступны | Не реализован | Определить объём данных и приватность |
| 8 | **Назначение тестов: приватность при малых группах** | Аналитика/CSV показывают каждого студента | Персональные данные видны учителю области | Совместить с #1/#4 |
| 9 | **Объём этапов W10–W13** (симуляции, библиотека-расширение) | Состав сверить с исходным DOCX | Симуляции/ресурсы не подключались | Утвердить состав |
| 10 | **admin.ts и другие монолиты** (Задача A2–A10) | admin.ts сейчас в работе у второго агента | teacher.ts разнесён (образец) | Скоординировать, после — разнести |
| 11 | **9 незакоммиченных файлов второго агента** (permissions/admin/groups/homework) | Параллельная работа в одном дереве | Лежат незакоммиченными | Дождаться его отчёта или передать мне на проверку/коммит |
| 12 | **Bootstrap-маршрут миграций** | Одноразовый, инертен без секрета | Оставлен в коде (fail-safe) | Удалить после уверенности, что миграции больше не нужны |
