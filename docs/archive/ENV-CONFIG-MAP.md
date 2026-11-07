# MEDBIOHIM — environment configuration map

Updated: 2026-10-07

This document records which environment variables exist, where they belong, and what they control. It intentionally contains names and configuration roles only. Real credentials, API keys, database passwords, B2 keys, and proxy secrets must remain outside GitHub.

## Configuration sources

The working test environment may contain temporary keys used for pre-deployment checks. That is expected. Treat the private runtime .env as the source of actual test values; the repository keeps only sanitized examples.

The platform is split into:
- Browser-safe / Vercel client: NEXT_PUBLIC_*.
- Vercel server: Cloudflare-only API proxy and optional Gemini proxy settings.
- Cloudflare Worker: Supabase, Upstash, AI providers, CORS, and runtime secrets.
- Legacy SpaceWeb/PHP server: retained for migration/reference; not used by the production API proxy.
- Firebase: полностью выведен из эксплуатации (2026-10-30). Ни код, ни конфиги его не используют — база и вход на Supabase.

## Frontend / Vercel

| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_API_URL | Same-origin browser API base (/api/v1). |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL for client-side Supabase usage. |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Publishable/legacy anon key; browser-safe by design, subject to RLS. |
| NEXT_PUBLIC_APP_NAME | Frontend application name. |
| CLOUDFLARE_API_ORIGIN | Server-only Cloudflare Worker API base, including `/api/v1`; HTTPS only. Defaults to `https://medbiohim-api.ryazansevegor.workers.dev/api/v1`. Production proxy never retries against SpaceWeb. |
| GEMINI_API_KEY | Optional Vercel-side Gemini key for the proxy route. |
| GEMINI_VERCEL_PROXY_SECRET | Optional server-to-server secret protecting the Gemini proxy. |

## Legacy SpaceWeb / PHP

### Supabase and PostgreSQL

SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, SUPABASE_JWKS_URL

These cover Supabase Auth, REST fallback, server-side operations, and JWT/JWKS validation. Service/secret keys are server-only.

DB_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSLMODE, DB_CONNECT_TIMEOUT

These configure the PHP PostgreSQL connection. The current architecture uses the Supabase session/pooler endpoint from the private runtime configuration.

### File storage

B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT, B2_REGION, B2_BUCKET_ID

B2 is optional storage/backup. Supabase stores canonical metadata; physical binaries may live on B2 or the SpaceWeb filesystem depending on the feature.

### Application/security

APP_ENV, APP_DEBUG, CORS_ORIGINS, ADMIN_BOOTSTRAP_SECRET

These control runtime mode, debugging, allowed browser origins, and protected admin bootstrap behavior.

### Firebase (retired)

Переменные FIREBASE_* удалены из конфигурации: ни один компонент (фронт,
воркер, бэкенд-скрипты) их не читает, ни одна копия .env их не задаёт.
База данных и аутентификация работают на Supabase; исторические упоминания
Firebase в старых документах — только про пройденную миграцию.

### AI provider layer

Gemini: GEMINI_API_KEY, GEMINI_MODEL, GEMINI_BASE_URL, GEMINI_API_MODE, GOOGLE_CLOUD_PROJECT, VERTEX_PROJECT, VERTEX_LOCATION

GigaChat: GIGACHAT_CREDENTIALS, GIGACHAT_AUTH_KEY, GIGACHAT_SCOPE, GIGACHAT_MODEL, GIGACHAT_BASE_URL, GIGACHAT_ACCESS_TOKEN, GIGACHAT_VERIFY_SSL

Multi-provider gateway: LLM_PROVIDER, LLM_MODE, LLM_ALLOW_GLOBAL, LLM_TIMEOUT_SEC, LLM_VISION_PROVIDER, MEDIA_REGION_DEFAULT, AI_CHAT_PRIMARY_PROVIDER

Additional providers: GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL; MISTRAL_API_KEY, MISTRAL_MODEL, MISTRAL_BASE_URL; OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_BASE_URL, OPENROUTER_VISION_MODEL

Optional Gemini Vercel proxy: GEMINI_VERCEL_PROXY_URL, GEMINI_VERCEL_PROXY_SECRET

AI remains optional for core testing where deterministic logic exists. Provider/model availability is controlled by the actual private environment rather than hardcoded production assumptions.

## Rules

1. Never commit .env, .env.local, backend runtime .env, or real secrets.
2. backend/.env.example and root .env.example contain placeholders only.
3. A temporary test key is not a reason to block implementation; it is simply classified as test runtime configuration.
4. Rotate temporary provider/database/storage credentials before final production handoff.
5. When debugging deployment, compare variable presence, scope, and precedence before changing code.
6. Do not copy server-only variables into NEXT_PUBLIC_*.
7. If a provider is unavailable, the platform should degrade gracefully where the feature is designed to be optional.
8. Cloudflare-first fallback testing must use a valid HTTPS SpaceWeb origin. Authenticated requests must never fall back to plaintext HTTP. Ambiguous failed writes are not retried automatically.

## Current test-config inventory

The private test .env supplied for this work contains the Supabase, PostgreSQL, B2, Gemini, GigaChat, Groq, Mistral, and OpenRouter configuration families described above (Firebase was retired in 2026-10). Its values are intentionally not mirrored into GitHub.

### Admin database console

DB_CREDENTIALS_KEY — server-side key used to encrypt external PostgreSQL/MySQL passwords stored in public.admin_db_connections. It must never be exposed through NEXT_PUBLIC_*. The preferred deployment is a dedicated strong random DB_CREDENTIALS_KEY on SpaceWeb. Compatibility fallback to an existing server-side admin/encryption key is kept for migration safety.


## 2026-10-15 — Vercel API routing default

Production and Preview call the Cloudflare `medbiohim-api` Worker directly through the Vercel same-origin proxy. SpaceWeb is not a runtime fallback. Unported routes must be implemented in the canonical Worker or its Cloudflare compatibility binding; they must not silently switch to PHP.
