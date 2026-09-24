# MEDBIOHIM

## Frontend (repo root) → Vercel
Next.js App Router.
- Browser API base: `/api/v1`
- Vercel server-side proxy target: `SPACEWEB_API_ORIGIN` (current test SpaceWeb origin is HTTP)
- If SpaceWeb document root is `backend/public`, the API origin is `http://YOUR-SPACEWEB/api/v1` for the current test environment — **not** `/public/api/v1`.
- **Strict TypeScript** (`tsconfig` strict): `unknown` from `AdminDbRow` / `Record<string, unknown>` must be stringified before JSX (`String(...)` or `display(...)`). See **[docs/dev-notes.md](docs/dev-notes.md)**.

## backend/ → SpaceWeb
PHP API. The intended SpaceWeb document root is `backend/public/`.
Copy `.env.example` → `.env`. Folder `data/` must be writable.

## Deployment chain
`Browser → Vercel /api/v1 → SpaceWeb /api/v1 → PHP front controller → Supabase`

## Docs
- [docs/dev-notes.md](docs/dev-notes.md) — правила фронта (TS/ReactNode, AdminDbRow, чтобы Vercel не падал)
- [docs/platform-concept-medbiohim.md](docs/platform-concept-medbiohim.md)
- [docs/subject-content-matrix.md](docs/subject-content-matrix.md)

Synced: 2026-09-23
