# Как подключить sessions в index.js

Файл `integrations/cloudflare-api/src/sessions.js` уже в `main`.
Тесты: `integrations/cloudflare-api/test/sessions.test.js`.
Parity map: `docs/PHP-CF-PARITY-MAP.md`.

## 1. Import (после personal-state.js)

```js
import { listSupabaseLearningSessions, getSupabaseLearningSession, createSupabaseLearningSession, patchSupabaseLearningSession } from "./sessions.js";
```

## 2. Routes (перед блоком `/notes`)

```js
if (pathname === API_PREFIX + "/sessions") {
  if (request.method === "GET") {
    const result = await listSupabaseLearningSessions(request, env, {
      status: url.searchParams.get("status") || "",
    });
    if (!result.ok) {
      return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
    }
    return withCors(success(result.data), origin);
  }
  if (request.method === "POST") {
    const parsed = await readJsonLimited(request, 65_536);
    if (!parsed.ok) {
      const status = parsed.tooLarge ? 413 : 400;
      const code = parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
      return withCors(json({ ok: false, error: { code, message: parsed.tooLarge ? "Request body is too large" : "Invalid JSON body" }, requestId: crypto.randomUUID() }, status), origin);
    }
    const result = await createSupabaseLearningSession(request, env, parsed.value);
    if (!result.ok) {
      return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
    }
    return withCors(success(result.data, result.status || 201), origin);
  }
  return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, POST, OPTIONS" }), origin);
}

const learningSessionMatch = new RegExp("^" + API_PREFIX + "/sessions/([^/]+)$").exec(pathname);
if (learningSessionMatch) {
  let sessionId;
  try { sessionId = decodeURIComponent(learningSessionMatch[1]); } catch {
    return withCors(json({ ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid session id" }, requestId: crypto.randomUUID() }, 422), origin);
  }
  if (request.method === "GET") {
    const result = await getSupabaseLearningSession(request, env, sessionId);
    if (!result.ok) {
      return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
    }
    return withCors(success(result.data), origin);
  }
  if (request.method === "PATCH") {
    const parsed = await readJsonLimited(request, 65_536);
    if (!parsed.ok) {
      const status = parsed.tooLarge ? 413 : 400;
      const code = parsed.tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
      return withCors(json({ ok: false, error: { code, message: parsed.tooLarge ? "Request body is too large" : "Invalid JSON body" }, requestId: crypto.randomUUID() }, status), origin);
    }
    const result = await patchSupabaseLearningSession(request, env, sessionId, parsed.value);
    if (!result.ok) {
      return withCors(json({ ok: false, error: { code: result.code, message: result.message }, requestId: crypto.randomUUID() }, result.status), origin);
    }
    return withCors(success(result.data), origin);
  }
  return withCors(json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, requestId: crypto.randomUUID() }, 405, { allow: "GET, PATCH, OPTIONS" }), origin);
}
```

## 3. Metadata endpoints list

Добавить `sessions` рядом с `notes` в строке `endpoints` ответа `GET /api/v1`.
