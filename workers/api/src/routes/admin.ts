import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import dbAdmin from "./admin-database";

const admin = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGERS = ["admin", "moderator", "teacher"];
const STRICT_ADMINS = ["admin"];
const LECTURE_FIELDS = ["title","subject","subject_id","subject_slug","topic","lesson_type","body_md","body_html","summary","media","sources","attachments","related_learning","curriculum","generation"];
const QUESTION_FIELDS = ["subject","subject_name","subject_slug","topic","type","text","answer","is_published","kind","for_exam","for_ticket"];
const IMPORT_TABLES = new Set(["questions","tests","test_questions","materials","content_sources","trainer_feed_cards"]);

function error(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}
async function hasRole(c: any, allowed: string[]) {
  const user = c.get("user");
  const db = c.get("supabase");
  const { data, error: queryError } = await db.from("user_roles").select("roles(code)").eq("user_id", user.id).limit(20);
  if (queryError) throw queryError;
  const codes = (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "");
  });
  return codes.some((role: string) => allowed.includes(role));
}
async function gate(c: any, allowed = MANAGERS) {
  try {
    if (await hasRole(c, allowed)) return true;
    c.res = error(c, requestId(), 403, "FORBIDDEN", "Недостаточно прав для административной операции");
    return false;
  } catch {
    c.res = error(c, requestId(), 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
    return false;
  }
}
async function bodyJson(c: any) {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function pick(input: any, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(input || {}, key)) out[key] = input[key];
  return out;
}
function validText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

admin.get("/", requireAuth, async (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/\/?$/, "") + "/overview";
  return admin.fetch(new Request(url.toString(), c.req.raw), c.env);
});

admin.get("/overview", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c)) return;
  try {
    const [groups, subjects, tests, questions, site] = await Promise.all([
      db.from("groups").select("id", { count: "exact", head: true }).eq("is_active", true),
      db.from("subjects").select("id", { count: "exact", head: true }).eq("is_active", true),
      db.from("tests").select("id", { count: "exact", head: true }),
      db.from("questions").select("id", { count: "exact", head: true }),
      db.from("site_content").select("key,payload").eq("key", "site").maybeSingle()
    ]);
    if (groups.error || subjects.error || tests.error || questions.error) return error(c, rid, 503, "DB_UNAVAILABLE", "Центр управления временно недоступен");
    return c.json(ok({ site: site.data?.payload || {}, counts: { groups: groups.count || 0, subjects: subjects.count || 0, tests: tests.count || 0, questions: questions.count || 0 }, source: "supabase" }, rid));
  } catch { return error(c, rid, 503, "DB_UNAVAILABLE", "Центр управления временно недоступен"); }
});

admin.get("/content/validate", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, STRICT_ADMINS)) return;
  try {
    const [tests, questions, links, exam] = await Promise.all([
      db.from("tests").select("id,title,is_published,archived_at").limit(1000),
      db.from("questions").select("id,is_published,archived_at").limit(5000),
      db.from("test_questions").select("test_id,question_id").limit(10000),
      db.from("exam_questions").select("id,text,answer,subject_slug,type,is_published").eq("is_published", true).limit(5000)
    ]);
    if (tests.error || questions.error || links.error || exam.error) return error(c, rid, 503, "VALIDATION_FAILED", "Не удалось проверить данные");
    const testIds = new Set((tests.data || []).map((x: any) => String(x.id)));
    const questionIds = new Set((questions.data || []).map((x: any) => String(x.id)));
    const counts: Record<string, number> = {};
    const issues: any[] = [];
    for (const link of links.data || []) {
      const tid = String((link as any).test_id), qid = String((link as any).question_id);
      counts[tid] = (counts[tid] || 0) + 1;
      if (!testIds.has(tid)) issues.push({ type: "orphan_test_link", test_id: tid, question_id: qid });
      if (!questionIds.has(qid)) issues.push({ type: "orphan_question_link", test_id: tid, question_id: qid });
    }
    for (const test of tests.data || []) if ((test as any).is_published && !(test as any).archived_at && !(counts[String((test as any).id)] > 0)) issues.push({ type: "published_test_without_questions", id: (test as any).id, title: (test as any).title || "" });
    for (const question of exam.data || []) if (!String((question as any).answer || "").trim() && ["mc","mcq","case"].includes(String((question as any).type || ""))) issues.push({ type: "published_exam_question_without_answer", id: (question as any).id, subject_slug: (question as any).subject_slug || null });
    return c.json(ok({ ok: issues.length === 0, issues: issues.slice(0, 500), count: issues.length, checked: { tests: tests.data?.length || 0, questions: questions.data?.length || 0, test_questions: links.data?.length || 0, exam_questions: exam.data?.length || 0 } }, rid));
  } catch { return error(c, rid, 503, "VALIDATION_FAILED", "Не удалось проверить данные"); }
});

