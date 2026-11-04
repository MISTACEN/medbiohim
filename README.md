# MEDBIOHIM

> **Актуальный статус на 03.11.2026:** [единый срез проекта](docs/CURRENT-STATE-2026-11-03.md). Старые аудиты и handoff-документы — исторические снимки.

Образовательная платформа для медико-биологической химии и смежных дисциплин.

**Стек:** Next.js (Vercel) · Cloudflare Workers API · Supabase · Upstash.

## Быстрый старт

### Frontend (корень репозитория)

```bash
npm install
cp .env.example .env.local   # заполнить NEXT_PUBLIC_* и CLOUDFLARE_API_ORIGIN
npm run dev
```

- Браузер ходит на `/api/v1/*` (same-origin).
- Vercel-прокси пересылает запросы только в production Cloudflare Worker.

### Legacy backend (SpaceWeb)

```bash
cd backend
cp .env.example .env         # DB_URL, Supabase keys, B2 и т.д.
# Document root на хостинге: backend/public/
```

PHP backend оставлен в репозитории для миграционной совместимости и не обслуживает production API.

Папка `backend/data/` должна быть writable (если ещё используется).

### Цепочка запросов (архитектура в исходниках `main`)

```text
Browser → Vercel /api/v1 → medbiohim-api (Cloudflare)
                              └─ только HTTP 501 → MEDBIOHIM_UPSTREAM → medbiohim-api-shadow
```

Vercel proxy (`src/app/api/v1/[...path]/route.ts`) не переключает запросы на PHP: при недоступности Cloudflare он возвращает 502. Canonical Worker (`workers/api/`) отправляет ответы 501 в shadow Worker через service binding. Поэтому shadow пока остаётся зависимостью до завершения route parity и проверки реального production bundle. Актуальная матрица: [API route parity audit](docs/archive/API-ROUTE-PARITY-AUDIT-2026-10-19.md).

## Рабочий процесс

`main` — каноническая ветка и источник истины. При параллельной работе ИИ-агенты используют отдельные локальные копии/worktree и возвращают patch/diff; общий writable workspace и одновременная запись в один файл запрещены. После завершения независимых частей координатор назначает одного интегратора, который последовательно собирает изменения и проверяет их перед commit в `main`. Постоянные remote branches не создаются по умолчанию. См. [BRANCHES.md](BRANCHES.md) и [AGENT-TASK-PROTOCOL.md](AGENT-TASK-PROTOCOL.md).

Не запускайте старые ручные workflow, которые восстанавливают файлы из исторических commit или делают push в `main`, пока они не прошли отдельный аудит.

## Документация

| Документ | Назначение |
|----------|------------|
| [AGENTS.md](AGENTS.md) | Входные инструкции для ИИ-агентов |
| [AGENT-ARCHITECTURE.md](AGENT-ARCHITECTURE.md) | Роли координатора, агентов и subagents |
| [AGENT-OWNERSHIP.md](AGENT-OWNERSHIP.md) | Границы владения файлами |
| [AGENT-TASK-PROTOCOL.md](AGENT-TASK-PROTOCOL.md) | Независимые задачи, patch и интеграция |
| [API-CONTRACTS.md](API-CONTRACTS.md) | API и межслойные контракты |
| [docs/README.md](docs/README.md) | Карта документации |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Архитектура приложения |
| [docs/SPACEWEB-API-INVENTORY.md](docs/SPACEWEB-API-INVENTORY.md) | Полный список legacy API SpaceWeb для сверки |
| [docs/STATUS.md](docs/archive/STATUS.md) | Исторический статус-снимок от 2026-10-15 |
| [backend/MODULE-INTEGRATION.md](backend/MODULE-INTEGRATION.md) | Как добавлять новые модули в legacy PHP |

## Frontend (repo root) → Vercel

Next.js App Router.
- Browser API base: `/api/v1`
- Vercel server-side proxy sends production API requests only to `medbiohim-api` on Cloudflare. SpaceWeb PHP is retained as migration/reference code and is not an API fallback.
- Chemistry (на main): `/chemistry`, `/api/chemistry/resolve`, `/api/chemistry/health` — см. [docs/chemical-engine.md](docs/chemical-engine.md)
- **Strict TypeScript**: see **[docs/dev-notes.md](docs/dev-notes.md)**.

## Что уже есть

- Auth (login/register/refresh/logout/recover/me), роли, academic context
- Группы, предметы, расписание, homework/planner
- Тесты с server-authoritative scoring и immutable snapshots
- Question Library, жалобы на вопросы
- Тренажёр гистологии (feed + answers + media)
- Chemistry master catalog (436 элементов)
- Admin database console, content package, import
- Telegram bot (публичные команды), browser extension MVP

## Zero-cost правило

Функциональность не режется из-за бесплатной инфраструктуры.
Сначала: cache, pagination, lazy loading, разделение metadata/binary, распределение нагрузки.

## Важно

- Supabase — единственный canonical source of truth для данных.
- Секреты в Git не класть.
- Cutover production на Cloudflare — только после явной сверки по [SPACEWEB-API-INVENTORY](docs/SPACEWEB-API-INVENTORY.md) и smoke-тестов.

## Актуальные аудиты (2026-10-19)

- [Production API и медиа гистологии](docs/archive/PRODUCTION-SMOKE-AND-MEDIA-AUDIT-2026-10-19.md)
- [Сверка migration ledger](docs/archive/MIGRATION-LEDGER-RECONCILIATION-2026-10-19.md)
- [CSV: 148 записей migration ledger](docs/MIGRATION-LEDGER-MAP-2026-10-19.csv)
- [CSV: инвентарь SQL-файлов](docs/SQL-SOURCE-INVENTORY-2026-10-19.csv)
- [Решения по очистке KEEP / ARCHIVE / REMOVE](docs/archive/REPOSITORY-CLEANUP-DECISIONS-2026-10-19.md)
