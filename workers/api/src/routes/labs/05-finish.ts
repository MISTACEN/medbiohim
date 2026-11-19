import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID } from "./shared";

import type { LabsRouter } from "./types";

export function registerFinishRoutes(labs: LabsRouter) {
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
}
