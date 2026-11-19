import { ok, fail, requestId } from "../../lib/response";
import { requireAuth } from "../../middleware/auth";
import { SEARCH_EXAMPLES, normalizeSearchText, parseSearchIntent } from "../../lib/search-query";
import { readKind } from "./shared";
import { collect } from "./collect";

import type { SearchRouter } from "./types";

export function registerSearchRoute(search: SearchRouter) {
search.get("/", requireAuth, async (c) => {
  const rid = requestId();
  const rawQuery = (c.req.query("q") || c.req.query("query") || "").trim().slice(0, 160);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 50);
  const subjectSlug = c.req.query("subject_slug")?.trim().toLowerCase() || undefined;
  const requestedKind = readKind(c.req.query("type") || "");
  if (requestedKind === "invalid") {
    const { body, status } = fail("VALIDATION_ERROR", "Неизвестный тип поиска", 422, rid);
    return c.json(body, status as 422);
  }

  const intent = parseSearchIntent(rawQuery);
  const kind = requestedKind || intent.kind;
  const query = intent.query || (kind ? rawQuery : "");
  const queryTooShort = normalizeSearchText(query).length < 2;
  // «Учебники» без предмета — допустимый запрос: вид материала сам по себе
  // достаточный фильтр. Всё остальное короче двух букв не ищем.
  if (queryTooShort && !intent.materialHint) {
    return c.json(ok({
      items: [],
      query,
      original: rawQuery,
      total: 0,
      intent: { kind: kind || null, hint: intent.hint },
      facets: { subjects: [], types: {} },
      examples: SEARCH_EXAMPLES,
    }, rid));
  }

  try {
    const effectiveQuery = queryTooShort ? "" : query;
    const collected = await collect(c, {
      query: effectiveQuery,
      kind,
      subjectSlug,
      limit,
      materialHint: intent.materialHint,
    });
    return c.json(ok({
      items: collected.items,
      query: effectiveQuery,
      original: rawQuery,
      total: collected.total,
      intent: { kind: kind || null, hint: intent.hint },
      facets: collected.facets,
      examples: SEARCH_EXAMPLES,
    }, rid));
  } catch (error) {
    console.error("[search]", error);
    const { body, status } = fail("DB_UNAVAILABLE", "Поиск временно недоступен", 503, rid);
    return c.json(body, status as 503);
  }
});

/**
 * Подсказки для поля поиска: предметы, препараты и материалы — три быстрых
 * запроса. Без вопросов и лекций, чтобы список не превращался в свалку.
 */
}