// Questions: preserve the legacy exam_questions contract used by the admin editor.
admin.get("/questions", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c)) return;
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
  } catch { return error(c, rid, 503, "DB_UNAVAILABLE", "Банк вопросов временно недоступен"); }
});
admin.post("/questions", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), input = await bodyJson(c);
  if (!await gate(c)) return;
  if (!input || !validText(input.text, 30000) || !validText(input.subject_slug || "general", 100)) return error(c, rid, 422, "VALIDATION_ERROR", "Текст вопроса и предмет обязательны");
  const row = pick({ subject: "Общий", subject_slug: "general", type: "open", kind: "ticket", is_published: true, ...input }, QUESTION_FIELDS);
  try {
    const { data, error: dbError } = await db.from("exam_questions").insert(row).select("*").single();
    if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос");
    return c.json(ok({ question: data }, rid), 201);
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос"); }
});
admin.put("/questions/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), input = await bodyJson(c);
  if (!await gate(c)) return;
  if (!UUID.test(id) && !/^[-a-zA-Z0-9_]{1,100}$/.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID вопроса");
  const patch = pick(input, QUESTION_FIELDS);
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
  if (patch.text !== undefined && !validText(patch.text, 30000)) return error(c, rid, 422, "VALIDATION_ERROR", "Текст вопроса обязателен");
  try {
    const { data, error: dbError } = await db.from("exam_questions").update(patch).eq("id", id).select("*").maybeSingle();
    if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос");
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
    return c.json(ok({ question: data }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос"); }
});
admin.delete("/questions/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!await gate(c)) return;
  try {
    const { data, error: dbError } = await db.from("exam_questions").delete().eq("id", id).select("id").maybeSingle();
    if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось удалить вопрос");
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
    return c.json(ok({ deleted: true }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось удалить вопрос"); }
});

admin.put("/question-bank/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), input = await bodyJson(c);
  if (!await gate(c)) return;
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
    if (type === "mcq" && options.filter((option: any) => option.correct).length !== 1) return error(c, rid, 422, "VALIDATION_ERROR", "Для одиночного выбора должен быть один правильный вариант");
  } else if (options != null && !Array.isArray(options)) return error(c, rid, 422, "VALIDATION_ERROR", "options должен быть массивом");
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
    const { data, error: writeError } = await db.from("questions").update({ type, text, answer, options: options || [], updated_at: new Date().toISOString() }).eq("id", id).select("id,subject_id,module_id,topic_id,type,text,answer,options,difficulty,is_published,source_key,archived_at").maybeSingle();
    if (writeError) return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить вопрос");
    return c.json(ok({ question: data }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось выполнить операцию с вопросом"); }
});

// Lectures are stored in site_content.payload.items; keep the legacy JSON document contract.
async function readLectures(db: any) {
  const { data, error: dbError } = await db.from("site_content").select("key,payload").eq("key", "lectures").maybeSingle();
  if (dbError) throw dbError;
  const payload = data?.payload;
  return { exists: !!data, items: Array.isArray(payload?.items) ? payload.items : [] };
}
async function writeLectures(db: any, old: any, items: any[]) {
  const payload = { items };
  if (old.exists) {
    const { error: dbError } = await db.from("site_content").update({ payload, updated_at: new Date().toISOString() }).eq("key", "lectures");
    if (dbError) throw dbError;
  } else {
    const { error: dbError } = await db.from("site_content").insert({ key: "lectures", payload, updated_at: new Date().toISOString() });
    if (dbError) throw dbError;
  }
}
admin.get("/lectures", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c)) return;
  const status = c.req.query("status") || "", subject = c.req.query("subject") || "";
  try {
    const store = await readLectures(db);
    let items = store.items;
    if (status) items = items.filter((x: any) => x.status === status);
    if (subject) items = items.filter((x: any) => x.subject_slug === subject);
    items = items.sort((a: any, b: any) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 500);
    return c.json(ok({ items, count: items.length }, rid));
  } catch { return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить лекции"); }
});
admin.post("/lectures/generate", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user"), input = await bodyJson(c);
  if (!await gate(c)) return;
  const subjectSlug = String(input?.subject_slug || "").trim();
  const topic = String(input?.topic || "").trim();
  const notes = String(input?.notes || "").trim().slice(0, 12000);
  const imageUrl = String(input?.image_url || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(subjectSlug) || !validText(topic, 500)) return error(c, rid, 422, "VALIDATION_ERROR", "subject_slug и topic обязательны");
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) return error(c, rid, 422, "VALIDATION_ERROR", "image_url должен использовать HTTPS");
  const apiKey = String(c.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return error(c, rid, 503, "AI_NOT_CONFIGURED", "Для генерации лекций настройте OPENAI_API_KEY в Cloudflare secrets");
  let generated: any;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: c.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Ты создаёшь проверяемый учебный черновик на русском языке. Не выдумывай источники и не выдавай сомнительные факты за достоверные. Верни JSON с ключами title, summary, body_md. body_md — структурированный Markdown с целями, основными разделами, кратким выводом и списком вопросов для самопроверки. Не включай HTML и внешние ссылки, если они не предоставлены." },
          { role: "user", content: JSON.stringify({ subject_slug: subjectSlug, topic, notes, image_url: imageUrl || null, task: "Сгенерируй черновик лекции для последующей проверки человеком." }) }
        ]
      }),
      signal: AbortSignal.timeout(25000)
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) return error(c, rid, 502, "AI_GENERATION_FAILED", "AI-провайдер не смог сгенерировать лекцию");
    generated = JSON.parse(String(payload.choices?.[0]?.message?.content || "{}"));
    if (!validText(generated.title, 500) || !validText(generated.body_md, 40000)) throw new Error("invalid generated document");
  } catch {
    return error(c, rid, 502, "AI_GENERATION_FAILED", "Не удалось получить корректный черновик лекции");
  }
  try {
    const store = await readLectures(db), now = new Date().toISOString();
    const lecture = {
      id: "lec-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
      title: String(generated.title).slice(0, 500), subject: subjectSlug, subject_slug: subjectSlug, topic,
      lesson_type: "lecture", summary: String(generated.summary || "").slice(0, 3000), body_md: String(generated.body_md).slice(0, 40000),
      body_html: "", media: imageUrl ? [{ type: "image", url: imageUrl }] : [], attachments: [], related_learning: { methodics: [], files: [], preparations: [], electronograms: [] },
      status: "pending_review", created_by: user.id, reviewed_by: null, published_at: null, created_at: now, updated_at: now
    };
    await writeLectures(db, store, [...store.items, lecture]);
    return c.json(ok({ lecture }, rid), 201);
  } catch {
    return error(c, rid, 503, "DB_ERROR", "Черновик создан, но не удалось сохранить лекцию");
  }
});

