import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { UUID, LAB_TYPES, labsQuery } from "./shared";

import type { LabsRouter } from "./types";

export function registerStartRoutes(labs: LabsRouter) {
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
      const { data: template } = await labsQuery(c, (client) => client
        .from("lab_templates")
        .select("title,subject_area")
        .eq("id", templateId)
        .maybeSingle());
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
}
