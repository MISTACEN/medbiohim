import { ok, fail, requestId } from "../../lib/response";

export async function readTelegramStatus(c: any) {
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

export async function startTelegramLink(c: any) {
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

export async function unlinkTelegramAccount(c: any) {
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
