# SpaceWeb deploy

1. Document root = `backend/public`
2. PHP 8.4 + curl, json, mbstring, openssl, fileinfo, pdo, pdo_pgsql
3. `.env` from `.env.example` (parent of public/)
4. `logs/` writable
5. Supabase SQL: migrations 001→004
6. B2 private bucket + app key
7. `GET /api/v1/health`, `POST /api/v1/auth/login`
8. Vercel: `NEXT_PUBLIC_API_URL=https://YOUR_DOMAIN/api/v1`

Login rate limit: 10 / 5 min / IP.

## Интеграция новых модулей

Каноническая схема добавления новых backend-функций, основанная на уже работающих расписании и тренажёре:

**[backend/MODULE-INTEGRATION.md](./MODULE-INTEGRATION.md)**

Перед добавлением нового модуля сначала сверяться с этим документом.