# Независимая проверка Telegram-обновления (task-9)

- Дата: 2026-10-26
- Проверяющий: `tg-verify` (реализацию не писал: код писали `tg-bot` и `tg-miniapp`, их отчёты не использовались)
- Среда: Windows, PowerShell (использованы `npm.cmd`/`npx.cmd`), Node **v26.8.1**
- Мной созданы только два новых файла: `workers/api/test/telegram-verification.test.js` (31 тест) и этот отчёт
- Реализацию и чужие тесты я **не изменял**; коммитов и пушей нет. В рабочем дереве есть незакоммиченные правки других участников (`worker.js`, `auth.ts`, `README` и др.) — они не мои и мной не трогались

## 0. Что реально исполнялось

| Команда | Результат |
|---|---|
| `workers/api`: `node --test` (baseline до начала) | tests 67, pass 67, fail 0 |
| `workers/api`: `node --test` (после добавления файла) | **tests 98, pass 96, fail 2** (оба падения — намеренные репродукции T9-1 и T9-2) |
| `workers/api`: `npm.cmd run typecheck` | exit 0, ошибок нет |
| `integrations/telegram-bot-cloudflare`: `npm.cmd test` | **tests 24, pass 24, fail 0**, exit 0 |
| корень: `npm.cmd run typecheck` (frontend) | exit 0, ошибок нет |
| корень: `node --test test/` (frontend) | **tests 120, pass 120, fail 0**, exit 0 |

Роут прогонялся офлайн через **реально собранное приложение** `src/index.ts` (`app.request`), а не через копию роутера; Supabase-запросы перехвачены подстановкой `globalThis.fetch`. Свой `node:crypto`-подписыватель реализован в тесте независимо от модуля.

## 1. `workers/api/src/lib/telegram-initdata.ts`

Исполнено (тесты A1–A8, T9-1):

| Проверка | Факт |
|---|---|
| `secret_key = HMAC("WebAppData" → ключ, bot_token → сообщение)`, `hash = HMAC(secret_key, dcs)` | подтверждено: эта конструкция принимается, а 4 альтернативы (перестановка ключ/сообщение, legacy `SHA256(token+WebAppData)`, `HMAC(token, dcs)`, лишний `\n`) отвергаются как `invalid_hash` |
| `data_check_string` = поля без `hash`, `key=value` через `\n` | подтверждено для обычных наборов полей |
| регистр `hash` | верхний регистр принимается (`toLowerCase` на строке 179), пробелы/усечение/не-hex/`%`-кодирование отвергаются |
| значение с `=` внутри | принимается (разделение по первому `=`) |
| `+` vs `%20` | сырой `+` декодируется как пробел (подпись «a b» — валидна, «a+b» — `invalid_hash`), `%2B` — как литеральный `+`. Соответствует form-urlencoded |
| невалидный percent-encoding (`%zz`) | `invalid_init_data` (исключение `decodeURIComponent` не утекает) |
| дубликаты ключей (в т.ч. `hash`) | `invalid_init_data` |
| пустой ключ (`=v`) | `invalid_init_data`; ключ без `=` считается полем с пустым значением и входит в подписываемый набор |
| `auth_date` ровно `now-86400` / `now+60` | принимаются; `now-86401` → `init_data_expired`; `now+61` → `auth_date_in_future`; `0` → expired; `-1`, `1.5`, `1e9`, строка с пробелом, пустая → `missing_required_fields`; 20-значное число → `invalid_init_data` |
| `user` | отсутствует → `missing_user`; битый JSON / `null` / `[]` / массив / `{}` / `id` = `0`, отрицательный, дробный, `>2^53`, строка с мусором, `" 1"`, `null`, `true`, массив, объект → `invalid_user`; `id` числом и десятичной строкой → принимается; `1e9` в JSON → принимается (1000000000) |
| `username` / `first_name` | не-строки и пробельные → `null`; обрезка до 64/128 символов; `trim` |
| длина/пустота/отсутствие токена | `>16384` → `invalid_init_data`; пустая строка/не-строка → `invalid_init_data`; `bot_token` пустой/пробельный/`null` → `bot_not_configured` |
| отсутствие `console.*` и импортов в модуле | подтверждено чтением файла плюс проверкой в тесте A8 |

### Дефект T9-1 — сортировка `key=value` вместо сортировки по ключу

`workers/api/src/lib/telegram-initdata.ts:171` (`checkParts.sort()` в строках 166–172) сортирует целые строки `key=value`. Спецификация Telegram требует сортировки **по ключу**.

