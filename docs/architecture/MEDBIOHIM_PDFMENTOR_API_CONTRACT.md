# MEDBIOHIM ↔ PdfMentor — контракт Bridge API

**Статус:** v1.2, 2026-11-23. Реализовано: SSO, контекст, Document Bridge
(чтение файла), Result Bridge (приём результатов, §5.2). PdfMentor со своей
стороны сделал регистрацию внешнего источника и версии документа; Sync Bridge
остаётся планом.
**База:** `https://<medbiohim-origin>/api/v1/mentor`.

Общие правила:

- формат ответа — платформенный: `{ ok, data, requestId }` или
  `{ ok: false, error: { code, message }, requestId }`;
- все поля — `snake_case`;
- пользовательские вызовы требуют `Authorization: Bearer <supabase access token>`;
- серверные вызовы (PdfMentor → MEDBIOHIM) требуют HMAC-подписи.

---

## 1. GET `/mentor/config`

Что показать во фронтенде. Коды не выдаёт.

```json
{ "ok": true, "data": { "enabled": true, "mentor_url": "https://mentor.example",
  "bridge_signed": true }, "requestId": "…" }
```

`enabled = Boolean(PDFMENTOR_URL) && MENTOR_ENABLED !== "0"`.

## 2. POST `/mentor/sso`

Требует авторизации. Создаёт одноразовый код (60 с, Redis `getdel`).

Запрос:

```json
{ "intent": "login" }
```

`intent`: `login` (по умолчанию) или `link` (привязка к открытой сессии PdfMentor).

Ответ:

```json
{ "ok": true, "data": {
  "code": "…", "intent": "login", "expires_in": 60, "expires_at": "…",
  "mentor_url": "https://mentor.example",
  "form_action": "https://mentor.example/login/sso",
  "storage": "redis" }, "requestId": "…" }
```

Ошибки: `401 UNAUTHORIZED`, `429 RATE_LIMITED` (30 выдач в минуту на
пользователя), `503 MENTOR_NOT_CONFIGURED` (нет `PDFMENTOR_URL`).

**Код передаётся POST-формой** на `form_action` (поля `code`, `intent`).
Query-параметр с кодом запрещён: он попадает в логи, Referer и историю.

## 3. POST `/mentor/sso/exchange`

Серверный вызов PdfMentor. Без пользовательской сессии, но с подписью.

Заголовки:

```
x-bridge-client: pdfmentor
x-bridge-timestamp: <unix seconds>
x-bridge-signature: hex(hmac_sha256(BRIDGE_SECRET, "<timestamp>.<code>"))
```

Тело: `{ "code": "…" }`.

Ответ:

```json
{ "ok": true, "data": {
  "user_id": "uuid MEDBIOHIM", "email": "…", "email_verified": true,
  "name": "…", "intent": "login", "expires_at": "…",
  "provider": "medbiohim" }, "requestId": "…" }
```

Ошибки: `401 UNAUTHORIZED` — нет/просрочена/неверна подпись или нет секрета;
`401 NOT_FOUND` — код истёк или уже использован; `422 VALIDATION_ERROR` — нет
кода; `429 RATE_LIMITED` — 60 обменов в минуту на IP.

Инварианты:

- подпись проверяется **до** расходования кода;
- код одноразовый и атомарно удаляется;
- код и подпись никогда не пишутся в лог;
- расхождение часов больше 120 с — отказ.

## 4. POST `/mentor/context`

Требует авторизации. Передаёт учебный контекст конкретной операции.

```json
{ "subject_slug": "physiology", "topic_title": "Синапсы",
  "weak_concepts": ["медиаторы"], "learning_goal": "exam" }
```

```json
{ "ok": true, "data": { "provider": "medbiohim", "user_id": "…",
  "context": { "subject_slug": "physiology", "topic_title": "Синапсы",
    "weak_concepts": ["медиаторы"], "learning_goal": "exam" },
  "supported_actions": ["highlight", "explain", "route", "search"] }, "requestId": "…" }
```

---

## 5. Целевые (не реализованы)

Ниже — согласованные формы, которые нельзя считать работающими.

| Маршрут | Назначение | Статус |
|---|---|---|
| `POST /bridge/v1/documents/register` | регистрация внешнего документа | PdfMentor готов (`apps/web/src/app/api/bridge/v1/documents/register`) |
| `POST /bridge/v1/documents/access` | проверка доступа к документу | MEDBIOHIM готов: `POST /api/v1/mentor/documents/access` |
| `GET /bridge/v1/documents/:id/content` | поток файла после проверки прав | MEDBIOHIM готов: `GET /api/v1/mentor/documents/:id/content` |
| `POST /bridge/v1/documents/:id/version` | новая версия оригинала | PdfMentor готов (`…/documents/[id]/version`) |
| `POST /bridge/v1/results` | результаты обработки и ссылки | MEDBIOHIM готов: `POST /api/v1/mentor/results` (§5.2) |
| `POST /bridge/v1/sync/events` | заметки, аннотации, офлайн | план (sync PdfMentor пока внутренний) |

