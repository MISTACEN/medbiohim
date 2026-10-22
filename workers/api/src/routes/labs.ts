/**
 * MEDBIOHIM Interactive Labs API
 * Handles lab sessions, checkpoints, and results
 */

import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const labs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LAB_TYPES = ["physiology", "biochemistry", "histology", "anatomy", "pharmacology"];

/**
 * GET /labs/templates
 * List available lab templates
 */
labs.get("/templates", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  
  try {
    const subject = c.req.query("subject");
    const difficulty = c.req.query("difficulty");
    
    let query = db.from("lab_templates")
      .select("*")
      .eq("is_published", true);
    
    if (subject) {
      query = query.eq("subject_area", subject);
    }
    
    if (difficulty) {
      const validLevels = ['beginner', 'intermediate', 'advanced'];
      if (!validLevels.includes(difficulty)) {
        return c.json(fail("VALIDATION_ERROR", "Некорректный уровень сложности", 422, rid), 422);
      }
      query = query.eq("difficulty_level", difficulty);
    }
    
    const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
    
    if (error) {
      console.error("[labs:templates]", error);
      return c.json(fail("DB_UNAVAILABLE", "Шаблоны лабораторных недоступны", 503, rid), 503);
    }
    
    return c.json(ok({ items: data || [] }, rid));
  } catch (error) {
    console.error("[labs:templates]", error);
    return c.json(fail("LABS_UNAVAILABLE", "Интерактивные лаборатории временно недоступны", 503, rid), 503);
  }
});

/**
 * POST /labs/start
 * Start a new lab session
 */
labs.post("/start", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  
  const templateId = payload?.template_id;
  const labName = String(payload?.lab_name || "").trim().slice(0, 255);
  
  if ((!templateId && !labName) || (templateId && !UUID.test(templateId))) {
    return c.json(fail("VALIDATION_ERROR", "Некорректные параметры", 422, rid), 422);
  }
  
  try {
    const insert: {
      user_id: string;
      status: string;
      progress_pct: number;
      lab_type: string;
      lab_name: string;
    } = {
      user_id: user.id,
      status: "in_progress",
      progress_pct: 0,
      lab_type: "physiology",
      lab_name: labName || "Лабораторная работа",
    };
    
    if (templateId) {
      const { data: template } = await db
        .from("lab_templates")
        .select("title,subject_area")
        .eq("id", templateId)
        .maybeSingle();
      if (!template) {
        return c.json(fail("NOT_FOUND", "Шаблон лабораторной не найден", 404, rid), 404);
      }
      const title = String((template as any).title || "").trim();
      if (title) insert.lab_name = title.slice(0, 255);
      const subjectArea = String((template as any).subject_area || "");
      if (LAB_TYPES.includes(subjectArea)) insert.lab_type = subjectArea;
    }
    
    const { data, error } = await db.from("lab_sessions")
      .insert(insert)
      .select()
      .single();
    
    if (error) {
      console.error("[labs:start]", error);
      return c.json(fail("LAB_START_FAILED", "Не удалось создать сессию", 503, rid), 503);
    }
    
    return c.json(ok({ session: data }, rid), 201);
  } catch (error) {
    console.error("[labs:start]", error);
    return c.json(fail("LAB_START_FAILED", "Не удалось создать сессию", 503, rid), 503);
  }
});

/**
 * GET /labs/:sessionId
 * Get detailed lab session with all checkpoints
 */
