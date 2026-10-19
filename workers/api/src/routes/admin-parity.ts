import { Hono } from "hono";
import type { Env } from "../env";
import { fail, ok, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { createServiceClient } from "../lib/supabase";

const parity = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGERS = ["admin", "moderator", "teacher"];
const ADMIN_ONLY = ["admin"];
const VERSION_FIELDS: Record<string, string[]> = {
  questions: ["subject_id", "module_id", "topic_id", "type", "text", "answer", "options", "difficulty", "is_published", "archived_at", "source_key"],
  tests: ["subject_id", "module_id", "topic_id", "title", "time_limit_sec", "max_attempts", "is_published", "archived_at", "source_key", "order_index"],
  materials: ["subject_id", "module_id", "topic_id", "type", "title", "file_id", "external_url", "content_html", "order_index", "is_published", "source_key"],
};

function responseError(c: any, rid: string, status: number, code: string, message: string) {
  const { body, status: responseStatus } = fail(code, message, status, rid);
  return c.json(body, responseStatus as any);
}

function dbFor(c: any) {
  return createServiceClient(c.env) || c.get("supabase");
}

async function roleCodes(c: any): Promise<string[]> {
  const user = c.get("user");
  const { data, error } = await c.get("supabase").from("user_roles").select("roles(code)").eq("user_id", user.id).limit(20);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return String(role?.code || "").toLowerCase();
  }).filter(Boolean);
}

async function gate(c: any, allowed: string[] = ADMIN_ONLY): Promise<boolean> {
  try {
    if ((await roleCodes(c)).some((role) => allowed.includes(role))) return true;
    c.res = responseError(c, requestId(), 403, "FORBIDDEN", "Недостаточно прав для административной операции");
  } catch {
    c.res = responseError(c, requestId(), 503, "ROLE_CHECK_UNAVAILABLE", "Не удалось проверить административные права");
  }
  return false;
}

