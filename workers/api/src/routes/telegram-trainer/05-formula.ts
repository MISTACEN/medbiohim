import { ok, fail, requestId } from "../../lib/response";
import { createServiceClient } from "../../lib/supabase";
import { latexToUnicode } from "../../lib/latex-unicode";
import { stableHash, isoDate, guardInternal } from "./shared";

import type { TrainerRouter } from "./types";

export function registerFormulaRoutes(telegramTrainer: TrainerRouter) {
telegramTrainer.get("/internal/trainer/formula", async (c) => {
  const rid = requestId();
  if (!guardInternal(c)) {
    const { body, status } = fail("UNAUTHORIZED", "Internal call only", 401, rid);
    return c.json(body, status as 401);
  }
  const supabase = createServiceClient(c.env);
  if (!supabase) {
    const { body, status } = fail("DB_UNAVAILABLE", "База данных недоступна", 503, rid);
    return c.json(body, status as 503);
  }
  try {
    const { data, error } = await supabase
      .from("bot_formulas")
      .select("id,title,latex,description,subject_name,topic")
      .eq("is_active", true)
      .limit(200);
    if (error) throw error;
    const formulas = (data || []) as any[];
    if (!formulas.length) return c.json(ok({ formula: null }, rid));
    const date = isoDate(new Date());
    const formula = formulas[stableHash(date) % formulas.length];
    return c.json(
      ok(
        {
          formula: {
            id: String(formula.id),
            title: String(formula.title || ""),
            latex: String(formula.latex || ""),
            unicode: latexToUnicode(String(formula.latex || "")),
            description: String(formula.description || ""),
            subject_name: String(formula.subject_name || ""),
            topic: String(formula.topic || ""),
          },
        },
        rid,
      ),
    );
  } catch (error) {
    console.error("[trainer:formula]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Формулы временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});
}
