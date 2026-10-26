# Telegram-бот: деплой через GitHub Actions

> Актуально на 2026-10-26. Топология: [WORKERS-TOPOLOGY.md](WORKERS-TOPOLOGY.md).

## Что где

| Что | Где |
|---|---|
| Код канонического бота | `integrations/telegram-bot-cloudflare/` (`src/worker.js`) |
| Worker | `medbiohim-telegram` — `https://medbiohim-telegram.ryazansevegor.workers.dev` |
| Деплой | `.github/workflows/deploy-telegram-worker.yml` |
| Проверки на push/PR | `.github/workflows/telegram-worker-checks.yml` |
| Health | `GET /health` → `{"ok":true,"configured":true}` (без раскрытия секретов) |
| Webhook | `POST /api/webhook` |

## Деплой

Автодеплой **включён**: push в `main`, затрагивающий `integrations/telegram-bot-cloudflare/**`,
запускает workflow `Deploy MEDBIOHIM Telegram Worker`. Он выполняет по порядку:

1. `npm test` в каталоге бота — красный тест **блокирует** прод-деплой;
2. `npx --yes wrangler@4.149.0 deploy --dry-run` — сборка без публикации;
3. `npx --yes wrangler@4.149.0 deploy` — публикация Worker.

Альтернативный путь «Cloudflare Dashboard → Builds → подключить GitHub» больше не нужен:
источник истины — GitHub Actions. Если оба пути включены одновременно, каждый коммит
выкатывается дважды; оставьте Actions.

Проверка результата: `GET /health` должен вернуть `configured:true`, а в ответе
`getWebhookInfo` URL вебхука должен указывать на этот Worker (скрипт
`integrations/telegram-bot-cloudflare/scripts/register-webhook.mjs`).

## Секреты и переменные

Секреты Worker (только Dashboard → Workers → `medbiohim-telegram` → Settings, тип Secret; в Git
их быть не должно): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.

Публичные переменные — в `integrations/telegram-bot-cloudflare/wrangler.toml`:

- `MEDBIOHIM_APP_URL` — единственный канонический адрес сайта (по умолчанию `https://medbiohim.vercel.app`).
- `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL` — `https://medbiohim-api.ryazansevegor.workers.dev/api/v1/telegram/account-link/confirm` (работает).
- `TELEGRAM_HOMEWORK_WEBHOOK_URL` — опционально, relay групповых обновлений в PHP. **Не задан.**

Секрет Telegram (`secret_token` вебхука) и `TELEGRAM_WEBHOOK_SECRET` Worker должны совпадать.

## Порядок первого включения (если Worker пересоздаётся)

1. Задать `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` как секреты Worker.
2. Проверить `GET /health` → `configured:true`.
3. Убедиться, что применена миграция `database/migrations/20261017120000_telegram_account_linking_rpc.sql` (RPC привязки аккаунта).
4. Зарегистрировать вебхук скриптом `scripts/register-webhook.mjs` (интерактивно, ввод секретов скрыт).
5. Проверить в Telegram: `/start`, `/help`, `/menu`, `/schedule`, `/link`.

У бота может быть **только один активный webhook**. Не переключайте его на другие реализации —
в репозитории лежат legacy-варианты (`integrations/telegram-bot/`), они не должны получать обновления.

## История (не инструкция)

Чекпоинты от 2026-10-11 описывали состояние до включения автодеплоя: Cloudflare Builds,
падение GitHub Actions до выполнения шагов (`runner_id=0`), HTTP-адрес SpaceWeb и отсутствие
DNS-зон. Всё это устарело: деплой идёт через Actions и подтверждён, а `TELEGRAM_HOMEWORK_WEBHOOK_URL`
по-прежнему не задан, потому что для relay нужен проверенный HTTPS-origin PHP — см.
[HOSTING-HTTPS-DECISION-2026-10-11.md](HOSTING-HTTPS-DECISION-2026-10-11.md).
