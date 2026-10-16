# MEDBIOHIM API (Cloudflare Workers)

Чистый бэкенд для фронтенда. Контракт ответов совместим с `src/lib/api.ts`:

```ts
{ ok: true, data: T, requestId: string }
{ ok: false, error: { code, message }, requestId: string }
```

## Стек

- **Cloudflare Workers** + **Hono**
- **Supabase** — Auth (JWT) + Postgres + RLS
- **Upstash Redis** — rate limit / cache
- **OpenAI** — опционально (ключ в secrets)

## Быстрый старт (локально)

```bash
cd workers/api
npm install
cp .dev.vars.example .dev.vars   # заполнить ключи
npm run dev                      # http://127.0.0.1:8787
```

Проверка:

```bash
curl http://127.0.0.1:8787/api/v1/health
curl http://127.0.0.1:8787/api/v1/ping
```

## Деплой

```bash
npm run deploy
# или: npx wrangler deploy
```

### Secrets в Cloudflare Dashboard

Workers & Pages → **medbiohim-api** → Settings → Variables and Secrets:

| Name | Type | Описание |
|------|------|----------|
| `SUPABASE_URL` | Secret | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Secret | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | только если нужны admin-обходы RLS |
| `UPSTASH_REDIS_REST_URL` | Secret | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | Upstash token |
| `OPENAI_API_KEY` | Secret | опционально |
| `OPENAI_MODEL` | Var | например `gpt-4o-mini` |
| `APP_ORIGIN` | Var | `https://medbiohim.vercel.app` |
| `CORS_ORIGINS` | Var | список через запятую |
| `APP_ENV` | Var | `production` |

CLI:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
# …
```

## Реализованные маршруты

| Method | Path | Auth |
|--------|------|------|
| GET | `/health`, `/api/v1/health`, `/api/v1`, `/api/v1/ping` | public |
| POST | `/api/v1/auth/login` | public + rate limit |
| POST | `/api/v1/auth/register` | public + rate limit |
| POST | `/api/v1/auth/refresh` | public |
| POST | `/api/v1/auth/logout` | bearer |
| POST | `/api/v1/auth/recover` | public + rate limit |
| GET | `/api/v1/auth/me` | bearer |
| GET | `/api/v1/me` | bearer |
| GET | `/api/v1/dashboard` | bearer |
| GET | `/api/v1/subjects` | bearer |
| GET | `/api/v1/subjects/:id` | bearer |

Остальные пути под `/api/v1/*` → `501 ROUTE_NOT_IMPLEMENTED` (можно добавлять по одному).

## Переключение фронта (Vercel)

В Vercel Environment Variables:

```
CLOUDFLARE_API_ORIGIN=https://medbiohim-api.<account>.workers.dev/api/v1
MEDBIOHIM_API_MODE=cloudflare
```

Или custom domain Worker, например `https://api.medbiohim.ru/api/v1`.

## Cloudflare Security (Dashboard)

Рекомендуется:

1. **WAF / Rate limiting** на `/api/v1/auth/*`
2. **Bot Fight Mode** / Super Bot Fight (по необходимости)
3. **SSL/TLS** Full (strict) при custom domain
4. Не публиковать `SUPABASE_SERVICE_ROLE_KEY` в клиент

## Дальше

Добавлять маршруты в `src/routes/` и подключать в `src/index.ts`:
`schedule`, `homework`, `tests`, `lectures`, `materials`, `trainings`, `search`, `settings`, `ai`, …