Минимальное воспроизведение (тест `DEFECT T9-1`, красный):

```js
const fields = { a: "1", a1: "2", auth_date: "1699999990", user: JSON.stringify({ id: 279058397, username: "vdlav", first_name: "Влад" }) };
const initData = buildInitData(fields);           // подпись строго по спецификации
await validateTelegramInitData(initData, BOT_TOKEN, 1_700_000_000);
// -> { ok: false, error: "invalid_hash" }        // валидный вход отвергнут
```

Исполненное доказательство расхождения (тест A5a, диагностика в выводе):

```
spec dcs = "a=1\na1=2\nauth_date=1700000000\nuser={...}"
impl dcs = "a1=2\na=1\nauth_date=1700000000\nuser={...}"   // '1'(0x31) < '='(0x3D)
```

### Fail closed — подтверждено, не опровергнуто

Рассуждение «ошибка сортировки ломает только валидный вход» **подтверждено тестом**, а не словами:

- A5b: принимается ровно один вариант — HMAC, посчитанный с **реальным токеном** по «сломанной» строке модуля; подпись атакующего токена над той же строкой отвергается. Никакая перестановка частей query-строки не помогает, изменение `user` при валидной подписи — `invalid_hash`.
- A5c: перебор 13 «легитимных» × 56 «форжерских» наборов → `collisions=0, accepted=0`.
- A5d: перебор с намеренно враждебными значениями (переводы строк внутри подписанных значений — единственный способ сделать join-by-`\n` неоднозначным) → `legitSets=373, collisions=0, accepted=0`.

Вывод: **T9-1 — дефект доступности, а не подделки.** Сегодня он латентен: документированные поля Telegram (`chat`, `chat_type`, `chat_instance`) не дают расхождения, потому что `_` (0x5F) > `=` (0x3D); проверено исполнением в A5a. Расхождение возникает, если появится/будет добавлено поле вида `a1`, `user1`, `chat1` (цифра или знак ниже `=` сразу после ключа-префикса) — тогда любой такой Mini App-логин отвергается. Исправление: сортировать по ключу (`telegram-initdata.ts:166-172`).

## 2. Роут `POST /api/v1/auth/telegram/webapp` (`workers/api/src/routes/auth.ts:222`)

Исполнено (B1–B10). Матрица:

| Вход | Ответ | Где |
|---|---|---|
| нет `TELEGRAM_BOT_TOKEN` (`undefined`/`""`/`"   "`) | 503 `TELEGRAM_NOT_CONFIGURED`, 0 запросов наверх | auth.ts:231–235 |
| нет `init_data`, пустой, не строка, тело > 16 КиБ, битый JSON | 400 `VALIDATION` | auth.ts:237–241 |
| 14 разных невалидных `init_data` (битый хеш, чужой токен, expired, future, дубликаты, битый JSON пользователя, `id=0`, массив, `=v`, мусор 16000 байт, лишнее поле) | **все 401 `INVALID_INIT_DATA` с побайтово одинаковым телом** (кроме `requestId`), в `error` ровно `{code,message}` без `details`, в теле ровно `{ok,error,requestId}`, `requestId` = 16 hex, 0 обращений к Supabase | auth.ts:243–248 |
| валидная подпись, нет service-ключа | 503 `TELEGRAM_LOGIN_UNAVAILABLE` (после проверки подписи: битая подпись в том же env даёт 401) | auth.ts:250–254 |
| валидная подпись, привязки нет | 409 `TELEGRAM_NOT_LINKED`; запрос ровно один: `GET /rest/v1/telegram_accounts?select=user_id&telegram_user_id=eq.279058397`; токен в URL не попадает | auth.ts:257–277 |
| ошибка БД / нет admin-пользователя / нет email / ошибка `generate_link` / ошибка `verifyOtp` | 503 `TELEGRAM_LOGIN_UNAVAILABLE`, 503 `AUTH_UPSTREAM`, 409 `TELEGRAM_NO_EMAIL`, 503, 503 — тела обезличены, коды БД (`57P01` и т.п.) не утекают | auth.ts:262–312 |
| успех | 200; тело совпадает по структуре с `/login`: ключи `access_token, refresh_token, expires_in, expires_at, token_type, user, session`, `session` = `{access_token, refresh_token, expires_in, expires_at, token_type, user{id,email,role}}`, `data.<key> === data.session.<key>`; значения взяты из ответа `verifyOtp`, а не из `init_data` | auth.ts:314–316 |
| лимит | при `incr = 21` → 429 `RATE_LIMIT` **до** любой работы и до Supabase; при `incr = 3` работает как обычно | auth.ts:225–229 |

