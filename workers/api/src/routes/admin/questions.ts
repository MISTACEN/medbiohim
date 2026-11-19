import { requireAuth } from "../../middleware/auth";
import { ok, requestId } from "../../lib/response";
import { CONTENT_MODERATORS, QUESTION_FIELDS, UUID, bodyJson, error, gate, pick, validText, type AdminApp } from "./shared";

/**
 * Банк экзаменационных вопросов и редактор банка вопросов.
 */
export function registerQuestions(admin: AdminApp) {

  // Questions: preserve the legacy exam_questions contract used by the admin editor.
  admin.get("/questions", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase");
    // Банк экзаменационных вопросов — платформенный контент: читают и правят
    // только admin и moderator. Преподаватель работает со СВОИМИ вопросами через
    // /my-questions, чужие через админку ему не открываются (план §10).
    if (!await gate(c, CONTENT_MODERATORS)) return;
    const subjectSlug = (c.req.query("subject_slug") || "").trim();
    const subject = (c.req.query("subject") || "").trim();
    const kind = (c.req.query("kind") || "ticket").trim();
    const term = (c.req.query("q") || "").trim().slice(0, 120);
    const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 50)));
    const offset = Math.max(0, Math.min(50000, Number(c.req.query("offset") || 0)));
    try {
      let query = db.from("exam_questions").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (subjectSlug) query = query.eq("subject_slug", subjectSlug);
      if (subject) query = query.eq("subject", subject);
      if (kind) query = query.eq("kind", kind);
      if (term) query = query.ilike("text", "%" + term.replace(/[%_]/g, "") + "%");
      const { data, error: dbError, count } = await query;
      if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Банк вопросов временно недоступен");
      return c.json(ok({ items: data || [], total: count ?? (data || []).length, source: "supabase" }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_UNAVAILABLE", "Банк вопросов временно недоступен"); }
  });
  admin.post("/questions", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), input = await bodyJson(c);
    if (!await gate(c, CONTENT_MODERATORS)) return;
    if (!input || !validText(input.text, 30000) || !validText(input.subject_slug || "general", 100)) return error(c, rid, 422, "VALIDATION_ERROR", "Текст вопроса и предмет обязательны");
    const row = pick({ subject: "Общий", subject_slug: "general", type: "open", kind: "ticket", is_published: true, ...input }, QUESTION_FIELDS);
    try {
      const { data, error: dbError } = await db.from("exam_questions").insert(row).select("*").single();
      if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос");
      return c.json(ok({ question: data }, rid), 201);
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос"); }
  });
  admin.put("/questions/:id", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), input = await bodyJson(c);
    if (!await gate(c, CONTENT_MODERATORS)) return;
    if (!UUID.test(id) && !/^[-a-zA-Z0-9_]{1,100}$/.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID вопроса");
    const patch = pick(input, QUESTION_FIELDS);
    if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
    if (patch.text !== undefined && !validText(patch.text, 30000)) return error(c, rid, 422, "VALIDATION_ERROR", "Текст вопроса обязателен");
    try {
      const { data, error: dbError } = await db.from("exam_questions").update(patch).eq("id", id).select("*").maybeSingle();
      if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос");
      if (!data) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
      return c.json(ok({ question: data }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос"); }
  });
  admin.delete("/questions/:id", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
    if (!await gate(c, CONTENT_MODERATORS)) return;
    try {
      const { data, error: dbError } = await db.from("exam_questions").delete().eq("id", id).select("id").maybeSingle();
      if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось удалить вопрос");
      if (!data) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
      return c.json(ok({ deleted: true }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось удалить вопрос"); }
  });

  admin.put("/question-bank/:id", requireAuth, async (c) => {
    const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), input = await bodyJson(c);
    // Банк вопросов — общий контент платформы, а не «своё» преподавателя.
    // Его правят только администратор и модератор; преподаватель ведёт ЛИЧНЫЕ
    // вопросы через /my-questions и чужие не меняет (контракт MA8, план §10).
    if (!await gate(c, CONTENT_MODERATORS)) return;
    if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID вопроса");
    const type = String(input?.type || "");
    const text = String(input?.text || "").trim();
    const answer = input?.answer == null ? "" : String(input.answer);
    let options = input?.options;
    if (!validText(text, 30000)) return error(c, rid, 422, "VALIDATION_ERROR", "Текст вопроса обязателен");
    if (!["mcq","multiple","open","short","number","ordering"].includes(type)) return error(c, rid, 422, "VALIDATION_ERROR", "Недопустимый тип вопроса");
    if (type === "mcq" || type === "multiple") {
      if (!Array.isArray(options) || options.length < 2 || options.length > 30) return error(c, rid, 422, "VALIDATION_ERROR", "Нужно от 2 до 30 вариантов ответа");
      options = options.map((option: any) => typeof option === "string" ? { label: option.trim(), correct: false } : { label: String(option?.label || "").trim(), correct: option?.correct === true });
      if (options.some((option: any) => !option.label) || !options.some((option: any) => option.correct)) return error(c, rid, 422, "VALIDATION_ERROR", "Укажите текст вариантов и хотя бы один правильный ответ");
      if (options.some((option: any) => option.label.length > 500)) return error(c, rid, 422, "VALIDATION_ERROR", "Текст варианта ответа не должен превышать 500 символов");
      if (type === "mcq" && options.filter((option: any) => option.correct).length !== 1) return error(c, rid, 422, "VALIDATION_ERROR", "Для одиночного выбора должен быть один правильный вариант");
    } else if (options != null && !Array.isArray(options)) return error(c, rid, 422, "VALIDATION_ERROR", "options должен быть массивом");
    if (answer.length > 10000) return error(c, rid, 422, "VALIDATION_ERROR", "Ответ/объяснение не должен превышать 10000 символов");
    const patch: Record<string, unknown> = { type, text, answer, options: options || [], updated_at: new Date().toISOString() };
    if (input?.is_published !== undefined) {
      if (typeof input.is_published !== "boolean") return error(c, rid, 422, "VALIDATION_ERROR", "is_published должен быть булевым значением");
      patch.is_published = input.is_published;
    }
    if (input?.difficulty !== undefined && input?.difficulty !== null && input?.difficulty !== "") {
      const difficulty = Number(input.difficulty);
      if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return error(c, rid, 422, "VALIDATION_ERROR", "Сложность должна быть целым числом от 1 до 5");
      patch.difficulty = difficulty;
    }
    for (const key of ["subject_id", "module_id", "topic_id"] as const) {
      const value = input?.[key];
      if (value === undefined) continue;
      if (value === null || value === "") { patch[key] = null; continue; }
      if (!UUID.test(String(value))) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID привязки вопроса (" + key + ")");
      patch[key] = String(value);
    }
    try {
      const { data: current, error: readError } = await db.from("questions").select("id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,source_key,archived_at").eq("id", id).maybeSingle();
      if (readError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить вопрос");
      if (!current) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
      const { data: versions, error: versionReadError } = await db.from("content_versions").select("version_no").eq("table_name", "questions").eq("row_key", JSON.stringify({ id })).order("version_no", { ascending: false }).limit(1);
      if (!versionReadError) {
        const versionNo = Number(versions?.[0]?.version_no || 0) + 1;
        const { error: versionError } = await db.from("content_versions").insert({ table_name: "questions", row_key: { id }, version_no: versionNo, data: current, source: "admin_ui", actor_user_id: c.get("user").id });
        if (versionError) console.warn("[admin:question-version]", versionError.message);
      }
      const { data, error: writeError } = await db.from("questions").update(patch).eq("id", id).select("id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,source_key,archived_at").maybeSingle();
      if (writeError) return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос");
      return c.json(ok({ question: data }, rid));
    } catch (dbError) { console.error("[admin]", dbError); return error(c, rid, 503, "DB_ERROR", "Не удалось выполнить операцию с вопросом"); }
  });
}
