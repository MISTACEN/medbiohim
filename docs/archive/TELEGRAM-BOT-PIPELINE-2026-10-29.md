# Telegram → задания: рабочий конвейер (2026-10-29)

## Что делает бот

1. Telegram присылает сообщение группе на `POST /api/webhook` бота
   `medbiohim-telegram`.
2. Бот проверяет `X-Telegram-Bot-Api-Secret-Token`, отбрасывает повторные
   `update_id` (если привязан KV) и пересылает обновление в API
   `POST /api/v1/telegram/ingest`.
3. API проверяет общий секрет, сохраняет сообщение в `telegram_messages`,
   регистрирует чат в `telegram_bot_chats`.
4. **Cloudflare Workers AI** (биндинг `AI`, по умолчанию
   `@cf/meta/llama-3.1-8b-instruct-fp8`) сортирует сообщение:
   `homework` / `material_candidate` / `schedule` / `other`, а также формирует
   заголовок, краткое описание, предмет, задачи и подсказку срока.
5. Если это задание с уверенностью ≥ 0.65 и чат привязан к учебной группе,
   API создаёт строку в `homeworks` и связывает её с сообщением
   (`telegram_homework_links`). Бот отправляет в группу короткое подтверждение.
6. Всё остальное (материалы, расписание, разговоры, неуверенные задания)
   остаётся в админке `/admin/telegram`: там видны категория, уверенность,
   предмет, срок и кнопка «Создать задание».

Правила (`ruleClassification`) — только страховка. Они включаются, если
Workers AI недоступен, вернул невалидный JSON или провайдер не настроен.
Сроки никогда не придумываются: `due_hint` принимается только если модель
процитировала его из текста, а дата вычисляется `parseDueAt`.

## Обязательная настройка (один раз)

### 1. Workers AI

Биндинг уже объявлен в `workers/api/wrangler.toml`:

```toml
[ai]
binding = "AI"
```

Ключи и сертификаты не нужны. После деплоя `/api/v1/health` должен показать
`cloudflareAiConfigured: true` и `cloudflareAiModel`.

### 2. Проверка секрета без копии на API

API не хранит `TELEGRAM_INGEST_SECRET`: он отправляет полученный заголовок на
бот-воркер `POST /api/verify-ingest`, а тот сравнивает его со своим секретом.
Поэтому достаточно, чтобы секрет был **только на боте** (он там уже есть как
`TELEGRAM_WEBHOOK_SECRET`).

`wrangler.toml` уже содержит:

```toml
TELEGRAM_BOT_VERIFY_INGEST_URL = "https://medbiohim-telegram.ryazansevegor.workers.dev/api/verify-ingest"
```

Если хочется убрать сетевой хоп, можно положить одинаковый
`TELEGRAM_INGEST_SECRET` на оба воркера — тогда API проверяет локально:

```bash
openssl rand -hex 32
cd workers/api
npx wrangler secret put TELEGRAM_INGEST_SECRET --name medbiohim-api
cd ../../integrations/telegram-bot-cloudflare
npx wrangler secret put TELEGRAM_INGEST_SECRET --name medbiohim-telegram
```

Проверка: `/api/v1/health` → `telegramIngestConfigured: true`,
`telegramIngestVerifier: "bot"` (или `"local"`); в админке `/admin/telegram`
блок «Приём из групп» зелёный.

### 3. Webhook и Privacy Mode

- `/admin/telegram` → «Настроить webhook» (нужны `TELEGRAM_BOT_TOKEN` и
  `TELEGRAM_WEBHOOK_URL`/`TELEGRAM_WEBHOOK_ORIGIN` на API-воркере).
- Бот должен получать все сообщения группы: отключите Privacy Mode в
  `@BotFather` или сделайте бота администратором группы.
- Привяжите обнаруженный чат к учебной группе в `/admin/telegram`.

Проверка после первого сообщения:

```bash
curl -s https://medbiohim-api.ryazansevegor.workers.dev/api/v1/health
```

В `telegram_messages` должна появиться строка с `classification`,
`classification_confidence`, `ai_reason` вида
`<причина> · cloudflare:<модель>`; в `telegram_homework_links` — ссылка, если
создано задание.

## GigaChat (опционально)

Изначально сортировка планировалась на GigaChat. Cloudflare Workers не доверяют
цепочке НУЦ Минцифры, поэтому прямой вызов падает с
`SELF_SIGNED_CERT_IN_CHAIN`. В этой волне сертификат на сайт **не добавлялся**:
основной провайдер — Workers AI.

Если GigaChat всё же нужен:

```bash
cd workers/api
npx wrangler secret put GIGACHAT_CREDENTIALS --name medbiohim-api
npx wrangler secret put AI_SORT_PROVIDER --name medbiohim-api   # значение: gigachat или auto
```

`auto` — сначала Cloudflare AI, при ошибке GigaChat. Для GigaChat нужен
HTTPS-relay на хосте, который доверяет сертификату (или умеет отключить
проверку только для этого запроса); URL задаётся в `GIGACHAT_RELAY_URL`
(`[vars]`, не секрет). Без relay на Workers работает только Workers AI.

## Ограничения текущей волны

- Фото и документы **не импортируются** в хранилище: сообщение с вложением без
  подписи становится `material_candidate` и ждёт ручного разбора. Для OCR нужен
  vision-провайдер и отдельная загрузка файла; это следующий шаг.
- Автоматически создаются только задания (`homework`). Материалы и расписание
  сохраняются и видны в админке, но не публикуются в соответствующие разделы.
- Если чат не привязан к группе, задания не создаются: бот один раз просит
  привязать чат.

## Тесты

- `workers/api/test/telegram-sorting.test.js` — Cloudflare AI по умолчанию,
  разбор JSON, отказ от выдуманного срока, fallback на правила, GigaChat-режим.
- `workers/api/test/telegram-ingest.test.js` — контракт ingest, порог 0.65,
  отсутствие ответов на болтовню, админские маршруты, отсутствие relay-переменных.
- `integrations/telegram-bot-cloudflare/test/worker.test.js` — пересылка в API,
  подтверждение в группу, дедупликация, HTTPS-only, секреты.