Дополнительно исполнено:

- **Логи.** B9 перехватывает `console.*` на шести сценариях (битая подпись, ненайденная привязка, успех, ошибка БД, ошибка verify, профиль без email). Ни одна строка не содержит `init_data`, хеша, bot-токена, service/anon-ключа, email, access/refresh токена, `hashed_token`; каждая запись `[auth:telegram-webapp]` состоит только из `{stage, requestId}` (и `code` при ошибке БД) — payload/ПДн не логируются.
- **Точность границы тела.** `init_data` на 16000 байт доходит до валидатора → 401; 17000 байт → 400 (срабатывает лимит тела `readJson`, `MAX_BODY = 16*1024`), т.е. собственный лимит 16384 у валидатора через этот роут недостижим. Это не дыра (fail closed), но 400 вместо 401 — наблюдаемая деталь контракта.
- **Метод.** `GET` на этот путь не попадает в POST-обработчик: композитное приложение отвечает 501 `ROUTE_NOT_IMPLEMENTED` (catch-all `v1.all("*")`), `OPTIONS` → 204 с `access-control-allow-origin: *`.
- **Фронтенд** (только чтение): `src/lib/api.ts:504` (`telegramWebAppLogin` → `POST /auth/telegram/webapp`) и `src/components/auth/AuthProvider.tsx:130-134` (тихий вход при наличии `initData` и отсутствии токена) — форма запроса совпадает с роутом.

Вывод: единый 401 без деталей подтверждён для всех проверенных классах ошибок; оракула «почему отвергли» нет.

## 3. Бот (`integrations/telegram-bot-cloudflare/src/worker.js`)

Исполнено (C1–C8, T9-2). Собственный `npm.cmd test` — 24/24 (использован как дополнительный прогон, не как источник веры).

- `/menu` → `inline_keyboard` по 2 кнопки в ряд, содержит все реальные пути (`/schedule … /settings`) — C2.
- `/status` → `https://medbiohim.vercel.app/settings`, текст прямо говорит, что бот не получает токен аккаунта — C3.
- `/university` → `/university`, `/cards` → `/cards` — C4.
- `/privacy` утверждает наличие привязки, `/start link_<48 hex>`, передачу `id/username/first_name`, одноразовость — C5.
- В `setMyCommands` ровно 21 публичная команда, скрытые алиасы `site/oldsite/main` отсутствуют (но продолжают работать) — C1.
- В `worker.js` нет строк `git-main`, `192.168.`, `http://`; `wrangler.toml` задаёт `MEDBIOHIM_APP_URL = "https://medbiohim.vercel.app"`; при дефолтном env все кнопки всех команд указывают только на канонический origin по https — C1.
- KV-дедуп необязателен: без биндинга повторный `update_id` обрабатывается дважды; с биндингом — `duplicate: true` и TTL>0; со «сломанным» KV (бросает исключение) обновление не теряется — C6.
- `/start@чужой_бот link_<48hex>` игнорируется без единого исходящего запроса; `link_` с 47 символами не уходит на account-link relay; `/start@<свой_бот> link_<48hex>` (регистронезависимо) подтверждается — C7.
- Секрет вебхука, отсутствие токена, `/health`, метод, лимит 256 КиБ — C8.

### Дефект T9-2 — HTTPS-preview URL всё-таки может быть отдан

`worker.js:17-30` (`safeAppOrigin`) отбрасывает только **не-https** и origin с невалидным URL; комментарий в строках 26–27 и `README.md:15` утверждают, что preview/branch-хост не будет отдан никогда. Это неверно для любого https-хоста.

Минимальное воспроизведение (тест `DEFECT T9-2`, красный):

```js
await handleRequest(request("/schedule"), { ...env, MEDBIOHIM_APP_URL: "https://medbiohim-git-main-mistacen1.vercel.app" });
// кнопка: https://medbiohim-git-main-mistacen1.vercel.app/schedule  — preview-хост отдан пользователю
```

Текущий деплой не затронут (`wrangler.toml:8` = канонический origin), поэтому severity низкая: это дыра в защите от неверной конфигурации, а не активная утечка. Существующий тест автора проверял только `http://192.168.x.x`.