admin.patch("/lectures/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), input = await bodyJson(c);
  if (!await gate(c)) return;
  const patch = pick(input, LECTURE_FIELDS);
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
  if (patch.title !== undefined && !validText(patch.title, 500)) return error(c, rid, 422, "VALIDATION_ERROR", "Название лекции обязательно");
  try {
    const store = await readLectures(db), index = store.items.findIndex((x: any) => String(x.id) === id);
    if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Лекция не найдена");
    const updated = { ...store.items[index], ...patch, updated_at: new Date().toISOString() };
    store.items[index] = updated;
    await writeLectures(db, store, store.items);
    return c.json(ok({ lecture: updated }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить лекцию"); }
});
admin.post("/lectures/:id/publish", requireAuth, async (c) => setLectureStatus(c, "published", ["admin", "moderator"]));
admin.post("/lectures/:id/reject", requireAuth, async (c) => setLectureStatus(c, "rejected", ["admin", "moderator"]));
async function setLectureStatus(c: any, status: string, roles: string[]) {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? ""), user = c.get("user");
  if (!await gate(c, roles)) return;
  try {
    const store = await readLectures(db), index = store.items.findIndex((x: any) => String(x.id) === id);
    if (index < 0) return error(c, rid, 404, "NOT_FOUND", "Лекция не найдена");
    const now = new Date().toISOString();
    store.items[index] = { ...store.items[index], status, reviewed_by: user.id, published_at: status === "published" ? now : null, updated_at: now };
    await writeLectures(db, store, store.items);
    return c.json(ok({ lecture: store.items[index] }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось изменить статус лекции"); }
}
admin.delete("/lectures/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = (c.req.param("id") ?? "");
  if (!await gate(c, ["admin", "moderator"])) return;
  try {
    const store = await readLectures(db), items = store.items.filter((x: any) => String(x.id) !== id);
    if (items.length === store.items.length) return error(c, rid, 404, "NOT_FOUND", "Лекция не найдена");
    await writeLectures(db, store, items);
    return c.json(ok({ deleted: true }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось удалить лекцию"); }
});

// User and role administration is restricted to administrators only.
admin.get("/users", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, STRICT_ADMINS)) return;
  try {
    const { data, error: dbError } = await db.from("users").select("id,email,full_name,course_number,semester,created_at").order("created_at", { ascending: false }).limit(100);
    if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить пользователей");
    const ids = (data || []).map((u: any) => u.id).filter(Boolean);
    let roleMap: Record<string, string[]> = {};
    if (ids.length) {
      const { data: roles, error: rolesError } = await db.from("user_roles").select("user_id,roles(code)").in("user_id", ids);
      if (rolesError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить роли пользователей");
      for (const row of roles || []) {
        const role = Array.isArray((row as any).roles) ? (row as any).roles[0] : (row as any).roles;
        (roleMap[(row as any).user_id] ||= []).push(String(role?.code || ""));
      }
    }
    const userIds = (data || []).map((u: any) => u.id).filter(Boolean);
    const groupMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: memberships, error: membershipsError } = await db.from("group_memberships").select("user_id,group_id,groups(name,code,course_number)").in("user_id", userIds).eq("is_active", true);
      if (membershipsError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить группы пользователей");
      for (const membership of memberships || []) {
        const group = Array.isArray((membership as any).groups) ? (membership as any).groups[0] : (membership as any).groups;
        groupMap[(membership as any).user_id] = { group_id: (membership as any).group_id, group_name: group?.name || null, group_code: group?.code || null, course_number: group?.course_number || null };
      }
    }
    return c.json(ok({ items: (data || []).map((u: any) => ({ ...u, roles: roleMap[u.id] || [], ...(groupMap[u.id] || {}) })) }, rid));
  } catch { return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить пользователей"); }
});
admin.post("/users/roles", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user"), input = await bodyJson(c);
  if (!await gate(c, STRICT_ADMINS)) return;
  const userId = String(input?.user_id || ""), roleCode = String(input?.role || ""), action = String(input?.action || "assign");
  if (!UUID.test(userId) || !["admin","moderator","teacher","student"].includes(roleCode) || !["assign","revoke"].includes(action)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректные user_id, role или action");
  try {
    const { data: role, error: roleError } = await db.from("roles").select("id,code").eq("code", roleCode).maybeSingle();
    if (roleError || !role) return error(c, rid, 503, "ROLE_UNAVAILABLE", "Роль не найдена");
    if (action === "revoke" && roleCode === "admin" && userId === user.id) {
      const { data: allRoleRows, error: adminError } = await db.from("user_roles").select("user_id,roles(code)").limit(2000);
      if (adminError) return error(c, rid, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить количество администраторов");
      const adminIds = new Set((allRoleRows || []).filter((row: any) => {
        const roleValue = Array.isArray(row.roles) ? row.roles[0] : row.roles;
        return roleValue?.code === "admin";
      }).map((row: any) => row.user_id));
      if (adminIds.size <= 1) return error(c, rid, 409, "LAST_ADMIN", "Нельзя снять роль последнего администратора");
    }
    if (action === "assign") {
      const { data: existing, error: existingError } = await db.from("user_roles").select("user_id").eq("user_id", userId).eq("role_id", role.id).maybeSingle();
      if (existingError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось проверить назначенную роль");
      if (!existing) {
        const { error: writeError } = await db.from("user_roles").insert({ user_id: userId, role_id: role.id });
        if (writeError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось назначить роль");
      }
    } else {
      const { error: writeError } = await db.from("user_roles").delete().eq("user_id", userId).eq("role_id", role.id);
      if (writeError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось снять роль");
    }
    const { data: rows } = await db.from("user_roles").select("roles(code)").eq("user_id", userId).limit(20);
    const roles = (rows || []).map((row: any) => { const r = Array.isArray(row.roles) ? row.roles[0] : row.roles; return String(r?.code || ""); }).filter(Boolean);
    return c.json(ok({ roles, session_refresh_required: userId === user.id }, rid));
  } catch { return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось изменить роли пользователя"); }
});

// Assign group / course / semester to a user (admin CMS).
admin.put("/users/:id/academic", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, STRICT_ADMINS)) return;
  const userId = c.req.param("id") ?? "";
  if (!UUID.test(userId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID пользователя");
  const input = await bodyJson(c);
  if (!input) return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  const groupId = String(input.group_id || "").trim();
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "group_id обязателен (UUID)");
  const semester = input.semester != null ? Number(input.semester) : null;
  const courseNumber = input.course_number != null ? Number(input.course_number) : input.course != null ? Number(input.course) : null;
  try {
    const { data: group, error: groupError } = await db
      .from("groups")
      .select("id,name,code,course_number,is_active")
      .eq("id", groupId)
      .maybeSingle();
    if (groupError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось проверить группу");
    if (!group || group.is_active === false) return error(c, rid, 404, "NOT_FOUND", "Активная группа не найдена");

    // Ensure the target membership is active before deactivating any previous membership.
    const { data: existing, error: existingError } = await db
      .from("group_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("group_id", groupId)
      .limit(1)
      .maybeSingle();
    if (existingError) return error(c, rid, 503, "DB_ERROR", "Не удалось проверить членство в группе");
    if (existing?.id) {
      const { error: mErr } = await db
        .from("group_memberships")
        .update({ is_active: true, role_in_group: "student" })
        .eq("id", existing.id);
      if (mErr) return error(c, rid, 503, "DB_ERROR", "Не удалось обновить членство в группе");
    } else {
      const { error: mErr } = await db.from("group_memberships").insert({
        user_id: userId,
        group_id: groupId,
        role_in_group: "student",
        is_active: true,
      });
      if (mErr) return error(c, rid, 503, "DB_ERROR", "Не удалось создать членство в группе");
    }
    const { error: deactivateError } = await db
      .from("group_memberships")
      .update({ is_active: false })
      .eq("user_id", userId)
      .neq("group_id", groupId)
      .eq("is_active", true);
    if (deactivateError) return error(c, rid, 503, "DB_ERROR", "Группа назначена, но не удалось закрыть прежнее членство");

    const userPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const resolvedSemester = semester != null && Number.isFinite(semester) ? semester : null;
    const resolvedCourse =
      courseNumber != null && Number.isFinite(courseNumber)
        ? courseNumber
        : group.course_number ?? null;
    if (resolvedSemester != null) userPatch.semester = resolvedSemester;
    if (resolvedCourse != null) userPatch.course_number = resolvedCourse;

    const { data: userRow, error: userError } = await db
      .from("users")
      .update(userPatch)
      .eq("id", userId)
      .select("id,email,full_name,course_number,semester")
      .maybeSingle();
    if (userError) return error(c, rid, 503, "DB_ERROR", "Членство сохранено, но профиль users не обновлён");

    return c.json(
      ok(
        {
          user: userRow,
          group_id: groupId,
          group: {
            id: group.id,
            name: group.name,
            code: group.code,
            course: group.course_number ?? null,
            course_number: group.course_number ?? null,
            semester: resolvedSemester,
          },
          semester: userRow?.semester ?? resolvedSemester,
          course_number: userRow?.course_number ?? resolvedCourse,
        },
        rid
      )
    );
  } catch {
    return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить академические данные");
  }
});


// Telegram chat management. Bot token and webhook secret are Worker secrets only.
admin.get("/telegram/chats", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, ["admin","moderator"])) return;
  try {
    const { data, error: dbError } = await db.from("telegram_bot_chats").select("*,groups(name,code)").order("created_at", { ascending: false }).limit(500);
    if (dbError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить Telegram-чаты");
    return c.json(ok({ items: data || [] }, rid));
  } catch { return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить Telegram-чаты"); }
});
admin.post("/telegram/chats/:chatId/bind", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), chatId = (c.req.param("chatId") ?? ""), input = await bodyJson(c);
  if (!await gate(c, ["admin","moderator"])) return;
  const groupId = String(input?.group_id || "");
  if (!/^-?\d{1,24}$/.test(chatId) || !UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный chat ID или group_id");
  try {
    const { data: group, error: groupError } = await db.from("groups").select("id").eq("id", groupId).eq("is_active", true).maybeSingle();
    if (groupError || !group) return error(c, rid, 404, "NOT_FOUND", "Активная группа не найдена");
    const { data, error: dbError } = await db.from("telegram_bot_chats").update({ group_id: groupId, is_verified: true, updated_at: new Date().toISOString() }).eq("telegram_chat_id", Number(chatId)).select("*").maybeSingle();
    if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось привязать Telegram-чат");
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Чат ещё не зарегистрирован ботом");
    return c.json(ok({ chat: data }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось привязать Telegram-чат"); }
});
admin.post("/telegram/set-webhook", requireAuth, async (c) => {
  const rid = requestId();
  if (!await gate(c, STRICT_ADMINS)) return;
  const token = String(c.env.TELEGRAM_BOT_TOKEN || "").trim();
  const secret = String(c.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const origin = String(c.env.TELEGRAM_WEBHOOK_ORIGIN || "").trim().replace(/\/$/, "");
  const explicitWebhookUrl = String(c.env.TELEGRAM_WEBHOOK_URL || "").trim();
  if (!token || (!origin && !explicitWebhookUrl)) return error(c, rid, 503, "TELEGRAM_NOT_CONFIGURED", "Настройте TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_URL (или TELEGRAM_WEBHOOK_ORIGIN)");
  let response: Response;
  try {
    response = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: explicitWebhookUrl || (() => { try { const parsed = new URL(origin); if (parsed.pathname !== "/" && parsed.pathname !== "") return parsed.toString(); return origin.includes(".workers.dev") ? origin + "/api/webhook" : origin + "/api/v1/telegram/webhook"; } catch { return origin; } })(), allowed_updates: ["message","edited_message"], ...(secret ? { secret_token: secret } : {}) }),
      signal: AbortSignal.timeout(12000),
    });
  } catch { return error(c, rid, 502, "TELEGRAM_WEBHOOK_FAILED", "Не удалось связаться с Telegram"); }
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) return error(c, rid, 502, "TELEGRAM_WEBHOOK_FAILED", "Telegram отклонил настройку webhook");
  return c.json(ok({ configured: true, url: explicitWebhookUrl || (() => { try { const parsed = new URL(origin); if (parsed.pathname !== "/" && parsed.pathname !== "") return parsed.toString(); return origin.includes(".workers.dev") ? origin + "/api/webhook" : origin + "/api/v1/telegram/webhook"; } catch { return origin; } })() }, rid));
});

// Admin content import: bounded, allowlisted and repeatable by source_key/primary key.
admin.post("/content/import", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), input = await bodyJson(c);
  if (!await gate(c, STRICT_ADMINS)) return;
  if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Передайте пакет импорта в JSON");
  // Workbook importer contract: { tests, questions, test_questions, dry_run }.
  if (Array.isArray(input.tests) || Array.isArray(input.questions) || Array.isArray(input.test_questions)) {
    const tests = Array.isArray(input.tests) ? input.tests : [];
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const links = Array.isArray(input.test_questions) ? input.test_questions : [];
    if (tests.length + questions.length + links.length < 1 || tests.length + questions.length + links.length > 500) return error(c, rid, 422, "VALIDATION_ERROR", "Пакет должен содержать от 1 до 500 строк");
    const dryRun = input.dry_run === true;
    try {
      const subjectCache = new Map<string, string>();
      async function subjectId(key: unknown) {
        const slug = String(key || "").trim();
        if (!slug) return null;
        if (subjectCache.has(slug)) return subjectCache.get(slug);
        if (!/^[a-zA-Z0-9 _.-]{1,120}$/.test(slug)) throw new Error("subject mapping invalid");
        const { data: bySlug, error: slugError } = await db.from("subjects").select("id,slug,name").eq("slug", slug).limit(2);
        if (slugError) throw slugError;
        let matches = bySlug || [];
        if (matches.length === 0) {
          const { data: byName, error: nameError } = await db.from("subjects").select("id,slug,name").eq("name", slug).limit(2);
          if (nameError) throw nameError;
          matches = byName || [];
        }
        if (matches.length !== 1) throw new Error("subject mapping ambiguous or missing");
        subjectCache.set(slug, String(matches[0].id));
        return String(matches[0].id);
      }
      async function academicRef(table: "modules" | "topics", key: unknown) {
        const value = String(key || "").trim();
        if (!value) return null;
        if (UUID.test(value)) {
          const { data, error: lookupError } = await db.from(table).select("id").eq("id", value).maybeSingle();
          if (lookupError) throw lookupError;
          if (!data) throw new Error("academic mapping missing");
          return String(data.id);
        }
        if (!/^[a-zA-Z0-9 _.-]{1,120}$/.test(value)) throw new Error("academic mapping invalid");
        const { data: bySlug, error: slugError } = await db.from(table).select("id,slug,name").eq("slug", value).limit(2);
        if (slugError) throw slugError;
        let matches = bySlug || [];
        if (!matches.length) {
          const { data: byName, error: nameError } = await db.from(table).select("id,slug,name").eq("name", value).limit(2);
          if (nameError) throw nameError;
          matches = byName || [];
        }
        if (matches.length !== 1) throw new Error("academic mapping ambiguous or missing");
        return String(matches[0].id);
      }
      const mappedTests: any[] = [];
      const mappedQuestions: any[] = [];
      for (const row of tests) {
        if (!row || typeof row !== "object" || !validText(row.test_key, 180) || !validText(row.title, 500)) throw new Error("invalid test row");
        const sid = await subjectId(row.subject_key);
        if (!sid) throw new Error("subject missing");
        const moduleId = await academicRef("modules", row.module_key);
        const topicId = await academicRef("topics", row.topic_key);
        const timeLimit = row.time_limit_sec == null || row.time_limit_sec === "" ? null : Number(row.time_limit_sec);
        const maxAttempts = row.max_attempts == null || row.max_attempts === "" ? 3 : Number(row.max_attempts);
        if ((timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit < 0 || timeLimit > 86400)) || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) throw new Error("invalid test limits");
        mappedTests.push({ source_key: row.test_key, title: row.title, subject_id: sid, module_id: moduleId, topic_id: topicId, time_limit_sec: timeLimit, max_attempts: maxAttempts, is_published: row.is_published === true || row.is_published === "true" });
      }
      for (const row of questions) {
        if (!row || typeof row !== "object" || !validText(row.question_key, 180) || !validText(row.text, 30000)) throw new Error("invalid question row");
        const sid = await subjectId(row.subject_key);
        if (!sid) throw new Error("subject missing");
        let options = row.options;
        if (typeof options === "string" && options.trim()) { try { options = JSON.parse(options); } catch { throw new Error("invalid options JSON"); } }
        if (options == null || options === "") options = [];
        if (!Array.isArray(options)) throw new Error("invalid options");
        const moduleId = await academicRef("modules", row.module_key);
        const topicId = await academicRef("topics", row.topic_key);
        const difficulty = row.difficulty == null || row.difficulty === "" ? null : Number(row.difficulty);
        if (difficulty !== null && (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 10)) throw new Error("invalid difficulty");
        mappedQuestions.push({ source_key: row.question_key, text: row.text, subject_id: sid, module_id: moduleId, topic_id: topicId, type: String(row.type || "open"), answer: String(row.answer || ""), options, difficulty, is_published: row.is_published === true || row.is_published === "true" });
      }
      if (dryRun) return c.json(ok({ dry_run: true, valid: true, counts: { tests: mappedTests.length, questions: mappedQuestions.length, test_questions: links.length } }, rid));
      if (mappedQuestions.length) {
        const { error: writeError } = await db.from("questions").upsert(mappedQuestions, { onConflict: "source_key" });
        if (writeError) return error(c, rid, 503, "IMPORT_FAILED", "Не удалось импортировать вопросы; проверьте уникальность source_key");
      }
      if (mappedTests.length) {
        const { error: writeError } = await db.from("tests").upsert(mappedTests, { onConflict: "source_key" });
        if (writeError) return error(c, rid, 503, "IMPORT_FAILED", "Не удалось импортировать тесты; проверьте уникальность source_key");
      }
      for (const link of links) {
        if (!link || typeof link !== "object" || !validText(link.test_key, 180) || !validText(link.question_key, 180)) throw new Error("invalid test link");
        const { data: test, error: testError } = await db.from("tests").select("id").eq("source_key", link.test_key).maybeSingle();
        const { data: question, error: questionError } = await db.from("questions").select("id").eq("source_key", link.question_key).maybeSingle();
        if (testError || questionError || !test || !question) throw new Error("unresolved test link");
        const { error: linkError } = await db.from("test_questions").upsert({ test_id: test.id, question_id: question.id, order_index: Number(link.order_index || 0) }, { onConflict: "test_id,question_id" });
        if (linkError) return error(c, rid, 503, "IMPORT_FAILED", "Не удалось связать вопросы с тестами");
      }
      return c.json(ok({ imported: { tests: mappedTests.length, questions: mappedQuestions.length, test_questions: links.length }, dry_run: false }, rid), 201);
    } catch (e) {
      const message = e instanceof Error && e.message.includes("subject") ? "Предмет не найден или его slug неоднозначен; укажите уникальный subject_key" : e instanceof Error && e.message.includes("academic") ? "Модуль или тема не найдены либо имеют неоднозначное имя" : e instanceof Error && e.message.includes("options") ? "Поле options содержит некорректный JSON-массив" : "Пакет содержит некорректные строки или неизвестные ссылки";
      return error(c, rid, 422, "VALIDATION_ERROR", message);
    }
  }
  // Explicit single-table import for internal admin tooling.
  const table = String(input.table || ""), rows = Array.isArray(input.rows) ? input.rows : (input.row && typeof input.row === "object" ? [input.row] : []);
  if (!IMPORT_TABLES.has(table) || !rows.length || rows.length > 500) return error(c, rid, 422, "VALIDATION_ERROR", "Разрешены только поддерживаемые таблицы и пакет до 500 строк");
  try {
    const safeRows = rows.map((row: any) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("invalid row");
      const copy = { ...row };
      for (const key of ["created_by","updated_by","actor_user_id","user_id","owner_id","is_admin"]) delete copy[key];
      if (table === "trainer_feed_cards" && copy.subject_slug === "histology" && copy.specialty_slug !== "mbh") throw new Error("histology scope must be mbh");
      return copy;
    });
    if (input.dry_run === true) return c.json(ok({ dry_run: true, valid: true, table, count: safeRows.length }, rid));
    const conflict = table === "test_questions" ? "test_id,question_id" : "id";
    const { error: dbError } = await db.from(table).upsert(safeRows, { onConflict: conflict, ignoreDuplicates: false });
    if (dbError) return error(c, rid, 503, "IMPORT_FAILED", "Импорт не выполнен; проверьте схему и уникальные ключи");
    return c.json(ok({ imported: safeRows.length, table }, rid), 201);
  } catch (e) {
    const message = e instanceof Error && e.message.includes("histology scope") ? "Пакет гистологии должен иметь specialty_slug=mbh" : "Некорректная строка импорта";
    return error(c, rid, 422, "VALIDATION_ERROR", message);
  }
});

// Legacy content-package import, deliberately bounded and scoped.
admin.post("/content/package/import", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), input = await bodyJson(c);
  if (!await gate(c, STRICT_ADMINS)) return;
  if (!input) return error(c, rid, 422, "VALIDATION_ERROR", "Передайте пакет в JSON");
  const subjectSlug = String(input.subject_slug || ""), specialty = String(input.specialty_slug || "");
  if (subjectSlug === "histology" && specialty !== "mbh") return error(c, rid, 422, "VALIDATION_ERROR", "Пакет гистологии должен быть ограничен specialty_slug=mbh");
  let packageSubjectId = String(input.subject_id || "");
  if (!packageSubjectId && subjectSlug) {
    const { data: subjects, error: subjectError } = await db.from("subjects").select("id").eq("slug", subjectSlug).limit(2);
    if (subjectError) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сопоставить предмет пакета");
    if ((subjects || []).length > 1) return error(c, rid, 422, "AMBIGUOUS_SUBJECT", "Укажите subject_id: slug предмета неоднозначен");
    packageSubjectId = String(subjects?.[0]?.id || "");
  }
  const allowed = ["sources","materials","trainer_cards","tests","questions","test_questions"];
  const total = allowed.reduce((n, key) => n + (Array.isArray(input[key]) ? input[key].length : 0), 0);
  if (total < 1 || total > 500) return error(c, rid, 422, "VALIDATION_ERROR", "Пакет должен содержать от 1 до 500 записей");
  const stats: Record<string, number> = {};
  const tableMap: Record<string, string> = { sources: "content_sources", materials: "materials", trainer_cards: "trainer_feed_cards", tests: "tests", questions: "questions", test_questions: "test_questions" };
  try {
    for (const key of allowed) {
      const rows = Array.isArray(input[key]) ? input[key] : [];
      if (!rows.length) continue;
      const table = tableMap[key];
      const safeRows = rows.map((row: any) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("invalid row");
        const copy = { ...row };
        for (const field of ["created_by","updated_by","actor_user_id","user_id","owner_id"]) delete copy[field];
        if (["materials","tests","trainer_cards"].includes(key) && !copy.subject_id && packageSubjectId) copy.subject_id = packageSubjectId;
        if (key === "trainer_cards") { if (!copy.subject_slug) copy.subject_slug = subjectSlug; if (!copy.specialty_slug) copy.specialty_slug = specialty; }
        if (key === "questions" && !copy.subject_slug) copy.subject_slug = subjectSlug;
        if (subjectSlug === "histology") {
          if (key === "trainer_cards" && (copy.specialty_slug || specialty) !== "mbh") throw new Error("histology scope");
          if (key === "questions" && copy.subject_slug && copy.subject_slug !== "histology") throw new Error("histology scope");
        }
        return copy;
      });
      const conflict = key === "test_questions" ? "test_id,question_id" : key === "sources" ? "id" : key === "materials" || key === "tests" ? "source_key" : "id";
      const { error: dbError } = await db.from(table).upsert(safeRows, { onConflict: conflict, ignoreDuplicates: false });
      if (dbError) return error(c, rid, 503, "IMPORT_FAILED", "Импорт прерван на наборе " + key + "; проверьте схему/уникальные ключи");
      stats[key] = safeRows.length;
    }
    return c.json(ok({ imported: stats, total }, rid), 201);
  } catch (e) {
    const message = e instanceof Error && e.message.includes("histology scope") ? "Пакет гистологии вышел за разрешённую область" : "Некорректный пакет импорта";
    return error(c, rid, 422, "VALIDATION_ERROR", message);
  }
});

