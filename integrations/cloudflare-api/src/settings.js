/**
 * Account settings routes — mirrors backend AccountSettingsService
 * without local filesystem preference storage.
 * Preferences: optional Supabase table user_preferences (RLS by user_id);
 * falls back to defaults when the table is unavailable.
 */
import { authenticateSupabaseRequest } from "./supabase-auth.js";

const TIMEOUT_MS = 8000;
const fail = (status, code, message, extra = {}) => ({ ok: false, status, code, message, ...extra });
const PREF_DEFAULTS = {
  theme: "system",
  locale: "ru",
  notify_email: true,
  notify_telegram: false,
  notify_homework: true,
  notify_lectures: true,
  media_prefer_ru: true,
  trainer_layout: "top",
  updated_at: null,
};
const PREF_KEYS = Object.keys(PREF_DEFAULTS).filter((k) => k !== "updated_at");

function providerLabel(p) {
  const map = {
    email: "Почта / пароль",
    google: "Google",
    "custom:telegram": "Telegram",
  };
  return map[p] || p;
}

function availableProviders(env) {
  return [
    { id: "email", label: "Почта / пароль", region: "any", enabled: true, linkable: false },
    { id: "google", label: "Google", region: "global", enabled: env.OAUTH_GOOGLE_ENABLED !== "0", linkable: true },
    { id: "custom:telegram", label: "Telegram", region: "global", enabled: true, linkable: false },
  ];
}

async function authUserRequest(method, accessToken, env, body, fetcher) {
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) return fail(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured");
  let endpoint;
  try {
    endpoint = new URL("/auth/v1/user", baseUrl);
    if (endpoint.protocol !== "https:") return fail(503, "AUTH_NOT_CONFIGURED", "Supabase Auth must use HTTPS");
  } catch {
    return fail(503, "AUTH_NOT_CONFIGURED", "Supabase Auth URL is invalid");
  }
  try {
    const response = await fetcher(endpoint.toString(), {
      method,
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + accessToken,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let json = null;
    try { json = await response.json(); } catch { /* empty */ }
    return { ok: response.ok, status: response.status, json };
  } catch {
    return fail(502, "AUTH_UPSTREAM_ERROR", "Could not reach Supabase Auth");
  }
}

async function restRows(accessToken, env, table, params, init, fetcher) {
  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  const endpoint = new URL("/rest/v1/" + table, baseUrl);
  for (const [k, v] of Object.entries(params || {})) endpoint.searchParams.set(k, String(v));
  const response = await fetcher(endpoint.toString(), {
    ...init,
    headers: {
      apikey: anonKey,
      authorization: "Bearer " + accessToken,
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json", prefer: "return=representation" } : {}),
      ...(init?.headers || {}),
    },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error("rest failed");
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function bearer(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  return match ? match[1] : "";
}

async function loadPreferences(accessToken, userId, env, fetcher) {
  try {
    const rows = await restRows(accessToken, env, "user_preferences", {
      select: "preferences",
      user_id: "eq." + userId,
      limit: "1",
    }, {}, fetcher);
    const prefs = rows[0]?.preferences;
    if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
      return { ...PREF_DEFAULTS, ...prefs };
    }
  } catch {
    // Table may not exist or RLS may deny — defaults are fine.
  }
  return { ...PREF_DEFAULTS };
}

async function savePreferences(accessToken, userId, patch, env, fetcher) {
  const current = await loadPreferences(accessToken, userId, env, fetcher);
  for (const key of PREF_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) current[key] = patch[key];
  }
  current.updated_at = new Date().toISOString();
  try {
    await restRows(accessToken, env, "user_preferences", {
      on_conflict: "user_id",
      select: "user_id",
    }, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ user_id: userId, preferences: current, updated_at: current.updated_at }),
    }, fetcher);
    return { ok: true, data: current };
  } catch (error) {
    if (error?.status === 404 || error?.status === 403) {
      return fail(503, "PREFERENCES_UNAVAILABLE", "Хранение настроек на Worker ещё не подключено к таблице user_preferences");
    }
    return fail(503, "PREFERENCES_UNAVAILABLE", "Не удалось сохранить настройки");
  }
}

function buildAccount(user, prefs, env) {
  // Только поддерживаемые способы входа; устаревшие идентичности скрываем.
  const allowed = new Set(["email", "google", "custom:telegram"]);
  const identities = (Array.isArray(user.identities) ? user.identities : [])
    .filter((id) => id && allowed.has(String(id.provider || "")));
  const linked = identities.map((id) => {
    if (!id || typeof id !== "object") return null;
    const provider = String(id.provider || "unknown");
    const data = id.identity_data && typeof id.identity_data === "object" ? id.identity_data : {};
    return {
      id: String(id.identity_id || id.id || ""),
      provider,
      provider_label: providerLabel(provider),
      email: data.email ?? id.email ?? null,
      name: data.full_name ?? data.name ?? data.preferred_username ?? null,
      last_sign_in_at: id.last_sign_in_at ?? null,
      created_at: id.created_at ?? null,
      can_unlink: identities.length > 1,
    };
  }).filter(Boolean);
  const meta = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  return {
    user: {
      id: user.id ?? null,
      email: user.email ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      phone: user.phone ?? null,
      full_name: meta.full_name ?? meta.name ?? null,
      avatar_url: meta.avatar_url ?? null,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
    },
    identities: linked,
    providers_available: availableProviders(env),
    preferences: prefs,
    sync: {
      account_id: user.id ?? null,
      note: "Все данные (прогресс, SRS, избранное, сессии) привязаны к этому ID. Привязка Google или Telegram не создаёт второй аккаунт.",
      scopes: ["progress", "srs_cards", "favorites", "notes", "sessions", "homework"],
    },
  };
}

