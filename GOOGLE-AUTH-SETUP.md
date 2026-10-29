# MEDBIOHIM — вход и привязка аккаунта: почта, Google, Telegram

Один аккаунт на все способы входа. Привязка второго способа **не создаёт второй
профиль**: прогресс, SRS, задания и сессии остаются на том же `user_id`.

- Почта + пароль — основной вход через Supabase Auth.
- Google — OAuth через Supabase и `/auth/callback`; может быть и входом, и вторым
  способом входа.
- Telegram — привязка через одноразовую ссылку и подтверждение в боте; вход в
  Mini App — отдельный сценарий `/api/v1/auth/telegram/webapp`.

Секреты (Google Client Secret, bot token, service-role) живут только в Supabase и
Cloudflare. В репозиторий, `.env`, браузер и логи они не попадают.

## Google: вход

Authentication → Providers → Google: включить и вставить Client ID/Secret.
Authentication → URL Configuration:

- Site URL: `https://medbiohim.vercel.app`
- Redirect URLs: `https://medbiohim.vercel.app/**`, локально `http://localhost:3000/**`,
  а также точный порт dev-сервера, например `http://localhost:3010/**`.

В Google Cloud у OAuth Client ID (Web application):

- JavaScript origins: `https://medbiohim.vercel.app`, `http://localhost:3000`, при
  необходимости — фактический порт локального сервера.
- Authorized redirect URI: точный callback, который показывает Supabase в настройках
  провайдера (`https://<project>.supabase.co/auth/v1/callback`).

## Google: привязка к текущему аккаунту

1. Supabase → Authentication → Providers → **Enable manual linking**. Без этого API
   отвечает `503 IDENTITY_LINK_DISABLED`, и Google не привязывается.
2. Redirect URLs должны содержать `/auth/callback` (см. выше). Привязка всегда
   возвращается туда, а не в произвольный адрес.
3. `/settings` → «Способы входа» → «Привязать Google».

Как это работает:

- `POST /api/v1/settings/identities/link` вызывает GoTrue
  `GET /auth/v1/user/identities/authorize?provider=google&redirect_to=…&skip_http_redirect=true`
  под access-токеном пользователя. Именно GET: прежний POST с JSON отвечал 404.
- API возвращает URL провайдера, браузер уходит на Google.
- Возврат идёт на `/auth/callback?linked=google`; страница разбирает токены, если они
  есть, и переходит в `/settings?linked=1`.
- `/settings` заново загружает `identities` и только после этого говорит «Google
  привязан». Отмена (`error=access_denied`) показывается причиной, а не «попробуйте
  ещё раз».
- Уже привязанный Google → `409 IDENTITY_ALREADY_LINKED`. Отвязка — только когда у
  аккаунта остаётся другой способ входа, иначе `409 LAST_IDENTITY`.

Роли и админка при этом не меняются: Google-вход никогда не выдаёт права сам.

## Telegram: привязка

Код: `workers/api/src/routes/settings.ts` (создание ссылки), бот
`integrations/telegram-bot-cloudflare/src/worker.js`, подтверждение
`workers/api/src/routes/telegram.ts`, миграция
`database/migrations/20261017120000_telegram_account_linking_rpc.sql`.

Поток:

1. `/settings` → Telegram → «Привязать через @MEDBIOCHIM_bot».
2. API создаёт 48 hex-токен, сохраняет **только SHA-256-хеш** и отдаёт ссылку
   `https://t.me/<bot>?start=link_<token>` (10 минут, не больше 5 ссылок за 15 минут).
3. Браузер открывает бота в новой вкладке, а страница остаётся в настройках и
   опрашивает статус раз в 3 секунды с обратным отсчётом.
4. Бот принимает `/start link_<48 hex>` только для своего username, отправляет на
   `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL` id/username/first_name и одноразовый токен.
5. API проверяет `x-telegram-bot-api-secret-token`, хеширует токен и вызывает
   `confirm_telegram_account_link`: токен гасится, аккаунт привязывается.
6. Настройки сами показывают «Telegram привязан» и username. Истёкшая или уже
   использованная ссылка → `410`, занятый Telegram/аккаунт → `409`.

Обязательные настройки:

- Worker API (секреты Cloudflare): `TELEGRAM_WEBHOOK_SECRET` (он же используется как
  общий секрет подтверждения), `TELEGRAM_BOT_USERNAME` (необязательно, по умолчанию
  `MEDBIOCHIM_bot`), `SUPABASE_SERVICE_ROLE_KEY` (нужен роуту подтверждения).
- Бот (Cloudflare): секреты `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`;
  переменная `TELEGRAM_ACCOUNT_LINK_WEBHOOK_URL` уже указывает на
  `/api/v1/telegram/account-link/confirm`; `MEDBIOHIM_APP_URL` — канонический сайт.
- Значение `TELEGRAM_WEBHOOK_SECRET` у бота и API должно совпадать. Не публикуйте его.

Отвязка: `POST /api/v1/settings/telegram/unlink` (RPC `unlink_my_telegram_account`).
Бот после отвязки не узнаёт аккаунт: вход через Telegram WebApp вернёт
`409 TELEGRAM_NOT_LINKED`, пока не привяжете снова.

## Что проверить после настройки

1. Вход по почте работает, `/settings` открывается.
2. «Привязать Google» → согласие → возврат в настройки → «✓ Google привязан».
3. Отмена на экране Google → в настройках причина отказа, а не ложный успех.
4. «Отвязать» у Google работает, пока есть почта; отвязка последнего способа — отказ.
5. «Привязать Telegram» → бот → в настройках статус меняется без перезагрузки.
6. Повторное открытие старой ссылки → бот говорит, что ссылка устарела (410).
7. Отвязка Telegram → статус «не привязан», вход через WebApp — `409`.
