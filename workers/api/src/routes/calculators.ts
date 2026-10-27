import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";
// Shared, stateless formulas formerly used only by the shadow Worker.
// @ts-expect-error The integration module is plain JavaScript without type declarations and is bundled by Wrangler.
import { listCalculators, computeCalculator, CalculatorValidationError } from "../../../../integrations/cloudflare-api/src/calculators.js";

const calculators = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

calculators.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const items = listCalculators();
  const categories = items.reduce((all: Record<string, unknown[]>, item: any) => ((all[item.category] ||= []).push(item), all), {});
  return c.json(ok({ items, categories, count: items.length }, rid));
});

calculators.post("/:id/compute", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id");
  let input: Record<string, unknown> = {};
  try {
    input = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }

  try {
    return c.json(ok(computeCalculator(id, input), rid));
  } catch (error) {
    if (error instanceof CalculatorValidationError) {
      const { body, status } = fail("VALIDATION", (error as Error).message, 422, rid);
      return c.json(body, status as 422);
    }
    console.error("[calculators:compute]", error);
    const { body, status } = fail("CALCULATION_ERROR", "Не удалось выполнить расчёт", 500, rid);
    return c.json(body, status as 500);
  }
});

export default calculators;
