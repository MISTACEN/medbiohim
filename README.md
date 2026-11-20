# MEDBIOHIM

Образовательная платформа для медико-биологической химии и смежных дисциплин.

**Стек:** Next.js (Vercel) · Cloudflare Workers (Hono) · Supabase · Upstash Redis

**Актуальный main:** `52e46b44` (2026-11-20). Все проверки зелёные.

---

## Быстрый старт

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_*, CLOUDFLARE_API_ORIGIN
npm run dev                   # http://localhost:3000

# Воркер (отдельно)
cd workers/api
npm install
npm run dev                   # wrangler dev
```

## Что сделано (2026-10 → 2026-11)

### Декомпозиция монолитов — ✅ выполнена

**40 страниц** фронтенда разнесены (0 сверх лимита 200 строк):
- admin.ts 1481 → 13 файлов · ai.ts 1366 → 10 файлов · search.ts 659 → 13 файлов
- settings 872→157 · practice 752→194 · schedule 959→83 · subjects 884→55

**22 маршрута** воркера разнесены (0 сверх лимита 400):
- tests.ts 991 → 6 файлов · lectures.ts 792 → 6 · workshop.ts 787 → 5
- auth 550 → 3 домена · export 571 → 3 · итого 22 домена

**2 модуля** химии разнесены (0 сверх 400):
- PeriodicTable 614 → periodic/ (9 файлов)
- LabBench 517 → lab/ (5 файлов)

### Дедупликация — ✅

- constantTimeEqual ×6 → `workers/api/src/lib/timing.ts`
- escapeHtml ×5 → `src/lib/html-escape.ts` + worker-версия
- getCallerRoles ×2 → `workers/api/src/lib/caller-roles.ts`
- bodyJson ×4 → `workers/api/src/lib/request-body.ts`
- getJson ×4 → `src/lib/content-json.ts`
- download-хелпер ×4 → `src/lib/download.ts`

### Инфраструктура — ✅

| Компонент | Где |
|-----------|-----|
| Кэш списков (TTL + stale-while-revalidate) | `workers/api/src/lib/cache.ts` |
| Пагинация (limit/offset, необязательная) | `workers/api/src/lib/pagination.ts` |
| Route guards (269 файлов проверены) | `test/route-guards.test.js` |
| Реестр подмодулей предметов | `src/modules/subjects/registry.json` |
| Генератор модулей | `scripts/new-module.mjs` |
| LOC-бюджет (машиночитаемый) | `docs/architecture/registry/loc-budgets.json` |
| Architecture fitness (6 тестов-стражей) | `test/architecture-fitness.test.mjs` |
| ADR (4 решения) | `docs/architecture/adr/` |

### Личный архив — ✅

- 1 858 файлов (6.5 ГБ) рассортированы по предметам
- 569 дублей (1.3 ГБ) в `_ДУБЛИКАТЫ`
- Откат одной командой: `cd 00_ИНДЕКС && node tools/rollback.mjs --commit`

---

## Архитектура

```text
Browser / PWA
  src/app/<domain>/            → page.tsx (≤200 строк, тонкая точка входа)
  src/components/<domain>/     → UI-компоненты домена
  src/modules/<domain>/        → модули предметов
  src/lib/api/<domain>.ts      → API-клиент
  src/lib/endpoints.ts         → ЕДИНСТВЕННОЕ место путей /api/v1/*
      ↓ same-origin
  src/app/api/v1/[...path]/route.ts  → Vercel proxy → Cloudflare Worker
      ↓
  workers/api/src/
    routes/<domain>.ts         → barrel
    routes/<domain>/           01-*.ts … shared.ts, types.ts
    lib/                       cache, auth, permissions, timing
    middleware/                 auth, CORS, security
    jobs/                      account-deletion, course-rollover
      ↓
  supabase/migrations/         → 18 миграций (canonical source of truth)
  Upstash Redis                 → кэш (fail-open)
```

### Инструкция для новых разработчиков (и ИИ-агентов)

| Что нужно сделать | Как |
|-------------------|-----|
| **Новая страница** | Создать `src/app/<slug>/page.tsx` (≤200 строк) → компоненты в `src/components/<slug>/` |
| **Новый маршрут API** | Создать `src/routes/<slug>.ts` (barrel) → `src/routes/<slug>/01-*.ts` … `shared.ts` |
| **Новый подмодуль** | `node scripts/new-module.mjs <slug> --title "Название" --subject <slug> --tab key:Заголовок` |
| **Кэш списка** | Добавить политику в `cache.ts`, обернуть GET в `cached()` |
| **Проверить** | `npx tsc --noEmit && npm test && cd workers/api && npm run check && node scripts/audit-loc.mjs` |

---

## Проверки (последний прогон)

| Команда | Результат |
|---------|-----------|
| `npx tsc --noEmit` | ✅ 0 ошибок |
| `npm run lint` | ✅ 0 ошибок |
| `npm test` | ✅ 368/368 |
| `cd workers/api && npm run check` | ✅ 530/530 |
| `npm run test:unit` (vitest) | ✅ 721/721 |
| `npm run build` (next) | ✅ exit 0 |
| `node scripts/audit-loc.mjs` | ✅ 0 файлов сверх лимита |

---

## Документация

| Файл | О чём |
|------|-------|
| [PROJECT-MAP.md](PROJECT-MAP.md) | Карта проекта и инструкции |
| [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) | Структура директорий |
| [ROADMAP.md](ROADMAP.md) | План и статус этапов |
| [AGENTS.md](AGENTS.md) | Инструкции для ИИ-агентов |
| [docs/architecture/MODULE-ARCHITECTURE.md](docs/architecture/MODULE-ARCHITECTURE.md) | Модульная архитектура |
| [docs/architecture/adr/](docs/architecture/adr/) | ADR (реестр подмодулей, кэш) |
| [docs/architecture/LECTURES-MAP.md](docs/architecture/LECTURES-MAP.md) | Карта трёх хранилищ лекций |

---

## Лицензия

Не лицензирован. Личный студенческий проект «от студентов для студентов». Не является официальным сайтом университета.
