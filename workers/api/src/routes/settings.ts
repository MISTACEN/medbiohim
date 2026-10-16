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

    const identities = Array.isArray(user.identities) ? user.identities : [];
    const linkedIdentities = identities.map((identity: any) => {
      const provider = String(identity.provider || "unknown");
      const identityData = identity.identity_data && typeof identity.identity_data === "object" ? identity.identity_data : {};
      const labels: Record<string, string> = { email: "Почта", google: "Google", "custom:vk": "ВКонтакте", github: "GitHub", discord: "Discord", yandex: "Яндекс" };
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
        { id: "custom:vk", label: "ВКонтакте", region: "ru", enabled: true, linkable: true },
        { id: "yandex", label: "Яндекс", region: "ru", enabled: false, linkable: true },
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

settings.get("/", requireAuth, readPreferences);
settings.patch("/", requireAuth, savePreferences); // Backward-compatible settings endpoint.
settings.get("/account", requireAuth, readAccount);
settings.put("/preferences", requireAuth, savePreferences);

export default settings;
