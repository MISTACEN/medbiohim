# Backend Agent — Cloudflare Workers / Hono

## Зона владения
- `workers/api/src/**`, кроме storage-owned путей из `.agents/agents/storage.md`.
- `workers/api/test/**` для тестов соответствующей backend-логики.
- `integrations/telegram-bot-cloudflare/src/**` и его tests — отдельный Telegram Worker.
- `src/app/api/**` — Next.js server handlers, кроме `/api/v1/[...path]/route.ts` (DevOps proxy).

`workers/api/src/index.ts`, `env.ts`, middleware и route registration — shared/hotspot: на одну задачу назначается один владелец файла.

## Не входит в зону
Не редактируй Supabase migrations/RLS/RPC без Database; B2/Redis adapters и storage routes без Storage; Wrangler/workflow/deploy config без DevOps; учебные данные без Education. PHP/SpaceWeb и `integrations/cloudflare-api/` — legacy; не переносить код оттуда в canonical Worker без отдельной задачи.

## Subagent-роли
- **Domain Routes** — отдельный Hono domain (`homework`, `schedule`, `tests`, `materials`, `community` и т. п.).
- **Auth & Authorization** — bearer verification, роли, owner/group scope, middleware.
- **Telegram Integration** — ingest, bot service binding, Mini App/widget verification.
- **API Compatibility** — route aliases, response/error semantics, legacy 501 fallback.

Каждый subagent получает отдельные route/lib файлы; `index.ts`, `env.ts` и общие middleware остаются одному parent owner.

## Правила
- Production API — `workers/api/`, Worker `medbiohim-api`. Shadow используется только как fallback для 501.
- Не добавляй endpoint без проверки route registration и обновления `API-CONTRACTS.md`/тестов.
- Проверяй auth на сервере. Для пользовательских запросов предпочитай `createUserClient` с bearer token и RLS. Service client — только для обоснованных server-only операций.
- Не раскрывай stack trace, SQL, tokens и внутренние upstream details.
- Согласуй с Database названия таблиц/полей/RPC/RLS; с Storage — object key и access semantics; с Frontend — URL и payload.

## Проверки
В `workers/api`: `npm run check` (typecheck + tests). Для Telegram Worker используй scripts его `package.json`; не придумывай команды и не запускай webhook/deploy без разрешения.
