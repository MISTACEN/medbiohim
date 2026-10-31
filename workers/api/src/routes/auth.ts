import { Hono } from "hono";
import type { Env } from "../env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAnonClient, createServiceClient, createUserClient, verifyBearerUser } from "../lib/supabase";
import { isHttpsUrl, requireEnv } from "../env";
import { rateLimit } from "../lib/redis";
import { ok, fail, requestId } from "../lib/response";
import { hasRemoteVerifier, validateTelegramInitData, verifyTelegramInitDataRemote } from "../lib/telegram-initdata";
import {
  hasWidgetVerifier,
  validateTelegramLoginWidget,
  verifyTelegramLoginWidgetRemote,
} from "../lib/telegram-widget";
import { isPwnedPassword } from "../lib/password-guard";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const MAX_BODY = 16 * 1024;

async function readJson<T>(c: { req: { raw: Request } }): Promise<T | null> {
  const raw = await c.req.raw.clone().arrayBuffer();
  if (raw.byteLength > MAX_BODY) return null;
  try {
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  } catch {
    return null;
  }
}

/**
 * Клиент с заголовками реального пользователя: GoTrue записывает User-Agent
 * и IP из запроса в сессию. Без пересылки все устройства выглядят как
 * Cloudflare-эгресс и «Неизвестное устройство».
 */
function clientWithRealIdentity(c: { req: { header: (n: string) => string | undefined } }, env: Env): SupabaseClient {
  const url = requireEnv(env, "SUPABASE_URL");
  const anon = requireEnv(env, "SUPABASE_ANON_KEY");
  if (!isHttpsUrl(url)) throw new Error("SUPABASE_URL must be HTTPS");
  const userAgent = c.req.header("user-agent") || "unknown";
  const ip = clientIp(c);
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: {
        "user-agent": userAgent,
        "x-forwarded-for": ip,
        "x-real-ip": ip,
      },
    },
  });
}

function clientIp(c: { req: { header: (n: string) => string | undefined } }): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function normalizeSession(session: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: { id?: string; email?: string; app_metadata?: Record<string, unknown> };
}) {
  return {
    access_token: session.access_token ?? null,
    refresh_token: session.refresh_token ?? null,
    expires_in: session.expires_in ?? null,
    expires_at: session.expires_at ?? null,
    token_type: session.token_type ?? "bearer",
    user: session.user
      ? {
          id: session.user.id,
          email: session.user.email,
          role: (session.user.app_metadata as { role?: string } | undefined)?.role ?? null,
        }
      : null,
  };
}

type TelegramSession =
  | { ok: true; session: ReturnType<typeof normalizeSession> }
  | { ok: false; code: string; message: string; status: number };

/**
 * Shared tail of both Telegram login routes (Mini App initData and the website
 * Login Widget): a verified Telegram identity is resolved to the linked account
 * and a Supabase session is minted server-side — the magic-link token is
 * consumed in-process and never emailed.
 */
async function mintTelegramSession(
  service: SupabaseClient,
  env: Env,
  telegramUserId: number,
  rid: string
): Promise<TelegramSession> {
  const { data: account, error: accountError } = await service
    .from("telegram_accounts")
    .select("user_id")
    .eq("telegram_user_id", String(telegramUserId))
    .maybeSingle();
  if (accountError) {
    console.error("[auth:telegram-mint]", { stage: "account_lookup", code: accountError.code, requestId: rid });
    return { ok: false, code: "TELEGRAM_LOGIN_UNAVAILABLE", message: "Вход через Telegram временно недоступен", status: 503 };
  }

  const linkedUserId = account?.user_id ? String(account.user_id) : "";
  if (!linkedUserId) {
    return {
      ok: false,
      code: "TELEGRAM_NOT_LINKED",
      message: "Telegram не привязан. Привяжите аккаунт в Настройках → Telegram.",
      status: 409,
    };
  }

  const { data: adminUser, error: adminUserError } = await service.auth.admin.getUserById(linkedUserId);
  if (adminUserError || !adminUser?.user) {
    console.error("[auth:telegram-mint]", { stage: "user_lookup", code: adminUserError?.code, requestId: rid });
    return { ok: false, code: "AUTH_UPSTREAM", message: "Сервис авторизации временно недоступен", status: 503 };
  }

  const email = adminUser.user.email?.trim();
  if (!email) {
    // A profile without an email cannot receive a server-issued session.
    return {
      ok: false,
      code: "TELEGRAM_NO_EMAIL",
      message: "Для профиля не задан email. Обратитесь в поддержку.",
      status: 409,
    };
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("[auth:telegram-mint]", { stage: "generate_link", code: linkError?.code, requestId: rid });
    return { ok: false, code: "AUTH_UPSTREAM", message: "Сервис авторизации временно недоступен", status: 503 };
  }

  const anon = createAnonClient(env);
  const { data: otp, error: otpError } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpError || !otp.session) {
    console.error("[auth:telegram-mint]", { stage: "verify_otp", code: otpError?.code, requestId: rid });
    return { ok: false, code: "AUTH_UPSTREAM", message: "Сервис авторизации временно недоступен", status: 503 };
  }

  return { ok: true, session: normalizeSession(otp.session) };
}