## 4. Регрессии

См. таблицу в §0. Фронтенд typecheck и 120/120 тестов зелёные; типизация API зелёная; бот 24/24. Никакие файлы реализации и чужие тесты не менялись: `git status --porcelain` показывает два новых файла task-9 (`workers/api/test/telegram-verification.test.js`, `docs/TELEGRAM-VERIFICATION-2026-10-26.md`) и незакоммиченные правки других участников задачи, к которым я не прикасался.

## 5. Дефекты (сводка)

| ID | Файл:строка | Тип | Воспроизведение |
|---|---|---|---|
| T9-1 | `workers/api/src/lib/telegram-initdata.ts:171` (166–172) | средняя: отказ в обслуживании валидного входа (fail closed) | тест `DEFECT T9-1` — подпись по спецификации для ключей `a`/`a1` отвергается |
| T9-2 | `integrations/telegram-bot-cloudflare/src/worker.js:17-30` (комментарий 26–27), `README.md:15` | низкая: неверное утверждение защиты от preview-хоста | тест `DEFECT T9-2` — `MEDBIOHIM_APP_URL=https://medbiohim-git-main-mistacen1.vercel.app` попадает в кнопку |

Оба теста оставлены падающими намеренно (это и есть воспроизведение), исправления не вносились.
**Оба дефекта закрыты в раунде 2 — см. §8.**

## 6. Что прочитано, но не исполнено

- `auth.ts:31-53` (`normalizeSession`) — форма разобрана чтением и подтверждена сравнением ответов `/login` и `/telegram/webapp`; сама функция отдельно не юнит-тестировалась.
- `worker.js:358-397` (`confirmAccountLink`) — проверено только то, что запрос уходит/не уходит; тело запроса и реакция на 409/410 сверены чтением, отдельного теста на 410 нет.
- `worker.js:399-413` (`relayGroupUpdate`) — проверен регрессионными тестами бота (24/24), собственных новых проверок не добавлял.
- `src/components/auth/AuthProvider.tsx:130-134` — только чтение, без запуска в браузере/Telegram.

## 7. НЕ проверено

1. **Реальный Supabase-round-trip** — всё офлайн, `fetch` подменён; реальные `telegram_accounts`, `generateLink`, `verifyOtp`, RLS и поведение при нескольких строках привязки не проверялись.
2. **Живой Telegram** — настоящий `initData` не проверялся; не проверено, действительно ли Telegram может подписать значение с переводом строки (например, имя пользователя), а значит не закрыт вопрос о неоднозначности join-by-`\n` в принципе (в переборе A5c/A5d — 0 коллизий и 0 принятий).
3. **Реальный секрет** — токен бота, `SUPABASE_SERVICE_ROLE_KEY` и Upstash-креды не использовались; в тестах только заведомо фейковые значения.
4. **Production-окружение** — не запускались `wrangler dev/deploy`, не проверены реальный Cloudflare Workers `crypto.subtle`, KV-биндинг и переменные деплоя; вывод о MedBiohim Mini App login в проде не делался.
5. **Поле `signature` (Ed25519)** — попадает в `data_check_string` (что верно), но как Ed25519-подпись не валидируется; это осознанное решение реализации, отдельно не тестировалось.
6. **Прочие телеграм-роуты** (`/api/v1/telegram/*`, привязка аккаунта на бэкенде) — вне объёма task-9, не проверялись.
7. **Фронтенд в среде Telegram** — тихий вход реально в WebView не запускался; проверены только статическая связка, typecheck и тесты.
8. **git** — коммиты и пуш не делались; `git status`/diff в отчёте не фиксировались как артефакт.

## 8. Раунд 2 — исправление дефектов (Lead, 2026-10-26)

Просьбы об исправлении были отправлены авторам (`tg-miniapp`, `tg-bot`), но **оба
исполнителя упали, не сделав ни одного изменения** (mtime файлов не изменился).
Дефекты закрыл Lead. Оракул этой проверки не ослаблялся: переписан ровно один тест,
который фиксировал *баговое* поведение; проверки T9-1/T9-2 оставлены на месте.

| Дефект | Исправление | Где |
|---|---|---|
| T9-1 | `data_check_string` собирается из полей, отсортированных **по ключу** (было — сортировка целых строк `key=value`); порядок join и всё остальное не тронуты | `workers/api/src/lib/telegram-initdata.ts` — `checkFields.sort(...)` |
| T9-2 | `safeAppOrigin()` отклоняет не только не-HTTPS, но и любой `.vercel.app`-хост кроме канонического `medbiohim.vercel.app`, откатываясь на канонический origin; комментарий и README приведены в соответствие с кодом | `integrations/telegram-bot-cloudflare/src/worker.js` — `isPreviewHost()` |

