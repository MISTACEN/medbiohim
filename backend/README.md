# MEDBIOHIM Backend (SpaceWeb / PHP 8.4)

## Phase A — skeleton
Router, JSON contract, CORS, health, logs without secrets.

## Phase B — Auth (Supabase)
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/auth/login` | public `{ email, password }` |
| POST | `/api/v1/auth/refresh` | public `{ refresh_token }` |
| POST | `/api/v1/auth/logout` | Bearer or body `access_token` |
| POST | `/api/v1/auth/recover` | public `{ email }` |
| GET | `/api/v1/auth/me` | Bearer required |

## Deploy SpaceWeb
1. Document root = `public/`
2. PHP 8.4 + curl, json, mbstring, openssl, fileinfo, pdo, pdo_pgsql
3. `.env` from `.env.example` (SUPABASE_URL + ANON_KEY for Auth)
4. `logs/` writable
5. `GET /api/v1/health`

## Not done yet
- Sync `public.users` after login (Phase C)
- Role middleware teacher/admin
- Domain CRUD (Phase C)
- B2 files (Phase D)
- Rate limiting on login