/** POST /api/v1/auth/login */
auth.post("/login", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `auth:login:${ip}`, 20, 60);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много попыток входа", 429, rid);
    return c.json(body, status as 429);
  }

  const body = await readJson<{ email?: string; password?: string }>(c);
  if (!body?.email || !body?.password) {
    const { body: b, status } = fail("VALIDATION", "Укажите email и пароль", 400, rid);
    return c.json(b, status as 400);
  }

  try {
    const client = clientWithRealIdentity(c, c.env);
    const { data, error } = await client.auth.signInWithPassword({
      email: String(body.email).trim().toLowerCase(),
      password: String(body.password),
    });
    if (error || !data.session) {
      const authMessage = String(error?.message || "").toLowerCase();
      if (error?.code === "email_not_confirmed" || authMessage.includes("email not confirmed")) {
        const { body: b, status } = fail("EMAIL_NOT_CONFIRMED", "Подтвердите email по ссылке из письма Supabase", 401, rid);
        return c.json(b, status as 401);
      }
      const { body: b, status } = fail("INVALID_CREDENTIALS", "Неверный email или пароль", 401, rid);
      return c.json(b, status as 401);
    }
    const session = normalizeSession(data.session);
    // Keep tokens at the top level for the existing frontend client, while preserving the normalized session object.
    return c.json(ok({ ...session, session }, rid));
  } catch {
    const { body: b, status } = fail("AUTH_UPSTREAM", "Сервис авторизации временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }
});

/** POST /api/v1/auth/register */
auth.post("/register", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `auth:register:${ip}`, 10, 3600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много регистраций", 429, rid);
    return c.json(body, status as 429);
  }

  const body = await readJson<{ email?: string; password?: string; name?: string; full_name?: string }>(c);
  if (!body?.email || !body?.password) {
    const { body: b, status } = fail("VALIDATION", "Укажите email и пароль", 400, rid);
    return c.json(b, status as 400);
  }
  if (String(body.password).length < 8) {
    const { body: b, status } = fail("VALIDATION", "Пароль не короче 8 символов", 400, rid);
    return c.json(b, status as 400);
  }
  // Leaked password protection (замена Pro-фичи Supabase): пароль из утечек
  // отклоняется до создания аккаунта. HIBP недоступен — регистрация идёт дальше.
  const pwned = await isPwnedPassword(String(body.password));
  if (pwned === true) {
    const { body: b, status } = fail("PASSWORD_PWNED", "Этот пароль найден в базах утечек — выберите другой", 422, rid);
    return c.json(b, status as 422);
  }

  try {
    const client = clientWithRealIdentity(c, c.env);
    const { data, error } = await client.auth.signUp({
      email: String(body.email).trim().toLowerCase(),
      password: String(body.password),
      options: {
        data: { name: (body.name || body.full_name) ? String(body.name || body.full_name).trim().slice(0, 120) : undefined },
        emailRedirectTo: `${(c.env.APP_ORIGIN || "").replace(/\/$/, "")}/auth/callback`,
      },
    });
    if (error) {
      const { body: b, status } = fail("REGISTER_FAILED", "Не удалось зарегистрироваться", 400, rid);
      return c.json(b, status as 400);
    }
    const needsConfirm = !data.session;
    return c.json(
      ok(
        {
          session: data.session ? normalizeSession(data.session) : null,
          needs_email_confirm: needsConfirm,
          user: data.user ? { id: data.user.id, email: data.user.email } : null,
        },
        rid
      )
    );
  } catch {
    const { body: b, status } = fail("AUTH_UPSTREAM", "Сервис авторизации временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }
});