Результат после исправлений:

| Команда | Результат |
|---|---|
| `cd workers/api && npm.cmd test` | **98/98, 0 fail** (было 96/98) |
| `cd workers/api && npm.cmd run typecheck` | exit 0 |
| `cd integrations/telegram-bot-cloudflare && npm.cmd test` | **24/24, 0 fail** |
| фронтенд `node --test test/` | 120/120, 0 fail |
| фронтенд `npm.cmd run typecheck` | exit 0 |

Единственное изменение внутри оракула — тест `A5b`. Он назывался «the sort divergence
fails CLOSED» и утверждал, что принимается подпись, посчитанная по **баговому**
порядку (`assert.equal(validate(implOrderHash).ok, true)`). После фикса это
утверждение стало неверным, поэтому тест переписан на инвариант: спека-порядок
принимается при любом порядке query-строки, а подпись по старому порядку, подделка
identity и подпись чужим токеном — отвергаются. Все негативные проверки сохранены,
плюс добавлена проверка отказа подписи чужим токеном; ни одно утверждение не
ослаблено.

Непроверенным остаётся то же, что и в §7: реальный Supabase-round-trip, живой
`initData` из Telegram, реальные секреты, `wrangler deploy`, Ed25519-подпись и
Mini App внутри настоящего WebView.

## 9. Живая проверка продакшена (Lead, после деплоя `bbf3cd2e`)

Все относящиеся к делу workflow для коммита `bbf3cd2e` завершились успешно:
`Deploy MEDBIOHIM Telegram Worker`, `Deploy MEDBIOHIM API to Cloudflare`,
`Telegram Worker checks`, `MEDBIOHIM code checks`, `MEDBIOHIM smoke`,
`Package MEDBIOHIM source`, `MEDBIOHIM optional integrations checks`.
Четыре workflow (`apply-p0-academic-crud`, `apply-p1-ui-schedule-db`,
`fix-academic-soft`, `fix-runtime-errors`) падают на каждом коммите, включая
базовый `6e434de6` до этих работ — предсуществующее, к Telegram отношения не имеет.

| Живая проба (2026-10-26) | Результат | Что доказывает |
|---|---|---|
| `GET medbiohim-telegram…/health` | `200 {"ok":true,"configured":true}` | бот жив, секреты бота на месте |
| `POST /api/webhook` с неверным secret | `401` | проверка секрета работает в проде |
| `GET /api/webhook` | `405` | метод-гард в проде |
| `POST medbiohim.vercel.app/api/v1/auth/telegram/webapp` с поддельным `init_data` | `503 TELEGRAM_NOT_CONFIGURED` | **роут Mini App развёрнут** — такого кода в старом API не было; секрет `TELEGRAM_BOT_TOKEN` у `medbiohim-api` не задан |

### Требуется ручной шаг

Вход из Telegram сейчас ответит `503`, а не сессией: у воркера **`medbiohim-api`**
нет секрета `TELEGRAM_BOT_TOKEN`. Его нужно добавить — Dashboard → Workers →
`medbiohim-api` → Settings → Variables and Secrets (тип Secret, то же значение,
что у бота). После этого поддельный `init_data` должен получать
`401 INVALID_INIT_DATA`, а настоящий — сессию. Сам бот (команды, кнопки, привязка
аккаунта) работает и без этого шага.

## 10. Раунд 3 — проверка делегирована боту (вариант В, Lead)

Владелец проекта выбрал схему, в которой **токен бота не дублируется в `medbiohim-api`**.
Вместо установки `TELEGRAM_BOT_TOKEN` в API-воркер проверка `initData` делегируется тому
воркеру, который токен уже хранит.

