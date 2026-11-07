/**
 * Свои тесты преподавателя: список, создание из личного банка, правка, архив, владение и видимость.
 * Выделено из монолита routes/teacher.ts — один домен, один файл.
 */
import { Hono } from "hono";
import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import {
  canAdminister,
  callerRoles,
  requireAdmin,
  requireTeachingCapability,
} from "../../lib/permissions";
import { describeScope, loadTeacherScope, loadTeacherSubjectIds } from "../../lib/teacher-scope";
import { createServiceClient } from "../../lib/supabase";
import {
  ASSIGNMENT_ROLES,
  UUID,
  error,
  scopedHomeworks,
  scopedSubmissions,
  studentDirectory,
  teacherSubjects,
  uniqueIds,
  type TeacherEnv,
} from "./_shared";

const teacher = new Hono<TeacherEnv>();

/**
 * Опубликованные тесты для предпросмотра (план §9.1). Чтение — teacher/admin;
 * сам прогон идёт через GET /tests/preview/:id без записи попыток.
 */
teacher.get("/tests", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const db = c.get("supabase") as any;
  const q = String(c.req.query("q") || "").replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 80).trim();
  const user = c.get("user");
  try {
    const roles = await callerRoles(db, user.id);
    const isAdmin = canAdminister(roles);
    let query = db.from("tests")
      .select("id,title,subject_id,is_published,teacher_visible,created_by,created_at,subjects(name)")
      .is("archived_at", null)
      .order("created_at", { ascending: false }).limit(300);
    if (q) query = query.ilike("title", `%${q}%`);
    const { data, error: readError } = await query;
    if (readError) throw readError;
    // Свой тест виден всегда (включая черновик), чужой — если опубликован,
    // разрешён администратором и относится к предмету преподавателя.
    const subjectIds = isAdmin ? [] : await loadTeacherSubjectIds(db, user.id);
    const rows = ((data || []) as any[]).filter((row) => {
      if (isAdmin) return true;
      if (String(row.created_by || "") === user.id) return true;
      if (row.is_published !== true) return false;
      if (row.teacher_visible === false) return false;
      if (!subjectIds.length) return true;
      return !row.subject_id || subjectIds.includes(String(row.subject_id));
    });
    const testIds = uniqueIds(rows.map((row) => row.id));
    const counts = new Map<string, number>();
    if (testIds.length) {
      const { data: links, error: linksError } = await db.from("test_questions")
        .select("test_id").in("test_id", testIds as string[]).limit(5000);
      if (linksError) throw linksError;
      for (const link of links || []) {
        const key = String((link as any).test_id || "");
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return c.json(ok({
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        subject_id: row.subject_id ?? null,
        subject_name: (Array.isArray(row.subjects) ? row.subjects[0] : row.subjects)?.name || null,
        question_count: counts.get(String(row.id)) || 0,
        is_published: row.is_published === true,
        teacher_visible: row.teacher_visible !== false,
        is_mine: String(row.created_by || "") === user.id,
        created_by: row.created_by ?? null,
        created_at: row.created_at,
      })),
      total: rows.length,
      is_admin: isAdmin,
      my_subjects: await teacherSubjects(db, user.id),
    }, rid));
  } catch (readError) {
    console.error("[teacher:tests]", readError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Список тестов временно недоступен");
  }
});

/**
 * Свой тест преподавателя (кабинет 8.7–8.11): собирается из личного банка
 * вопросов. Вопросы копируются в общий каталог questions со ссылкой на
 * предмет — существующий движок попыток и статистика работают без изменений.
 * Авторство фиксируется в tests.created_by; чужие тесты редактировать нельзя.
 */
