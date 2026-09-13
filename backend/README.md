# MEDBIOHIM Backend (SpaceWeb / PHP 8.4)

## Phases
| Phase | Status | Contents |
|-------|--------|----------|
| A | done | Router, JSON contract, CORS, health, logs |
| B | done | Auth login/refresh/logout/recover/me, RequireAuth, RequireRole |
| C | in progress | DB layer, profile ensure, groups, subjects |

## Domain (C)
- `GET /api/v1/me`
- `GET /api/v1/groups` / `{id}`
- `GET /api/v1/subjects` / `{id}`

Login upserts `public.users` when DB is configured.

## Env
Auth: SUPABASE_URL + SUPABASE_ANON_KEY
Phase C: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