Требования к ним: идемпотентность по `requestId`, версия + checksum в каждом
ответе, асинхронная обработка, повторная проверка прав при каждом чтении.

### 5.1. Чтение файла (реализовано на стороне MEDBIOHIM)

Вызывает только сервер PdfMentor — пользовательской сессии нет, поэтому запрос
подписывается общим секретом. Подпись покрывает файл **и** пользователя, за
которого читают:

```
x-bridge-timestamp: <unix seconds>
x-bridge-signature: hex(HMAC-SHA256(BRIDGE_SECRET, "<ts>.document:<file_id>:<user_id>"))
```

`POST /api/v1/mentor/documents/access` — тело `{ file_id, user_id }`:

```json
{ "ok": true, "data": { "allowed": true,
  "file": { "id": "…", "name": "Лекция 4.pdf", "mime_type": "application/pdf",
             "size_bytes": 812345, "version": null, "checksum": "<sha256 файла>" },
  "content_url": "/api/v1/mentor/documents/<id>/content?user_id=<uid>" }, "requestId": "…" }
```

Отказ по правам — это `200` с `allowed: false` и `reason` (`FORBIDDEN` /
`NOT_FOUND`): PdfMentor не должен отличать «нет файла» от «нет доступа» по
HTTP-коду. Неверная подпись — `401`, лимит — `429` (`MENTOR_ENABLED=0` — `503`).

`GET /api/v1/mentor/documents/:id/content?user_id=…` отдаёт байты потоком с
`Cache-Control: private, no-store`. Никакого редиректа на подписанный URL:
права проверяются на каждом чтении, поэтому отзыв группы закрывает доступ со
следующего запроса, а не «когда-нибудь истечёт ссылка». Каждое чтение (и отказ)
пишется в `bridge_document_reads`.

Источники полей: `name` берётся из `files.original_name`, `checksum` — из
`files.sha256` (колонок `name`/`checksum` в `files` нет). `version` сейчас
`null`: MEDBIOHIM не версионирует оригинал, `file_variants` — производные, а
номер версии документа заводит PdfMentor при регистрации внешнего источника.

Ограничения: регистрация документов на стороне PdfMentor (`external_sources`)
сделана 2026-11-23; приём версий оригинала остаётся на стороне PdfMentor.

### 5.2. Результаты обработки (реализовано на стороне MEDBIOHIM)

PdfMentor обработал внешний документ и возвращает результат в MEDBIOHIM.
Вызывает только сервер PdfMentor: подпись та же, что у чтения файла, —
`hex(HMAC-SHA256(BRIDGE_SECRET, "<ts>.document:<file_id>:<user_id>"))`.

```
POST /api/v1/mentor/results
{
  "file_id": "<uuid>", "user_id": "<uuid>", "version": "<версия документа>",
  "pages":     [{ "index": 0 }],
  "fragments": [{ "page_index": 3, "block_id": "b-12", "text": "цитата", "category": "definition" }],
  "route":     [{ "ord": 0, "level": "base", "title": "…", "summary": "…", "est_minutes": 10 }]
}
```

Правила ответа:

- `200 { accepted: true, stored: true }` — результат сохранён (upsert по
  `file_id + user_id + version`: повтор той же версии перезаписывает прошлый);
- `200 { accepted: true, stored: false, reason: "NOT_FOUND" }` — файла нет или
  он не active. Именно `200`, а не `404`: PdfMentor считает `404/405` признаком
  «эндпоинт не реализован» и прекращает пушить;
- `401` — подпись не принята; `429` — больше 120 пушей в минуту на пользователя;
  `503` — база недоступна или `MENTOR_ENABLED=0` (PdfMentor повторит из очереди).

Ограничения тела: `pages` ≤ 2000, `fragments` ≤ 5000, `route` ≤ 200, текст
фрагмента ≤ 4000 символов. Сохраняются только поля контракта — посторонние
ключи в `jsonb` не попадают.

Хранение: `public.bridge_document_results`, RLS без политик, `revoke all` для
`anon`/`authenticated` (пишет только service-role воркера).

## 6. Идентификаторы

`provider` + `external_file_id` — внешний ключ. `version` + `checksum` —
неизменяемая версия. Внутренние uuid PdfMentor не выходят за его границы.

## 7. Секреты

| Переменная | Где | Назначение |
|---|---|---|
| `PDFMENTOR_URL` | Worker `medbiohim-api` | адрес PdfMentor (https, либо loopback в dev) |
| `BRIDGE_SECRET` | Worker + PdfMentor | HMAC одноразового кода |
| `MENTOR_ENABLED` | Worker | `0` — аварийный выключатель встроенного режима |
| `MEDBIOHIM_BRIDGE_URL` | PdfMentor | origin MEDBIOHIM без слэша |

Секреты не коммитятся и не выводятся в отчётах.
