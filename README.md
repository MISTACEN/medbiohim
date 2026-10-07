# MEDBIOHIM

## Ветки (важно)

| Ветка | Роль |
|-------|------|
| **`main`** | **Прод** — source of truth, Vercel production |
| **`beta`** | **Только тесты и эксперименты** — не деплоить как production |

Подробно: **[BRANCHES.md](BRANCHES.md)** · журнал экспериментов: **[docs/ACTIVE-EXPERIMENTS.md](docs/ACTIVE-EXPERIMENTS.md)**

Коммиты на `beta`: префиксы `experiment:` / `test:` / `wip:`. На `main` — только готовое к проду.

## Frontend (repo root) → Vercel
Next.js App Router.
- Browser API base: `/api/v1`
- Vercel server-side proxy target: `SPACEWEB_API_ORIGIN`
- Chemistry (на main): `/chemistry`, `/api/chemistry/resolve`, `/api/chemistry/health` — см. [docs/chemical-engine.md](docs/chemical-engine.md)
- **Strict TypeScript**: see **[docs/dev-notes.md](docs/dev-notes.md)**.

## backend/ → SpaceWeb
PHP API. Document root: `backend/public/`.
Copy `.env.example` → `.env`. Folder `data/` must be writable.

## Deployment chain
`Browser → Vercel /api/v1 → SpaceWeb /api/v1 → PHP → Supabase`

## План и документация
- [ROADMAP.md](ROADMAP.md) — единый план проекта и порядок работ
- [PHASES_STATUS.md](PHASES_STATUS.md) — текущее состояние фаз
- [docs/README.md](docs/README.md) — карта документов и источников истины

## Docs
- [BRANCHES.md](BRANCHES.md) — main vs beta
- [docs/ACTIVE-EXPERIMENTS.md](docs/ACTIVE-EXPERIMENTS.md) — что тестируется на beta
- [docs/chemical-engine.md](docs/chemical-engine.md)
- [docs/dev-notes.md](docs/dev-notes.md)
- [docs/platform-concept-medbiohim.md](docs/platform-concept-medbiohim.md)

Synced: 2026-10-07
