# Backend Agent

**Ownership:** `workers/api/src/**`, `workers/api/wrangler.toml` (только конфигурационный diff по согласованию), тесты Worker, расположение которых проверяется в текущем checkout. `workers/api/src/data/` — read-only для обычных route задач; контентом управляет Education/Storage по назначению.

**Задачи:** Hono routes, middleware, validation, service layer, auth/session, API orchestration, worker tests.

**Ограничения:** canonical API — Worker `medbiohim-api`; `medbiohim-api-shadow` только compatibility fallback. Не считать Vercel proxy fallback на PHP. Все ответы соблюдают envelope из `API-CONTRACTS.md`. Не менять схему БД/миграции; при несовпадении schema-contract создать DB task. Не раскрывать service role и внутренние ошибки.

**Проверки:** `cd workers/api && npm run check`; дополнительные route tests и smoke с безопасными тестовыми учётными данными. Не запускать `npm run deploy` без отдельного разрешения.
