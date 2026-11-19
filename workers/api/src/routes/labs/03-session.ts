import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, labsQuery, getCallerRoles } from "./shared";

import type { LabsRouter } from "./types";

export function registerSessionRoutes(labs: LabsRouter) {
labs.get("/:sessionId", requireAuth, async (c) => {
  const rid = requestId(), db = c.get("supabase");
  const sessionId = String(c.req.param("sessionId") || "");
  
  if (!UUID.test(sessionId)) {
    return c.json(fail("VALIDATION_ERROR", "Некорректный ID сессии", 422, rid), 422);
  }
  
  try {
    const { data: session, error: sessionError } = await labsQuery(c, (client) => client
      .from("lab_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle());
    
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
    const { data: checkpoints, error: cpError } = await labsQuery(c, (client) => client
      .from("laboratory_checkpoints")
      .select("*")
      .eq("session_id", sessionId)
      .order("checkpoint_order", { ascending: true }));
    
    if (cpError) {
      console.error("[labs:details]", cpError);
      return c.json(fail("DB_UNAVAILABLE", "Данные лабораторий недоступны", 503, rid), 503);
    }
    
    // Get existing results for each checkpoint
    const checkpointIds = (checkpoints as any[] | null)?.map((item: any) => item.id) || [];
    let existingResults: any[] = [];
    if (checkpointIds.length) {
      const { data: results, error: resultError } = await labsQuery(c, (client) => client
        .from("laboratory_results")
        .select("*")
        .in("checkpoint_id", checkpointIds)
        .eq("user_id", user.id));
      
      if (!resultError) {
        existingResults = results || [];
      }
    }
    
    const checkpointsWithResults = checkpoints?.map((cp: any) => {
      const result = existingResults.find((row: any) => row.checkpoint_id === cp.id);
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
        completed: checkpointsWithResults.filter((row: any) => row.has_result).length,
        progress_pct: session.progress_pct
      }
    }, rid));
  } catch (error) {
    console.error("[labs:details]", error);
    return c.json(fail("LAB_DETAILS_UNAVAILABLE", "Данные лабораторий недоступны", 503, rid), 503);
  }
});
}
