# MEDBIOHIM

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

```
Browser → Vercel /api/v1 → medbiohim-api (Cloudflare)
                              └─ только HTTP 501 → MEDBIOHIM_UPSTREAM → medbiohim-api-shadow
```

Vercel proxy (`src/app/api/v1/[...path]/route.ts`) не переключает запросы на PHP: при недоступности Cloudflare он возвращает 502. Canonical Worker (`workers/api/`) отправляет ответы 501 в shadow Worker через service binding. Поэтому shadow пока остаётся зависимостью до завершения route parity и проверки реального production bundle. Актуальная матрица: [API route parity audit](docs/API-ROUTE-PARITY-AUDIT-2026-10-19.md).

## Рабочий процесс

Рабочие изменения выполняются непосредственно в `main`. Не запускайте старые ручные workflow, которые восстанавливают файлы из исторических commit или делают push в `main`, пока они не прошли отдельный аудит.

## Документация

| Документ | Назначение |
|----------|------------|
| [docs/README.md](docs/README.md) | Карта всей документации |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Архитектура |
| [docs/SPACEWEB-API-INVENTORY.md](docs/SPACEWEB-API-INVENTORY.md) | **Полный список API SpaceWeb** (для сверки с Cloudflare) |
| [docs/STATUS.md](docs/STATUS.md) | Исторический статус-снимок от 2026-10-15 и блокеры |
| [backend/MODULE-INTEGRATION.md](backend/MODULE-INTEGRATION.md) | Как добавлять новые модули в PHP |

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

Функциональность не режется из‑за бесплатной инфраструктуры.
Сначала: cache, pagination, lazy loading, разделение metadata/binary, распределение нагрузки.

## Важно

- Supabase — единственный canonical source of truth для данных.
- Секреты в Git не класть.
- Cutover production на Cloudflare — только после явной сверки по [SPACEWEB-API-INVENTORY](docs/SPACEWEB-API-INVENTORY.md) и smoke-тестов.