// Storage audit is strict-admin-only and uses the server key after the role gate.
function createServiceDb(env: Env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
  return key ? createClient(env.SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }) : null;
}

admin.get("/files/capabilities", requireAuth, async (c) => {
  const rid = requestId();
  if (!await gate(c, STRICT_ADMINS)) return;
  return c.json(ok({
    runtime: "cloudflare-workers",
    extensions: { gd: false, imagick: false, exif: false, fileinfo: true, mbstring: false },
    image: { webp_gd: false, avif_gd: false, webp_imagick: false, avif_imagick: false },
    commands: { ffmpeg: false, ffprobe: false, cwebp: false, avifenc: false },
    storage: {
      upstash_blob_configured: Boolean(c.env.UPSTASH_BLOB_TOKEN),
      redis_configured: Boolean(c.env.UPSTASH_REDIS_REST_URL && c.env.UPSTASH_REDIS_REST_TOKEN),
      b2_download_supported: false,
    },
    policy: { optimizer_mode: "capability_detect_then_quality_gate", original_deleted: false, video_full_hd_required: true },
  }, rid));
});

admin.get("/files/audit", requireAuth, async (c) => {
  const rid = requestId();
  if (!await gate(c, STRICT_ADMINS)) return;
  const db = createServiceDb(c.env);
  if (!db) return error(c, rid, 503, "SERVICE_DATABASE_NOT_CONFIGURED", "Storage audit is not configured");
  const limit = Math.max(1, Math.min(1000, Number(c.req.query("limit") || 200)));
  try {
    const count = async (query: any) => {
      const { count: value, error: queryError } = await query;
      if (queryError) throw queryError;
      return value || 0;
    };
    const [activeFiles, deletedFiles, missingObjectNull, missingObjectEmpty, missingHashNull, missingHashEmpty,
      b2Files, spacewebFiles, unknownFiles, processingFiles, failedProcessing] = await Promise.all([
      count(db.from("files").select("id", { count: "exact", head: true }).eq("status", "active")),
      count(db.from("files").select("id", { count: "exact", head: true }).eq("status", "deleted")),
      count(db.from("files").select("id", { count: "exact", head: true }).is("object_key", null)),
      count(db.from("files").select("id", { count: "exact", head: true }).eq("object_key", "")),
      count(db.from("files").select("id", { count: "exact", head: true }).is("sha256", null)),
      count(db.from("files").select("id", { count: "exact", head: true }).eq("sha256", "")),
      count(db.from("files").select("id", { count: "exact", head: true }).eq("storage_provider", "b2")),
      count(db.from("files").select("id", { count: "exact", head: true }).eq("storage_provider", "spaceweb")),
      count(db.from("files").select("id", { count: "exact", head: true }).eq("storage_provider", "unknown")),
      count(db.from("files").select("id", { count: "exact", head: true }).in("processing_status", ["queued", "processing"])),
      count(db.from("files").select("id", { count: "exact", head: true }).eq("processing_status", "failed")),
    ]);
    const { data: rows, error: rowsError } = await db.from("files")
      .select("id,original_name,mime_type,size_bytes,object_key,b2_file_id,uploaded_by,group_id,visibility,status,specialty_slug,sha256,storage_provider,processing_status,created_at")
      .eq("status", "active").order("created_at", { ascending: false }).limit(limit);
    if (rowsError) throw rowsError;
    const ids = (rows || []).map((row: any) => row.id).filter(Boolean);
    const loadRefs = async (table: string, column: string) => {
      if (!ids.length) return [] as any[];
      const { data, error: refsError } = await db.from(table).select(column).in(column, ids).not(column, "is", null);
      if (refsError) throw refsError;
      return data || [];
    };
    const [materials, trainers, attachments, submissions] = await Promise.all([
      loadRefs("materials", "file_id"),
      loadRefs("trainer_feed_cards", "source_file_id"),
      loadRefs("homework_attachments", "file_id"),
      loadRefs("homework_submissions", "file_id"),
    ]);
    const tally = (list: any[], column: string) => {
      const result = new Map<string, number>();
      for (const row of list) {
        const id = String(row[column] || "");
        if (id) result.set(id, (result.get(id) || 0) + 1);
      }
      return result;
    };
    const m = tally(materials, "file_id"), t = tally(trainers, "source_file_id");
    const ha = tally(attachments, "file_id"), hs = tally(submissions, "file_id");
    const items = (rows || []).map((row: any) => {
      const material_refs = m.get(String(row.id)) || 0;
      const trainer_refs = t.get(String(row.id)) || 0;
      const homework_attachment_refs = ha.get(String(row.id)) || 0;
      const homework_submission_refs = hs.get(String(row.id)) || 0;
      return { ...row, material_refs, trainer_refs, homework_attachment_refs, homework_submission_refs,
        total_refs: material_refs + trainer_refs + homework_attachment_refs + homework_submission_refs };
    }).sort((a: any, b: any) => a.total_refs - b.total_refs || String(b.created_at).localeCompare(String(a.created_at)));
    return c.json(ok({
      summary: {
        active_files: activeFiles, deleted_files: deletedFiles,
        missing_object_key: missingObjectNull + missingObjectEmpty,
        missing_sha256: missingHashNull + missingHashEmpty,
        b2_files: b2Files, spaceweb_files: spacewebFiles, unknown_files: unknownFiles,
        processing_files: processingFiles, failed_processing: failedProcessing,
      },
      items,
      limit,
    }, rid));
  } catch (auditError) {
    console.error("[admin:files-audit]", { error: String(auditError), requestId: rid });
    return error(c, rid, 503, "FILE_AUDIT_ERROR", "Storage audit is temporarily unavailable");
  }
});

