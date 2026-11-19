import { ok, fail, requestId } from "../../lib/response";
import { isPwnedPassword } from "../../lib/password-guard";
import { readAccount } from "./shared";

export async function updateProfile(c: any) {
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
      // Даже если тело ответа пустое, новый адрес известен: он ждёт подтверждения.
      c.set("emailChangePending", email);
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

export async function changePassword(c: any) {
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
  // Leaked password protection: пароль из утечек отклоняется до смены.
  const pwned = await isPwnedPassword(password);
  if (pwned === true) {
    const { body, status } = fail("PASSWORD_PWNED", "Этот пароль найден в базах утечек — выберите другой", 422, rid);
    return c.json(body, status as 422);
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

export async function resendEmailChange(c: any) {
  const rid = requestId();
  const user = c.get("user");
  const pending = typeof (user as any).new_email === "string" ? String((user as any).new_email).trim() : "";
  if (!pending) {
    const { body, status } = fail("EMAIL_CHANGE_NOT_PENDING", "Нет неподтверждённой смены почты", 409, rid);
    return c.json(body, status as 409);
  }
  try {
    const response = await fetch(new URL("/auth/v1/resend", c.env.SUPABASE_URL), {
      method: "POST",
      headers: { apikey: c.env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email_change", email: pending }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const { body, status } = fail("EMAIL_RESEND_FAILED", "Не удалось отправить письмо повторно", 422, rid);
      return c.json(body, status as 422);
    }
    return c.json(ok({ resent: true, pending_email: pending }, rid));
  } catch (error) {
    console.error("[settings:email-resend]", { error: String(error), requestId: rid });
    const { body, status } = fail("EMAIL_RESEND_FAILED", "Не удалось отправить письмо повторно", 503, rid);
    return c.json(body, status as 503);
  }
}
