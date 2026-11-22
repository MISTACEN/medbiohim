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

/**
 * Служебные жалобы модели на «нехватку материалов». Промпт их запрещает, но
 * слабые модели всё равно дописывают примечание вроде «в предоставленных
 * фрагментах курса нет информации, поэтому сноски добавить невозможно».
 * Студенту это не ответ, а оправдание, поэтому такие фразы вырезаются.
 */
const MATERIAL_DISCLAIMERS: RegExp[] = [
  /предоставленн[а-яё]*\s+(фрагмент|материал|лекци|конспект|источник)/i,
  /(фрагмент|материал|лекци|конспект|источник)[а-яё]*[^.!?\n]{0,60}(нет\s|не\s+содерж|не\s+описан|не\s+найден|не\s+хвата|отсутству|недостаточн)/i,
  /(нет|отсутству[а-яё]*|не\s+найден[а-яё]*)[^.!?\n]{0,50}(в|среди)\s+(предоставленн|фрагмент|материал|лекци|конспект)/i,
  /(ссылк[а-яё]*|сноск[а-яё]*)[^.!?\n]{0,50}невозможно/i,
  /для\s+полного\s+ответа[^.!?\n]{0,60}(потребовал|нужен|необходим)/i,
];

function isMaterialDisclaimer(sentence: string): boolean {
  return MATERIAL_DISCLAIMERS.some((pattern) => pattern.test(sentence));
}

/** Убирает строки и предложения-оправдания, сохраняя markdown-структуру ответа. */
export function stripMaterialDisclaimers(text: string): string {
  const body = String(text ?? "");
  if (!body.trim()) return body;
  const kept: string[] = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) {
      kept.push(line);
      continue;
    }
    // Строка может содержать и ответ, и оправдание: выкидываем только
    // предложения-оправдания, а содержательные возвращаем на место.
    const sentences = line.split(/(?<=[.!?…])\s+/);
    if (!sentences.some(isMaterialDisclaimer)) {
      kept.push(line);
      continue;
    }
    const rest = sentences.filter((sentence) => !isMaterialDisclaimer(sentence)).join(" ").trim();
    if (rest) kept.push(rest);
  }
  const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Если модель не сказала ничего, кроме оправданий, лучше показать её текст,
  // чем пустой блок: студент хотя бы увидит, что ответ не сложился.
  return cleaned || body.trim();
}

/** Итоговый текст ответа: убираем оправдания и мусорные метки, затем гарантируем сноски. */
export function formatAnswer(text: string, citations: readonly CitationRef[] | null | undefined): string {
  return ensureCitationFootnotes(cleanCitationNoise(stripMaterialDisclaimers(text)), citations);
}
