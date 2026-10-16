import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const admin = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGERS = ["admin", "moderator", "teacher"];
const STRICT_ADMINS = ["admin"];
const LECTURE_FIELDS = ["title","subject","subject_id","subject_slug","topic","lesson_type","body_md","body_html","summary","media","sources","attachments","related_learning","status","curriculum","generation"];
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
    error(c, requestId(), 403, "FORBIDDEN", "Недостаточно прав для административной операции");
    return false;
  } catch {
    error(c, requestId(), 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
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
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id"), input = await bodyJson(c);
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
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
  if (!await gate(c)) return;
  try {
    const { data, error: dbError } = await db.from("exam_questions").delete().eq("id", id).select("id").maybeSingle();
    if (dbError) return error(c, rid, 503, "DB_ERROR", "Не удалось удалить вопрос");
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Вопрос не найден");
    return c.json(ok({ deleted: true }, rid));
  } catch { return error(c, rid, 503, "DB_ERROR", "Не удалось удалить вопрос"); }
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
admin.patch("/lectures/:id", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id"), input = await bodyJson(c);
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
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id"), user = c.get("user");
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
  const rid = requestId(), db = c.get("supabase"), id = c.req.param("id");
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
      if (!rolesError) for (const row of roles || []) {
        const role = Array.isArray((row as any).roles) ? (row as any).roles[0] : (row as any).roles;
        (roleMap[(row as any).user_id] ||= []).push(String(role?.code || ""));
      }
    }
    const userIds = (data || []).map((u: any) => u.id).filter(Boolean);
    const groupMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: memberships } = await db.from("group_memberships").select("user_id,group_id,groups(name,code,course_number)").in("user_id", userIds).eq("is_active", true);
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
      const { data: admins, error: adminError } = await db.from("user_roles").select("user_id,roles!inner(code)").eq("roles.code", "admin").limit(2);
      if (adminError) return error(c, rid, 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить количество администраторов");
      if ((admins || []).length <= 1) return error(c, rid, 409, "LAST_ADMIN", "Нельзя снять роль последнего администратора");
    }
    if (action === "assign") {
      const { error: writeError } = await db.from("user_roles").upsert({ user_id: userId, role_id: role.id }, { onConflict: "user_id,role_id", ignoreDuplicates: true });
      if (writeError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось назначить роль");
    } else {
      const { error: writeError } = await db.from("user_roles").delete().eq("user_id", userId).eq("role_id", role.id);
      if (writeError) return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось снять роль");
    }
    const { data: rows } = await db.from("user_roles").select("roles(code)").eq("user_id", userId).limit(20);
    const roles = (rows || []).map((row: any) => { const r = Array.isArray(row.roles) ? row.roles[0] : row.roles; return String(r?.code || ""); }).filter(Boolean);
    return c.json(ok({ roles, session_refresh_required: userId === user.id }, rid));
  } catch { return error(c, rid, 503, "ROLE_WRITE_FAILED", "Не удалось изменить роли пользователя"); }
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
  const rid = requestId(), db = c.get("supabase"), chatId = c.req.param("chatId"), input = await bodyJson(c);
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
      body: JSON.stringify({ url: explicitWebhookUrl || (origin.includes(".workers.dev") ? origin + "/api/webhook" : origin + "/api/v1/telegram/webhook"), allowed_updates: ["message","edited_message"], ...(secret ? { secret_token: secret } : {}) }),
      signal: AbortSignal.timeout(12000),
    });
  } catch { return error(c, rid, 502, "TELEGRAM_WEBHOOK_FAILED", "Не удалось связаться с Telegram"); }
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) return error(c, rid, 502, "TELEGRAM_WEBHOOK_FAILED", "Telegram отклонил настройку webhook");
  return c.json(ok({ configured: true, url: explicitWebhookUrl || (origin.includes(".workers.dev") ? origin + "/api/webhook" : origin + "/api/v1/telegram/webhook") }, rid));
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
      const mappedTests: any[] = [];
      const mappedQuestions: any[] = [];
      for (const row of tests) {
        if (!row || typeof row !== "object" || !validText(row.test_key, 180) || !validText(row.title, 500)) throw new Error("invalid test row");
        const sid = await subjectId(row.subject_key);
        if (!sid) throw new Error("subject missing");
        mappedTests.push({ source_key: row.test_key, title: row.title, subject_id: sid, time_limit_sec: row.time_limit_sec == null || row.time_limit_sec === "" ? null : Number(row.time_limit_sec), max_attempts: row.max_attempts == null || row.max_attempts === "" ? 3 : Number(row.max_attempts), is_published: row.is_published === true || row.is_published === "true" });
      }
      for (const row of questions) {
        if (!row || typeof row !== "object" || !validText(row.question_key, 180) || !validText(row.text, 30000)) throw new Error("invalid question row");
        const sid = await subjectId(row.subject_key);
        if (!sid) throw new Error("subject missing");
        let options = row.options;
        if (typeof options === "string" && options.trim()) { try { options = JSON.parse(options); } catch { throw new Error("invalid options JSON"); } }
        if (options == null || options === "") options = [];
        if (!Array.isArray(options)) throw new Error("invalid options");
        mappedQuestions.push({ source_key: row.question_key, text: row.text, subject_id: sid, type: String(row.type || "open"), answer: String(row.answer || ""), options, difficulty: row.difficulty == null || row.difficulty === "" ? null : Number(row.difficulty), is_published: row.is_published === true || row.is_published === "true" });
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
      const message = e instanceof Error && e.message.includes("subject") ? "Предмет не найден или его slug неоднозначен; укажите уникальный subject_key" : e instanceof Error && e.message.includes("options") ? "Поле options содержит некорректный JSON-массив" : "Пакет содержит некорректные строки или неизвестные ссылки";
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
        if (subjectSlug === "histology") {
          if (key === "trainer_cards" && (copy.specialty_slug || specialty) !== "mbh") throw new Error("histology scope");
          if (key === "questions" && copy.subject_slug && copy.subject_slug !== "histology") throw new Error("histology scope");
        }
        return copy;
      });
      const conflict = key === "test_questions" ? "test_id,question_id" : key === "sources" ? "id" : key === "materials" || key === "tests" ? "source_key" : "id";
      const { data, error: dbError } = await db.from(table).upsert(safeRows, { onConflict: conflict, ignoreDuplicates: false }).select("id");
      if (dbError) return error(c, rid, 503, "IMPORT_FAILED", "Импорт прерван на наборе " + key + "; проверьте схему/уникальные ключи");
      stats[key] = (data || []).length;
    }
    return c.json(ok({ imported: stats, total }, rid), 201);
  } catch (e) {
    const message = e instanceof Error && e.message.includes("histology scope") ? "Пакет гистологии вышел за разрешённую область" : "Некорректный пакет импорта";
    return error(c, rid, 422, "VALIDATION_ERROR", message);
  }
});

export default admin;
