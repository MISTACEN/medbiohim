import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const settings = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

async function readPreferences(c: any) {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("user_id,preferences,created_at,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[settings:read]", { code: error.code, message: error.message, requestId: rid });
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить настройки", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok(data || { user_id: user.id, preferences: {}, created_at: null, updated_at: null }, rid));
  } catch (error) {
    console.error("[settings:read]", { error: String(error), requestId: rid });
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось загрузить настройки", 503, rid);
    return c.json(body, status as 503);
  }
}

async function readAccount(c: any) {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const [{ data: profile, error: profileError }, { data: prefRow, error: prefError }] = await Promise.all([
      supabase.from("users").select("id,full_name,avatar_url,course_number,semester").eq("id", user.id).maybeSingle(),
      supabase.from("user_preferences").select("preferences").eq("user_id", user.id).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (prefError) throw prefError;

    // В продукте остаются только почта, Google и Telegram. Устаревшие
    // идентичности (VK, Яндекс, GitHub, Discord, телефон) не показываем.
    const allowedProviders = new Set(["email", "google", "custom:telegram"]);
    const identities = (Array.isArray(user.identities) ? user.identities : [])
      .filter((identity: any) => allowedProviders.has(String(identity.provider || "")));
    const linkedIdentities = identities.map((identity: any) => {
      const provider = String(identity.provider || "unknown");
      const identityData = identity.identity_data && typeof identity.identity_data === "object" ? identity.identity_data : {};
      const labels: Record<string, string> = { email: "Почта", google: "Google", "custom:telegram": "Telegram" };
      return {
        id: String(identity.identity_id || identity.id || ""),
        provider,
        provider_label: labels[provider] || provider,
        email: identityData.email || identity.email || null,
        name: identityData.full_name || identityData.name || identityData.preferred_username || null,
        can_unlink: identities.length > 1,
        last_sign_in_at: identity.last_sign_in_at || null,
      };
    });
    const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
    return c.json(ok({
      user: {
        id: user.id,
        email: user.email || null,
        email_confirmed_at: user.email_confirmed_at || null,
        phone: user.phone || null,
        full_name: profile?.full_name || metadata.full_name || metadata.name || null,
        avatar_url: profile?.avatar_url || metadata.avatar_url || null,
        course_number: profile?.course_number ?? null,
        semester: profile?.semester ?? null,
        created_at: user.created_at || null,
        last_sign_in_at: user.last_sign_in_at || null,
      },
      identities: linkedIdentities,
      providers_available: [
        { id: "email", label: "Почта / пароль", region: "any", enabled: true, linkable: false },
        { id: "google", label: "Google", region: "global", enabled: true, linkable: true },
        { id: "custom:telegram", label: "Telegram", region: "global", enabled: true, linkable: false },
      ],
      preferences: prefRow?.preferences || {},
      sync: {
        account_id: user.id,
        note: "Прогресс, карточки повторения, избранное, заметки и сессии привязаны к единому ID пользователя.",
        scopes: ["progress", "srs_cards", "favorites", "notes", "sessions", "homework"],
      },
    }, rid));
  } catch (error) {
    console.error("[settings:account]", { error: String(error), requestId: rid });
    const { body, status } = fail("SETTINGS_ERROR", "Настройки временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
}

async function savePreferences(c: any) {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const { body, status } = fail("VALIDATION_ERROR", "Ожидался объект настроек", 400, rid);
    return c.json(body, status as 400);
  }
  const raw = payload as Record<string, unknown>;
  const preferences = raw.preferences ?? raw;
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    const { body, status } = fail("VALIDATION_ERROR", "Поле preferences должно быть объектом", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    const { data, error } = await supabase.from("user_preferences")
      .upsert({ user_id: user.id, preferences, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("user_id,preferences,created_at,updated_at").single();
    if (error) {
      console.error("[settings:write]", { code: error.code, message: error.message, requestId: rid });
      const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить настройки", 503, rid);
      return c.json(body, status as 503);
    }
    return c.json(ok({ preferences: data.preferences, updated_at: data.updated_at }, rid));
  } catch (error) {
    console.error("[settings:write]", { error: String(error), requestId: rid });
    const { body, status } = fail("DB_UNAVAILABLE", "Не удалось сохранить настройки", 503, rid);
    return c.json(body, status as 503);
  }
}

async function updateProfile(c: any) {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const { body, status } = fail("VALIDATION_ERROR", "Ожидался объект профиля", 400, rid);
    return c.json(body, status as 400);
  }

  const input = payload as Record<string, unknown>;
  const patch: Record<string, string> = {};
  if (Object.prototype.hasOwnProperty.call(input, "full_name")) {
    if (typeof input.full_name !== "string" || input.full_name.trim().length > 120) {
      const { body, status } = fail("VALIDATION_ERROR", "Имя должно быть строкой до 120 символов", 400, rid);
      return c.json(body, status as 400);
    }
    patch.full_name = input.full_name.trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, "avatar_url")) {
    if (typeof input.avatar_url !== "string" || input.avatar_url.trim().length > 2048) {
      const { body, status } = fail("VALIDATION_ERROR", "Некорректный адрес аватара", 400, rid);
      return c.json(body, status as 400);
    }
    const avatar = input.avatar_url.trim();
    if (avatar) {
      try {
        if (new URL(avatar).protocol !== "https:") throw new Error("https required");
      } catch {
        const { body, status } = fail("VALIDATION_ERROR", "Аватар должен иметь HTTPS URL", 400, rid);
        return c.json(body, status as 400);
      }
    }
    patch.avatar_url = avatar;
  }
  const email = typeof input.email === "string" ? input.email.trim() : undefined;
  if (input.email !== undefined && (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный email", 400, rid);
    return c.json(body, status as 400);
  }
  if (Object.keys(patch).length === 0 && !email) {
    const { body, status } = fail("VALIDATION_ERROR", "Нет полей для обновления", 400, rid);
    return c.json(body, status as 400);
  }

  try {
    // Update email through Supabase Auth so its confirmation/security flow remains authoritative.
    if (email && email.toLowerCase() !== String(user.email || "").toLowerCase()) {
      const authUrl = new URL("/auth/v1/user", c.env.SUPABASE_URL);
      const authResponse = await fetch(authUrl, {
        method: "PUT",
        headers: {
          apikey: c.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${c.get("accessToken")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(10000),
      });
      if (!authResponse.ok) {
        const { body, status } = fail("PROFILE_UPDATE_FAILED", "Не удалось обновить email. Проверьте адрес и подтверждение в письме.", 422, rid);
        return c.json(body, status as 422);
      }
      try {
        const authUser = await authResponse.json() as Record<string, unknown>;
        c.set("user", { ...user, ...authUser } as typeof user);
      } catch {
        // Supabase Auth may return an empty success body; the profile update itself remains valid.
      }
    }

    if (Object.keys(patch).length) {
      const { data: updatedProfile, error } = await supabase.from("users").update(patch).eq("id", user.id).select("id").maybeSingle();
      if (error || !updatedProfile) {
        console.error("[settings:profile]", { code: error.code, message: error.message, requestId: rid });
        const { body, status } = fail("PROFILE_UPDATE_FAILED", "Не удалось сохранить профиль", 503, rid);
        return c.json(body, status as 503);
      }
    }
    return await readAccount(c);
  } catch (error) {
    console.error("[settings:profile]", { error: String(error), requestId: rid });
    const { body, status } = fail("PROFILE_UPDATE_FAILED", "Не удалось обновить профиль", 503, rid);
    return c.json(body, status as 503);
  }
}

async function changePassword(c: any) {
  const rid = requestId();
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
  const password = typeof input.password === "string" ? input.password : "";
  // Владение устройством больше не равно владению аккаунтом: смена пароля требует
  // текущий пароль, иначе украденный access-токен давал полный контроль навсегда.
  const currentPassword = typeof input.current_password === "string" ? input.current_password : "";
  if (password.length < 8 || password.length > 1024) {
    const { body, status } = fail("VALIDATION_ERROR", "Пароль должен содержать не менее 8 символов", 400, rid);
    return c.json(body, status as 400);
  }
  if (!currentPassword) {
    const { body, status } = fail("VALIDATION_ERROR", "Укажите текущий пароль", 400, rid);
    return c.json(body, status as 400);
  }
  const user = c.get("user");
  const email = String(user?.email || "").trim();
  if (!email) {
    const { body, status } = fail("VALIDATION_ERROR", "У аккаунта нет email для подтверждения пароля", 400, rid);
    return c.json(body, status as 400);
  }
  try {
    // 1. Подтверждение владения: текущий пароль проверяет сам Supabase Auth.
    const verify = await fetch(new URL("/auth/v1/token?grant_type=password", c.env.SUPABASE_URL), {
      method: "POST",
      headers: { apikey: c.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: currentPassword }),
      signal: AbortSignal.timeout(10000),
    });
    if (!verify.ok) {
      const { body, status } = fail("INVALID_CURRENT_PASSWORD", "Текущий пароль указан неверно", 401, rid);
      return c.json(body, status as 401);
    }
    // 2. Смена пароля под access-токеном пользователя.
    const response = await fetch(new URL("/auth/v1/user", c.env.SUPABASE_URL), {
      method: "PUT",
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.get("accessToken")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const { body, status } = fail("PASSWORD_CHANGE_FAILED", "Supabase Auth не принял изменение пароля", 422, rid);
      return c.json(body, status as 422);
    }
    // 3. Чужие refresh-токены больше не должны работать. Отзыв — best effort:
    // он требует service-ключа и не должен ломать саму смену пароля.
    let sessionsRevoked = false;
    if (c.env.SUPABASE_SERVICE_ROLE_KEY && user?.id) {
      try {
        const revoke = await fetch(new URL(`/auth/v1/admin/users/${encodeURIComponent(String(user.id))}/logout`, c.env.SUPABASE_URL), {
          method: "POST",
          headers: {
            apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000),
        });
        sessionsRevoked = revoke.ok;
        if (!revoke.ok) console.warn("[settings:password] сессии не отозваны", { status: revoke.status, requestId: rid });
      } catch (revokeError) {
        console.warn("[settings:password] отзыв сессий не удался", { error: String(revokeError), requestId: rid });
      }
    }
    return c.json(ok({ changed: true, sessions_revoked: sessionsRevoked }, rid));
  } catch (error) {
    console.error("[settings:password]", { error: String(error), requestId: rid });
    const { body, status } = fail("PASSWORD_CHANGE_FAILED", "Не удалось изменить пароль", 503, rid);
    return c.json(body, status as 503);
  }
}

async function startIdentityLink(c: any) {
  const rid = requestId();
  let payload: unknown;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
  const provider = typeof input.provider === "string" ? input.provider.trim().toLowerCase() : "";
  const allowedProviders = new Set(["google"]);
  if (!allowedProviders.has(provider)) {
    const { body, status } = fail("VALIDATION_ERROR", "Провайдер не поддерживается", 400, rid);
    return c.json(body, status as 400);
  }
  const configuredOrigins = (c.env.CORS_ORIGINS || c.env.APP_ORIGIN || "")
    .split(",").map((value: string) => value.trim()).filter(Boolean);
  const fallbackOrigin = c.env.APP_ORIGIN || "https://medbiohim.vercel.app";
  let redirectTo = fallbackOrigin;
  if (typeof input.redirect_to === "string" && input.redirect_to.trim()) {
    try {
      const requested = new URL(input.redirect_to.trim());
      const allowed = configuredOrigins.some((origin: string) => {
        try { return new URL(origin).origin === requested.origin; } catch { return false; }
      }) || requested.origin === new URL(fallbackOrigin).origin;
      if (requested.protocol !== "https:" && requested.hostname !== "localhost") throw new Error("HTTPS required");
      if (!allowed) throw new Error("Origin not allowed");
      redirectTo = requested.toString();
    } catch {
      const { body, status } = fail("VALIDATION_ERROR", "Недопустимый адрес возврата", 400, rid);
      return c.json(body, status as 400);
    }
  }
  try {
    const response = await fetch(new URL("/auth/v1/user/identities/authorize", c.env.SUPABASE_URL), {
      method: "POST",
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.get("accessToken")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ provider, redirect_to: redirectTo, skip_http_redirect: true }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const url = typeof result.url === "string" ? result.url
      : typeof result.authorize_url === "string" ? result.authorize_url : null;
    if (!response.ok || !url) {
      const { body, status } = fail("IDENTITY_LINK_FAILED", "Не удалось начать привязку способа входа", 502, rid);
      return c.json(body, status as 502);
    }
    return c.json(ok({ url, provider, mode: "link" }, rid));
  } catch (error) {
    console.error("[settings:identity-link]", { error: String(error), requestId: rid });
    const { body, status } = fail("IDENTITY_LINK_FAILED", "Не удалось начать привязку способа входа", 503, rid);
    return c.json(body, status as 503);
  }
}

async function unlinkIdentity(c: any) {
  const rid = requestId();
  let payload: unknown;
  try { payload = await c.req.json(); } catch {
    const { body, status } = fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }
  const input = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown> : {};
  const identityId = typeof input.identity_id === "string" ? input.identity_id.trim() : "";
  const user = c.get("user");
  const identities = Array.isArray(user.identities) ? user.identities : [];
  if (!identityId || !identities.some((identity: any) => String(identity.identity_id || identity.id || "") === identityId)) {
    const { body, status } = fail("VALIDATION_ERROR", "Способ входа не найден у этого аккаунта", 400, rid);
    return c.json(body, status as 400);
  }
  if (identities.length <= 1) {
    const { body, status } = fail("LAST_IDENTITY", "Нельзя отвязать единственный способ входа", 409, rid);
    return c.json(body, status as 409);
  }
  try {
    const response = await fetch(new URL(`/auth/v1/user/identities/${encodeURIComponent(identityId)}`, c.env.SUPABASE_URL), {
      method: "DELETE",
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.get("accessToken")}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const { body, status } = fail("IDENTITY_UNLINK_FAILED", "Не удалось отвязать способ входа", 422, rid);
      return c.json(body, status as 422);
    }
    const refreshed = await fetch(new URL("/auth/v1/user", c.env.SUPABASE_URL), {
      headers: { apikey: c.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${c.get("accessToken")}` },
      signal: AbortSignal.timeout(10000),
    });
    if (refreshed.ok) {
      const freshUser = await refreshed.json().catch(() => null);
      if (freshUser && typeof freshUser === "object") c.set("user", { ...user, ...freshUser } as typeof user);
    }
    return await readAccount(c);
  } catch (error) {
    console.error("[settings:identity-unlink]", { error: String(error), requestId: rid });
    const { body, status } = fail("IDENTITY_UNLINK_FAILED", "Не удалось отвязать способ входа", 503, rid);
    return c.json(body, status as 503);
  }
}

async function readTelegramStatus(c: any) {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase.rpc("get_my_telegram_account");
    if (error) throw error;
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (result.status !== "ok") throw new Error("Telegram status RPC returned an unexpected result");
    return c.json(ok({ linked: result.linked === true, account: result.account || null }, rid));
  } catch (error) {
    console.error("[settings:telegram-status]", { error: String(error), requestId: rid });
    const { body, status } = fail("TELEGRAM_LINK_UNAVAILABLE", "Статус Telegram временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
}

async function startTelegramLink(c: any) {
  const rid = requestId();
  const supabase = c.get("supabase");
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const rawToken = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
    const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const { data, error } = await supabase.rpc("create_my_telegram_link_token", { p_token_hash: tokenHash });
    if (error) throw error;
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (result.status === "rate_limited") {
      const { body, status } = fail("RATE_LIMITED", "Слишком много попыток привязки. Попробуйте позже.", 429, rid);
      return c.json(body, status as 429);
    }
    if (result.status !== "created") throw new Error("Telegram link token RPC returned an unexpected result");
    const bot = String(c.env.TELEGRAM_BOT_USERNAME || "MEDBIOCHIM_bot").replace(/^@/, "").trim() || "MEDBIOCHIM_bot";
    return c.json(ok({
      url: `https://t.me/${encodeURIComponent(bot)}?start=link_${rawToken}`,
      expires_in_seconds: 600,
    }, rid));
  } catch (error) {
    console.error("[settings:telegram-link-start]", { error: String(error), requestId: rid });
    const { body, status } = fail("TELEGRAM_LINK_UNAVAILABLE", "Не удалось начать привязку Telegram", 503, rid);
    return c.json(body, status as 503);
  }
}

async function unlinkTelegramAccount(c: any) {
  const rid = requestId();
  const supabase = c.get("supabase");
  try {
    const { data, error } = await supabase.rpc("unlink_my_telegram_account");
    if (error) throw error;
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (result.status !== "ok") throw new Error("Telegram unlink RPC returned an unexpected result");
    return c.json(ok({ unlinked: result.unlinked === true }, rid));
  } catch (error) {
    console.error("[settings:telegram-unlink]", { error: String(error), requestId: rid });
    const { body, status } = fail("TELEGRAM_UNLINK_FAILED", "Не удалось отвязать Telegram", 503, rid);
    return c.json(body, status as 503);
  }
}

settings.get("/", requireAuth, readPreferences);
settings.get("/preferences", requireAuth, readPreferences);
settings.patch("/", requireAuth, savePreferences); // Backward-compatible settings endpoint.
settings.get("/account", requireAuth, readAccount);
settings.get("/telegram/status", requireAuth, readTelegramStatus);
settings.post("/telegram/link-start", requireAuth, startTelegramLink);
settings.post("/telegram/unlink", requireAuth, unlinkTelegramAccount);
settings.patch("/profile", requireAuth, updateProfile);
settings.post("/password", requireAuth, changePassword);
settings.post("/identities/link", requireAuth, startIdentityLink);
settings.post("/identities/unlink", requireAuth, unlinkIdentity);
settings.put("/preferences", requireAuth, savePreferences);

export default settings;
