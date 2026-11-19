import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";

import { toEpoch, formatCard, subjectNames, loadCards, filterCards } from "./shared";

import type { SrsRouter } from "./types";

export function registerDueRoutes(srs: SrsRouter) {
srs.get("/due", requireAuth, async (c) => {
  const rid = requestId();
  const user = c.get("user");
  const supabase = c.get("supabase");
  const now = Math.round(Date.now() / 1000);
  const limit = Math.max(1, Math.min(50, Number(c.req.query("limit") || 20) || 20));
  try {
    const names = await subjectNames(supabase);
    const rows = filterCards(await loadCards(supabase, user.id, 2000), {
      subjectId: c.req.query("subject_id"),
      subjectSlug: c.req.query("subject_slug"),
      scope: c.req.query("scope"),
    }).filter((row) => toEpoch(row.due_at, now) <= now);
    const items = rows.slice(0, limit).map((row) => formatCard(row, names, now));
    return c.json(ok({ items, count: items.length }, rid));
  } catch (error) {
    console.error("[srs:due]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "SRS недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});
}
