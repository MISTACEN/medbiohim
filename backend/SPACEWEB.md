# SpaceWeb deploy

1. Document root = `backend/public`
2. PHP 8.4 + curl, json, mbstring, openssl, fileinfo, pdo, pdo_pgsql
3. `.env` from `.env.example` (parent of public/)
4. `logs/` writable
5. Supabase migrations: remote history is authoritative; repository migration files are not a byte-for-byte mirror (see `database/SUPABASE_SYNC.md`).
6. B2 private bucket + app key
7. `GET /api/v1/health`, `POST /api/v1/auth/login`
8. Vercel browser API: `NEXT_PUBLIC_API_URL=/api/v1`; server proxy target is `SPACEWEB_API_ORIGIN=http://YOUR-SPACEWEB/api/v1` in the current test environment.

Login rate limit: 10 / 5 min / IP.

## Интеграция новых модулей

Каноническая схема добавления новых backend-функций, основанная на уже работающих расписании и тренажёре:

**[backend/MODULE-INTEGRATION.md](./MODULE-INTEGRATION.md)**

Перед добавлением нового модуля сначала сверяться с этим документом.