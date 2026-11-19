import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { ADMIN_ONLY, UUID, dbFor, gate, jsonBody, recordVersion, responseError } from "./shared";
import type { ParityApp } from "./shared";

export function registerContent(parity: ParityApp) {
parity.patch("/question-reports/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const id = c.req.param("id") || "";
  const input = await jsonBody(c);
  const status = String(input?.status || "");
  if (!UUID.test(id) || !["new", "reviewing", "fixed", "rejected"].includes(status)) {
    return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID или статус жалобы");
  }
  const resolved = status === "fixed" || status === "rejected";
  try {
    const { data, error } = await dbFor(c).from("question_reports").update({
      status, resolved_by: resolved ? c.get("user").id : null, resolved_at: resolved ? new Date().toISOString() : null,
    }).eq("id", id).select("id,question_id,category,status,resolved_by,resolved_at").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Жалоба не найдена");
    return c.json(ok({ report: data }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить жалобу");
  }
});

parity.put("/site", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, ADMIN_ONLY))) return c.res;
  const input = await jsonBody(c);
  if (!input) return responseError(c, rid, 422, "VALIDATION_ERROR", "Передайте настройки сайта в JSON");
  const payload: Record<string, string> = {};
  for (const key of ["title", "subtitle", "description", "announcement_banner"]) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "string" || input[key].length > (key === "description" ? 5000 : 1000)) {
        return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректное поле " + key);
      }
      payload[key] = input[key].trim();
    }
  }
  if (!Object.keys(payload).length) return responseError(c, rid, 422, "VALIDATION_ERROR", "Нет поддерживаемых полей сайта");
  try {
    const { data: current, error: readError } = await dbFor(c).from("site_content").select("payload").eq("key", "site").maybeSingle();
    if (readError) throw readError;
    const merged = { ...(current?.payload && typeof current.payload === "object" ? current.payload : {}), ...payload };
    const { error } = await dbFor(c).from("site_content").upsert({ key: "site", payload: merged, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return c.json(ok({ site: merged }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить настройки сайта");
  }
});

// Content archival snapshots the row before setting archived_at; only supported tables are accepted.
parity.post("/content/archive", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, ADMIN_ONLY))) return c.res;
  const input = await jsonBody(c);
  const table = String(input?.table || ""), id = String(input?.id || "");
  if (!["questions", "tests"].includes(table) || !UUID.test(id)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Разрешено архивировать только questions/tests по UUID");
  const db = dbFor(c), user = c.get("user");
  try {
    const { data: current, error: readError } = await db.from(table).select("*").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!current) return responseError(c, rid, 404, "NOT_FOUND", "Запись не найдена");
    if (current.archived_at) return c.json(ok({ archived: true, already_archived: true, id, table }, rid));
    await recordVersion(db, table, id, current, user.id, "admin_archive");
    const { data, error } = await db.from(table).update({ archived_at: new Date().toISOString(), is_published: false }).eq("id", id).select("id,archived_at,is_published").maybeSingle();
    if (error) throw error;
    return c.json(ok({ archived: true, item: data, table }, rid));
  } catch {
    return responseError(c, rid, 503, "ARCHIVE_FAILED", "Не удалось архивировать запись; исходная запись не должна удаляться физически");
  }
});

parity.post("/content/move", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, ADMIN_ONLY))) return c.res;
  const input = await jsonBody(c);
  const table = String(input?.table || ""), id = String(input?.id || "");
  if (!["questions", "tests", "materials"].includes(table) || !UUID.test(id)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Разрешено перемещать только questions/tests/materials по UUID");
  const allowed = ["subject_id", "module_id", "topic_id"];
  const patch: Record<string, string | null> = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(input, key)) {
    const value = input[key] == null || input[key] === "" ? null : String(input[key]);
    if (value && !UUID.test(value)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный " + key);
    patch[key] = value;
  }
  if (!Object.keys(patch).length) return responseError(c, rid, 422, "VALIDATION_ERROR", "Укажите subject_id, module_id или topic_id");
  const db = dbFor(c), user = c.get("user");
  try {
    const { data: current, error: readError } = await db.from(table).select("*").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!current) return responseError(c, rid, 404, "NOT_FOUND", "Запись не найдена");
    const targetSubject = patch.subject_id === undefined ? current.subject_id : patch.subject_id;
    const targetModule = patch.module_id === undefined ? current.module_id : patch.module_id;
    const targetTopic = patch.topic_id === undefined ? current.topic_id : patch.topic_id;
    if (targetSubject) {
      const { data, error } = await db.from("subjects").select("id").eq("id", targetSubject).maybeSingle();
      if (error) throw error;
      if (!data) return responseError(c, rid, 422, "SUBJECT_NOT_FOUND", "Предмет не найден");
    }
    if (targetModule) {
      const { data, error } = await db.from("modules").select("id,subject_id").eq("id", targetModule).maybeSingle();
      if (error) throw error;
      if (!data || (targetSubject && data.subject_id !== targetSubject)) return responseError(c, rid, 422, "MODULE_NOT_FOUND", "Модуль не принадлежит выбранному предмету");
    }
    if (targetTopic) {
      const { data, error } = await db.from("topics").select("id,module_id").eq("id", targetTopic).maybeSingle();
      if (error) throw error;
      if (!data || (targetModule && data.module_id !== targetModule)) return responseError(c, rid, 422, "TOPIC_NOT_FOUND", "Тема не принадлежит выбранному модулю");
    }
    await recordVersion(db, table, id, current, user.id, "admin_move");
    const { data, error } = await db.from(table).update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    return c.json(ok({ item: data, table }, rid));
  } catch {
    return responseError(c, rid, 503, "MOVE_FAILED", "Не удалось переместить запись");
  }
});
}