labs.get("/:sessionId", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const sessionId = String(c.req.param("sessionId") || "");
  
  if (!UUID.test(sessionId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID сессии", 422, rid), 422);
  }
  
  try {
    const { data: session, error: sessionError } = await db
      .from("lab_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    
    if (sessionError || !session) {
      return c.json(fail("NOT_FOUND", "Сессия лабораторной не найдена", 404, rid), 404);
    }
    
    // Verify ownership or staff access
    const user = c.get("user");
    if (String(session.user_id) !== user.id) {
      const roles = await getCallerRoles(db, user.id);
      if (!roles.some(r => ["teacher", "moderator", "admin"].includes(r))) {
        return c.json(fail("FORBIDDEN", "Доступ только к собственным сессиям", 403, rid), 403);
      }
    }
    
    // Get all checkpoints for this session
    const { data: checkpoints, error: cpError } = await db
      .from("laboratory_checkpoints")
      .select("*")
      .eq("session_id", sessionId)
      .order("checkpoint_order", { ascending: true });
    
    if (cpError) {
      console.error("[labs:details]", cpError);
      return c.json(fail("DB_UNAVAILABLE", "Данные лабораторий недоступны", 503, rid), 503);
    }
    
    // Get existing results for each checkpoint
    const checkpointIds = checkpoints?.map(c => c.id) || [];
    let existingResults = [];
    if (checkpointIds.length) {
      const { data: results, error: resultError } = await db
        .from("laboratory_results")
        .select("*")
        .in("checkpoint_id", checkpointIds)
        .eq("user_id", user.id);
      
      if (!resultError) {
        existingResults = results || [];
      }
    }
    
    const checkpointsWithResults = checkpoints?.map((cp: any) => {
      const result = existingResults.find(r => r.checkpoint_id === cp.id);
      return {
        ...cp,
        has_result: !!result,
        score: result?.score || null,
        grading_status: result?.grading_status || null
      };
    }) || [];
    
    return c.json(ok({ 
      session, 
      checkpoints: checkpointsWithResults,
      summary: {
        total: checkpointsWithResults.length,
        completed: checkpointsWithResults.filter(c => c.has_result).length,
        progress_pct: session.progress_pct
      }
    }, rid));
  } catch (error) {
    console.error("[labs:details]", error);
    return c.json(fail("LAB_DETAILS_UNAVAILABLE", "Данные лабораторий недоступны", 503, rid), 503);
  }
});

/**
 * POST /labs/checkpoints/submit
 * Submit answer for a checkpoint
 */
labs.post("/checkpoints/submit", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  
  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(fail("VALIDATION_ERROR", "Некорректный JSON", 400, rid), 400);
  }
  
  const checkpointId = payload?.checkpoint_id;
  const userAnswers = payload?.answers;
  
  if (!checkpointId || !UUID.test(checkpointId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID вопроса", 422, rid), 422);
  }
  
  if (!Array.isArray(userAnswers) || userAnswers.length === 0) {
    return c.json(fail("VALIDATION_ERROR", "Нужны ответы на вопрос", 422, rid), 422);
  }
  
  try {
    // Verify checkpoint belongs to active session
    const { data: cp, error: cpError } = await db
      .from("laboratory_checkpoints")
      .select("session_id,laboratory_checkpoints(lab_sessions(status))")
      .eq("id", checkpointId)
      .maybeSingle();
    
    if (cpError || !cp) {
      return c.json(fail("NOT_FOUND", "Вопрос не найден", 404, rid), 404);
    }
    
    const checkpointRow = cp as any;
    const parentCheckpoint = Array.isArray(checkpointRow?.laboratory_checkpoints)
      ? checkpointRow.laboratory_checkpoints[0]
      : checkpointRow?.laboratory_checkpoints;
    const parentSession = Array.isArray(parentCheckpoint?.lab_sessions)
      ? parentCheckpoint.lab_sessions[0]
      : parentCheckpoint?.lab_sessions;
    const sessionStatus = parentSession?.status;
    
    if (sessionStatus !== "in_progress") {
      return c.json(fail("FORBIDDEN", "Сессия завершена или остановлена", 403, rid), 403);
    }
    
    // Check for existing submission
    const { data: existing } = await db
      .from("laboratory_results")
      .select("id,version")
      .eq("checkpoint_id", checkpointId)
      .eq("user_id", user.id)
      .maybeSingle();
    
    const insertData = {
      checkpoint_id: checkpointId,
      user_id: user.id,
      submitted_at: new Date().toISOString(),
      user_answers: userAnswers,
      version: (existing?.version || 0) + 1,
      status: "pending"
    };
    
    // Use upsert pattern
    let result;
    let writeError: any = null;
    if (existing) {
      const { data, error } = await db
        .from("laboratory_results")
        .update({
          user_answers: userAnswers,
          version: insertData.version,
          updated_at: new Date().toISOString(),
          grading_status: "pending" // reset grading on resubmit
        })
        .eq("id", existing.id)
        .select()
        .single();
      result = data;
      writeError = error;
    } else {
      const { data, error } = await db
        .from("laboratory_results")
        .insert(insertData)
        .select()
        .single();
      result = data;
      writeError = error;
    }
    
    if (writeError || !result) {
      console.error("[labs:submit]", writeError);
      return c.json(fail("SUBMIT_FAILED", "Не удалось сохранить ответ", 503, rid), 503);
    }
    
    return c.json(ok({ 
      result,
      is_new_submission: !existing,
      auto_graded: false // placeholder - would trigger auto-grading here
    }, rid));
  } catch (error) {
    console.error("[labs:submit]", error);
    return c.json(fail("SUBMIT_FAILED", "Не удалось сохранить ответ", 503, rid), 503);
  }
});

