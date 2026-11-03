# Public trainer image access fix — 2026-10-18

## Incident
Opening `https://medbiohim.vercel.app/api/v1/trainers/feed/{id}/image` without a signed-in browser session returned `UNAUTHORIZED`.

## Root cause
The canonical Worker route in `workers/api/src/routes/trainers.ts` registered the image-byte handler with `requireAuth`, so the request was rejected before public Upstash Blob lookup.

## Fix on `main`
- Removed `requireAuth` from only `GET /api/v1/trainers/feed/:id/image`.
- The route uses the server-only Supabase service client for metadata when configured, with anon/RLS fallback.
- It continues to require `is_published = true`, validates object keys, and returns image bytes only; it does not return card answer data.
- Feed listing, card detail, answer submission, and other protected routes retain their existing auth requirements.
- Added a contract test that asserts the image route is public and that the public Blob path remains enabled.

## Verification status
- Source change committed directly to `main`.
- Production deployment and browser-level unauthenticated image response still need confirmation from the GitHub Actions/Cloudflare live deployment. Do not mark the issue resolved solely from a source commit.
