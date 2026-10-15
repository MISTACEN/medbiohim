# MEDBIOHIM

Образовательная платформа для медико-биологической химии и смежных дисциплин.

**Стек:** Next.js (Vercel) · PHP API (SpaceWeb) · Supabase · миграция API на Cloudflare Workers.

## Быстрый старт

### Frontend (корень репозитория)

```bash
npm install
cp .env.example .env.local   # заполнить NEXT_PUBLIC_* и SPACEWEB_API_ORIGIN
npm run dev
```

- Браузер ходит на `/api/v1/*` (same-origin).
- Vercel-прокси пересылает запросы на SpaceWeb (`SPACEWEB_API_ORIGIN`).

### Backend (SpaceWeb)

```bash
cd backend
cp .env.example .env         # DB_URL, Supabase keys, B2 и т.д.
# Document root на хостинге: backend/public/
```

Папка `backend/data/` должна быть writable (если ещё используется).

### Цепочка запросов (production сейчас)

```
Browser → Vercel /api/v1 → SpaceWeb PHP /api/v1 → Supabase
```

Параллельно идёт shadow-миграция на Cloudflare Workers (`integrations/cloudflare-api/`).
Production-трафик на Cloudflare **не переключён**.

## Ветки

| Ветка | Роль |
|-------|------|
| `main` | Прод, source of truth, Vercel production |
| `spaceweb-backend` | Совместимость/фиксы текущего PHP на SpaceWeb |
| `beta` | Эксперименты, не деплоить как prod |

Подробно: [BRANCHES.md](BRANCHES.md).

## Документация

| Документ | Назначение |
|----------|------------|
| [docs/README.md](docs/README.md) | Карта всей документации |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Архитектура |
| [docs/SPACEWEB-API-INVENTORY.md](docs/SPACEWEB-API-INVENTORY.md) | **Полный список API SpaceWeb** (для сверки с Cloudflare) |
| [docs/STATUS.md](docs/STATUS.md) | Текущий статус и блокеры |
| [backend/MODULE-INTEGRATION.md](backend/MODULE-INTEGRATION.md) | Как добавлять новые модули в PHP |

## Frontend (repo root) → Vercel
Next.js App Router.
- Browser API base: `/api/v1`
- Vercel server-side proxy: Cloudflare is selected only by explicit Preview opt-in or `MEDBIOHIM_API_MODE=cloudflare` with a production Worker origin; the migration shadow is rejected. The legacy PHP origin remains a temporary fallback and must use HTTPS.
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
