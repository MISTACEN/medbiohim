import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { requireContentOwnership } from "../../lib/content-access";
import { UUID, countRows, dbFor, gate, responseError } from "./shared";
import type { ParityApp } from "./shared";

export function registerMaterials(parity: ParityApp) {
// Materials UI lists uploaded file records; deletion is a soft-delete and refuses linked files.
parity.get("/materials", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  try {
    const { data, error } = await dbFor(c).from("files")
      .select("id,original_name,mime_type,size_bytes,created_at,uploaded_by,group_id,visibility,specialty_slug,status")
      .eq("status", "active").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить материалы");
  }
});

parity.delete("/materials/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID файла");
  const db = dbFor(c);
  try {
    const { data: file, error: readError } = await db.from("files").select("id,status,uploaded_by").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!file || file.status !== "active") return responseError(c, rid, 404, "NOT_FOUND", "Файл не найден");
    // Файл удаляет автор или менеджер контента: чужой материал недоступен.
    if (!await requireContentOwnership(c, (file as { uploaded_by?: unknown }).uploaded_by)) return c.res;
    const [materials, attachments, submissions, progress] = await Promise.all([
      countRows(db, "materials", "file_id", id),
      countRows(db, "homework_attachments", "file_id", id),
      countRows(db, "homework_submissions", "file_id", id),
      countRows(db, "homework_progress", "file_id", id),
    ]);
    if (materials + attachments + submissions + progress > 0) {
      return responseError(c, rid, 409, "FILE_IN_USE", "Файл используется в учебных материалах или ответах и не может быть удалён");
    }
    const { error } = await db.from("files").update({ status: "deleted" }).eq("id", id);
    if (error) throw error;
    return c.json(ok({ deleted: true, id, storage: "retained_for_safe_cleanup" }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить файл");
  }
});
}
