/**
 * Сноски [N] в ответе тьютора.
 *
 * Промпт требует помечать утверждения из фрагментов лекций, но маленькая модель
 * на Workers AI это требование иногда игнорирует: в блоке «Источники» пять
 * лекций, а в тексте ни одного маркера — связь ответа с материалом теряется.
 * Поэтому номера гарантируются детерминированно: если модель не поставила ни
 * одной сноски, в конец ответа добавляется строка с теми же номерами, что и в
 * блоке «Источники». Ничего не выдумывается — только фактические цитаты.
 *
 * Вторая проблема: копируя формат сносок, модель ставит в скобках слова —
 * «[Soi]», «[Skel]», «[Movement]». Это не источник и только мусорит ответ,
 * поэтому такие пометки вырезаются. Скобки с цифрами и обычный текст в
 * скобках («[см. выше]») не трогаются.
 */

export type CitationRef = { n: number; title: string };

/** Скобки с одним словом без цифр — это эхо формата сносок, а не ссылка. */
const PSEUDO_TAG = /\[\s*[A-Za-zА-Яа-яЁё]{1,20}\s*\]/g;

export function cleanCitationNoise(text: string): string {
  return String(text ?? "")
    .replace(PSEUDO_TAG, "")
    .replace(/ {2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1");
}

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

/** Итоговый текст ответа: сначала чистим мусорные метки, потом гарантируем сноски. */
export function formatAnswer(text: string, citations: readonly CitationRef[] | null | undefined): string {
  return ensureCitationFootnotes(cleanCitationNoise(text), citations);
}