admin.post("/files/:id/process-image", requireAuth, async (c) => {
  const rid = requestId();
  if (!await gate(c, STRICT_ADMINS)) return;
  return error(c, rid, 501, "MEDIA_PROCESSING_UNAVAILABLE", "Image processing is not available in the Cloudflare Worker runtime");
});

// --- Admin schedule read/write ---
admin.get("/schedule", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c)) return;
  const groupId = String(c.req.query("group_id") || "").trim();
  const semester = Number(c.req.query("semester") || 0) || null;
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "group_id обязателен (UUID)");
  try {
    let q = db.from("schedules").select("id,group_id,semester,version,is_active,academic_year_id").eq("group_id", groupId).eq("is_active", true).limit(20);
    if (semester != null) q = q.eq("semester", semester);
    const { data: schedules, error: sErr } = await q;
    if (sErr) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить расписание");
    const scheduleIds = (schedules || []).map((s: any) => s.id).filter(Boolean);
    if (!scheduleIds.length) return c.json(ok({ items: [], schedules: [], group_id: groupId, semester }, rid));
    const { data: entries, error: eErr } = await db
      .from("schedule_entries")
      .select("id,schedule_id,date,start_time,end_time,subject_id,subject_name,type,building,room,notes,academic_hours,week_parity,is_cancelled,is_makeup,teacher,sort_order")
      .in("schedule_id", scheduleIds)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(2000);
    if (eErr) return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить занятия");
    return c.json(ok({ items: entries || [], schedules: schedules || [], group_id: groupId, semester }, rid));
  } catch {
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить расписание");
  }
});

