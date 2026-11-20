# Структура проекта MEDBIOHIM

**Актуально:** 2026-11-20, main (`b75a75ae`)

---

## Архитектура

```text
medbiohim-main/
├── src/                          # Фронтенд (Next.js App Router)
│   ├── app/                      # 95 страниц (все ≤200 строк)
│   │   ├── admin/                # Админ-панель (26 страниц)
│   │   ├── subjects/[id]/        # Страница предмета (55 строк)
│   │   ├── schedule/             # Расписание (83 строки)
│   │   ├── settings/             # Настройки (157 строк)
│   │   ├── teacher/              # Кабинет преподавателя
│   │   ├── tests/                # Тесты (каталог, попытка, подготовка)
│   │   └── ...
│   ├── components/               # UI-компоненты по доменам
│   │   ├── admin/                # 5 поддоменов (panels, schedule-hub, tests-hub, attestations)
│   │   ├── subjects/             # Предметы (header, панели, каталог, урок)
│   │   ├── schedule/             # Расписание (7 видов + хук + модель)
│   │   ├── settings/             # Настройки (11 карточек)
│   │   ├── teacher/              # Преподаватель (workspace, превью)
│   │   ├── test-prep/            # Подготовка к тестам (14 файлов)
│   │   ├── trainers/             # Тренажёры
│   │   ├── tutor/                # AI-тьютор
│   │   └── ui/                   # UI-кит (18 компонентов)
│   ├── modules/                  # Модульная система
│   │   └── subjects/             # Подмодули предметов
│   │       ├── submodules/chemistry/  # Химия (периодическая, лаборатория)
│   │       ├── registry.json     # Реестр подмодулей
│   │       └── registry.ts       # Типы
│   ├── lib/                      # Бизнес-логика (фронтенд)
│   │   ├── api/                  # API-клиенты (endpoints.ts — единый реестр путей)
│   │   ├── chemistry/            # Химия (формулы, PubChem, периодическая)
│   │   ├── histology/            # Гистология (эмбриология, экзамены)
│   │   ├── learning/             # Учёба (прогресс, SRS, модули)
│   │   ├── sim/                  # Симуляции (биохимия, физиология)
│   │   └── ...                   # cache.ts, download.ts, html-escape.ts и др.
│   └── shared/                   # Общие модули
│       ├── file-engine/          # Офисные форматы (DOCX/XLSX/PPTX)
│       └── permissions/          # Права доступа
├── workers/api/                  # Бэкенд (Cloudflare Worker, Hono)
│   ├── src/
│   │   ├── routes/               # 269 файлов маршрутов (все ≤400 строк)
│   │   │   ├── admin/            # 13 файлов (ранее 1482 строк)
│   │   │   ├── ai/               # 10 файлов
│   │   │   ├── tests/            # 6 файлов
│   │   │   ├── lectures/         # 6 файлов
│   │   │   ├── search/           # 13 файлов (8 источников + оркестратор)
│   │   │   └── ... (22 домена)
│   │   ├── lib/                  # Общие библиотеки (cache, auth, permissions, timing)
│   │   ├── middleware/           # auth, CORS, security
│   │   ├── jobs/                 # Фоновые задачи (account-deletion, course-rollover)
│   │   └── index.ts              # Сборка всех маршрутов
│   ├── test/                     # 530 тестов воркера
│   └── wrangler.toml             # Конфигурация Cloudflare Worker
├── supabase/migrations/          # 18 миграций
├── test/                         # Фронтенд-тесты (368 node + 721 vitest)
└── docs/architecture/            # Архитектурная документация
    ├── ADR/                     # Architectural Decision Records (4 файла)
    ├── patches/                  # Патчи декомпозиции
    └── registry/                # LOC-бюджеты
```

## Ключевые показатели

| Метрика | Значение |
|---------|----------|
| Страниц (Next.js) | 95 |
| Файлов маршрутов (Worker) | 269 |
| Файлов компонентов | 200+ |
| Модулей | 1 (chemistry) |
| Миграций Supabase | 18 |
| Тестов фронтенда | 368 |
| Тестов воркера | 530 |
| Тестов Vitest | 721 |
| Файлов сверх LOC-лимита | 0 |

## Политики кэша

| Ключ | TTL | Stale | Где |
|------|-----|-------|-----|
| `subjects:catalog` | 2 мин | 30 мин | GET /subjects |
| `lectures:catalog` | 5 мин | 1 час | GET /lectures |
| `materials:list` | 5 мин | 1 час | GET /materials |
| `chem:resolve` | 1 час | 24 часа | PubChem proxy |
| `external:stats` | 1 мин | 10 мин | External platforms |

## Статус проверок (последний прогон)

| Проверка | Результат |
|----------|-----------|
| `npx tsc --noEmit` | ✅ 0 ошибок |
| `npm run lint` | ✅ 0 ошибок |
| `npm test` (node) | ✅ 368/368 |
| `npm run test:unit` (vitest) | ✅ 721/721 |
| `cd workers/api && npm run check` | ✅ 530/530 |
| `npm run build` | ✅ exit 0 |
| `node scripts/audit-loc.mjs` | ✅ 0 сверх лимита |
| Architecture fitness | ✅ 6/6 |
