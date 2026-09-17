# MEDBIOHIM

## Frontend (repo root) → Vercel
Next.js App Router.
- Browser API base: `/api/v1`
- Vercel rewrite target: `SPACEWEB_API_ORIGIN` (HTTPS SpaceWeb API origin)
- If SpaceWeb document root is `backend/public`, the API origin is `https://YOUR-SPACEWEB/api/v1` — **not** `/public/api/v1`.

## backend/ → SpaceWeb
PHP API. The intended SpaceWeb document root is `backend/public/`.
Copy `.env.example` → `.env`. Folder `data/` must be writable.

## Deployment chain
`Browser → Vercel /api/v1 → SpaceWeb /api/v1 → PHP front controller → Supabase`

Synced: 2026-09-17