admin.put("/schedule", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, STRICT_ADMINS)) return;
  const input = await bodyJson(c);
  if (!input) return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  const groupId = String(input.group_id || "").trim();
  const semester = Number(input.semester || 0);
  if (!UUID.test(groupId)) return error(c, rid, 422, "VALIDATION_ERROR", "group_id обязателен");
  if (!semester || semester < 1 || semester > 12) return error(c, rid, 422, "VALIDATION_ERROR", "semester 1–12");
  const entries = Array.isArray(input.entries) ? input.entries : [];
  if (entries.length > 2000) return error(c, rid, 422, "VALIDATION_ERROR", "Слишком много занятий (max 2000)");
  try {
    let { data: existing } = await db
      .from("schedules")
      .select("id,version")
      .eq("group_id", groupId)
      .eq("semester", semester)
      .eq("is_active", true)
      .maybeSingle();
    let scheduleId = existing?.id as string | undefined;
    if (!scheduleId) {
      const { data: created, error: cErr } = await db
        .from("schedules")
        .insert({ group_id: groupId, semester, is_active: true, version: 1 })
        .select("id,version")
        .maybeSingle();
      if (cErr || !created) return error(c, rid, 503, "DB_ERROR", cErr?.message || "Не удалось создать schedule");
      scheduleId = created.id;
    } else {
      await db.from("schedules").update({ version: Number(existing?.version || 0) + 1 }).eq("id", scheduleId);
    }
    const { error: delErr } = await db.from("schedule_entries").delete().eq("schedule_id", scheduleId);
    if (delErr) return error(c, rid, 503, "DB_ERROR", delErr.message || "Не удалось очистить занятия");
    if (!entries.length) return c.json(ok({ saved: 0, schedule_id: scheduleId, group_id: groupId, semester }, rid));
    const rows = entries.map((e: any, i: number) => ({
      schedule_id: scheduleId,
      date: String(e.date || "").slice(0, 10) || null,
      start_time: String(e.start_time || e.startTime || "").slice(0, 8) || null,
      end_time: String(e.end_time || e.endTime || "").slice(0, 8) || null,
      subject_id: e.subject_id && UUID.test(String(e.subject_id)) ? e.subject_id : null,
      subject_name: e.subject_name || e.subject || e.title || null,
      type: e.type || e.lesson_type || "lecture",
      building: e.building || null,
      room: e.room || null,
      notes: e.notes || null,
      academic_hours: e.academic_hours != null ? Number(e.academic_hours) : null,
      week_parity: e.week_parity || null,
      is_cancelled: Boolean(e.is_cancelled),
      is_makeup: Boolean(e.is_makeup),
      teacher: e.teacher || null,
      sort_order: e.sort_order != null ? Number(e.sort_order) : i,
    })).filter((r: any) => r.date && r.start_time);
    let saved = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: insErr } = await db.from("schedule_entries").insert(chunk);
      if (insErr) return error(c, rid, 503, "DB_ERROR", insErr.message || "Не удалось сохранить занятия");
      saved += chunk.length;
    }
    return c.json(ok({ saved, schedule_id: scheduleId, group_id: groupId, semester }, rid));
  } catch {
    return error(c, rid, 503, "DB_ERROR", "Не удалось сохранить расписание");
  }
});