export async function getSupabaseAccountSettings(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  if (!token) return fail(401, "UNAUTHORIZED", "Нужен токен");
  const res = await authUserRequest("GET", token, env, null, fetcher);
  if (!res.ok || res.status === 401) return fail(401, "UNAUTHORIZED", "Недействительная сессия");
  if (!res.ok) return fail(503, "SETTINGS_ERROR", "Настройки временно недоступны");
  if (!res.json || typeof res.json.id !== "string") return fail(503, "SETTINGS_ERROR", "Настройки временно недоступны");
  const prefs = await loadPreferences(token, res.json.id, env, fetcher);
  return { ok: true, data: buildAccount(res.json, prefs, env) };
}

export async function updateSupabaseProfile(request, env, patch, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  if (!token) return fail(401, "UNAUTHORIZED", "Нужен токен");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return fail(422, "VALIDATION", "Нет полей для обновления");
  }
  const body = {};
  if (Object.prototype.hasOwnProperty.call(patch, "full_name")) {
    body.data = { ...(body.data || {}), full_name: String(patch.full_name || "").trim().slice(0, 160) };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "avatar_url")) {
    body.data = { ...(body.data || {}), avatar_url: String(patch.avatar_url || "").trim().slice(0, 2000) };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "email") && String(patch.email || "").trim()) {
    body.email = String(patch.email).trim().slice(0, 254);
  }
  if (!Object.keys(body).length) return fail(422, "VALIDATION", "Нет полей для обновления");

  const res = await authUserRequest("PUT", token, env, body, fetcher);
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.error_description || res.json?.error || "Ошибка обновления профиля";
    return fail(res.status >= 400 && res.status < 500 ? 422 : 502, "PROFILE_UPDATE_FAILED", String(msg));
  }
  return getSupabaseAccountSettings(request, env, fetcher);
}

export async function changeSupabasePassword(request, env, newPassword, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  if (!token) return fail(401, "UNAUTHORIZED", "Нужен токен");
  const pwd = String(newPassword || "");
  if (pwd.length < 8 || pwd.length > 1024) {
    return fail(422, "VALIDATION", "Пароль не короче 8 символов");
  }
  if (env.AUTH_PASSWORD_LIMITER && typeof env.AUTH_PASSWORD_LIMITER.limit === "function") {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.AUTH_PASSWORD_LIMITER.limit({ key: "pwd:" + ip });
    if (!success) return fail(429, "RATE_LIMIT", "Слишком много попыток");
  }
  const res = await authUserRequest("PUT", token, env, { password: pwd }, fetcher);
  if (!res.ok) {
    const msg = res.json?.msg || res.json?.error_description || "Не удалось сменить пароль";
    return fail(502, "PASSWORD_CHANGE_FAILED", String(msg));
  }
  return { ok: true, data: { changed: true } };
}

export async function saveSupabasePreferences(request, env, body, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  if (!token) return fail(401, "UNAUTHORIZED", "Нужен токен");
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(422, "VALIDATION", "Ожидается JSON настроек");
  }
  const result = await savePreferences(token, identity.user.id, body, env, fetcher);
  if (!result.ok) return result;
  return { ok: true, data: { preferences: result.data } };
}

