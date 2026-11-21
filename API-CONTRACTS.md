# MEDBIOHIM — API и межслойные контракты

**Назначение:** общий контракт для Frontend, Backend, Database, Storage и QA. Описывает проверенную структуру кода `main`, а не обещание, что каждый endpoint уже принят на production.

## 1. Канонический транспорт

```text
Browser / PWA
  → relative same-origin /api/v1/*
  → Next.js proxy: src/app/api/v1/[...path]/route.ts
  → HTTPS Cloudflare Worker: medbiohim-api
  → Hono routes: workers/api/src/index.ts
  → Supabase / Upstash Redis / storage
```

- Browser-клиент использует relative `/api/v1`; не обращается к `workers.dev` напрямую.
- Proxy принимает GET/POST/PUT/PATCH/DELETE и OPTIONS; передаёт ограниченный набор заголовков (`content-type`, `authorization`, `accept`, `x-request-id`).
- Если Authorization отсутствует, proxy может преобразовать HttpOnly cookie `mb_at` в Bearer для upstream. Не передавай cookie как произвольный заголовок.
- Proxy использует no-store, timeout сейчас 45 секунд и Next route `maxDuration = 60` (18 с обрывали AI-фолбэк; не расширяй без оценки runtime).
- Proxy пропускает выбранные response headers (`content-type`, `location`, `content-disposition`, `cache-control`, `etag`, `last-modified`, `x-request-id`) и сохраняет HTTP status.
- Для JSON ответов `trainings` применяется `protectTrainingPayload`; не обходи sanitizer ради удобства клиента.
- Если основной Worker недоступен, proxy возвращает 502 envelope `UPSTREAM`; он не переключается на PHP/SpaceWeb.

Канонический Worker задан в `workers/api/wrangler.toml` как `medbiohim-api`. `workers/api/src/index.ts` монтирует Hono routes под `/api/v1`. Shadow service binding `MEDBIOHIM_UPSTREAM` используется только для ответа 501 от canonical Worker. `medbiohim-api-shadow` не является обычным upstream. `medbiohim-telegram` — отдельный bot Worker/service binding.

Отдельные Next.js API handlers вне `/api/v1` могут существовать (например, chemistry); проверяй их код отдельно, не считай их автоматически частью Hono.

## 2. JSON envelope и HTTP semantics

Успех:
```json
{ "ok": true, "data": {}, "requestId": "request-id" }
```

Ошибка:
```json
{
  "ok": false,
  "error": { "code": "ERROR_CODE", "message": "Безопасное сообщение" },
  "requestId": "request-id"
}
```

- `data` — endpoint-specific payload; не меняй shape без координации с frontend client.
- В типах Worker есть optional `stale`; error details могут присутствовать, только если безопасны для клиента.
- Сохраняй HTTP status. Типичные значения: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 413 payload too large, 422 semantic validation, 429 rate limit, 500 internal, 502 upstream, 503 dependency unavailable, 501 not implemented. Это ориентир, а не замена контракту конкретного route.
- Не отправляй stack trace, SQL text, credentials, private object keys или персональные данные в `message/details`.
- Binary/media endpoints — исключение: возвращают bytes с корректными `Content-Type`, `Cache-Control`, `Content-Disposition`, `ETag` и status, а не JSON envelope.
- Worker выставляет `x-request-id`; response helpers формируют `requestId` в body. Header и body requestId совпадают всегда: root-middleware воркера кладёт rid в контекст (с 2026-11-22), middleware/auth берёт его из заголовка. Сквозное совпадение — часть контракта.

## 3. Authentication и authorization

- Основной transport — `Authorization: Bearer <access_token>`. Proxy поддерживает dual-read с cookie `mb_at` и переводит cookie token в Bearer.
- Worker проверяет token через Supabase Auth (`verifyBearerUser` в `workers/api/src/lib/supabase.ts`).
- User-scoped запросы используют `createUserClient` с anon key + access token; RLS остаётся границей данных.
- `createServiceClient` — только server-side и только для узких обоснованных операций. Никогда не помещать service-role/secret key во frontend, public env или browser bundle.
- UI visibility не является authorization. Worker должен проверять owner, group membership, role и действие на каждом чувствительном endpoint.
- Admin diagnostics в Next proxy не заменяют Worker-side authorization.
- Telegram internal/service-binding requests не имеют пользовательской сессии; они должны подтверждать внутренний shared secret и назначение вызова.