teacher.post("/tests", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const userId = c.get("user").id;
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const title = String(input?.title || "").trim();
  const subjectId = String(input?.subject_id || "");
  const questionIds = uniqueIds(Array.isArray(input?.question_ids) ? input.question_ids : []);
  const timeLimitSec = input?.time_limit_sec != null ? Number(input.time_limit_sec) : null;
  const maxAttempts = input?.max_attempts != null ? Number(input.max_attempts) : null;
  const instructions = input?.instructions ? String(input.instructions).slice(0, 1000) : null;
  const isPublished = input?.is_published !== false;
  if (!title || title.length > 300) return error(c, rid, 422, "VALIDATION_ERROR", "Название обязательно (до 300 символов)");
  if (!UUID.test(subjectId)) return error(c, rid, 422, "VALIDATION_ERROR", "Выберите предмет");
  if (!questionIds.length) return error(c, rid, 422, "VALIDATION_ERROR", "Выберите хотя бы один вопрос");
  if (questionIds.length > 200) return error(c, rid, 422, "VALIDATION_ERROR", "Максимум 200 вопросов");
  for (const [value, label] of [[maxAttempts, "max_attempts"], [timeLimitSec, "time_limit_sec"]] as const) {
    if (value != null && (!Number.isInteger(value) || value < 1 || value > 86400)) {
      return error(c, rid, 422, "VALIDATION_ERROR", `${label}: целое 1..86400`);
    }
  }
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const { data: subject, error: subjectError } = await service
      .from("subjects").select("id").eq("id", subjectId).maybeSingle();
    if (subjectError) throw subjectError;
    if (!subject) return error(c, rid, 404, "NOT_FOUND", "Предмет не найден");
    // Личный банк автора: чужие вопросы не подсунуть даже подменой id.
    const { data: storeRows, error: storeError } = await service
      .from("site_content").select("payload")
      .eq("key", "user_questions").limit(1);
    if (storeError) throw storeError;
    const bank: any[] = Array.isArray(storeRows?.[0]?.payload?.items) ? storeRows[0].payload.items : [];
    const byId = new Map<string, any>(
      bank.filter((item) => String(item?.author_id || "") === userId).map((item) => [String(item.id), item]),
    );
    const picked = questionIds.map((id) => byId.get(id)).filter(Boolean);
    if (picked.length !== questionIds.length) {
      return error(c, rid, 403, "FORBIDDEN", "Часть вопросов не найдена в вашем личном банке");
    }
    const questionRows = picked.map((item: any) => {
      const options = Array.isArray(item.options) ? item.options : [];
      return {
        subject_id: subjectId,
        type: String(item.kind || "single"),
        text: String(item.text || "").slice(0, 4000),
        answer: String(item.answer || "").slice(0, 500),
        options: JSON.stringify(
          options.map((label: string, index: number) => ({
            key: String.fromCharCode(65 + index),
            label: String(label),
          })),
        ),
        difficulty: null,
        is_published: true,
      };
    });
    const { data: insertedQuestions, error: questionsError } = await service
      .from("questions").insert(questionRows).select("id");
    if (questionsError) throw questionsError;
    const insertedIds = (insertedQuestions || []).map((row: any) => String(row.id));
    const { data: test, error: testError } = await service
      .from("tests")
      .insert({
        title,
        subject_id: subjectId,
        is_published: isPublished,
        created_by: userId,
        time_limit_sec: timeLimitSec,
        max_attempts: maxAttempts,
        source_key: `teacher:${userId}:${Date.now()}`,
      })
      .select("id,title,is_published,created_by")
      .maybeSingle();
    if (testError) throw testError;
    if (!test) return error(c, rid, 503, "DB_ERROR", "Тест не сохранился");
    const links = insertedIds.map((questionId, index) => ({
      test_id: String(test.id),
      question_id: questionId,
      order_index: index,
    }));
    const { error: linksError } = await service.from("test_questions").insert(links);
    if (linksError) throw linksError;
    return c.json(ok({ test, question_count: insertedIds.length }, rid), 201);
  } catch (createError) {
    console.error("[teacher:create-test]", createError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось создать тест");
  }
});

/** Правка своего теста: название, публикация, настройки. */
teacher.patch("/tests/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const userId = c.get("user").id;
  let input: any = {};
  try { input = await c.req.json(); } catch {}
  const patch: Record<string, unknown> = {};
  if (input?.title != null) {
    const title = String(input.title).trim();
    if (!title || title.length > 300) return error(c, rid, 422, "VALIDATION_ERROR", "Название обязательно (до 300 символов)");
    patch.title = title;
  }
  if (input?.is_published != null) patch.is_published = input.is_published === true;
  if (input?.time_limit_sec != null) {
    const value = Number(input.time_limit_sec);
    if (!Number.isInteger(value) || value < 1 || value > 86400) {
      return error(c, rid, 422, "VALIDATION_ERROR", "time_limit_sec: целое 1..86400");
    }
    patch.time_limit_sec = value;
  }
  if (input?.max_attempts != null) {
    const value = Number(input.max_attempts);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      return error(c, rid, 422, "VALIDATION_ERROR", "max_attempts: целое 1..100");
    }
    patch.max_attempts = value;
  }
  if (!Object.keys(patch).length) return error(c, rid, 422, "VALIDATION_ERROR", "Нет полей для обновления");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, userId);
    let query = service.from("tests").update(patch).eq("id", id);
    if (!canAdminister(roles)) query = query.eq("created_by", userId);
    const { data, error: updateError } = await query.select("id,title,is_published").maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден или не ваш");
    return c.json(ok({ test: data }, rid));
  } catch (patchError) {
    console.error("[teacher:patch-test]", patchError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось сохранить тест");
  }
});

