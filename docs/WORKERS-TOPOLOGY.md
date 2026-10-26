# Cloudflare Workers topology (LOCKED)

> **Не менять без явного решения.** Эта схема — единственный source of truth для API Workers.

Обновлено: 2026-10-26.

## Канон

| Worker | URL | Код в репо | Роль |
|--------|-----|------------|------|
| **`medbiohim-api`** | `https://medbiohim-api.ryazansevegor.workers.dev` | `workers/api/` (Hono + TypeScript) | **Единственный production API** |
| **`medbiohim-api-shadow`** | `https://medbiohim-api-shadow.ryazansevegor.workers.dev` | `integrations/cloudflare-api/` (JS monolith) | Legacy fallback через service binding; **manual deploy only** |
| **`medbiohim-telegram`** | `medbiohim-telegram.ryazansevegor.workers.dev` | `integrations/telegram-bot-cloudflare/` | Telegram-бот (канонический), **не** HTTP API сайта |

```
Browser → Vercel /api/v1/* → medbiohim-api (PROD)
                              └─ 501 / непокрытый роут → MEDBIOHIM_UPSTREAM → medbiohim-api-shadow (опционально)
```

## Telegram-бот

**Канонический и единственный развиваемый бот** — Worker `medbiohim-telegram`
(`integrations/telegram-bot-cloudflare/`). Он не является HTTP API сайта.

- Деплой: workflow `Deploy MEDBIOHIM Telegram Worker`
  (`.github/workflows/deploy-telegram-worker.yml`); перед выкатом обязательны `npm test`
  и `wrangler deploy --dry-run`.
- Webhook: `POST /api/webhook` с проверкой `X-Telegram-Bot-Api-Secret-Token`; `GET /health` отдаёт
  состояние без раскрытия секретов.
- Привязка аккаунта: одноразовая ссылка `/start link_<48 hex>` → `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL`
  → `medbiohim-api` `POST /api/v1/telegram/account-link/confirm`.
- Mini App (вход из Telegram): `POST /api/v1/auth/telegram/webapp` в `workers/api` проверяет подпись
  `initData` (HMAC-SHA256 по спецификации Telegram, срок 24 ч, дубликаты ключей отклоняются) и выдаёт
  обычную сессию того же формата, что `/auth/login`. Требует секрет `TELEGRAM_BOT_TOKEN` на
  **`medbiohim-api`**; без него роут отвечает `503 TELEGRAM_NOT_CONFIGURED`, а не падает.
  Непривязанный Telegram → `409 TELEGRAM_NOT_LINKED`.
- Групповой relay: `TELEGRAM_HOMEWORK_WEBHOOK_URL` → PHP `TelegramHomeworkService`
  (классификация ДЗ, вложения, OCR). Это **единственная** часть PHP-контура Telegram,
  которая ещё используется в проде; при переносе её в `workers/api` обновить этот раздел.

Legacy (не развивается, не подключать к основному боту):

- `integrations/telegram-bot/` — Node/Vercel MVP без привязки аккаунта. У бота может быть только
  один активный webhook, поэтому этот код не должен получать обновления продакшн-бота.
- Telegram-роуты `integrations/cloudflare-api/` (`/settings/telegram/*`) — legacy shadow;
  актуальные реализации: `workers/api/src/routes/settings.ts` и `workers/api/src/routes/telegram.ts`.

## Правила (обязательно)

1. **Vercel / фронт** всегда указывают на **`medbiohim-api`**, никогда на shadow.
2. **Правки student/admin API** — только в `workers/api/`. Деплой: workflow `Deploy MEDBIOHIM API to Cloudflare` (typecheck + tests → `wrangler deploy` → имя `medbiohim-api`).
3. **Shadow не является вторым production deploy.** Push в `main` его не обновляет; ручной workflow оставлен только для обслуживания legacy fallback.
4. Успешный билд **shadow** или **telegram** ≠ прод обновлён. Смотреть статус **`medbiohim-api`**.
5. Telegram — отдельный Worker; коммиты в `workers/api` не должны требовать правок telegram.
6. Локальные артефакты (`artifacts/medbiohim-cloudflare-api/`, `artifacts/medbiohim-cf-push/`) — **не** auto-deploy, не прод.

## Секреты

Секреты production только у **`medbiohim-api`** (Dashboard → Workers → medbiohim-api):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_BLOB_TOKEN`
- `TELEGRAM_BOT_TOKEN` — обязателен для входа в Telegram Mini App (`/auth/telegram/webapp`); без него роут отдаёт 503
- прочие по мере надобности

Не дублировать «для надёжности» на shadow без причины.

## Проверка «куда ушёл деплой»

| Симптом | Значение |
|---------|----------|
| Cloudflare: `medbiohim-api` Latest build **failed** | Прод **старый**; shadow мог обновиться отдельно |
| `GET …/gradebook` → **501 ROUTE_NOT_IMPLEMENTED** | На проде нет нового кода |
| `GET …/gradebook` → **401** | Роут есть, нужен JWT — ок |
| Health: `"service":"medbiohim-api","mode":"production"` | Прод |
| Health: `mode: shadow` / `migration-scaffold` | Это shadow, не сайт |

## Связанные файлы

- `workers/api/wrangler.toml` — `name = "medbiohim-api"` + binding `MEDBIOHIM_UPSTREAM` → shadow
- `.github/workflows/deploy-medbiohim-api.yml` — единственный прод-деплой API
- `.github/workflows/deploy-cloudflare-shadow.yml` — ручное обслуживание legacy fallback; не срабатывает при push в `main`
- `integrations/cloudflare-api/wrangler.toml` — `name = "medbiohim-api-shadow"`
