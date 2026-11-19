import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { SEARCH_EXAMPLES, normalizeSearchText, parseSearchIntent } from "../../lib/search-query";
import { collect } from "./collect";

import type { SearchRouter } from "./types";

export function registerSuggestRoute(search: SearchRouter) {
search.get("/suggest", requireAuth, async (c) => {
  const rid = requestId();
  const rawQuery = (c.req.query("q") || "").trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 8), 1), 12);
  const intent = parseSearchIntent(rawQuery);
  const query = intent.query || rawQuery;
  const queryTooShort = normalizeSearchText(query).length < 2;

  if (queryTooShort && !intent.materialHint) {
    return c.json(ok({
      items: [],
      query,
      hint: "Введите название препарата, учебника или предмета",
      examples: SEARCH_EXAMPLES,
    }, rid));
  }

  try {
    const collected = await collect(c, {
      query: queryTooShort ? "" : query,
      kind: intent.kind,
      limit,
      materialHint: intent.materialHint,
      kinds: ["subjects", "preparations", "materials", "tests"],
    });
    return c.json(ok({
      items: collected.items.map((item) => ({
        id: item.id,
        type: item.type,
        type_label: item.type_label,
        title: item.title,
        subject: item.subject,
        hint: item.hint,
        href: item.href,
        count: item.count || 1,
      })),
      query,
      hint: intent.hint,
      examples: SEARCH_EXAMPLES,
    }, rid));
  } catch (error) {
    console.error("[search:suggest]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Подсказки временно недоступны", 503, rid);
    return c.json(body, status as 503);
  }
});
}
