# MEDBIOHIM API (Cloudflare Workers) — **PRODUCTION**

> **Топология (LOCKED):** [docs/WORKERS-TOPOLOGY.md](../../docs/WORKERS-TOPOLOGY.md)
>
> | Worker | Роль |
> |--------|------|
> | **`medbiohim-api`** (этот каталог `workers/api/`) | **Единственный прод API** |
> | `medbiohim-api-shadow` | Только fallback `MEDBIOHIM_UPSTREAM` — не развивать |
> | `medbiohim-telegram` | Бот, не HTTP API сайта |
>
> Vercel → `https://medbiohim-api.<account>.workers.dev/api/v1`  
> Успешный деплой **shadow ≠** прод. Смотреть workflow **Deploy MEDBIOHIM API to Cloudflare**.

Чистый student-facing бэкенд для фронтенда. Контракт:

```ts
{ ok: true, data: T, requestId: string }
{ ok: false, error: { code, message }, requestId: string }
```

## Стек

- Cloudflare Workers + Hono
- Supabase (Auth JWT + Postgres + RLS)
- Upstash Redis (rate limit / presence)
- Upstash Blob (histology / trainer images)
- OpenAI (опционально)
- PubChem (chemistry resolve)

## Быстрый старт

```bash
cd workers/api
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

```bash
curl http://127.0.0.1:8787/api/v1/health
```

## Secrets (Cloudflare Dashboard)

Workers → **medbiohim-api** → Settings → Variables and Secrets:

| Name | Type |
|------|------|
| `SUPABASE_URL` | Secret |
| `SUPABASE_ANON_KEY` | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret |
| `UPSTASH_REDIS_REST_URL` | Secret |
| `UPSTASH_REDIS_REST_TOKEN` | Secret |
| `UPSTASH_BLOB_TOKEN` | Secret |
| `OPENAI_API_KEY` | Secret |
| `APP_ORIGIN` | Var |
| `CORS_ORIGINS` | Var |
| `APP_ENV` | Var (`production`) |

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put UPSTASH_BLOB_TOKEN
npx wrangler deploy   # → Worker name medbiohim-api ONLY
```

## Vercel cutover

```
CLOUDFLARE_API_ORIGIN=https://medbiohim-api.<account>.workers.dev/api/v1
MEDBIOHIM_API_MODE=cloudflare
```

Никогда не ставить origin на `medbiohim-api-shadow`.

## Деплой

Только `.github/workflows/deploy-medbiohim-api.yml`:

1. typecheck
2. `npm test`
3. `wrangler deploy` → **medbiohim-api**

Если тесты упали — **прод не обновится** (shadow мог обновиться отдельно — это не прод).
