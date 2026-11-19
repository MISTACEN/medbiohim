import { ok, fail, requestId } from "../../lib/response";

export async function readPreferences(c: any) {
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

export const ALLOWED_IDENTITY_PROVIDERS = new Set(["email", "google", "custom:telegram"]);

export function linkedIdentitiesOf(user: any): any[] {
  const identities = (Array.isArray(user.identities) ? user.identities : [])
    .filter((identity: any) => ALLOWED_IDENTITY_PROVIDERS.has(String(identity.provider || "")));
  const labels: Record<string, string> = { email: "Почта", google: "Google", "custom:telegram": "Telegram" };
  return identities.map((identity: any) => {
    const provider = String(identity.provider || "unknown");
    const identityData = identity.identity_data && typeof identity.identity_data === "object" ? identity.identity_data : {};
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
}

export async function savePreferences(c: any) {
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

export async function readAccount(c: any) {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const [{ data: profile, error: profileError }, { data: prefRow, error: prefError }] = await Promise.all([
      supabase.from("users").select("id,full_name,avatar_url,avatar_key,course_number,semester").eq("id", user.id).maybeSingle(),
      supabase.from("user_preferences").select("preferences").eq("user_id", user.id).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (prefError) throw prefError;

    const linkedIdentities = linkedIdentitiesOf(user);
    const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
    // Смена почты в Supabase двухшаговая: письмо уходит на новый адрес, а
    // user.email меняется только после подтверждения. Показываем это явно,
    // иначе UI делает вид, что адрес уже изменён.
    const pendingEmail = (user as any).new_email || c.get("emailChangePending") || null;
    return c.json(ok({
      user: {
        id: user.id,
        email: user.email || null,
        email_confirmed_at: user.email_confirmed_at || null,
        email_change_pending: pendingEmail,
        phone: user.phone || null,
        full_name: profile?.full_name || metadata.full_name || metadata.name || null,
        avatar_url: profile?.avatar_url || metadata.avatar_url || null,
        // SA3: загруженный файл показывается через аутентифицированный прокси;
        // ключ объекта наружу не отдаём, только факт наличия и адрес.
        has_uploaded_avatar: Boolean(profile?.avatar_key),
        avatar_proxy_url: profile?.avatar_key ? `/api/v1/storage/avatar/${encodeURIComponent(user.id)}` : null,
        // Загрузка файла требует Upstash Blob. Если токена нет, кнопка в профиле
        // не должна приводить к 502: интерфейс честно пишет, что загрузка
        // временно недоступна (внешняя ссылка avatar_url при этом работает).
        avatar_upload_enabled: Boolean(c.env.UPSTASH_BLOB_TOKEN?.trim()),
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
