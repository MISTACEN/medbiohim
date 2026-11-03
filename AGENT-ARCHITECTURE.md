# MEDBIOHIM — архитектура параллельных ИИ-агентов

## Назначение и статус
Это модель распределения работы по репозиторию, а не новый runtime. Она описывает, как несколько внешних coding agents и их субагенты могут безопасно работать параллельно. Наличие файлов не означает, что агенты автоматически запущены или имеют доступ к GitHub/Supabase/Cloudflare.

## Слои управления
1. **Coordinator / Architect** — принимает запрос, изучает актуальный main, разбивает задачу, назначает владельцев, фиксирует контракты, принимает patches и интегрирует их.
2. **Domain agents** — Frontend, Backend, Database, Education, Storage, DevOps. Каждый отвечает за свой набор файлов и результаты.
3. **Education subagents** — Histology, Physiology, Chemistry, Embryology, Assessment/Tests.
4. **Independent QA/Security** — отдельная проверка, не автор собственного feature patch.

## Топология MEDBIOHIM
```
Browser / PWA
    │ same-origin /api/v1/*
Vercel Next.js (src/app/api/v1/[...path]/route.ts)
    │ HTTPS proxy
Cloudflare Worker: medbiohim-api (Hono)
    ├── Supabase (Postgres + Auth; canonical data source)
    ├── Upstash Redis (cache / ephemeral state)
    ├── B2 → Upstash adapter (general files)
    └── trainer media resolver (Drive index → public Upstash Blob/SDK)
Telegram Worker: medbiohim-telegram ── service binding MEDBIOHIM_API
Compatibility only: medbiohim-api-shadow (501 fallback path)
Legacy/reference: PHP SpaceWeb, integrations/cloudflare-api
```

Frontend, Backend, Database and Storage work may be parallel only after their interfaces and file ownership are explicit. For example, a new API feature can be split into UI contract, Worker implementation, SQL migration and QA, but only one owner integrates each shared boundary.

## Agent roster
| Role | Responsibility | Instruction |
|---|---|---|
| Coordinator | Planning, contracts, integration, final report | `.agents/coordinator.md` |
| Frontend | Next.js, UI, PWA | `.agents/agents/frontend.md` |
| Backend | Hono routes, middleware, Worker services | `.agents/agents/backend.md` |
| Database | Supabase schema, RLS, migrations | `.agents/agents/database.md` |
| Education | Subject content and assessment source data | `.agents/agents/education.md` |
| Storage | B2, Blob, Redis, Drive indexes | `.agents/agents/storage.md` |
| DevOps | Vercel, Cloudflare releases, GitHub Actions | `.agents/agents/devops.md` |
| QA/Security | Independent validation and security gate | `.agents/agents/qa-security.md` |

## Subagent fan-out
Education may delegate by subject (Histology, Physiology, Chemistry, Embryology) and assessment. Backend may delegate research-only tasks by domain (auth, schedule/planner, homework, tests, admin, Telegram), but Backend remains the sole owner of Worker route integration. QA may parallelize read-only reviews (auth/RLS, API contract, media, UI accessibility), then consolidate findings.

## Execution topology
- Each agent receives its own isolated worktree/container or patch workspace based on a recorded base SHA.
- No concurrent write access to the same checkout. Agents do not push to main.
- Agents return diffs. Coordinator checks ownership, rebases/rebuilds patches on current main, integrates one at a time, runs tests, then commits to main if authorized.
- Parallelize read-only investigation freely; parallelize code only for disjoint files and stable contracts.
- Shared files (package manifests/lockfiles, root config, route registry, common types, API response helpers, migration ledger) have one temporary owner per task.
- No separate agent runtime is introduced by this architecture. If later required, evaluate it as a separate product/infra proposal.

## Reference docs
See `AGENT-OWNERSHIP.md`, `API-CONTRACTS.md`, `AGENT-TASK-PROTOCOL.md` and `.agents/`.
