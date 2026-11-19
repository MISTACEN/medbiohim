import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { ADMIN_ONLY, UUID, VERSION_FIELDS, dbFor, gate, recordVersion, responseError } from "./shared";
import type { ParityApp } from "./shared";

export function registerAudit(parity: ParityApp) {
parity.get("/db/audit", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, ADMIN_ONLY))) return c.res;
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 100)));
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  const table = String(c.req.query("table") || "").trim();
  const source = String(c.req.query("source") || "").trim().slice(0, 60);
  if (table && !VERSION_FIELDS[table]) {
    return responseError(c, rid, 422, "VALIDATION_ERROR", "Неизвестная таблица журнала версий");
  }
  try {
    const db = dbFor(c);
    let query = db.from("content_versions")
      .select("id,table_name,row_key,version_no,source,actor_user_id,created_at", { count: "exact" });
    if (table) query = query.eq("table_name", table);
    if (source) query = query.eq("source", source);
    const { data, count, error } = await query
      .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    const items = data || [];
    // Журнал хранит только id автора, а администратору нужно видеть человека.
    const actorIds = [...new Set(items.map((row: any) => String(row.actor_user_id || "")).filter(Boolean))];
    const actors: Record<string, string> = {};
    if (actorIds.length) {
      const { data: people, error: peopleError } = await db.from("users")
        .select("id,email,full_name").in("id", actorIds).limit(200);
      if (!peopleError) {
        for (const person of people || []) {
          actors[String((person as any).id)] = String((person as any).full_name || (person as any).email || "");
        }
      }
    }
    return c.json(ok({
      items: items.map((row: any) => ({ ...row, actor_name: actors[String(row.actor_user_id || "")] || null })),
      total: count ?? items.length,
      limit,
      offset,
      rollback_tables: Object.keys(VERSION_FIELDS),
    }, rid));
  } catch {
    return responseError(c, rid, 503, "AUDIT_UNAVAILABLE", "Журнал версий контента недоступен");
  }
});

// Снимок одной версии + текущая строка: без обоих нельзя показать, что именно изменилось.
parity.get("/db/audit/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, ADMIN_ONLY))) return c.res;
  const versionId = c.req.param("id") || "";
  if (!UUID.test(versionId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID версии");
  try {
    const db = dbFor(c);
    const { data: version, error } = await db.from("content_versions")
      .select("id,table_name,row_key,version_no,source,actor_user_id,created_at,data")
      .eq("id", versionId).maybeSingle();
    if (error) throw error;
    if (!version) return responseError(c, rid, 404, "VERSION_NOT_FOUND", "Версия не найдена");
    const table = String((version as any).table_name);
    const fields = VERSION_FIELDS[table] || [];
    let rowKey = (version as any).row_key;
    if (typeof rowKey === "string") { try { rowKey = JSON.parse(rowKey); } catch { rowKey = null; } }
    const rowId = String(rowKey?.id || "");
    const snapshot = (version as any).data && typeof (version as any).data === "object" ? (version as any).data : {};
    let current: Record<string, unknown> | null = null;
    if (fields.length && UUID.test(rowId)) {
      const { data: row, error: rowError } = await db.from(table).select(fields.join(",")).eq("id", rowId).maybeSingle();
      if (!rowError) current = (row as any) || null;
    }
    // Длинные поля (content_html, options) не должны превращать просмотр в мегабайтную загрузку.
    const truncated = new Set<string>();
    const limitText = (value: unknown) => {
      if (typeof value !== "string") return value;
      if (value.length <= 1200) return value;
      truncated.add("value");
      return value.slice(0, 1200);
    };
    const snapshotView: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(snapshot)) snapshotView[key] = limitText(raw);
    const currentView: Record<string, unknown> = {};
    if (current) for (const [key, raw] of Object.entries(current)) currentView[key] = limitText(raw);
    return c.json(ok({
      version: {
        id: (version as any).id, table_name: table, row_id: rowId || null, version_no: (version as any).version_no,
        source: (version as any).source, actor_user_id: (version as any).actor_user_id, created_at: (version as any).created_at,
      },
      fields,
      snapshot: snapshotView,
      current: current ? currentView : null,
      row_missing: current === null && fields.length > 0 && UUID.test(rowId),
      rollback_supported: fields.length > 0 && UUID.test(rowId) && current !== null,
      truncated: truncated.size > 0,
    }, rid));
  } catch {
    return responseError(c, rid, 503, "AUDIT_UNAVAILABLE", "Не удалось загрузить версию");
  }
});

parity.post("/db/audit/:id/rollback", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, ADMIN_ONLY))) return c.res;
  const versionId = c.req.param("id") || "";
  if (!UUID.test(versionId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID версии");
  const db = dbFor(c), user = c.get("user");
  try {
    const { data: version, error: versionError } = await db.from("content_versions").select("*").eq("id", versionId).maybeSingle();
    if (versionError) throw versionError;
    if (!version || !["questions", "tests", "materials"].includes(String(version.table_name))) return responseError(c, rid, 404, "VERSION_NOT_FOUND", "Версия не найдена или не поддерживается для отката");
    let rowKey = version.row_key;
    if (typeof rowKey === "string") { try { rowKey = JSON.parse(rowKey); } catch { rowKey = null; } }
    const rowId = String(rowKey?.id || "");
    if (!UUID.test(rowId) || !version.data || typeof version.data !== "object") return responseError(c, rid, 422, "INVALID_VERSION", "Снимок версии некорректен");
    const table = String(version.table_name);
    const { data: current, error: readError } = await db.from(table).select("*").eq("id", rowId).maybeSingle();
    if (readError) throw readError;
    if (!current) return responseError(c, rid, 404, "NOT_FOUND", "Исходная запись отсутствует; автоматическое восстановление удалённых строк отключено");
    await recordVersion(db, table, rowId, current, user.id, "admin_rollback");
    const patch: Record<string, unknown> = {};
    for (const key of VERSION_FIELDS[table]) if (Object.prototype.hasOwnProperty.call(version.data, key)) patch[key] = version.data[key];
    if (table === "materials") patch.updated_at = new Date().toISOString();
    const { data, error } = await db.from(table).update(patch).eq("id", rowId).select("id").maybeSingle();
    if (error) throw error;
    return c.json(ok({ rolled_back: true, table, id: rowId, version_id: versionId, item: data }, rid));
  } catch {
    return responseError(c, rid, 503, "ROLLBACK_FAILED", "Не удалось выполнить откат версии");
  }
});

}
