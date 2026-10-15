import { authenticateSupabaseRequest } from "./supabase-auth.js";

const fail = (status, code, message) => ({ ok: false, status, code, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function gradeSupabaseSubmission(request, env, submissionId, input, fetcher = fetch) {
  const auth = await authenticateSupabaseRequest(request, env, fetcher);
  if (!auth.ok) return auth;
  if (!UUID.test(String(submissionId || ""))) return fail(422, "VALIDATION_ERROR", "Некорректный ID сдачи");
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(422, "VALIDATION_ERROR", "Ожидается JSON-объект оценки");

  const rawGrade = input.grade;
  if (rawGrade === null || rawGrade === undefined || rawGrade === "" || !Number.isFinite(Number(rawGrade))) {
    return fail(422, "VALIDATION_ERROR", "grade должен быть числом");
  }
  const grade = Number(rawGrade);
  if (grade < 0 || grade > 100) return fail(422, "VALIDATION_ERROR", "grade должен быть в диапазоне 0–100");
  const comment = input.comment == null ? null : String(input.comment).slice(0, 5000);

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  const key = String(env.SUPABASE_ANON_KEY || "").trim();
  let base;
  try {
    base = new URL(String(env.SUPABASE_URL || "").trim());
    if (base.protocol !== "https:" || !key || !token) throw new Error("config");
  } catch {
    return fail(503, "AUTH_NOT_CONFIGURED", "Supabase REST требует HTTPS, anon key и пользовательский токен");
  }

  async function rows(table, params, init = {}) {
    const endpoint = new URL("/rest/v1/" + table, base);
    for (const [name, value] of Object.entries(params || {})) endpoint.searchParams.set(name, String(value));
    const response = await fetcher(endpoint.toString(), {
      ...init,
      headers: {
        apikey: key,
        authorization: "Bearer " + token,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json", prefer: "return=representation" } : {}),
        ...(init.headers || {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(7000),
    });
    if (response.status >= 300 && response.status < 400) return fail(503, "UPSTREAM_REDIRECT", "Supabase REST перенаправил запрос");
    if (!response.ok) {
      const error = new Error("Supabase REST request failed");
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  }

  try {
    // Authorization is derived from the live role relation, never from client input.
    const roleRows = await rows("user_roles", {
      select: "roles(code)",
      user_id: "eq." + auth.user.id,
      limit: "20",
    });
    if (!Array.isArray(roleRows)) return roleRows;
    const roles = roleRows.flatMap((row) => {
      const value = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
      return value.map((role) => String(role?.code || "").trim().toLowerCase());
    });
    if (!roles.some((role) => ["teacher", "moderator", "admin"].includes(role))) {
      return fail(403, "FORBIDDEN", "Оценка доступна только преподавателям и администраторам");
    }

    const existing = await rows("homework_submissions", {
      select: "id,homework_id,user_id,status,grade",
      id: "eq." + submissionId,
      limit: "1",
    });
    if (!Array.isArray(existing)) return existing;
    if (!existing[0]) return fail(404, "NOT_FOUND", "Сдача не найдена");

    const updated = await rows("homework_submissions", {
      id: "eq." + submissionId,
      select: "*",
    }, {
      method: "PATCH",
      body: JSON.stringify({ grade, teacher_comment: comment, status: "graded" }),
    });
    if (!Array.isArray(updated)) return updated;
    if (!updated[0]) return fail(404, "NOT_FOUND", "Сдача не найдена или изменение запрещено политикой доступа");
    return { ok: true, data: { submission: updated[0] } };
  } catch (error) {
    if (error?.status === 401) return fail(401, "UNAUTHORIZED", "Требуется войти в систему");
    if (error?.status === 403) return fail(403, "FORBIDDEN", "Недостаточно прав для оценки этой сдачи");
    if (error?.status === 404) return fail(404, "NOT_FOUND", "Сдача не найдена");
    return fail(503, "DB_ERROR", "Не удалось сохранить оценку. Попробуйте позже");
  }
}
