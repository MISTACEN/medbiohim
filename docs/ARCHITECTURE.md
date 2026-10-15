# Архитектура MEDBIOHIM

Обновлено: 2026-10-15.

## Наблюдаемая production-схема

```
Browser
  │
  ▼
Vercel (Next.js App Router)
  │  same-origin /api/v1/*
  │  same-origin API proxy (live health identifies the Cloudflare Worker)
  ▼
Cloudflare Worker `medbiohim-api-shadow` (partial route parity; health says `APP_ENV=shadow`)
  ├── Supabase (PostgreSQL + Auth + RLS; canonical data and authorization)
  └── Upstash Blob (private Histology object bytes)

SpaceWeb PHP remains a compatibility backend for routes that have not yet been
ported. The public `GET /api/v1/files` probe returned `501 ROUTE_NOT_MIGRATED`,
so this is active Worker traffic, not a completed migration.
```

## Компоненты

| Слой | Роль | Тариф |
|------|------|--------|
| GitHub | Код, миграции, docs | free |
| Vercel | Frontend + API proxy | Hobby |
| SpaceWeb | PHP compatibility API and legacy media | Free |
| Supabase | PostgreSQL, Auth, RLS, metadata | Free |
| Upstash Blob | Private Histology object storage | Current configured file store |
| Cloudflare Workers | API receiving production requests; route migration incomplete | Free |

**Supabase** — единственный source of truth для данных.
JSON в `backend/data/` не production SoT.

## Миграция на Cloudflare

- Проект API: `integrations/cloudflare-api/`
- Telegram Worker: `integrations/telegram-bot-cloudflare/` (отдельный Worker)
- Shadow Worker (`medbiohim-api-shadow`) уже деплоится, **production-трафик не переключён**
- Frontend остаётся на legacy SpaceWeb origin до явного cutover

Правила миграции:

1. Один маршрут за раз (или узкая семья).
2. Сверка контракта с PHP (метод, auth, response shape, RLS).
3. Fail-closed при неготовности (auth rate-limit, test attempts).
4. Не трогать DNS / Vercel production origin / Telegram production webhook без отдельного решения.

Полный список PHP-маршрутов для сверки: [SPACEWEB-API-INVENTORY.md](SPACEWEB-API-INVENTORY.md).

## Ветки и деплой

| Ветка | Назначение |
|-------|------------|
| `main` | Прод-код, Vercel production, Cloudflare shadow builds |
| `spaceweb-backend` | Фиксы текущего PHP без смешивания с Cloudflare-миграцией |
| `beta` | Эксперименты |

См. [BRANCHES.md](../BRANCHES.md).

## Frontend API client

- `src/lib/api.ts` — основной клиент (token, refresh)
- `src/lib/content-api.ts` — content/trainer helpers
- Не дублировать сырой `fetch('/api/v1/...')` по страницам

## Медиа и приватные файлы

1. Метаданные — Supabase `public.files`
2. Объект — private Upstash Blob key. Existing B2 integration remains a legacy
   fallback for old records while object-key coverage is checked.
3. Cloudflare R2 is intentionally not used; there is no R2 binding or paid R2 dependency.
3. Приватный доступ — только через PHP (или Worker) с Bearer; `<img src>` без Authorization не подходит
4. Frontend: authenticated fetch → blob → `URL.createObjectURL()`

## Безопасность (кратко)

- JWT проверяется через Supabase Auth
- Роли: student / teacher / moderator / admin
- SpecialtyAccess (например МБХ → гистология)
- Server-authoritative scoring тестов (snapshot + server grade)
- Least-privilege миграции на public-схему — в репозитории, применение на live — осознанно