async function jsonBody(c: any): Promise<any | null> {
  try {
    const value = await c.req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

async function recordVersion(db: any, table: string, id: string, data: any, actorId: string, source = "admin_ui") {
  const { data: rows, error: readError } = await db.from("content_versions").select("version_no")
    .eq("table_name", table).eq("row_key", JSON.stringify({ id }))
    .order("version_no", { ascending: false }).limit(1);
  if (readError) throw readError;
  const versionNo = Number(rows?.[0]?.version_no || 0) + 1;
  const { error: insertError } = await db.from("content_versions").insert({
    table_name: table, row_key: { id }, version_no: versionNo, data, source, actor_user_id: actorId,
  });
  if (insertError) throw insertError;
}

async function countRows(db: any, table: string, column: string, value: string): Promise<number> {
  const { count, error } = await db.from(table).select(column, { count: "exact", head: true }).eq(column, value);
  if (error) throw error;
  return count || 0;
}

// Administrative community moderation. The live schema has is_deleted but no pin column;
// pinning is rejected explicitly rather than pretending a non-persistent change succeeded.
parity.get("/community", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const db = dbFor(c);
  try {
    const { data, error } = await db.from("community_posts")
      .select("id,title,body,author_id,created_at,updated_at,is_deleted,tag")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    const ids = [...new Set((data || []).map((x: any) => x.author_id).filter(Boolean))];
    let userMap: Record<string, any> = {};
    if (ids.length) {
      const { data: users, error: usersError } = await db.from("users").select("id,full_name,email").in("id", ids);
      if (usersError) throw usersError;
      userMap = Object.fromEntries((users || []).map((u: any) => [String(u.id), u]));
    }
    return c.json(ok({ items: (data || []).map((p: any) => ({
      ...p, author_name: userMap[String(p.author_id)]?.full_name || userMap[String(p.author_id)]?.email || "Студент",
      hidden: Boolean(p.is_deleted), pinned: false,
    })) }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить публикации");
  }
});

parity.patch("/community/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const id = c.req.param("id") || "";
  const input = await jsonBody(c);
  if (!UUID.test(id) || !input) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID или JSON");
  if (Object.prototype.hasOwnProperty.call(input, "pinned")) {
    return responseError(c, rid, 422, "PINNING_NOT_SUPPORTED", "В схеме community_posts нет поля закрепления; сначала нужна миграция схемы");
  }
  if (typeof input.hidden !== "boolean") return responseError(c, rid, 422, "VALIDATION_ERROR", "Поддерживается только изменение hidden");
  try {
    const { data, error } = await dbFor(c).from("community_posts").update({ is_deleted: input.hidden })
      .eq("id", id).select("id,is_deleted").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Публикация не найдена");
    return c.json(ok({ id, hidden: Boolean(data.is_deleted), pinned: false }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить публикацию");
  }
});

parity.delete("/community/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID публикации");
  try {
    const { data, error } = await dbFor(c).from("community_posts").update({ is_deleted: true })
      .eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Публикация не найдена");
    return c.json(ok({ deleted: true, id }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось скрыть публикацию");
  }
});

// Admin homework panel. Deletion is blocked when student submissions/progress/attachments exist.
parity.get("/homeworks", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, MANAGERS))) return c.res;
  const db = dbFor(c);
  try {
    const { data: homeworks, error } = await db.from("homeworks")
      .select("id,title,description,due_at,due_date,status,created_at,subject_id,group_id")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    const rows = homeworks || [];
    const subjectIds = [...new Set(rows.map((x: any) => x.subject_id).filter(Boolean))];
    const groupIds = [...new Set(rows.map((x: any) => x.group_id).filter(Boolean))];
    const homeworkIds = rows.map((x: any) => x.id).filter(Boolean);
    const [subjectsResult, groupsResult, submissionsResult] = await Promise.all([
      subjectIds.length ? db.from("subjects").select("id,name,slug").in("id", subjectIds) : Promise.resolve({ data: [], error: null }),
      groupIds.length ? db.from("groups").select("id,name,code").in("id", groupIds) : Promise.resolve({ data: [], error: null }),
      homeworkIds.length ? db.from("homework_submissions").select("id,homework_id,user_id,text_answer,status,grade,teacher_comment,submitted_at").in("homework_id", homeworkIds).order("submitted_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    ]);
    if (subjectsResult.error || groupsResult.error || submissionsResult.error) throw new Error("homework relations failed");
    const subjectMap = Object.fromEntries((subjectsResult.data || []).map((x: any) => [String(x.id), x]));
    const groupMap = Object.fromEntries((groupsResult.data || []).map((x: any) => [String(x.id), x]));
    const submissions = submissionsResult.data || [];
    const userIds = [...new Set(submissions.map((x: any) => x.user_id).filter(Boolean))];
    const { data: users, error: usersError } = userIds.length
      ? await db.from("users").select("id,full_name,email").in("id", userIds)
      : { data: [], error: null };
    if (usersError) throw usersError;
    const userMap = Object.fromEntries((users || []).map((x: any) => [String(x.id), x]));
    const byHomework: Record<string, any[]> = {};
    for (const sub of submissions) (byHomework[String(sub.homework_id)] ||= []).push(sub);
    const items: any[] = [];
    for (const hw of rows) {
      const base = {
        ...hw,
        subject_name: subjectMap[String(hw.subject_id)]?.name || null,
        group_name: groupMap[String(hw.group_id)]?.name || groupMap[String(hw.group_id)]?.code || null,
      };
      const subs = byHomework[String(hw.id)] || [];
      if (!subs.length) items.push(base);
      else for (const sub of subs) {
        const user = userMap[String(sub.user_id)] || {};
        items.push({
          ...base, submission_id: sub.id, student_name: user.full_name || null, student_email: user.email || null,
          submission_status: sub.status, grade: sub.grade, text_answer: sub.text_answer,
          teacher_comment: sub.teacher_comment, submitted_at: sub.submitted_at,
        });
      }
    }
    return c.json(ok({ items }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить домашние задания");
  }
});

parity.post("/homeworks", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, MANAGERS))) return c.res;
  const input = await jsonBody(c);
  if (!input || !validText(input.title, 300)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Укажите название домашнего задания");
  const subjectId = input.subject_id ? String(input.subject_id) : null;
  const groupId = input.group_id ? String(input.group_id) : null;
  if (subjectId && !UUID.test(subjectId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный subject_id");
  if (groupId && !UUID.test(groupId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный group_id");
  let dueAt: string | null = null;
  if (input.due_at) {
    const date = new Date(String(input.due_at));
    if (Number.isNaN(date.getTime())) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный срок сдачи");
    dueAt = date.toISOString();
  }
  const db = dbFor(c), user = c.get("user");
  try {
    if (subjectId) {
      const { data, error } = await db.from("subjects").select("id").eq("id", subjectId).maybeSingle();
      if (error) throw error;
      if (!data) return responseError(c, rid, 422, "SUBJECT_NOT_FOUND", "Предмет не найден");
    }
    if (groupId) {
      const { data, error } = await db.from("groups").select("id,is_active").eq("id", groupId).maybeSingle();
      if (error) throw error;
      if (!data || data.is_active === false) return responseError(c, rid, 422, "GROUP_NOT_FOUND", "Активная группа не найдена");
    }
    const roles = await roleCodes(c);
    const row: any = {
      title: input.title.trim(), description: String(input.description || "").slice(0, 20000),
      subject_id: subjectId, group_id: groupId, due_at: dueAt,
      due_date: dueAt ? dueAt.slice(0, 10) : null,
      created_by: user.id, created_by_role: roles.includes("admin") ? "admin" : "teacher", status: "open",
    };
    const { data, error } = await db.from("homeworks").insert(row).select("id,title,description,due_at,due_date,status,created_at,subject_id,group_id").single();
    if (error) throw error;
    return c.json(ok({ item: data }, rid), 201);
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать домашнее задание");
  }
});

parity.delete("/homeworks/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, MANAGERS))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID домашнего задания");
  const db = dbFor(c);
  try {
    const [submissions, progress, attachments] = await Promise.all([
      countRows(db, "homework_submissions", "homework_id", id),
      countRows(db, "homework_progress", "homework_id", id),
      countRows(db, "homework_attachments", "homework_id", id),
    ]);
    if (submissions + progress + attachments > 0) {
      return responseError(c, rid, 409, "HOMEWORK_HAS_ACTIVITY", "Нельзя удалить ДЗ: уже есть ответы, прогресс или вложения");
    }
    const { data, error } = await db.from("homeworks").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Домашнее задание не найдено");
    return c.json(ok({ deleted: true, id }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить домашнее задание");
  }
});

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
    const { data: file, error: readError } = await db.from("files").select("id,status").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!file || file.status !== "active") return responseError(c, rid, 404, "NOT_FOUND", "Файл не найден");
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

// Problem center: aggregate student reports and task work items.
parity.get("/problem-center", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const db = dbFor(c);
  try {
    const { data: reports, error: reportsError } = await db.from("question_reports")
      .select("id,question_id,reporter_user_id,category,message,status,work_id,resolved_by,resolved_at,created_at")
      .order("created_at", { ascending: false }).limit(500);
    if (reportsError) throw reportsError;
    const questionIds = [...new Set((reports || []).map((x: any) => x.question_id).filter(Boolean))];
    const { data: questions, error: questionsError } = questionIds.length
      ? await db.from("questions").select("id,text,answer,options,type,subject_id").in("id", questionIds)
      : { data: [], error: null };
    if (questionsError) throw questionsError;
    const questionMap = Object.fromEntries((questions || []).map((x: any) => [String(x.id), x]));
    const { data: works, error: worksError } = await db.from("content_work_items")
      .select("id,title,description,status,priority,question_id,report_id,assignee_user_id,created_by,created_at,updated_at,completed_at")
      .order("updated_at", { ascending: false }).limit(300);
    if (worksError) throw worksError;
    const grouped: Record<string, any> = {};
    for (const report of reports || []) {
      const key = String(report.question_id) + "|" + String(report.category || "other");
      if (!grouped[key]) grouped[key] = {
        question_id: report.question_id, category: report.category || "other",
        question: questionMap[String(report.question_id)] || null, reports: [], report_count: 0, status: report.status || "new",
      };
      grouped[key].reports.push(report);
      grouped[key].report_count += 1;
      if (report.status === "new") grouped[key].status = "new";
    }
    return c.json(ok({ problems: Object.values(grouped), works: works || [] }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось загрузить центр проблем");
  }
});

parity.post("/problem-center/work", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const input = await jsonBody(c);
  if (!input || !validText(input.title, 300)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Укажите название работы");
  const questionId = input.question_id ? String(input.question_id) : null;
  const reportId = input.report_id ? String(input.report_id) : null;
  if (questionId && !UUID.test(questionId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный question_id");
  if (reportId && !UUID.test(reportId)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный report_id");
  const priority = String(input.priority || "normal");
  if (!["low", "normal", "high"].includes(priority)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный приоритет");
  const db = dbFor(c), user = c.get("user"), now = new Date().toISOString();
  try {
    const { data, error } = await db.from("content_work_items").insert({
      title: input.title.trim(), description: String(input.description || "").slice(0, 10000),
      status: "new", priority, question_id: questionId, report_id: reportId,
      created_by: user.id, updated_at: now,
    }).select("*").single();
    if (error) throw error;
    if (reportId) {
      const { error: reportError } = await db.from("question_reports").update({ work_id: data.id }).eq("id", reportId);
      if (reportError) throw reportError;
    }
    return c.json(ok({ work: data }, rid), 201);
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать работу");
  }
});

parity.patch("/problem-center/work/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c))) return c.res;
  const id = c.req.param("id") || "";
  const input = await jsonBody(c);
  if (!UUID.test(id) || !input) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный ID или JSON");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.status !== undefined) {
    if (!["new", "in_progress", "review", "done"].includes(String(input.status))) return responseError(c, rid, 422, "VALIDATION_ERROR", "Недопустимый статус работы");
    patch.status = String(input.status);
    patch.completed_at = input.status === "done" ? new Date().toISOString() : null;
  }
  if (input.priority !== undefined) {
    if (!["low", "normal", "high"].includes(String(input.priority))) return responseError(c, rid, 422, "VALIDATION_ERROR", "Недопустимый приоритет");
    patch.priority = String(input.priority);
  }
  if (input.title !== undefined) {
    if (!validText(input.title, 300)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный заголовок");
    patch.title = input.title.trim();
  }
  if (input.description !== undefined) patch.description = String(input.description || "").slice(0, 10000);
  if (input.assignee_user_id !== undefined) {
    const value = input.assignee_user_id ? String(input.assignee_user_id) : null;
    if (value && !UUID.test(value)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный assignee_user_id");
    patch.assignee_user_id = value;
  }
  if (Object.keys(patch).length === 1) return responseError(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
  try {
    const { data, error } = await dbFor(c).from("content_work_items").update(patch).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return responseError(c, rid, 404, "NOT_FOUND", "Работа не найдена");
    return c.json(ok({ work: data }, rid));
  } catch {
    return responseError(c, rid, 503, "DB_UNAVAILABLE", "Не удалось обновить работу");
  }
});

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

parity.get("/db/audit", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await gate(c, ADMIN_ONLY))) return c.res;
  const limit = Math.max(1, Math.min(200, Number(c.req.query("limit") || 100)));
  try {
    const { data, error } = await dbFor(c).from("content_versions")
      .select("id,table_name,row_key,version_no,source,actor_user_id,created_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return c.json(ok({ items: data || [] }, rid));
  } catch {
    return responseError(c, rid, 503, "AUDIT_UNAVAILABLE", "Журнал версий контента недоступен");
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

export default parity;
