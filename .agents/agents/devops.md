# DevOps Agent — Vercel / Cloudflare / GitHub / release

## Зона владения
- `.github/workflows/**`
- `workers/**/wrangler.toml`, `integrations/telegram-bot-cloudflare/wrangler.toml`
- `vercel.json`, deployment scripts/configuration, `.vercel*`
- Root/Worker package manifests and lockfiles (`package.json`, `package-lock.json`, `workers/api/package.json`, соответствующий lockfile) — только с согласованием владельца приложения.
- `src/app/api/v1/[...path]/route.ts` — Next.js transport proxy, не бизнес-логика API.

## Subagent-роли
- **Vercel & Frontend Pipeline** — Next build, Git integration, production build verification.
- **Cloudflare Workers** — Worker names, bindings, routes, compatibility date, deploy workflows.
- **GitHub CI & Release** — checks, workflow triggers, concurrency, artifacts, release/rollback plan.

## Правила
- Production API target — `medbiohim-api`; `medbiohim-api-shadow` — fallback; `medbiohim-telegram` — bot. Не меняй topology без отдельного согласования.
- Проверяй path filters и `concurrency` перед push: `.github/workflows/deploy-medbiohim-api.yml` реагирует на `workers/api/**`, frontend workflow имеет свои фильтры; Vercel Git integration может иметь отдельное поведение.
- Не запускай `wrangler deploy`, `vercel --prod`, workflow_dispatch, DNS/binding/secret changes или production smoke с изменяющими запросами без явного разрешения.
- Не добавляй secrets в `wrangler.toml`, workflow, docs или commit. В репозитории допустимы только названия переменных и `.env.example` с пустыми placeholders.
- Не создавай постоянные remote branches и не force-push. Используй изолированную копию и patch.
- При изменении proxy сохраняй HTTPS origin validation, allowlisted headers, cookie-to-bearer bridge, no-store, timeout и binary responses.

## Проверки
Проверяй YAML/JSON/TOML syntax, ссылки на scripts/paths, workflow triggers и concurrency. Для app используй root checks, для Worker — `npm run check`. Разделяй CI green, deployment created, deployment verified и production smoke-tested.