Минимальная проверочная матрица: anon, authenticated owner, другой пользователь, участник/неучастник группы, staff/admin — по применимости.

## 4. Database contract

- Supabase Postgres/Auth — canonical source of truth.
- Redis — cache и ephemeral state, не основное хранилище.
- До изменения query/RPC проверь реальный код, migrations и live ledger/schema при явном разрешении. Наличие SQL-файла не доказывает, что он применён.
- Согласуй таблицу, поле, nullability, cardinality, FK/unique/check constraints, RPC signature, transaction behavior и RLS с Database Agent до изменения Worker/frontend.
- Migration должна описывать rollout/backfill/validation/rollback. Не выполнять её автоматически и не делать destructive reset.
- Проверяй доступ не только для owner/admin, но и для чужого пользователя и участника/неучастника группы.

## 5. Storage contract

- General file adapter: B2, если настроен полный набор B2 env; иначе Upstash Blob; при отсутствии конфигурации storage может быть недоступен.
- Trainer/histology images используют отдельный resolver в `workers/api/src/routes/trainers.ts`: публичный Google Drive index → public Upstash Blob/SDK. Этот путь не использует общий B2 adapter.
- Не утверждай, что перенос на B2 завершён, пока trainer resolver и весь набор изображений не проверены отдельно.
- Публичными могут быть только явно public assets. Private documents требуют server authorization или expiring signed URL.
- Проверяй object key/path traversal, MIME, размер, filename, visibility, cache headers, expiry и отсутствие произвольного remote URL.
- Не помещай tokens или приватные storage URLs в client bundle, logs или content packages.

## 6. Frontend client contract

- Используй `src/lib/api.ts` и `src/lib/api/**` для доменных API calls; не создавай второй несогласованный transport.
- Добавляя endpoint, обнови client types, error handling, cache invalidation и тесты.
- Учитывай loading/empty/error/success, повторную отправку, optimistic updates и stale cache.
- Для pagination явно зафиксируй cursor/page, ordering, stable key и поведение при изменении набора данных.
- Не делай destructive write в ответ на повторный network retry без idempotency strategy.

## 7. Contract change procedure

Любое изменение URL, method, params, payload, auth, role/scope, pagination, cache, status/error code, streaming/binary behavior или storage visibility требует:
1. обновить этот документ или указать точную секцию/исключение;
2. согласовать Backend + Frontend + Database/Storage по затронутым слоям;
3. добавить/обновить contract tests;
4. сохранить backward compatibility, если возможно;
5. явно указать migration/deploy order и rollback.

Если реализация в коде расходится с документом, не подгоняй код под устаревшую документацию вслепую: сначала зафиксируй расхождение и назначь владельца решения.

## 8. PdfMentor bridge contract

Канон: `docs/architecture/MEDBIOHIM_PDFMENTOR_API_CONTRACT.md`. Кратко для слоёв:

- `POST /api/v1/mentor/sso` — только `requireAuth`; выдаёт одноразовый код
  (60 с, Upstash Redis) и `form_action` PdfMentor. Код не передаётся в query.
- `POST /api/v1/mentor/sso/exchange` — без пользовательской сессии, но с
  `x-bridge-timestamp` + `x-bridge-signature` = HMAC-SHA256(`BRIDGE_SECRET`,
  `"<ts>.<code>"`). Подпись проверяется до расходования кода; код одноразовый
  (`getdel`), в логи не пишется.
- `POST /api/v1/mentor/context` — учебный контекст конкретной операции.
- `GET /api/v1/mentor/config` — состояние подключения; `MENTOR_ENABLED=0`
  выключает встроенный режим, не ломая старый просмотрщик.
- Адрес PdfMentor берётся только из `PDFMENTOR_URL` (https или loopback в dev),
  а не из тела запроса.
- `POST /api/v1/mentor/documents/access` и
  `GET /api/v1/mentor/documents/:id/content` — Document Bridge. Без
  пользовательской сессии: HMAC `"<ts>.document:<file_id>:<user_id>"` от
  `BRIDGE_SECRET`, права проверяются на каждом чтении (отзыв группы действует
  сразу), содержимое отдаётся потоком с `Cache-Control: private, no-store` (без
  редиректа на подписанный URL), каждое чтение пишется в `bridge_document_reads`.
  Отказ по правам — `200 { allowed: false }` в `access` и `403` в `content`.
  Метаданные в `access`: `name` из `files.original_name`, `checksum` из
  `files.sha256`, `version` — `null` (версию оригинала ведёт PdfMentor).
