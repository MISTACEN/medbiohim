import { getStorageBackend } from "../../lib/b2";
import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { normalizeTags } from "../../lib/workshop";
import {
  UUID,
  authorOrStaff,
  dbFor,
  error,
  isStaff,
  loadItem,
  mapItem,
  readSettings,
  saveVersion,
} from "./shared";
import type { WorkshopApp } from "./shared";

export function registerItems(workshop: WorkshopApp) {
workshop.patch("/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const db = dbFor(c);
  const { item, files, questions } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Редактировать может только автор");
  let input: any = {};
  try { input = await c.req.json(); } catch { return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON"); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of ["title", "summary", "topic"] as const) {
    if (input[field] !== undefined) patch[field] = input[field] == null ? null : String(input[field]).slice(0, field === "summary" ? 4000 : 200);
  }
  if (input.title !== undefined && !String(patch.title || "").trim()) return error(c, rid, 422, "VALIDATION_ERROR", "Название не может быть пустым");
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.subject_id !== undefined) {
    if (input.subject_id && !UUID.test(String(input.subject_id))) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_id");
    patch.subject_id = input.subject_id || null;
  }
  if (input.kind !== undefined && ["photo_lecture", "notes", "test_questions", "pdf", "other"].includes(String(input.kind))) patch.kind = String(input.kind);
  const settings = await readSettings(c);
  // В ручном режиме правка опубликованного материала снова уходит на проверку.
  if (settings.moderation_mode === "manual" && item.status === "published" && !(await isStaff(c))) {
    patch.status = "pending";
    patch.published_at = null;
  }
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нечего обновлять");
  const { data: updated, error: updateError } = await db.from("workshop_items").update(patch).eq("id", id).select("*").maybeSingle();
  if (updateError || !updated) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить материал");
  const nextFiles = files;
  const nextQuestions = questions;
  let versionNo = Number(updated.version_no || 1) + 1;
  try {
    versionNo = await saveVersion(c, updated, nextFiles, nextQuestions, c.get("user").id, input.note ? String(input.note) : "Обновление материала");
    await db.from("workshop_items").update({ version_no: versionNo }).eq("id", id);
  } catch (versionError) {
    console.error("[workshop:version]", versionError);
  }
  return c.json(ok({ item: { ...mapItem({ ...updated, version_no: versionNo }, nextFiles, nextQuestions) }, moderation_mode: settings.moderation_mode }, rid));
});

workshop.post("/items/:id/visibility", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const hidden = input.hidden !== false;
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Скрывать может только автор");
  const patch: Record<string, unknown> = hidden
    ? {
        status: "hidden",
        previous_status: item.status === "hidden" ? item.previous_status : item.status,
        hidden_by: c.get("user").id,
        hidden_until: null,
        updated_at: new Date().toISOString(),
      }
    : {
        status: ["published", "pending", "rejected", "draft"].includes(String(item.previous_status)) ? item.previous_status : "pending",
        previous_status: null,
        hidden_by: null,
        hidden_until: null,
        published_at: item.previous_status === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
  const { data, error: updateError } = await db.from("workshop_items").update(patch).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить видимость");
  return c.json(ok({ item: data }, rid));
});

workshop.delete("/items/:id", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Удалять может только автор");
  // Мягкое удаление: история версий и жалобы остаются для разбора.
  const { error: deleteError } = await dbFor(c).from("workshop_items")
    .update({ status: "deleted", deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (deleteError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить материал");
  return c.json(ok({ deleted: true, id }, rid));
});

workshop.get("/items/:id/versions", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "История доступна автору и модераторам");
  const { data, error: readError } = await dbFor(c).from("workshop_item_versions")
    .select("id,version_no,note,created_by,created_at,snapshot").eq("item_id", id)
    .order("version_no", { ascending: false }).limit(50);
  if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "История версий недоступна");
  return c.json(ok({
    items: (data || []).map((row: any) => ({
      id: row.id,
      version_no: row.version_no,
      note: row.note,
      created_at: row.created_at,
      title: row.snapshot?.title ?? null,
      files: Array.isArray(row.snapshot?.files) ? row.snapshot.files.length : 0,
      questions: Array.isArray(row.snapshot?.questions) ? row.snapshot.questions.length : 0,
    })),
    current_version: item.version_no,
  }, rid));
});

