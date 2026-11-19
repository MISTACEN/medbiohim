import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, getCallerRoles } from "./shared";

import type { LabsRouter } from "./types";

export function registerResultRoutes(labs: LabsRouter) {
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
}