admin.post("/schedule/import", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  if (!await gate(c, STRICT_ADMINS)) return;
  let groupId = "";
  let semester: number | null = null;
  let entries: any[] = [];
  const ct = (c.req.header("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const input = await bodyJson(c);
      if (!input) return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
      groupId = String(input.group_id || "").trim();
      semester = input.semester != null ? Number(input.semester) : null;
      entries = Array.isArray(input.entries) ? input.entries : [];
    } else {
      const form = await c.req.parseBody();
      groupId = String(form.group_id || "").trim();
      semester = form.semester != null ? Number(form.semester) : null;
      if (typeof form.entries === "string") {
        try { entries = JSON.parse(form.entries); } catch { entries = []; }
      }
      if (!entries.length && form.file) {
        return error(c, rid, 422, "VALIDATION_ERROR", "XLSX-парсер на Worker ещё не подключён. Передайте entries как JSON или используйте PUT /admin/schedule");
      }
    }
  } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Не удалось прочитать тело запроса");
  }
  if (!UUID.test(groupId) || !semester) return error(c, rid, 422, "VALIDATION_ERROR", "group_id и semester обязательны");
  const putReq = new Request(new URL("/api/v1/admin/schedule", c.req.url).toString(), {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: c.req.header("authorization") || "" },
    body: JSON.stringify({ group_id: groupId, semester, entries }),
  });
  return admin.fetch(putReq, c.env, c.executionCtx);
});


admin.route("/database", dbAdmin);

export default admin;
