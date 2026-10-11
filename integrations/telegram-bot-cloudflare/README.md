# MEDBIOHIM Telegram bot — Cloudflare Workers adapter

## Текущее состояние (11 октября 2026)

- Основной beta Worker развёрнут под именем `medbiohim-telegram`: https://medbiohim-telegram.ryazansevegor.workers.dev
- Прежний `medbiohim-telegram-test` сохранён отдельно как резервный Worker: https://medbiohim-telegram-test.ryazansevegor.workers.dev
- Для основного beta Worker включён адрес `workers.dev`.
- Важно: Cloudflare не переносит секретные значения при создании нового Worker. В новом `medbiohim-telegram` необходимо отдельно задать секреты `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET`. До этого health покажет `configured:false`, а webhook регистрировать не следует.
- Webhook Telegram пока не переключён. Сначала задайте секреты, проверьте `/health`, затем запустите интерактивный скрипт регистрации.
- Webhook endpoint: https://medbiohim-telegram.ryazansevegor.workers.dev/api/webhook
- Скрипт `scripts/register-webhook.mjs` проверяет Worker и токен, устанавливает webhook и проверяет результат через `getWebhookInfo`. Токен и secret вводятся в скрытом режиме и не выводятся скриптом.

## Безопасность

Не вставляйте токен в исходный код, GitHub, адресную строку браузера, переписку или скриншоты. Если токен когда-либо раскрывался, сначала перевыпустите его через `@BotFather` и обновите секрет `TELEGRAM_BOT_TOKEN` в Cloudflare Worker. Не показывайте никому вводимые секреты.

Смена webhook заменяет прежний адрес: Telegram отправляет обновления бота только на один активный webhook. Скрипт сохраняет ожидающие обновления (`drop_pending_updates: false`). Если текущий webhook ведёт на другой сервер, тот сервер перестанет получать новые обновления после переключения.

## Перед переключением: сверить секреты Worker

Поскольку токен мог быть перевыпущен через BotFather, сначала убедитесь, что Cloudflare использует именно актуальный токен. Откройте https://dash.cloudflare.com/ → аккаунт MEDBIOHIM → **Workers & Pages** → **medbiohim-telegram** → **Settings** → **Variables and Secrets**. В разделе secrets задайте/обновите `TELEGRAM_BOT_TOKEN` актуальным токеном через **Edit** или **Add** (тип Secret, не Text/Plaintext), сохраните и дождитесь завершения обновления. Не публикуйте значение. Если у вас нет точного значения `TELEGRAM_WEBHOOK_SECRET`, задайте новый секрет по инструкции ниже и используйте его же в скрипте.

## Что нужно сделать один раз на компьютере Windows

1. Убедитесь, что установлен Node.js версии 20 или новее. В PowerShell выполните `node --version`. Если команда не найдена, установите LTS-версию с https://nodejs.org/ и откройте PowerShell заново.
2. Откройте репозиторий https://github.com/MISTACEN/medbiohim (ветка `main`) и нажмите зелёную кнопку **Code → Download ZIP**. Распакуйте ZIP, например, в папку `Загрузки\medbiohim-main`.
3. Откройте распакованную папку, зайдите в `integrations\telegram-bot-cloudflare`. Нажмите на адресную строку Проводника, введите `powershell` и нажмите Enter.
4. В открывшемся PowerShell выполните:

   ```powershell
   node .\scripts\register-webhook.mjs
   ```

5. Скрипт сначала попросит ввести точную фразу `SWITCH-MAIN`. Это подтверждение, что вы действительно хотите переключить **основного бота** на Cloudflare. Если передумали — нажмите Ctrl+C или введите другую фразу.
6. Введите актуальный токен основного бота и значение `TELEGRAM_WEBHOOK_SECRET`, которое задано в Cloudflare Worker. Ввод скрыт: символы не отображаются. Не вводите токен в обычный текст чата.
7. Дождитесь сообщения **«УСПЕХ: Telegram подтвердил новый webhook»**. Если скрипт сообщил ошибку, не повторяйте вслепую — скопируйте только текст ошибки, предварительно убедившись, что в нём нет секретов.
8. Откройте Telegram, найдите своего бота, отправьте `/start`, затем `/help`. Проверьте кнопки и команды `/schedule`, `/tests`, `/subjects`, `/materials`.
9. Проверьте https://medbiohim-telegram.ryazansevegor.workers.dev/health — ожидается JSON с `"ok":true` и `"configured":true`. Открытие `/api/webhook` в браузере методом GET вернёт `METHOD_NOT_ALLOWED`; это нормально, потому что Telegram отправляет POST.

### Если не знаете значение TELEGRAM_WEBHOOK_SECRET

Не пытайтесь угадать его. Откройте https://dash.cloudflare.com/ → выберите аккаунт MEDBIOHIM → **Workers & Pages** → `medbiohim-telegram` → **Settings** → **Variables and Secrets**. Найдите `TELEGRAM_WEBHOOK_SECRET`. Если интерфейс не позволяет посмотреть сохранённое значение (обычно секреты скрыты), создайте новый случайный секрет, состоящий только из латинских букв, цифр, `_` и `-`; сохраните его в менеджере паролей, задайте его как secret `TELEGRAM_WEBHOOK_SECRET` для Worker и затем используйте то же значение в скрипте. После изменения подождите завершения обновления Worker и снова проверьте `/health`.

Если перевыпускали токен через BotFather, обновите и `TELEGRAM_BOT_TOKEN` в этом же разделе Cloudflare. Значения обоих секретов должны совпадать с теми, что использует Worker.

## Возможности и ограничения текущей версии

- `GET /health` — состояние сервиса без раскрытия значений секретов.
- `POST /api/webhook` — проверка заголовка `X-Telegram-Bot-Api-Secret-Token`, ограничение размера тела, публичные команды `/start`, `/help`, `/app`, `/site`, `/schedule`, `/tests`, `/subjects`, `/materials`, `/privacy`, `/homework`.
- Приватные команды отправляют ссылки на платформу; личные расписания/оценки и привязка аккаунта пока не реализованы.
- Пересылка групповых обновлений в PHP отключена, пока не задан и не проверен `TELEGRAM_HOMEWORK_WEBHOOK_URL`.
- Нет постоянного хранилища для дедупликации обновлений; перед включением записи домашних заданий или приватных данных нужно добавить идемпотентность.
- Запуск тестов проекта: `npm test` из этой папки (Node.js 20+).
- Скрипт регистрации не деплоит Worker и не меняет его секреты; он только регистрирует webhook в Telegram после локального подтверждения.

## Откат

Чтобы вернуть старый webhook, запустите скрипт ещё раз и при запросе токена используйте токен того же бота; перед этим измените `WEBHOOK_URL` в скрипте на проверенный прежний HTTPS-адрес и пересмотрите изменения. Не вызывайте `deleteWebhook` без необходимости: это остановит доставку обновлений через webhook.