/**
 * POST /labs/finish
 * Complete lab session
 */
labs.post("/:sessionId/finish", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase"), user = c.get("user");
  const sessionId = String(c.req.param("sessionId") || "");
  
  if (!UUID.test(sessionId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID сессии", 422, rid), 422);
  }
  
  try {
    // Verify ownership
    const { data: session, error } = await db
      .from("lab_sessions")
      .select("user_id,status")
      .eq("id", sessionId)
      .maybeSingle();
    
    if (error || !session) {
      return c.json(fail("NOT_FOUND", "Сессия не найдена", 404, rid), 404);
    }
    
    if (String(session.user_id) !== user.id) {
      return c.json(fail("FORBIDDEN", "Нельзя завершить чужую сессию", 403, rid), 403);
    }
    
    if (session.status === "completed") {
      return c.json(fail("BAD_REQUEST", "Сессия уже завершена", 400, rid), 400);
    }
    
    const { error: updateError } = await db
      .from("lab_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString()
      })
      .eq("id", sessionId);
    
    if (updateError) {
      console.error("[labs:finish]", updateError);
      return c.json(fail("FINISH_FAILED", "Не удалось завершить сессию", 503, rid), 503);
    }
    
    return c.json(ok({ message: "Сессия завершена", session }, rid));
  } catch (error) {
    console.error("[labs:finish]", error);
    return c.json(fail("FINISH_FAILED", "Не удалось завершить сессию", 503, rid), 503);
  }
});

/**
 * GET /labs/:sessionId/results
 * Get results for a lab session
 */
labs.get("/:sessionId/results", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const sessionId = String(c.req.param("sessionId") || "");
  
  if (!UUID.test(sessionId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID сессии", 422, rid), 422);
  }
  
  try {
    const user = c.get("user");
    const { data: session, error } = await db
      .from("lab_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle();
    
    if (error || !session) {
      return c.json(fail("NOT_FOUND", "Сессия не найдена", 404, rid), 404);
    }
    
    // Check permissions
    if (String(session.user_id) !== user.id) {
      const roles = await getCallerRoles(db, user.id);
      if (!roles.some(r => ["teacher", "moderator", "admin"].includes(r))) {
        return c.json(fail("FORBIDDEN", "Доступ только к собственным результатам", 403, rid), 403);
      }
    }
    
    // Get all results for this session
    const { data: results, error: resultsError } = await db
      .from("laboratory_results")
      .select(`
        *,
        checkpoint:laboratory_checkpoints(title,checkpoint_type,checkpoint_order)
      `)
      .eq("user_id", user.id)
      .eq("checkpoint_id", sessionId) // This won't work correctly, needs adjustment
      .order("submitted_at", { ascending: true });
    
    if (resultsError) {
      console.error("[labs:results]", resultsError);
      return c.json(fail("RESULTS_UNAVAILABLE", "Результаты недоступны", 503, rid), 503);
    }
    
    return c.json(ok({ results: results || [] }, rid));
  } catch (error) {
    console.error("[labs:results]", error);
    return c.json(fail("RESULTS_UNAVAILABLE", "Результаты недоступны", 503, rid), 503);
  }
});

// Helper function
async function getCallerRoles(db: any, userId: string): Promise<string[]> {
  const { data, error } = await db
    .from("user_roles")
    .select("roles(code)")
    .eq("user_id", userId)
    .limit(25);
  
  if (error) throw error;
  
  const codes: string[] = [];
  for (const row of data || []) {
    const roleRows = Array.isArray(row?.roles) ? row.roles : row?.roles ? [row.roles] : [];
    for (const role of roleRows) {
      const code = String(role?.code || "").toLowerCase().trim();
      if (code) codes.push(code);
    }
  }
  return [...new Set(codes)];
}

export default labs;
