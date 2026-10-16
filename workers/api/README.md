# MEDBIOHIM API (Cloudflare Workers)

Чистый student-facing бэкенд для фронтенда. Контракт:

```ts
{ ok: true, data: T, requestId: string }
{ ok: false, error: { code, message }, requestId: string }
```

## Стек

- Cloudflare Workers + Hono
- Supabase (Auth JWT + Postgres + RLS)
- Upstash Redis (rate limit / presence)
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
| `SUPABASE_SERVICE_ROLE_KEY` | Secret (только admin, лучше не использовать) |
| `UPSTASH_REDIS_REST_URL` | Secret |
| `UPSTASH_REDIS_REST_TOKEN` | Secret |
| `OPENAI_API_KEY` | Secret |
| `OPENAI_MODEL` | Var (`gpt-4o-mini`) |
| `APP_ORIGIN` | Var |
| `CORS_ORIGINS` | Var |
| `APP_ENV` | Var |

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
npx wrangler deploy
```

## Student-facing маршруты

### Public / meta
| Method | Path |
|--------|------|
| GET | `/health`, `/api/v1/health`, `/api/v1`, `/api/v1/ping` |
| GET | `/api/v1/chemistry/resolve?query=` |

### Auth
| Method | Path |
|--------|------|
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/register` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/logout` |
| POST | `/api/v1/auth/recover` |
| GET | `/api/v1/auth/me` |
| GET | `/api/v1/me` |

### Core learning
| Method | Path |
|--------|------|
| GET | `/api/v1/dashboard` |
| GET | `/api/v1/groups`, `/api/v1/groups/:id` |
| GET | `/api/v1/subjects`, `/api/v1/subjects/:id` |
| GET | `/api/v1/subjects-catalog` |
| GET | `/api/v1/subject-plans`, `/api/v1/subject-plans/:slug` |
| GET | `/api/v1/subject-materials` |
| GET | `/api/v1/schedule`, `/api/v1/schedule/meta` |
| GET | `/api/v1/curriculum` |
| GET | `/api/v1/homeworks` |
| POST | `/api/v1/homeworks/:id/submit` |
| POST | `/api/v1/homeworks/:id/progress` |
| GET | `/api/v1/lectures`, `/api/v1/lectures/:id` |
| GET | `/api/v1/materials`, `/api/v1/materials/:id` |
| GET | `/api/v1/materials/:id/file-url` |
| GET | `/api/v1/materials/:id/file` *(501 until blob store)* |

### Tests & questions
| Method | Path |
|--------|------|
| GET | `/api/v1/tests` |
| GET | `/api/v1/tests/curriculum-map` |
| GET | `/api/v1/tests/chemistry-master` |
| GET | `/api/v1/tests/:id` |
| POST | `/api/v1/tests/:id/start` |
| POST | `/api/v1/tests/:id/attempts` |
| POST | `/api/v1/tests/attempts/:id/answers` |
| POST | `/api/v1/tests/attempts/:id/finish` |
| GET | `/api/v1/my/attempts` |
| GET | `/api/v1/questions`, `/api/v1/questions/subjects` |
| POST | `/api/v1/questions/:id/report` |
| GET | `/api/v1/search` |

### Trainer / histology
| Method | Path |
|--------|------|
| GET | `/api/v1/trainings` |
| POST | `/api/v1/trainings` |
| GET | `/api/v1/trainings/:id` |
| POST | `/api/v1/trainings/:id/answer` |
| POST | `/api/v1/trainings/:id/complete` |
| POST | `/api/v1/trainings/:id/cancel` |
| GET | `/api/v1/trainers/feed` |
| GET | `/api/v1/trainers/feed/:id` |
| POST | `/api/v1/trainers/feed/answer` |
| GET | `/api/v1/trainers/feed/:id/image` *(501 until blob)* |

### Progress / SRS / sessions
| Method | Path |
|--------|------|
| GET | `/api/v1/progress` |
| GET | `/api/v1/srs`, `/api/v1/srs/due` |
| POST | `/api/v1/srs/:id/review` |
| GET/POST | `/api/v1/sessions` |

### Other student
| Method | Path |
|--------|------|
| GET/PATCH | `/api/v1/settings` |
| POST | `/api/v1/presence/heartbeat` |
| GET/POST | `/api/v1/community/posts` |
| GET | `/api/v1/calculators` |
| POST | `/api/v1/calculators/:id/compute` |
| POST | `/api/v1/ai/chat` |

Admin routes **не** включены намеренно.

## Vercel cutover

```
CLOUDFLARE_API_ORIGIN=https://medbiohim-api.<account>.workers.dev/api/v1
MEDBIOHIM_API_MODE=cloudflare
```

## Замечания

1. Все защищённые маршруты используют **JWT пользователя + RLS** (anon key + Bearer).
2. Ответы тестов / trainer не отдают answer keys до server-side RPC.
3. Binary media (`/file`, trainer images) → `501` до привязки R2 или Upstash Blob.
4. Имена таблиц/RPC должны совпадать с live Supabase; при расхождении править select/rpc в соответствующем `src/routes/*.ts`.
5. Rate limit login/register/AI через Upstash; без Redis — fail-open в dev.
