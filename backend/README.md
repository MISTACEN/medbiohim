# MEDBIOHIM Backend (SpaceWeb / PHP 8.4)

## Phase A — каркас API

- Front controller `public/index.php`
- Router `/api/v1/*`
- JSON contract: `{ ok, data|error, requestId }`
- CORS via `CORS_ORIGINS`
- `GET /health` and `GET /api/v1/health`
- Logs in `logs/app.log` without secrets

## Deploy SpaceWeb

1. PHP 8.4, document root = `public/`
2. `.env.example` → `.env`
3. Writable `logs/`
4. Check `https://your-domain/api/v1/health`

## Not in Phase A

- Auth (Phase B)
- Domain CRUD (Phase C)
- B2 upload (Phase D)
- Composer / PHPUnit
- Rate limiting