/** Удалить (архивировать) свой тест. */
teacher.delete("/tests/:id", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireTeachingCapability(c, "teacher.content.manage"))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор");
  const service = createServiceClient(c.env);
  if (!service) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  try {
    const roles = await callerRoles(service, c.get("user").id);
    const archivedAt = new Date().toISOString();
    let query = service.from("tests").update({ archived_at: archivedAt }).eq("id", id);
    if (!canAdminister(roles)) query = query.eq("created_by", c.get("user").id);
    const { data, error: deleteTestError } = await query.select("id").maybeSingle();
    if (deleteTestError) throw deleteTestError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден или не ваш");
    return c.json(ok({ removed: true, id }, rid));
  } catch (deleteTestError) {
    console.error("[teacher:delete-test]", deleteTestError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось удалить тест");
  }
});

/**
 * Назначить автора теста (только администратор). Автор видит тест всегда,
 * включая черновик, — так администратор решает, какой тест «его», а какой нет.
 */
teacher.patch("/tests/:id/owner", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор теста");
  // Запись в `tests` идёт service-клиентом: под JWT пользователя RLS на UPDATE
  // возвращает 0 строк, и маршрут отвечал ложным 404. Права проверены выше.
  const db = createServiceClient(c.env) as any;
  if (!db) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  const teacherId = input?.teacher_id ? String(input.teacher_id) : "";
  if (teacherId && !UUID.test(teacherId)) {
    return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный teacher_id");
  }
  try {
    if (teacherId) {
      const { data: person, error: personError } = await db.from("users")
        .select("id").eq("id", teacherId).maybeSingle();
      if (personError) throw personError;
      if (!person) return error(c, rid, 404, "NOT_FOUND", "Преподаватель не найден");
    }
    const { data, error: updateError } = await db.from("tests")
      .update({ created_by: teacherId || null })
      .eq("id", id).select("id,title,created_by").maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден");
    return c.json(ok({ test: data }, rid));
  } catch (writeError) {
    console.error("[teacher:tests:owner]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось назначить автора теста");
  }
});

/** Разрешить или запретить показ теста преподавателям (только администратор). */
teacher.patch("/tests/:id/visibility", requireAuth, async (c) => {
  const rid = requestId();
  if (!(await requireAdmin(c))) return c.res;
  const id = c.req.param("id") || "";
  if (!UUID.test(id)) return error(c, rid, 422, "VALIDATION_ERROR", "Некорректный идентификатор теста");
  const db = createServiceClient(c.env) as any;
  if (!db) return error(c, rid, 503, "SERVICE_UNAVAILABLE", "Сервис недоступен");
  let input: any = {};
  try { input = await c.req.json(); } catch {
    return error(c, rid, 400, "VALIDATION_ERROR", "Некорректный JSON");
  }
  if (typeof input?.teacher_visible !== "boolean") {
    return error(c, rid, 422, "VALIDATION_ERROR", "Нужен флаг teacher_visible");
  }
  try {
    const { data, error: updateError } = await db.from("tests")
      .update({ teacher_visible: input.teacher_visible })
      .eq("id", id).select("id,title,teacher_visible").maybeSingle();
    if (updateError) throw updateError;
    if (!data) return error(c, rid, 404, "NOT_FOUND", "Тест не найден");
    return c.json(ok({ test: data }, rid));
  } catch (writeError) {
    console.error("[teacher:tests:visibility]", writeError);
    return error(c, rid, 503, "DB_UNAVAILABLE", "Не удалось изменить видимость теста");
  }
});

export default teacher;