| Что добавлено | Где |
|---|---|
| Проверка подписи (перенос 1:1 из API-модуля, включая фикс сортировки T9-1) | `integrations/telegram-bot-cloudflare/src/initdata.js` |
| Внутренний эндпоинт `POST /api/verify-initdata` — доступ по общему секрету, ответ содержит только подтверждённую личность, токен никогда не покидает воркер | `integrations/telegram-bot-cloudflare/src/worker.js` |
| Клиент делегирования + `hasRemoteVerifier` / `verifyUrl` (только https, только `*.workers.dev`, только путь `/api/verify-initdata`) | `workers/api/src/lib/telegram-initdata.ts` |
| Выбор пути в роуте: локально при своём токене, иначе делегирование; недоступный верификатор → `503 TELEGRAM_LOGIN_UNAVAILABLE`, **никогда** не выдаётся за неверную подпись | `workers/api/src/routes/auth.ts` |
| Адрес верификатора как `[vars]`, общий секрет описан в комментариях | `workers/api/wrangler.toml`, `workers/api/src/env.ts` |

Проверка equivalence: `workers/api/test/telegram-initdata-parity.test.js` прогоняет **26 случаев**
(включая T9-1, границы `auth_date`, дубликаты ключей, битый percent-encoding, мусорные `user.id`)
через обе реализации и требует побитово одинаковых вердиктов — расхождение копий стало невозможным.

| Команда | Результат |
|---|---|
| `cd integrations/telegram-bot-cloudflare && npm.cmd test` | **31/31** (было 24: +7 на эндпоинт) |
| `cd workers/api && npm.cmd test` | **137/137** (было 98: +30 паритет, +9 делегирование) |
| `cd workers/api && npm.cmd run typecheck` | exit 0 |
| фронтенд `node --test test/` | 120/120 |
| фронтенд `npm.cmd run typecheck` | exit 0 |

Проверено тестами: без общего секрета → `503 INTERNAL_NOT_CONFIGURED` и ноль исходящих
запросов; неверный секрет → `401`; отсутствие заголовка → `401`; валидный `initData` → `200`
с личностью; подделка, чужой токен и просроченный `auth_date` → единый
`401 INVALID_INIT_DATA`; `GET` → `405`; пустое/нестроковое/битый JSON тело → `400`;
переросшее тело → `413`; выделенный `TELEGRAM_INTERNAL_SECRET` вытесняет вебхук-секрет;
`/health` сообщает `internal`; ответ не содержит ни токена, ни секрета, ни `hash`.
На стороне API: ровно один исходящий запрос с заголовком-секретом и телом `{init_data}`,
наружу не уходит ничего лишнего; `401 INVALID_INIT_DATA` от бота → неверная подпись, а
`401 UNAUTHORIZED` / `503` / `500` / сеть / таймаут / битый успешный ответ → `internal_unavailable`.

### Что осталось для запуска

Цепочка заработает, как только у `medbiohim-api` появится **общий секрет**:
`TELEGRAM_INTERNAL_SECRET` (предпочтительно) или уже знакомый обоим воркерам
`TELEGRAM_WEBHOOK_SECRET`. Если последний там уже задан, ручной шаг не нужен вовсе —
живая проверка после деплоя это покажет: поддельный `initData` вернёт `401 INVALID_INIT_DATA`
при рабочей цепочке и `503 TELEGRAM_LOGIN_UNAVAILABLE` при отсутствующем секрете.

### Живая проверка после деплоя `6e1a34f0`

| Проба | Результат |
|---|---|
| `GET medbiohim-telegram…/health` | `{"configured":true,"internal":true}` — у бота общий секрет есть (переиспользован его вебхук-секрет), ручной шаг для бота не нужен |
| `POST /api/verify-initdata` без заголовка | `401 UNAUTHORIZED` |
| `POST /api/verify-initdata` с неверным секретом | `401 UNAUTHORIZED` |
| `POST medbiohim.vercel.app/api/v1/auth/telegram/webapp` с подделкой | `503 TELEGRAM_NOT_CONFIGURED` |
| CI: `Deploy MEDBIOHIM Telegram Worker` / `Deploy MEDBIOHIM API to Cloudflare` | success / success |

`npx wrangler deploy --dry-run` в `workers/api` показывает, что переменная уходит в деплой
(`Vars: … TELEGRAM_BOT_VERIFY_URL: "https://medbiohim-telegram…"`). Значит причина `503` — **не
переменная, а отсутствующий общий секрет** на `medbiohim-api`: `hasRemoteVerifier` требует и
адрес, и секрет.

Вывод: нужен ровно один новый секрет `TELEGRAM_INTERNAL_SECRET` (случайное значение) на **обоих**
воркерах. Менять `TELEGRAM_WEBHOOK_SECRET` на боте нельзя без последствий: он проверяет входящие
обновления Telegram, и его смена потребовала бы перерегистрации вебхука с новым `secret_token`.
