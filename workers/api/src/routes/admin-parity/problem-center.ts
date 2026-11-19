import { ok, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, dbFor, gate, jsonBody, responseError, validText } from "./shared";
import type { ParityApp } from "./shared";

export function registerProblemCenter(parity: ParityApp) {
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
  if (!["low", "normal", "high", "urgent"].includes(priority)) return responseError(c, rid, 422, "VALIDATION_ERROR", "Некорректный приоритет");
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
    if (!["low", "normal", "high", "urgent"].includes(String(input.priority))) return responseError(c, rid, 422, "VALIDATION_ERROR", "Недопустимый приоритет");
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
}
