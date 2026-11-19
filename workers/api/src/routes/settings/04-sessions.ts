import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";

import type { SettingsRouter } from "./types";

type SessionRow = {
  session_id: string;
  created_at: string | null;
  last_used_at: string | null;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  is_current: boolean;
};

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerSessionRoutes(settings: SettingsRouter) {

settings.get("/sessions", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_user_sessions");
    if (error) throw error;
    const rows = Array.isArray(data) ? (data as SessionRow[]) : [];
    return c.json(ok({
      sessions: rows.map((row) => ({
        session_id: String(row.session_id),
        created_at: row.created_at,
        last_used_at: row.last_used_at,
        user_agent: row.user_agent,
        // IP показываем частично: полный адрес устройства в интерфейсе не нужен.
        ip_hint: row.ip ? String(row.ip).replace(/(:\d+)?$/, "") : null,
        aal: row.aal,
        is_current: Boolean(row.is_current),
      })),
    }, rid));
  } catch (error) {
    console.error("[settings:sessions:list]", { error: String(error), requestId: rid });
    const { body, status } = fail("SESSIONS_UNAVAILABLE", "Не удалось загрузить список устройств", 503, rid);
    return c.json(body, status as 503);
  }
});

settings.delete("/sessions/:sessionId", requireAuth, async (c) => {
  const rid = requestId();
  const sessionId = String(c.req.param("sessionId") || "");
  if (!SESSION_ID_RE.test(sessionId)) {
    const { body, status } = fail("VALIDATION", "Некорректный идентификатор устройства", 422, rid);
    return c.json(body, status as 422);
  }
  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_revoke_session", { p_session_id: sessionId });
    if (error) throw error;
    const result = (data || {}) as { revoked?: boolean; reason?: string };
    if (result.reason === "current_session") {
      // Текущее устройство закрывается кнопкой «Выйти», а не «Завершить».
      const { body, status } = fail(
        "CURRENT_SESSION",
        "Это текущее устройство. Чтобы выйти на нём, нажмите «Выйти».",
        409,
        rid,
      );
      return c.json(body, status as 409);
    }
    if (!result.revoked) {
      const { body, status } = fail("NOT_FOUND", "Устройство не найдено: возможно, сессия уже завершена", 404, rid);
      return c.json(body, status as 404);
    }
    return c.json(ok({ revoked: true, session_id: sessionId }, rid));
  } catch (error) {
    console.error("[settings:sessions:revoke]", { error: String(error), requestId: rid });
    const { body, status } = fail("SESSIONS_UNAVAILABLE", "Не удалось завершить устройство", 503, rid);
    return c.json(body, status as 503);
  }
});

settings.post("/sessions/revoke-others", requireAuth, async (c) => {
  const rid = requestId();
  try {
    const { data, error } = await c.get("supabase").rpc("medbiohim_revoke_other_sessions");
    if (error) throw error;
    const result = (data || {}) as { revoked?: number; kept_current?: boolean };
    return c.json(ok({
      revoked: Number(result.revoked || 0),
      kept_current: Boolean(result.kept_current),
    }, rid));
  } catch (error) {
    console.error("[settings:sessions:revoke-others]", { error: String(error), requestId: rid });
    const { body, status } = fail("SESSIONS_UNAVAILABLE", "Не удалось завершить другие устройства", 503, rid);
    return c.json(body, status as 503);
  }
});
}