/** POST /api/v1/auth/refresh */
auth.post("/refresh", async (c) => {
  const rid = requestId();
  const body = await readJson<{ refresh_token?: string }>(c);
  if (!body?.refresh_token) {
    const { body: b, status } = fail("VALIDATION", "Нужен refresh_token", 400, rid);
    return c.json(b, status as 400);
  }

  try {
    const client = createAnonClient(c.env);
    const { data, error } = await client.auth.refreshSession({
      refresh_token: String(body.refresh_token),
    });
    if (error || !data.session) {
      const { body: b, status } = fail("INVALID_REFRESH", "Сессия истекла", 401, rid);
      return c.json(b, status as 401);
    }
    return c.json(ok({ session: normalizeSession(data.session), access_token: data.session.access_token, refresh_token: data.session.refresh_token }, rid));
  } catch {
    const { body: b, status } = fail("AUTH_UPSTREAM", "Сервис авторизации временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }
});

/** POST /api/v1/auth/logout */
auth.post("/logout", async (c) => {
  const rid = requestId();
  const verified = await verifyBearerUser(c.env, c.req.header("Authorization"));
  if (!verified) {
    return c.json(ok({ logged_out: true }, rid));
  }
  try {
    const client = createUserClient(c.env, verified.accessToken);
    await client.auth.signOut();
  } catch {
    // best-effort
  }
  return c.json(ok({ logged_out: true }, rid));
});

/** POST /api/v1/auth/recover */
auth.post("/recover", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `auth:recover:${ip}`, 5, 3600);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много запросов", 429, rid);
    return c.json(body, status as 429);
  }

  const body = await readJson<{ email?: string }>(c);
  if (!body?.email) {
    const { body: b, status } = fail("VALIDATION", "Укажите email", 400, rid);
    return c.json(b, status as 400);
  }

  try {
    const client = createAnonClient(c.env);
    const origin = (c.env.APP_ORIGIN || "").replace(/\/$/, "") || "https://medbiohim.vercel.app";
    await client.auth.resetPasswordForEmail(String(body.email).trim().toLowerCase(), {
      redirectTo: `${origin}/auth/callback`,
    });
  } catch {
    // still return sent:true to avoid email enumeration
  }
  return c.json(ok({ sent: true }, rid));
});

/**
 * POST /api/v1/auth/telegram/webapp — silent Mini App login.
 *
 * The Telegram identity is trusted only after a spec-correct initData signature
 * check. A verified Telegram user still needs an explicit account link; the
 * session itself is issued server-side and never derived from initData.
 */
