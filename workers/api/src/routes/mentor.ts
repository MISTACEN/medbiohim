/**
 * Bridge API — интеграция PdfMentor в MEDBIOHIM
 *
 * Создаёт одноразовый SSO-токен для бесшовного перехода в PdfMentor.
 * PdfMentor обменивает токен на сессию, MEDBIOHIM не передаёт пароль напрямую.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import type { Env } from "../env";

const mentor = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Временное хранилище одноразовых SSO-токенов (в production — Redis)
const tokenCache = new Map<string, { userId: string; email: string; name: string; expiresAt: number }>();

/**
 * POST /mentor/sso
 * Создаёт одноразовый SSO-токен для текущего пользователя MEDBIOHIM.
 * Токен живёт 60 секунд. PdfMentor обращается к POST /api/mentor/sso/exchange.
 */
mentor.post("/sso", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");

  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 60_000;
  const userData = user as any;
  tokenCache.set(token, {
    userId: user.id,
    email: userData.email || "",
    name: userData.name || "",
    expiresAt,
  });

  // Автоочистка через 70 секунд
  setTimeout(() => tokenCache.delete(token), 70_000);

  return c.json(ok({
    token,
    expires_in: 60,
    mentor_url: `http://localhost:3002/login?medbiohim_sso=${token}`,
    expires_at: new Date(expiresAt).toISOString(),
  }, rid));
});

/**
 * POST /mentor/sso/exchange
 * Обменивает SSO-токен на данные пользователя (внутренний, вызывается PdfMentor). 
 */
mentor.post("/sso/exchange", async (c) => {
  const rid = requestId();
  let body: any = {};
  try { body = await c.req.json(); } catch { body = {}; }
  const token = String(body.token || "").trim();
  if (!token) {
    const { body: res, status } = fail("VALIDATION_ERROR", "Token required", 422, rid);
    return c.json(res, status as 422);
  }
  const entry = tokenCache.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    tokenCache.delete(token);
    const { body: res, status } = fail("NOT_FOUND", "Token expired or invalid", 401, rid);
    return c.json(res, status as 401);
  }
  tokenCache.delete(token); // одноразовый
  return c.json(ok({
    user_id: entry.userId,
    email: entry.email,
    name: entry.name,
    provider: "medbiohim",
  }, rid));
});

export default mentor;
