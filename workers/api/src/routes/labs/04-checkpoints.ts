import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID } from "./shared";

import type { LabsRouter } from "./types";

export function registerCheckpointRoutes(labs: LabsRouter) {
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
}