auth.post("/telegram/webapp", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `auth:telegram-webapp:${ip}`, 20, 60);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много попыток входа", 429, rid);
    return c.json(body, status as 429);
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN?.trim();
  const canVerifyRemotely = hasRemoteVerifier(c.env);
  if (!botToken && !canVerifyRemotely) {
    const { body, status } = fail("TELEGRAM_NOT_CONFIGURED", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  const body = await readJson<{ init_data?: string }>(c);
  if (!body || typeof body.init_data !== "string" || !body.init_data) {
    const { body: b, status } = fail("VALIDATION", "Нужен init_data", 400, rid);
    return c.json(b, status as 400);
  }

  // Local crypto when this Worker owns the token; otherwise delegate to the bot
  // Worker, which does. The bot token never has to be copied here.
  const verification = botToken
    ? await validateTelegramInitData(body.init_data, botToken)
    : await verifyTelegramInitDataRemote(body.init_data, c.env);
  if (!verification.ok) {
    if (!botToken && (verification.error === "internal_not_configured" || verification.error === "internal_unavailable")) {
      // An infrastructure problem, not the caller's credentials — never report it
      // as a signature failure.
      const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
      return c.json(b, status as 503);
    }
    // Deliberately generic: never tell a forger which check failed.
    const { body: b, status } = fail("INVALID_INIT_DATA", "Не удалось подтвердить данные Telegram", 401, rid);
    return c.json(b, status as 401);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }

  try {
    const minted = await mintTelegramSession(service, c.env, verification.user.id, rid);
    if (!minted.ok) {
      const { body: b, status } = fail(minted.code, minted.message, minted.status, rid);
      return c.json(b, status as 409);
    }
    // Same envelope as /login so the shared frontend client keeps working.
    return c.json(ok({ ...minted.session, session: minted.session }, rid));
  } catch (error) {
    console.error("[auth:telegram-webapp]", {
      stage: "unhandled",
      error: error instanceof Error ? error.name : "unknown",
      requestId: rid,
    });
    const { body: b, status } = fail("AUTH_UPSTREAM", "Сервис авторизации временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }
});

/**
 * GET /api/v1/auth/telegram/config — the only public value the Login Widget
 * needs: the bot username the widget is rendered for. No tokens, no ids.
 */
auth.get("/telegram/config", (c) => {
  const rid = requestId();
  const botUsername = c.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!botUsername) {
    const { body, status } = fail("TELEGRAM_NOT_CONFIGURED", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
  return c.json(ok({ bot_username: botUsername }, rid));
});

/**
 * POST /api/v1/auth/telegram/widget — "Sign in with Telegram" on the website.
 * The widget posts its signed callback payload; the identity is trusted only
 * after a spec-correct signature check — locally when this Worker holds the
 * bot token, otherwise through the bot Worker (same trust model as initData).
 */
auth.post("/telegram/widget", async (c) => {
  const rid = requestId();
  const ip = clientIp(c);
  const rl = await rateLimit(c.env, `auth:telegram-widget:${ip}`, 20, 60);
  if (!rl.allowed) {
    const { body, status } = fail("RATE_LIMIT", "Слишком много попыток входа", 429, rid);
    return c.json(body, status as 429);
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN?.trim();
  const canVerifyRemotely = hasWidgetVerifier(c.env);
  if (!botToken && !canVerifyRemotely) {
    const { body, status } = fail("TELEGRAM_NOT_CONFIGURED", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }

  const body = await readJson<Record<string, unknown>>(c);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const { body: b, status } = fail("VALIDATION", "Нужен payload виджета", 400, rid);
    return c.json(b, status as 400);
  }

  const verification = botToken
    ? await validateTelegramLoginWidget(body, botToken)
    : await verifyTelegramLoginWidgetRemote(body, c.env);
  if (!verification.ok) {
    if (!botToken && (verification.error === "internal_not_configured" || verification.error === "internal_unavailable")) {
      // An infrastructure problem, not the caller's credentials — never report it
      // as a signature failure.
      const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
      return c.json(b, status as 503);
    }
    // Deliberately generic: never tell a forger which check failed.
    const { body: b, status } = fail("INVALID_INIT_DATA", "Не удалось подтвердить данные Telegram", 401, rid);
    return c.json(b, status as 401);
  }

  const service = createServiceClient(c.env);
  if (!service) {
    const { body: b, status } = fail("TELEGRAM_LOGIN_UNAVAILABLE", "Вход через Telegram временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }

  try {
    const minted = await mintTelegramSession(service, c.env, verification.user.id, rid);
    if (!minted.ok) {
      const { body: b, status } = fail(minted.code, minted.message, minted.status, rid);
      return c.json(b, status as 409);
    }
    // Same envelope as /login so the shared frontend client keeps working.
    return c.json(ok({ ...minted.session, session: minted.session }, rid));
  } catch (error) {
    console.error("[auth:telegram-widget]", {
      stage: "unhandled",
      error: error instanceof Error ? error.name : "unknown",
      requestId: rid,
    });
    const { body: b, status } = fail("AUTH_UPSTREAM", "Сервис авторизации временно недоступен", 503, rid);
    return c.json(b, status as 503);
  }
});

/** GET /api/v1/auth/me — profile bundle */
auth.get("/me", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");

  try {
    const [profileRes, rolesRes, groupsRes] = await Promise.all([
      supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("roles(code,name)").eq("user_id", user.id).limit(25),
      supabase
        .from("group_memberships")
        .select("group_id,role_in_group,groups(id,name,specialty_slug,course_number,is_active)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(50),
    ]);

    const roles = (rolesRes.data || []).flatMap((row: any) => {
      const r = row?.roles;
      const list = Array.isArray(r) ? r : r ? [r] : [];
      return list.map((x: any) => String(x?.code || "")).filter(Boolean);
    });

    const groups = (groupsRes.data || []).map((row: any) => {
      const g = Array.isArray(row.groups) ? row.groups[0] : row.groups;
      if (!g || g.is_active === false) return null;
      return {
        id: g.id ?? row.group_id,
        name: g.name,
        specialty_slug: g.specialty_slug,
        course: g.course_number ?? null,
        course_number: g.course_number ?? null,
        semester: profileRes.data?.semester ?? null,
        membership_role: row.role_in_group,
      };
    }).filter(Boolean);

    const current = groups[0] || null;

    return c.json(
      ok(
        {
          user: {
            id: user.id,
            email: user.email,
            ...(profileRes.data || {}),
          },
          roles,
          groups,
          current_group: current,
          course: current?.course ?? null,
          semester: current?.semester ?? null,
        },
        rid
      )
    );
  } catch {
    return c.json(
      ok(
        {
          user: { id: user.id, email: user.email },
          roles: [],
          groups: [],
          current_group: null,
          course: null,
          semester: null,
        },
        rid
      )
    );
  }
});

export default auth;
