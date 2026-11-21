/**
 * Bridge API MEDBIOHIM → PdfMentor.
 *
 * MEDBIOHIM — IdP и владелец прав; PdfMentor — движок документов. Между ними
 * только HTTP: общих таблиц нет.
 *
 * Поток входа:
 *   1. Браузер (уже авторизован в MEDBIOHIM) → POST /mentor/sso.
 *   2. MEDBIOHIM кладёт одноразовый код в Redis (60 с) и возвращает форму.
 *   3. Браузер отправляет код в PdfMentor POST-формой (form_post), поэтому
 *      код не попадает ни в query, ни в Referer, ни в логи прокси.
 *   4. Сервер PdfMentor обменивает код через POST /mentor/sso/exchange,
 *      подписывая запрос HMAC (BRIDGE_SECRET). Код одноразовый: getdel.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { rateLimit } from "../../lib/redis";
import { requireAuth, type AuthVariables } from "../../middleware/auth";
import type { Env } from "../../env";
import {
  BRIDGE_CLIENT,
  BRIDGE_CLIENT_HEADER,
  BRIDGE_SIGNATURE_HEADER,
  BRIDGE_TIMESTAMP_HEADER,
  MENTOR_CODE_TTL_SECONDS,
  normalizeIntent,
  normalizeMentorUrl,
  verifyBridgeSignature,
} from "./model";
import { consumeMentorCode, storeMentorCode } from "./store";
import documents from "./documents";

const mentor = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

function clientIp(c: Context<{ Bindings: Env; Variables: AuthVariables }>): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** GET /mentor/config — что показать во фронтенде, без выдачи кодов. */
mentor.get("/config", requireAuth, async (c) => {
  const rid = requestId();
  const mentorUrl = normalizeMentorUrl(c.env.PDFMENTOR_URL);
  // MENTOR_ENABLED="0" — аварийный выключатель: старый путь остаётся рабочим.
  const enabled = Boolean(mentorUrl) && c.env.MENTOR_ENABLED !== "0";
  return c.json(
    ok(
      {
        enabled,
        mentor_url: mentorUrl,
        bridge_signed: Boolean(String(c.env.BRIDGE_SECRET ?? "").trim()),
      },
      rid,
    ),
  );
});

/**
 * POST /mentor/sso — выдать одноразовый код текущему пользователю MEDBIOHIM.
 * `intent: "link"` используется, когда у человека уже есть аккаунт PdfMentor
 * и он хочет привязать его, а не войти новым.
 */
mentor.post("/sso", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");

  const mentorUrl = normalizeMentorUrl(c.env.PDFMENTOR_URL);
  if (!mentorUrl) {
    const { body, status } = fail(
      "MENTOR_NOT_CONFIGURED",
      "PdfMentor не подключён: задайте PDFMENTOR_URL",
      503,
      rid,
    );
    return c.json(body, status as 503);
  }

  const limit = await rateLimit(c.env, `mentor:sso:${user.id}`, 30, 60);
  if (!limit.allowed) {
    const { body, status } = fail("RATE_LIMITED", "Слишком много попыток входа в PdfMentor", 429, rid);
    return c.json(body, status as 429);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await c.req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const intent = normalizeIntent(payload.intent);
  const code = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + MENTOR_CODE_TTL_SECONDS * 1000).toISOString();

  const durable = await storeMentorCode(
    c.env,
    code,
    {
      user_id: user.id,
      email: String(user.email ?? ""),
      email_verified: Boolean(user.email_confirmed_at || user.confirmed_at),
      name: String((user.user_metadata as Record<string, unknown> | undefined)?.full_name ?? ""),
      intent,
      expires_at: expiresAt,
    },
    MENTOR_CODE_TTL_SECONDS,
  );

  // Код — не секрет навсегда, но в лог он попадать не должен.
  console.log("[mentor:sso] issued", { requestId: rid, intent, durable });

  return c.json(
    ok(
      {
        code,
        intent,
        expires_in: MENTOR_CODE_TTL_SECONDS,
        expires_at: expiresAt,
        mentor_url: mentorUrl,
        // PdfMentor принимает код POST-формой: query-параметр с кодом запрещён.
        form_action: `${mentorUrl}/login/sso`,
        storage: durable ? "redis" : "memory",
      },
      rid,
    ),
  );
});

/**
 * POST /mentor/sso/exchange — обмен кода на личность пользователя.
 * Вызывается только сервером PdfMentor и только с HMAC-подписью.
 */
mentor.post("/sso/exchange", async (c) => {
  const rid = requestId();

  const limit = await rateLimit(c.env, `mentor:exchange:${clientIp(c)}`, 60, 60);
  if (!limit.allowed) {
    const { body, status } = fail("RATE_LIMITED", "Слишком много обменов кода", 429, rid);
    return c.json(body, status as 429);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await c.req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const code = String(payload.code ?? "").trim();
  if (!code) {
    const { body, status } = fail("VALIDATION_ERROR", "Token required", 422, rid);
    return c.json(body, status as 422);
  }

  const verification = await verifyBridgeSignature({
    secret: c.env.BRIDGE_SECRET,
    code,
    timestamp: c.req.header(BRIDGE_TIMESTAMP_HEADER),
    signature: c.req.header(BRIDGE_SIGNATURE_HEADER),
  });
  if (!verification.ok) {
    console.warn("[mentor:sso] exchange rejected", {
      requestId: rid,
      reason: verification.reason,
      client: c.req.header(BRIDGE_CLIENT_HEADER) ?? "unknown",
    });
    const { body, status } = fail("UNAUTHORIZED", "Подпись бриджа не принята", 401, rid);
    return c.json(body, status as 401);
  }

  const entry = await consumeMentorCode(c.env, code);
  if (!entry) {
    const { body, status } = fail("NOT_FOUND", "Token expired or invalid", 401, rid);
    return c.json(body, status as 401);
  }

  console.log("[mentor:sso] exchanged", { requestId: rid, intent: entry.intent, client: BRIDGE_CLIENT });

  return c.json(
    ok(
      {
        user_id: entry.user_id,
        email: entry.email,
        email_verified: entry.email_verified,
        name: entry.name,
        intent: entry.intent,
        expires_at: entry.expires_at,
        provider: "medbiohim",
      },
      rid,
    ),
  );
});

/**
 * POST /mentor/context — учебный контекст для PdfMentor: предмет, тема,
 * слабые места. Отдаём только то, что нужно конкретной учебной операции.
 */
mentor.post("/context", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  let payload: Record<string, unknown> = {};
  try {
    payload = (await c.req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return c.json(
    ok(
      {
        provider: "medbiohim",
        user_id: user.id,
        context: {
          subject_id: payload.subject_id ?? null,
          subject_slug: payload.subject_slug ?? null,
          topic_id: payload.topic_id ?? null,
          topic_title: payload.topic_title ?? null,
          weak_concepts: Array.isArray(payload.weak_concepts) ? payload.weak_concepts : [],
          learning_goal: String(payload.learning_goal ?? "general").slice(0, 200),
        },
        supported_actions: ["highlight", "explain", "route", "search"],
      },
      rid,
    ),
  );
});

// Document Bridge: чтение файлов MEDBIOHIM сервером PdfMentor (HMAC, без сессии).
mentor.route("/", documents);

export default mentor;
