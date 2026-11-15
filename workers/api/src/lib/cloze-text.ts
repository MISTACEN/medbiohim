/**
 * Чистые функции конспекта с пропусками (cloze), вынесенные из маршрута,
 * чтобы их можно было проверять тестами без Hono и Supabase.
 */

export type ClozeSeedItem = { before: string; answer: string; after: string };
export type ClozeItem = ClozeSeedItem & { hint: string };

/**
 * Версия в ключе кэша: правка промпта или валидации должна давать новые пункты,
 * а не отдавать старые из site_content. Подняли версию — старые ключи просто
 * перестают читаться и набор пересобирается при следующем открытии.
 */
export const CLOZE_CACHE_VERSION = "v1";
export const CLOZE_CACHE_PREFIX = `cloze:${CLOZE_CACHE_VERSION}:`;

/**
 * Короткий хэш текста лекции для ключа кэша: правка лекции должна давать новые
 * пропуски, а не старый набор из site_content. Ключ выглядит как
 * `cloze:v1:<id>:<hash8>` — расхождение хэша равнозначно отсутствию кэша.
 */
export async function clozeBodyHash(body: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(body || "")));
  return [...new Uint8Array(digest).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Сравнение терминов: без регистра, ё→е, без пунктуации и лишних пробелов. */
export function normalizeLoose(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * То же, но вообще без пробелов — для сверки цитаты с текстом лекции.
 *
 * Цитата может быть обрезана посреди слова: детерминированный путь режет
 * контекст по 160 символов, а модель иногда делит слово между `before` и
 * `answer`. Склейка через пробел (`before + " " + answer + " " + after`) в таком
 * месте не совпадала с текстом, и дословный, но разрезанный пункт молча
 * выбрасывался. Сравнение без пробелов и пунктуации принимает разрезанную
 * цитату и по-прежнему отбрасывает пересказ.
 */
export function squeezeLoose(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, "");
}

/**
 * Пропуски из терминов, выделенных **жирным**: это авторская разметка ключевых
 * понятий лекции. Цитаты дословные по построению, генерация мгновенная и не тратит
 * квоту ИИ; маленькая модель нужна только там, где такой разметки нет.
 * Живой прод показал, что один только Llama-8b выдерживает дословные цитаты
 * примерно в четверти попыток — а выделенные термины есть в 52 из 60 лекций.
 */
/**
 * Сдвигает начало среза к границе слова: если index попал внутрь слова,
 * ведём вперёд до первого пробела — иначе before начинается с обрывка слова.
 */
function boundaryStart(text: string, index: number, limit: number): number {
  if (index <= 0 || index >= limit) return index;
  if (/\s/.test(text[index - 1]) || /\s/.test(text[index])) return index;
  let i = index;
  while (i < limit && !/\s/.test(text[i])) i += 1;
  return i;
}

/**
 * Сдвигает конец среза к границе слова — аналогично, для after.
 */
function boundaryEnd(text: string, index: number, floor: number): number {
  if (index <= floor || index >= text.length) return index;
  if (/\s/.test(text[index]) || /\s/.test(text[index - 1])) return index;
  let i = index;
  while (i > floor && !/\s/.test(text[i - 1])) i -= 1;
  return i;
}

export function extractBoldClozeItems(
  markdown: string,
  limit = 12,
): ClozeSeedItem[] {
  const raw = String(markdown || "");
  const plain = raw.replace(/\*\*/g, "");
  const terms: string[] = [];
  const seenTerms = new Set<string>();
  const marker = /\*\*([^*\n]{2,80})\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw))) {
    const term = match[1].trim();
    if (term.length < 3 || seenTerms.has(term)) continue;
    seenTerms.add(term);
    terms.push(term);
  }
  const items: ClozeSeedItem[] = [];
  let cursor = 0;
  for (const term of terms) {
    if (items.length >= limit) break;
    const at = plain.indexOf(term, cursor);
    if (at < 0) continue;
    const start = boundaryStart(plain, Math.max(0, at - 160), at);
    const before = plain.slice(start, at).trim();
    const afterFrom = at + term.length;
    const end = boundaryEnd(plain, Math.min(plain.length, afterFrom + 160), afterFrom);
    const after = plain.slice(afterFrom, end).trim();
    // Короткие обрезки нечитаемы и неоднозначны — пропускаем.
    if (before.length < 10 || after.length < 10) continue;
    items.push({ before, answer: term, after });
    cursor = at + term.length;
  }
  return items;
}

/** Оставляем только пункты, которые дословно присутствуют в тексте лекции. */
export function validateClozeItems(raw: unknown, body: string): ClozeItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const haystack = squeezeLoose(body);
  const seen = new Set<string>();
  const items: ClozeItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const before = String(row.before ?? "").trim();
    const answer = String(row.answer ?? "").trim();
    const after = String(row.after ?? "").trim();
    if (!answer || answer.length < 2 || answer.length > 80) continue;
    if (before.length > 240 || after.length > 240) continue;
    const key = normalizeLoose(answer);
    if (!key || seen.has(key)) continue;
    const needle = squeezeLoose(before + answer + after);
    if (!needle || !haystack.includes(needle)) continue;
    seen.add(key);
    items.push({
      before,
      answer,
      after,
      hint: String(row.hint ?? "").trim().slice(0, 60) || `${answer.slice(0, 1)}… (${answer.length} симв.)`,
    });
    if (items.length >= 15) break;
  }
  return items;
}
