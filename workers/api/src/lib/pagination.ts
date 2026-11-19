/**
 * Пагинация списочных маршрутов без изменения текущего контракта.
 *
 * `limit`/`offset` — необязательные параметры: если клиент их не передал,
 * маршрут отвечает ровно тем же телом, что и раньше (`requested: false`).
 * Отрицательные, дробные и гигантские значения не роняют запрос, а
 * зажимаются в допустимый диапазон.
 */

export type PageRequest = {
  limit: number;
  offset: number;
  /** Передал ли клиент пагинацию — от этого зависит форма ответа. */
  requested: boolean;
};

export const PAGINATION = { defaultLimit: 50, maxLimit: 200 } as const;

type QueryLike = { get(name: string): string | null };

function toInt(raw: string | null): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

export function parsePage(
  query: QueryLike,
  options: { defaultLimit?: number; maxLimit?: number } = {},
): PageRequest {
  const defaultLimit = options.defaultLimit ?? PAGINATION.defaultLimit;
  const maxLimit = options.maxLimit ?? PAGINATION.maxLimit;
  const limitParam = toInt(query.get("limit"));
  const offsetParam = toInt(query.get("offset"));
  const requested = limitParam != null || offsetParam != null;
  const limit = Math.min(Math.max(limitParam ?? defaultLimit, 1), maxLimit);
  const offset = Math.max(offsetParam ?? 0, 0);
  return { limit, offset, requested };
}

export type PageMeta = {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
};

export function pageMeta(page: PageRequest, total: number): PageMeta {
  return {
    limit: page.limit,
    offset: page.offset,
    total,
    has_more: page.offset + page.limit < total,
  };
}

export function paginate<T>(rows: readonly T[], page: PageRequest): { items: T[]; page: PageMeta } {
  return {
    items: rows.slice(page.offset, page.offset + page.limit),
    page: pageMeta(page, rows.length),
  };
}
