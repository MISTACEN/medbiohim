/**
 * Сноски [N] в ответе тьютора.
 *
 * Промпт требует помечать утверждения из фрагментов лекций, но маленькая модель
 * на Workers AI это требование иногда игнорирует: в блоке «Источники» пять
 * лекций, а в тексте ни одного маркера — связь ответа с материалом теряется.
 * Поэтому номера гарантируются детерминированно: если модель не поставила ни
 * одной сноски, в конец ответа добавляется строка с теми же номерами, что и в
 * блоке «Источники». Ничего не выдумывается — только фактические цитаты.
 */

export type CitationRef = { n: number; title: string };

export function ensureCitationFootnotes(text: string, citations: readonly CitationRef[] | null | undefined): string {
  const body = String(text ?? "").trim();
  if (!body) return body;
  const list = (citations || []).filter(
    (citation) => Number.isFinite(Number(citation?.n)) && String(citation?.title ?? "").trim(),
  );
  if (!list.length) return body;
  if (/\[\d+\]/.test(body)) return body;
  const refs = list.map((citation) => `[${Number(citation.n)}] ${String(citation.title).trim()}`).join("; ");
  return `${body}\n\nИсточники: ${refs}`;
}
