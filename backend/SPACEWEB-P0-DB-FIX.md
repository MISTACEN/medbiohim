# P0-1 — SpaceWeb ↔ Supabase PostgreSQL

SpaceWeb is using an IPv4 network. The Supabase direct `db.<project-ref>.supabase.co:5432` endpoint is not the correct default for an IPv4-only backend. Use the Shared Session pooler on port 5432.

Set one server-side variable on SpaceWeb:

`DB_URL=postgres://postgres.gnobvyjywtqbdfeejxmf:<YOUR_DB_PASSWORD>@<EXACT_SESSION_POOLER_HOST>:5432/postgres?sslmode=require`

Replace the password and the exact Session pooler host copied from Supabase → Connect → Session pooler. Do not guess the pooler host/index.

`DB_URL` takes priority over `DB_HOST` / `DB_USER` / `DB_PORT` / `DB_NAME`.

Verification: `/public/api/v1/health` should show `database.status=ok`, `message=Connected`. B2 `warn` is acceptable until B2 credentials are configured.

The database already contains the administrator role assignment. Normal student accounts must not bootstrap a second admin.
