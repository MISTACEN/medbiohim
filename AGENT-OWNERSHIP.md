# MEDBIOHIM — карта владения файлами и границы изменений

## Принцип

Владение означает право быть единственным writer по файлу в рамках назначенной задачи, а не безусловное право менять всё дерево. Координатор всегда фиксирует точный allowlist. Один файл — один writer на интеграционный цикл; review другим агентом выполняется read-only.

## Матрица владения

| Направление | Основные пути | Не передавать без согласования |
|---|---|---|
| Frontend | `src/app/**` (кроме `/api/v1` proxy), `src/components/**`, `src/hooks/**`, `src/lib/**`, `browser-extension/**`, `integrations/browser-extension/**` | `src/app/api/**` server handlers, proxy, shared types |
| Backend | `workers/api/src/**` (кроме Storage paths), `workers/api/test/**`, `integrations/telegram-bot-cloudflare/src/**` и tests, `src/app/api/**` server handlers кроме `/api/v1` proxy | migrations/RLS, storage adapters, Wrangler/workflows, educational source data |
| Database | `supabase/migrations/**`, `database/migrations/**`, `database/rpc/**`, `database/audits/**`, `database/SUPABASE_SYNC.md` | Worker callers, live schema application, service-role secrets |
| Education | `src/data/**`, `public/content/**`, `public/library/**`, `public/downloads/**`, `tools/histology/**`, `tools/physiology/**`, `tools/lectures/**`, учебные source files в `tools/chem/**`, профильные subject docs | UI/renderers, API routes, grading implementation, SQL/RLS, production upload |
| Storage | `workers/api/src/lib/b2.ts`, `workers/api/src/lib/redis.ts`, `workers/api/src/routes/storage.ts`, `workers/api/src/routes/files.ts`, `workers/api/src/routes/trainer-atlas.ts`, назначенные upload scripts | content asset bytes, general trainer business route, bucket secrets, production upload/delete |
| DevOps | `.github/workflows/**`, `workers/**/wrangler.toml`, `integrations/telegram-bot-cloudflare/wrangler.toml`, `vercel.json`, `.vercel*`, deployment scripts, build manifests/lockfiles по назначению, `src/app/api/v1/[...path]/route.ts` | business route behavior, DB schema, secret values, production deploy without approval |
| QA/Security | `test/**`, `e2e/**`, `scripts/predeploy-audit.mjs`, `scripts/check-contrast.mjs`; cross-cutting review | production code fixes without explicit single-file ownership |

## Исключения и shared surfaces

1. `workers/api/src/index.ts`, `workers/api/src/env.ts`, общие middleware — Backend-owned, но один writer; route registration/bindings согласуются с DevOps.
2. `workers/api/src/routes/trainers/**` (бывший монолит `trainers.ts`) — смешанный business/media hotspot. Default owner — Backend. Storage может получить конкретный файл (`03-image.ts` и связанные) как единственный owner задачи; делить один файл между агентами нельзя.
3. `src/lib/api.ts`, `src/lib/api/**`, `src/types/**` — shared frontend contract surface. Frontend — writer; Backend утверждает API shape, QA проверяет регрессии.
4. `src/app/api/v1/[...path]/route.ts` — DevOps owns proxy; Frontend/Backend только согласуют изменение транспорта.
5. `src/app/api/**` (кроме `/api/v1` proxy) — Backend owns server endpoints; Frontend owns pages/components.
6. `src/lib/histology/**`, `src/lib/chemistry/**`, `src/lib/physiologyContent.ts`, `src/lib/histologyAtlas.ts`, `src/lib/lectureBlocks.ts` — кодовые модули, не content files. Default writer — Frontend; Education выполняет научный/content review.
7. SQL seeds и migrations остаются Database-owned даже если содержат учебные вопросы. Education предоставляет проверенные данные и provenance, Database отвечает за безопасный импорт.
8. `workers/api/src/routes/storage.ts`, `files.ts`, `trainer-atlas.ts`, `lib/b2.ts`, `lib/redis.ts` — Storage-owned; другие backend routes остаются Backend-owned.
9. `docs/architecture/registry/**`, `test/component-registry.test.mjs` и `test/ui-barrel.test.mjs` — контракт реестра общих компонентов (этапы A и D). Данные реестра — shared surface с одним writer (архитектура/Frontend); `test/**` остаётся QA-owned. Изменение реестра принимается только вместе с прохождением теста-стража; записи в обход контракта не принимаются.
10. `src/modules/subjects/registry.json` + `registry.ts` + `submodules/<slug>/**` — реестр подмодулей предмета (ADR-0001). Один writer на цикл; новые подмодули добавляются только генератором `scripts/new-module.mjs` (рукописные правки `registry.json` не принимаются — стражи `test/subject-submodules.test.mjs` и `test/architecture-fitness.test.mjs`). `src/modules/**` не импортирует `src/app/**` и чужие подмодули — проверяет fitness-тест.
11. `docs/architecture/registry/loc-budgets.json` (v2) — LOC-бюджеты: страницы 200 / маршруты 400 / модули 400. Исключения — только через ADR; проверка `scripts/audit-loc.mjs` + fitness.
12. `src/shared/**` — общие чистые модули, которые импортируют и Next, и Worker (`histology/preparation-match.ts`, `lectures/lecture-title.ts`). Один writer на цикл; изменение правила требует прогона обоих контуров (`npm test`, `npm run test:unit`, `cd workers/api && npm run check`) — иначе копии снова разойдутся. Новые копии такого правила в `src/lib/**` или `workers/api/src/**` не принимаются.
13. `workers/api/test/route-guards.test.js` — страж guard-хелперов маршрутов. Новый публичный маршрут без auth обязан получить rate limit либо обоснованную запись в ALLOWLIST файла-стража (QA-owned, согласование с Backend).

## Legacy и замороженные зоны

- `backend/**` (PHP/SpaceWeb), `integrations/cloudflare-api/**`, `integrations/telegram-bot/**`, `deploy/**` — legacy/reference. По умолчанию read-only; изменение только по отдельной задаче после проверки необходимости.
- `integrations/telegram-bot-cloudflare/**` — отдельный bot Worker: Backend владеет `src/**` и tests, DevOps — `wrangler.toml` и deploy workflow.
- Не переносить старый код в `workers/api` без сравнения актуального canonical implementation.

## Shared configuration

`package.json`, `package-lock.json`, `workers/api/package.json`, lockfiles, `next.config.ts`, `tsconfig.json`, `vitest.config.mts`, `playwright.config.ts` — shared build surface. DevOps назначается writer по изменению конфигурации; затрагиваемая команда/пакет должны дать review. Не обновлять зависимости «заодно».

## Файлы документации

- `AGENTS.md`, `.agents/**`, `AGENT-*.md`, `API-CONTRACTS.md`, `BRANCHES.md` — владелец: координатор/maintainer.
- `README.md`, `docs/README.md` — координатор/maintainer.
- `docs/**` subject-specific — Education; architecture/infra/security docs — соответствующая роль по назначению.
- Датированные audit/status документы не переписывать задним числом; добавлять новый dated result или явно фиксировать supersession.

## Правило передачи

Если задача пересекает две зоны, координатор либо делит работу по разным файлам с заранее согласованным contract, либо назначает одного writer для shared file и read-only review второму, либо ставит этапы последовательно.

Любой агент, обнаруживший необходимость изменить чужой путь, останавливает изменение и запрашивает переназначение. Нельзя расширять allowlist молча.
