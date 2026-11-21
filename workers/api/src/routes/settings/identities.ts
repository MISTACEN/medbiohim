import { ok, fail, requestId } from "../../lib/response";
import { defaultLinkRedirect, identityAuthorizeUrl, resolveLinkRedirect } from "../../lib/link-redirect";
import { readAccount } from "./shared";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

export async function startIdentityLink(c: any) {
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
  const fallbackOrigin = c.env.APP_ORIGIN || "https://medbiohim.vercel.app";
  // Возвращаем пользователя туда, где он нажал кнопку: иначе Supabase
  // открывает корень сайта, и «Google привязан» негде показать.
  let redirectTo = defaultLinkRedirect(fallbackOrigin);
  if (typeof input.redirect_to === "string" && input.redirect_to.trim()) {
    const resolved = resolveLinkRedirect(input.redirect_to.trim(), c.env.CORS_ORIGINS || "", fallbackOrigin);
    if (!resolved) {
      const { body, status } = fail("VALIDATION_ERROR", "Недопустимый адрес возврата", 400, rid);
      return c.json(body, status as 400);
    }
    redirectTo = resolved;
  }
  try {
    // GoTrue ждёт GET с query-параметрами (так это делает supabase-js
    // linkIdentity → _getUrlForProvider). POST с JSON отвечал 404, и привязка
    // Google не начиналась вовсе.
    const authorizeUrl = identityAuthorizeUrl(c.env.SUPABASE_URL, provider, redirectTo);
    const response = await fetchWithTimeout(authorizeUrl, {
      method: "GET",
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${c.get("accessToken")}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json().catch(() => ({})) as Record<string, unknown>;
    const url = typeof result.url === "string" ? result.url
      : typeof result.authorize_url === "string" ? result.authorize_url : null;
    if (!response.ok || !url) {
      const reason = `${String(result.error_code || "")} ${String(result.msg || result.message || "")}`.toLowerCase();
      console.warn("[settings:identity-link]", { status: response.status, reason, requestId: rid });
      if (reason.includes("already") && reason.includes("link")) {
        const { body, status } = fail("IDENTITY_ALREADY_LINKED", "Этот способ входа уже привязан к аккаунту", 409, rid);
        return c.json(body, status as 409);
      }
      // Supabase отвечает 404/«Manual linking is disabled», пока в проекте не
      // включена привязка второго способа входа. Это настройка сервера, не
      // ошибка пользователя — говорим прямо, а не «попробуйте позже».
      if (reason.includes("manual linking")) {
        const { body, status } = fail("IDENTITY_LINK_DISABLED", "Привязка второго способа входа выключена на сервере", 503, rid);
        return c.json(body, status as 503);
      }
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

export async function unlinkIdentity(c: any) {
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
    const response = await fetchWithTimeout(new URL(`/auth/v1/user/identities/${encodeURIComponent(identityId)}`, c.env.SUPABASE_URL), {
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
    const refreshed = await fetchWithTimeout(new URL("/auth/v1/user", c.env.SUPABASE_URL), {
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
