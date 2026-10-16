import { Hono } from "hono";
import type { Env } from "../env";
import { ok, fail, requestId } from "../lib/response";
import { requireAuth, type AuthVariables } from "../middleware/auth";

const calculators = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

calculators.get("/", requireAuth, async (c) => {
  const rid = requestId();
  // Static catalog — extend as needed; heavy math stays client-side or pure functions here
  return c.json(
    ok(
      {
        items: [
          { id: "molar-mass", name: "Молярная масса", category: "chemistry" },
          { id: "dilution", name: "Разбавление растворов", category: "chemistry" },
          { id: "ph", name: "pH / pOH", category: "chemistry" },
          { id: "buffer", name: "Буферные системы", category: "biochem" },
        ],
      },
      rid
    )
  );
});

calculators.post("/:id/compute", requireAuth, async (c) => {
  const rid = requestId();
  const id = c.req.param("id");
  let input: Record<string, number> = {};
  try {
    input = await c.req.json();
  } catch {
    const { body, status } = fail("VALIDATION", "Некорректный JSON", 400, rid);
    return c.json(body, status as 400);
  }

  if (id === "dilution") {
    const { c1, v1, c2, v2 } = input;
    if (c1 && v1 && c2) return c.json(ok({ v2: (c1 * v1) / c2 }, rid));
    if (c1 && v1 && v2) return c.json(ok({ c2: (c1 * v1) / v2 }, rid));
  }
  if (id === "ph" && input.h_plus != null) {
    const ph = -Math.log10(Number(input.h_plus));
    return c.json(ok({ ph, poh: 14 - ph }, rid));
  }

  const { body, status } = fail("NOT_IMPLEMENTED", `Калькулятор ${id} не реализован на сервере`, 501, rid);
  return c.json(body, status as 501);
});

export default calculators;