export async function getSupabaseTelegramStatus(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  try {
    const rows = await restRows(token, env, "telegram_accounts", {
      select: "username,first_name,linked_at",
      user_id: "eq." + identity.user.id,
      limit: "1",
    }, {}, fetcher);
    const row = rows[0] || null;
    return { ok: true, data: { linked: !!row, account: row } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Недействительная сессия");
    return fail(503, "TELEGRAM_LINK_UNAVAILABLE", "Статус Telegram временно недоступен");
  }
}

export async function unlinkSupabaseTelegram(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  try {
    const rows = await restRows(token, env, "telegram_accounts", {
      user_id: "eq." + identity.user.id,
      select: "user_id",
    }, { method: "DELETE" }, fetcher);
    return { ok: true, data: { unlinked: Array.isArray(rows) ? rows.length > 0 : true } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Недействительная сессия");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав");
    return fail(503, "TELEGRAM_UNLINK_FAILED", "Не удалось отвязать Telegram");
  }
}

const ALLOWED_LINK_PROVIDERS = new Set(["google"]);

export async function startSupabaseIdentityLink(request, env, body, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  if (!token) return fail(401, "UNAUTHORIZED", "Нужен токен");
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(422, "VALIDATION", "Ожидается JSON");
  }
  const provider = String(body.provider || "").trim().toLowerCase();
  if (!ALLOWED_LINK_PROVIDERS.has(provider)) {
    return fail(422, "VALIDATION", "Провайдер не поддерживается: " + provider);
  }
  let redirectTo = String(body.redirect_to || "").trim();
  if (!redirectTo) redirectTo = "https://medbiohim.vercel.app/settings?linked=1";
  try {
    const redirectUrl = new URL(redirectTo);
    if (redirectUrl.protocol !== "https:") {
      return fail(422, "VALIDATION", "redirect_to must be https");
    }
    const host = redirectUrl.hostname.toLowerCase();
    const allowed = ["medbiohim.vercel.app", "localhost", "127.0.0.1"];
    const okHost = allowed.includes(host) || host.endsWith(".medbiohim.ru") || host === "medbiohim.ru";
    if (!okHost) return fail(422, "VALIDATION", "redirect_to host is not allowed");
  } catch {
    return fail(422, "VALIDATION", "redirect_to is invalid");
  }

  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) return fail(503, "AUTH_NOT_CONFIGURED", "Supabase Auth is not configured");

  try {
    const endpoint = new URL("/auth/v1/user/identities/authorize", baseUrl);
    const response = await fetcher(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        provider,
        redirect_to: redirectTo,
        skip_http_redirect: true,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let json = null;
    try { json = await response.json(); } catch { /* empty */ }
    const link = json && (json.url || json.authorize_url);
    if (typeof link === "string" && link) {
      return { ok: true, data: { url: link, provider, mode: "link" } };
    }
    if (response.status >= 400) {
      const msg = json?.msg || json?.error_description || json?.error || "Не удалось начать привязку";
      return fail(502, "LINK_START_FAILED", String(msg));
    }
    const fallback = new URL("/auth/v1/authorize", baseUrl);
    fallback.searchParams.set("provider", provider);
    fallback.searchParams.set("redirect_to", redirectTo);
    return { ok: true, data: { url: fallback.toString(), provider, mode: "authorize_fallback" } };
  } catch {
    return fail(502, "LINK_START_FAILED", "Не удалось начать привязку аккаунта");
  }
}

export async function unlinkSupabaseIdentity(request, env, body, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  if (!token) return fail(401, "UNAUTHORIZED", "Нужен токен");
  const identityId = String(body?.identity_id || "").trim();
  if (!identityId) return fail(422, "VALIDATION", "identity_id required");

  const account = await getSupabaseAccountSettings(request, env, fetcher);
  if (!account.ok) return account;
  if ((account.data.identities || []).length <= 1) {
    return fail(400, "UNLINK_FAILED", "Нельзя отвязать единственный способ входа");
  }

  const baseUrl = String(env.SUPABASE_URL || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();
  try {
    const endpoint = new URL("/auth/v1/user/identities/" + encodeURIComponent(identityId), baseUrl);
    const response = await fetcher(endpoint.toString(), {
      method: "DELETE",
      headers: {
        apikey: anonKey,
        authorization: "Bearer " + token,
        accept: "application/json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      let json = null;
      try { json = await response.json(); } catch { /* empty */ }
      const msg = json?.msg || json?.error_description || json?.error || "Не удалось отвязать";
      return fail(502, "UNLINK_FAILED", String(msg));
    }
    return getSupabaseAccountSettings(request, env, fetcher);
  } catch {
    return fail(502, "UNLINK_FAILED", "Не удалось отвязать аккаунт");
  }
}

export async function startSupabaseTelegramLink(request, env, fetcher = fetch) {
  const identity = await authenticateSupabaseRequest(request, env, fetcher);
  if (!identity.ok) return identity;
  const token = bearer(request);
  const userId = identity.user.id;

  if (env.AUTH_PASSWORD_LIMITER && typeof env.AUTH_PASSWORD_LIMITER.limit === "function") {
    const { success } = await env.AUTH_PASSWORD_LIMITER.limit({ key: "telegram-link:" + userId });
    if (!success) return fail(429, "RATE_LIMITED", "Слишком много попыток привязки. Попробуйте позже.");
  }

  const rawToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    await restRows(token, env, "telegram_account_link_tokens", { select: "user_id" }, {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        token_hash: hash,
        expires_at: expiresAt,
      }),
    }, fetcher);
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Недействительная сессия");
    if (error?.status === 404 || error?.status === 403) {
      return fail(503, "TELEGRAM_LINK_UNAVAILABLE", "Таблица telegram_account_link_tokens недоступна под JWT/RLS");
    }
    return fail(503, "TELEGRAM_LINK_UNAVAILABLE", "Не удалось начать привязку Telegram");
  }

  const bot = String(env.TELEGRAM_BOT_USERNAME || "MEDBIOCHIM_bot").replace(/^@/, "").trim() || "MEDBIOCHIM_bot";
  return {
    ok: true,
    data: {
      url: "https://t.me/" + encodeURIComponent(bot) + "?start=link_" + rawToken,
      expires_in_seconds: 600,
    },
  };
}
