# Архитектура MEDBIOHIM — актуальная схема

**Проверено по main:** 3 ноября 2026 года. Полный статус: [CURRENT-STATE-2026-11-03.md](CURRENT-STATE-2026-11-03.md).

## Поток запросов

```text
Browser / PWA -> Vercel Next.js -> same-origin /api/v1/*
 -> src/app/api/v1/[...path]/route.ts -> Cloudflare Worker medbiohim-api
 -> Supabase / Upstash Redis / storage
```

## Компоненты

| Компонент | Роль |
|---|---|
| Vercel | Next.js frontend |
| `medbiohim-api` | Канонический Cloudflare API Worker |
| Supabase | Postgres и Auth |
| Upstash Redis | Cache / ephemeral state |
| Backblaze B2 | Общее файловое хранилище, если настроены secrets |
| Upstash Blob | Fallback общего файлового хранилища |
| `medbiohim-telegram` | Отдельный Telegram Worker |
| `medbiohim-api-shadow` | Legacy/migration fallback, не primary |
| PHP/SpaceWeb, `integrations/cloudflare-api` | Legacy |

API contract: success `{ok:true,data,requestId}`; error `{ok:false,error:{code,message},requestId}`. Shadow fallback вызывается для 501 и не меняет primary backend.

## Важное исключение: trainer media

Общие файлы используют `workers/api/src/lib/b2.ts` (B2 → Upstash). Изображения тренажёров/гистологии обрабатываются отдельно в `workers/api/src/routes/trainers.ts`: временный Google Drive index → публичный Upstash Blob → Upstash SDK. Этот путь не использует B2 adapter.

Эта схема подтверждает код main, но не наличие production secrets, deployment последнего commit, доступность всех файлов или полный API route parity.