workshop.post("/items/:id/versions/:versionNo/restore", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  const versionNo = Number(c.req.param("versionNo"));
  if (!UUID.test(id) || !Number.isInteger(versionNo) || versionNo < 1) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректная версия");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  if (!(await authorOrStaff(c, item))) return error(c, rid, 403, "FORBIDDEN", "Восстанавливать может только автор");
  const { data: version } = await db.from("workshop_item_versions")
    .select("snapshot").eq("item_id", id).eq("version_no", versionNo).maybeSingle();
  if (!version?.snapshot) return error(c, rid, 404, "VERSION_NOT_FOUND", "Версия не найдена");
  const snapshot = version.snapshot;
  await db.from("workshop_item_files").delete().eq("item_id", id);
  await db.from("workshop_item_questions").delete().eq("item_id", id);
  const files = Array.isArray(snapshot.files) ? snapshot.files : [];
  const questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
  if (files.length) await db.from("workshop_item_files").insert(files.map((file: any, index: number) => ({ ...file, item_id: id, position: index })));
  if (questions.length) await db.from("workshop_item_questions").insert(questions.map((question: any, index: number) => ({
    item_id: id,
    text: String(question.text || ""),
    topic: question.topic ?? null,
    options: Array.isArray(question.options) ? question.options.slice(0, 8) : question.options ?? null,
    answer: question.answer != null ? String(question.answer).slice(0, 500) : null,
    position: index,
  })));
  const { data: updated, error: updateError } = await db.from("workshop_items").update({
    title: snapshot.title ?? item.title,
    summary: snapshot.summary ?? null,
    kind: snapshot.kind ?? item.kind,
    tags: normalizeTags(snapshot.tags),
    subject_id: snapshot.subject_id ?? null,
    topic: snapshot.topic ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").maybeSingle();
  if (updateError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось восстановить версию");
  const next = await loadItem(c, id);
  let nextVersion = item.version_no;
  try {
    nextVersion = await saveVersion(c, updated, next.files, next.questions, c.get("user").id, `Восстановление версии ${versionNo}`);
    await db.from("workshop_items").update({ version_no: nextVersion }).eq("id", id);
  } catch {}
  return c.json(ok({ item: mapItem({ ...updated, version_no: nextVersion }, next.files, next.questions) }, rid));
});

workshop.post("/items/:id/report", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const reason = String(input.reason || "").trim().slice(0, 1000);
  if (reason.length < 3) return error(c, rid, 422, "VALIDATION_ERROR", "Опишите причину жалобы");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status !== "published") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  const { error: reportError } = await db.from("workshop_reports").insert({
    item_id: id, reporter_user_id: c.get("user").id, reason,
  });
  if (reportError) {
    if (String((reportError as any).code) === "23505") return error(c, rid, 409, "ALREADY_REPORTED", "Вы уже жаловались на этот материал");
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось отправить жалобу");
  }
  await db.from("workshop_items").update({ report_count: Number(item.report_count || 0) + 1 }).eq("id", id);
  return c.json(ok({ reported: true }, rid), 201);
});

workshop.get("/items/:id/files/:fileId", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id") || "";
  const fileId = c.req.param("fileId") || "";
  if (!UUID.test(id) || !UUID.test(fileId)) return error(c, rid, 404, "NOT_FOUND", "Файл не найден");
  const backend = getStorageBackend(c.env);
  if (!backend) return error(c, rid, 503, "STORAGE_NOT_CONFIGURED", "Хранилище не настроено");
  const db = dbFor(c);
  const { item } = await loadItem(c, id);
  if (!item || item.status === "deleted") return error(c, rid, 404, "NOT_FOUND", "Материал не найден");
  const isAuthor = String(item.author_id) === String(c.get("user").id);
  if (item.status !== "published" && !isAuthor && !(await isStaff(c))) return error(c, rid, 403, "FORBIDDEN", "Материал ещё не опубликован");
  const { data: file } = await db.from("workshop_item_files").select("*")
    .eq("item_id", id).or(`id.eq.${fileId},file_id.eq.${fileId}`).maybeSingle();
  if (!file) return error(c, rid, 404, "NOT_FOUND", "Файл не найден");
  const key = String(file.object_key || "");
  if (!key.startsWith("users/")) return error(c, rid, 404, "NOT_FOUND", "Файл недоступен");
  try {
    const object = await backend.get(key);
    const headers = new Headers({
      "content-type": String(file.mime_type || object.contentType || "application/octet-stream"),
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(file.original_name || "file"))}`,
    });
    return new Response(object.body, { headers });
  } catch (blobError) {
    console.error("[workshop:file]", blobError);
    return error(c, rid, 502, "STORAGE_ERROR", "Не удалось открыть файл");
  }
});
}
