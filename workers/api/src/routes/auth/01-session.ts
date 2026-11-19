import { ok, fail, requestId } from "../../lib/response";
import { createAnonClient, createUserClient, verifyBearerUser } from "../../lib/supabase";
import { rateLimit } from "../../lib/redis";
import { isPwnedPassword } from "../../lib/password-guard";
import { readJson, clientWithRealIdentity, clientIp, normalizeSession } from "./shared";

import type { AuthRouter } from "./types";

export function registerSessionRoutes(auth: AuthRouter) {
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
}
