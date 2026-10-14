# Архитектура MEDBIOHIM

Обновлено: 2026-10-14.

## Каноническая схема (production сейчас)

```
Browser
  │
  ▼
Vercel (Next.js App Router)
  │  same-origin /api/v1/*
  │  proxy → SPACEWEB_API_ORIGIN
  ▼
SpaceWeb (PHP API)
  document root: backend/public/
  │
  ├── RequireAuth / RequireRole / SpecialtyAccess
  ├── Repository / Service
  └── Supabase (PostgreSQL + Auth + RLS)
        │
        └── media metadata → SpaceWeb files / B2 (physical objects)
```

## Компоненты

| Слой | Роль | Тариф |
|------|------|--------|
| GitHub | Код, миграции, docs | free |
| Vercel | Frontend + API proxy | Hobby |
| SpaceWeb | PHP runtime, тяжёлые media | Free |
| Supabase | PostgreSQL, Auth, RLS, metadata | Free |
| Backblaze B2 | Object storage (опционально) | Free tier |
| Cloudflare Workers | Shadow API + Telegram (миграция) | Free |

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
2. Объект — SpaceWeb path или B2
3. Приватный доступ — только через PHP (или Worker) с Bearer; `<img src>` без Authorization не подходит
4. Frontend: authenticated fetch → blob → `URL.createObjectURL()`

## Безопасность (кратко)

- JWT проверяется через Supabase Auth
- Роли: student / teacher / moderator / admin
- SpecialtyAccess (например МБХ → гистология)
- Server-authoritative scoring тестов (snapshot + server grade)
- Least-privilege миграции на public-схему — в репозитории, применение на live — осознанно
