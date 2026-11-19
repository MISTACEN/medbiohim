import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";

import { formatCard, subjectNames, loadCards } from "./shared";

import type { SrsRouter } from "./types";

export function registerRootRoutes(srs: SrsRouter) {
srs.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  try {
    const names = await subjectNames(supabase);
    const now = Math.round(Date.now() / 1000);
    const rows = await loadCards(supabase, user.id, 100);
    const items = rows.map((row) => formatCard(row, names, now));
    return c.json(ok({ items }, rid));
  } catch (error) {
    console.error("[srs:list]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});
}
