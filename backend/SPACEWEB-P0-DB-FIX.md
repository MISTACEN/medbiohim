# P0-1 — SpaceWeb ↔ Supabase PostgreSQL

SpaceWeb is IPv4-only. Do **not** use `db.<project-ref>.supabase.co`.

## This project (confirmed)

| Param | Value |
|-------|--------|
| Host | `aws-1-eu-west-1.pooler.supabase.com` |
| Port | `5432` |
| Database | `postgres` |
| User | `postgres.gnobvyjywtqbdfeejxmf` |

On SpaceWeb `.env`:

```env
DB_URL=postgresql://postgres.gnobvyjywtqbdfeejxmf:YOUR_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require
DB_HOST=aws-1-eu-west-1.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.gnobvyjywtqbdfeejxmf
DB_PASSWORD=YOUR_PASSWORD
DB_SSLMODE=require
```

`DB_URL` takes priority over split `DB_*` vars.

Also set real `SUPABASE_SERVICE_KEY` (service_role) so REST fallbacks work if PDO fails.

Verify: `GET /public/api/v1/health` → `database.status=ok`.