- Регистрация внешних документов, версии/checksum на стороне PdfMentor, Result
  и Sync Bridge не реализованы.

Тесты контракта: `workers/api/test/mentor-bridge.test.js`.

## 9. Микропрепараты: методические карточки и диагностикум

Каталог препаратов остаётся в `trainer_feed_cards`; новые таблицы — только
методички (`preparation_guides`), словарь структур (`preparation_structures`) и
попытки диагностикума (`diagnosticum_attempts`).

- `GET /api/v1/preparations/guides`, `GET /api/v1/preparations/guides/:key`,
  `GET /api/v1/preparations/structures` — `requireAuth`. До применения миграции
  отдают `migrated: false` и пустой список, а не 503: атлас продолжает работать
  без методичек и фильтров.
- `GET /api/v1/admin/preparation-guides` — список карточек для редактора (`admin`,
  `moderator`); `PUT /api/v1/admin/preparation-guides/:key` — сохранение одной
  карточки (`key`: латиница/цифры/дефис, `name` обязателен, `difficulty` 1–3
  как в ограничении таблицы, пустые текстовые поля сохраняются как `""`,
  списки до 30 строк по 400 символов). Запись идёт upsert-ом по `key` через
  service-role: политик на insert/update у таблицы нет намеренно, поэтому обойти
  редактор нельзя. Без миграции — `503 NOT_MIGRATED`.
- `GET /api/v1/diagnosticum` — разделы (из `preparation_guides.section`) и режимы.
- `POST /api/v1/diagnosticum/start` — `{mode, section?}`; вопрос собирается на
  сервере, ответ содержит `attempt_id`, `question` и `hints_total`, но не ключ.
- `POST /api/v1/diagnosticum/hint` — `{attempt_id, level?}`; уровни 1–4 только по
  порядку, каждая подсказка −10 баллов.
- `POST /api/v1/diagnosticum/answer` — `{attempt_id, submitted}`; проверка
  набора (`missing`/`extra`), балл и `guide_key` для открытия методички.
- `GET /api/v1/diagnosticum/stats` — по своим попыткам: точность, средний балл,
  разбивка по режимам и разделам, `weak_sections`.
- `GET /api/v1/diagnosticum/mistakes` — очередь повторения: уникальные `card_id`
  неверных попыток (до 20) для deep-link `?cards=` тренажёра гистологии; второй
  режим повторения не заводится.

Правила доступа: `diagnosticum_attempts` под RLS (`user_id = auth.uid()`), колонка
`answers` (ключ) не входит в колоночные гранты — правильные варианты приходят
только в ответе `/answer`. Попытка закрывается один раз: повторный ответ — 409.

Тесты контракта: `workers/api/test/preparations-guides.test.js`,
`workers/api/test/diagnosticum.test.js`,
`workers/api/test/admin-preparation-guides.test.js`; логика заданий —
`src/lib/__tests__/diagnosticum-model.test.ts`. Методички правятся в админке:
`/admin/preparation-guides` (`PreparationGuideEditor`).

## 10. Офлайн-ответы и идемпотентность

Офлайн-очередь живёт в браузере (`src/lib/offline/`, IndexedDB) и не подменяет
транспорт: это тот же `api()` с теми же путями.

- Запись в очереди — `{ path, method, body }`, где `body` уже содержит
  `origin: "user"` и `client_id` (UUID). Очередь отправляется в исходном порядке:
  сеть/таймаут останавливают её, окончательный 4xx снимает запись; хранится не
  больше 200 записей.
- `POST /api/v1/trainers/feed/answer` принимает необязательные `client_id` и
  `origin`. `origin` допускается только `"user"` (иначе 422): клиент не может
  выдать свой ответ за импорт или синхронизацию.
- Повтор с тем же `client_id` возвращает сохранённый результат с `replayed: true`
  и **не создаёт второй ответ**; память о выполнении живёт 7 дней (Redis, в dev —
  память процесса).
- Пока ответ в очереди, клиент получает `{ queued: true }` вместо результата:
  проверку `is_correct` по-прежнему делает только сервер.
- Service worker не кэширует `/api/` и `/auth/`: персональные данные и токены не
  остаются в Cache Storage, офлайн работает только оболочка и статика.

Тесты: `src/lib/__tests__/offline-queue.test.ts` (порядок, остановка, снятие,
лимит, происхождение), `workers/api/test/offline-answers.test.js` (origin,
идемпотентность, отсутствие API-кэша).
