# MEDBIOHIM Telegram bot — Cloudflare Workers adapter

## Текущее состояние (26 октября 2026)

- Бот развёрнут как Cloudflare Worker `medbiohim-telegram`: https://medbiohim-telegram.ryazansevegor.workers.dev
- Проверка живости: `GET /health` → `{"ok":true,"service":"medbiohim-telegram-bot","configured":true}`. `configured` показывает только наличие `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET`; значения секретов не раскрываются.
- Webhook Telegram: `POST https://medbiohim-telegram.ryazansevegor.workers.dev/api/webhook`
- Деплой автоматический: `.github/workflows/deploy-telegram-worker.yml` при пуше в `main` с изменениями в `integrations/telegram-bot-cloudflare/**` прогоняет `npm test`, затем `npx --yes wrangler@4.149.0 deploy --dry-run`, и только после этого публикует Worker. Красные тесты блокируют деплой.
- Резервный Worker `medbiohim-telegram-test` сохранён отдельно: https://medbiohim-telegram-test.ryazansevegor.workers.dev

## Один сайт, одна версия

У платформы **одна каноническая версия**: `MEDBIOHIM_APP_URL`, по умолчанию `https://medbiohim.vercel.app` (см. `wrangler.toml`).

- Preview-URL git-ветки (`medbiohim-git-main-mistacen1.vercel.app`) больше не используется и не может быть в ссылке.
- Если `MEDBIOHIM_APP_URL` задан без `https:` (например, локальный `http://192.168.x.x`), Worker откатывается на канонический origin и никогда не отдаёт такой адрес пользователю.
- Команды `/oldsite`, `/main` и `/site` оставлены как **скрытые алиасы** на канонический сайт: у части пользователей в Telegram закешировано старое меню. В `setMyCommands` они не попадают.

## Команды

Зарегистрированное меню бота: `/start`, `/help`, `/menu`, `/app`, `/login`, `/register`, `/link`, `/status`, `/schedule`, `/homework`, `/subjects`, `/materials`, `/tests`, `/tickets`, `/university`, `/cards`, `/progress`, `/calculators`, `/latin`, `/extension`, `/privacy`.

- Каждая команда — короткий честный текст и inline-кнопка на соответствующий путь канонического сайта.
- `/menu` — inline-клавиатура со всеми разделами в две колонки, а не текст.
- `/status` — честно: бот не может показать состояние привязки, для этого нужен токен аккаунта пользователя, которого у бота нет. Кнопка ведёт на `/settings` (Настройки → Telegram), где состояние видно и где можно отвязать.
- `/app` — кнопка `web_app` на корень канонического сайта (открывает платформу внутри Telegram).
- `/privacy` — описывает реальную привязку, а не отрицает её (см. ниже).
- Любая команда с чужим `@username` (например, `/start@other_bot`) игнорируется.

## Привязка Telegram к аккаунту (реализована)

1. Пользователь входит в MEDBIOHIM и открывает **Настройки → Telegram**.
2. Сайт создаёт одноразовую ссылку и открывает бота с командой `/start link_<48 hex-символов>`.
3. Worker подтверждает ссылку на сервере MEDBIOHIM (`TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL`, в `wrangler.toml` указан современный API `medbiohim-api.ryazansevegor.workers.dev/api/v1/telegram/account-link/confirm`) и отвечает пользователю.
4. Передаются только `telegram_user_id`, `username`, `first_name`. Больше ничего.

Ссылка одноразовая: при повторном использовании или истечении срока бот честно сообщает, что нужно создать новую в настройках сайта. Адрес привязки обязан быть HTTPS, иначе запрос не отправляется.

## Групповые чаты и конвейер домашних заданий

Сообщения из групп и супергрупп пересылаются в `TELEGRAM_HOMEWORK_WEBHOOK_URL` (PHP-конвейер), **если он задан**. Без этой переменной worker отвечает `{"ok":true,"forwarded":false}` и ничего не отправляет. Адрес relay обязан быть HTTPS: HTTP-адрес отклоняется с `502` без сетевого запроса.

