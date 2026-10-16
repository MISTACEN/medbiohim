import { Hono } from "hono";
import type { Env } from "../env";
import { createAnonClient, createUserClient, verifyBearerUser } from "../lib/supabase";
import { rateLimit } from "../lib/redis";
import { ok, fail, requestId } from "../lib/response";
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
    const client = createAnonClient(c.env);
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

  try {
    const client = createAnonClient(c.env);
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