В личных чатах команда `/homework` ничего не импортирует — она лишь объясняет правила и открывает раздел заданий на сайте.

## Идемпотентность (опционально, без KV не нужна)

Telegram может доставить одно и то же обновление повторно. Если к Worker привязан KV namespace `TELEGRAM_UPDATES`, повторный `update_id` в течение 24 часов пропускается (ответ `{"ok":true,"duplicate":true}`).

```toml
[[kv_namespaces]]
binding = "TELEGRAM_UPDATES"
id = "<your-kv-namespace-id>"
```

Без привязки KV Worker работает как раньше: обновления не дедуплицируются, но и не теряются. Ошибка KV тоже не приводит к потере обновления.

## Безопасность

- Проверка заголовка `X-Telegram-Bot-Api-Secret-Token` сравнением с постоянным временем; неверный секрет → `401`.
- Не-POST на `/api/webhook` → `405`; тело больше 256 КиБ → `413`; некорректный JSON → `400`; отсутствие `TELEGRAM_BOT_TOKEN` или `TELEGRAM_WEBHOOK_SECRET` → `503`.
- Бот никогда не пишет первым: только отвечает на входящее обновление.
- Токены, секреты, тела обновлений и ответы upstream не логируются.
- Не вставляйте токен в исходный код, GitHub, адресную строку, переписку или скриншоты. Если токен мог раскрыться, перевыпустите его через `@BotFather` и обновите секрет Worker. Значения секретов не выводятся ни скриптом, ни Worker'ом.

## Возможности и ограничения

- Публичные разделы отдаются ссылками на канонический сайт; бот не показывает расписание, оценки или материалы прямо в чате.
- Личные данные не показываются до привязки аккаунта; после привязки бот по-прежнему не раскрывает их без запроса с сайта.
- Без KV нет дедупликации обновлений (см. выше).
- Нет зависимостей: только стандартный рантайм Workers, Node.js 20+ для тестов.

## Тесты и локальная проверка

Из этой папки (PowerShell блокирует `npm.ps1`, поэтому используйте `npm.cmd`/`npx.cmd`):

```powershell
npm.cmd test
npx.cmd --yes wrangler@4.149.0 deploy --dry-run   # проверка сборки без публикации
```

## Регистрация webhook (однократно)

Скрипт `scripts/register-webhook.mjs` проверяет Worker (`/health`), токен (`getMe`), устанавливает webhook и подтверждает результат через `getWebhookInfo`. Токен и secret вводятся в скрытом режиме и не выводятся.

```powershell
node .\scripts\register-webhook.mjs
```

Смена webhook заменяет прежний адрес: Telegram доставляет обновления только на один активный webhook (`drop_pending_updates: false`, ожидающие обновления сохраняются). Скрипт требует подтверждения `SWITCH-MAIN` и не деплоит Worker и не меняет его секреты.

## Если секреты не заданы

Откройте https://dash.cloudflare.com/ → аккаунт MEDBIOHIM → **Workers & Pages** → `medbiohim-telegram` → **Settings** → **Variables and Secrets**. Задайте `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` как **Secret** (не Text). Cloudflare не переносит секреты между Worker'ами. До этого `/health` вернёт `configured:false`, и регистрировать webhook не следует. Если значение `TELEGRAM_WEBHOOK_SECRET` неизвестно, создайте новый случайный секрет из латинских букв, цифр, `_` и `-`, сохраните его в менеджере паролей и используйте то же значение в скрипте.

## Откат

Чтобы вернуть прежний webhook, измените `WEBHOOK_URL` в скрипте на проверенный прежний HTTPS-адрес и запустите его снова. Не вызывайте `deleteWebhook` без необходимости: это остановит доставку обновлений.
