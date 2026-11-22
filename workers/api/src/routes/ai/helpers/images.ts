/**
 * Изображения к ответу тьютора.
 *
 * Многие разборы нельзя объяснить одним текстом: «где на снимке эозинофил»,
 * «чем трахея отличается от бронха». Генерировать картинку модель не умеет
 * (провайдеры текстовые), поэтому к ответу прикладываются реальные
 * микропрепараты и электронограммы курса из опубликованных карточек
 * тренажёра. Снимок добавляется только при явном совпадении названия
 * препарата с вопросом: лишняя фотография хуже её отсутствия.
 */

export type AnswerImage = {
  /** id карточки тренажёра: клиент сам получает по нему ссылку на картинку. */
  card_id: string;
  title: string;
  kind: "preparation" | "electronogram";
};

type FeedCard = {
  id?: unknown;
  mode_set?: unknown;
  preparation?: Record<string, unknown> | null;
  tags?: unknown;
};

/** Слова, которые не говорят о препарате и дают ложные совпадения. */
const STOP_WORDS = new Set([
  "это", "как", "что", "чем", "для", "при", "или", "его", "она", "они", "так", "все", "еще", "ещё",
  "быть", "есть", "был", "была", "были", "было", "может", "можно", "нужно", "надо", "только", "также",
  "какой", "какая", "какие", "каких", "который", "которая", "которые", "почему", "зачем", "где", "когда",
  "правильный", "правильного", "неверный", "ответ", "ответа", "ответы", "вариант", "варианта", "варианты",
  "вопрос", "вопроса", "вопросы", "тест", "тесте", "теста", "задание", "задания",
  "препарат", "препарата", "препараты", "микропрепарат", "электронограмма", "электронограммы",
  "гистология", "гистологии", "ткань", "ткани", "клетка", "клетки", "клеток", "строение", "функция",
  "функции", "разбери", "объясни", "разбор", "выбор", "ключ", "ключе", "ключевой", "источник", "материал",
  "материалы", "лекция", "лекции", "фрагмент", "фрагменты", "мой", "моя", "меня", "тебе", "вам", "ваш",
]);

/** Служебные окончания: «трахея»/«трахеи» и «кровь»/«крови» должны совпасть. */
const ENDING = /(?:ами|ями|ого|его|ому|ему|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ей|ов|ев|ам|ям|ах|ях|ом|ем|ую|юю|а|я|ы|и|у|ю|е|о|ь)$/u;

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

/** Грубая основа слова: окончание отрезано, хвост длинного слова укорочен. */
function stem(word: string): string {
  const base = word.replace(ENDING, "") || word;
  return base.length > 5 ? base.slice(0, 5) : base;
}

function keywords(values: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const value of values) {
    for (const word of normalize(String(value ?? "")).split(" ")) {
      if (word.length < 3 || STOP_WORDS.has(word)) continue;
      out.add(stem(word));
    }
  }
  return out;
}

/**
 * Нужна ли вообще картинка. Для гистологии — всегда (вопрос про строение), для
 * остальных предметов — только если студент сам говорит о снимке/препарате,
 * иначе к физиологии прилипали случайные фото.
 */
export function wantsCourseImage(subjectSlug: string | null | undefined, query: string): boolean {
  if (String(subjectSlug || "").trim().toLowerCase() === "histology") return true;
  return /(препарат|микропрепарат|электронограмм|гистолог|снимок|фото|изображен|на рисунке|на схеме|структур)/i
    .test(String(query || ""));
}

/**
 * Подбор карточек по тексту вопроса. Одно название препарата — одна карточка:
 * в банке по восемь снимков «Кровь мазок», и все они в ответе не нужны.
 */
export function pickAnswerImages(cards: readonly FeedCard[], query: string, limit = 2): AnswerImage[] {
  const queryTokens = keywords([query]);
  if (!queryTokens.size) return [];
  const ranked: { score: number; image: AnswerImage }[] = [];
  const usedTitles = new Set<string>();

  for (const card of cards) {
    const preparation = (card?.preparation && typeof card.preparation === "object" ? card.preparation : {}) as Record<string, unknown>;
    const title = String(preparation.name || preparation.organ || "").trim();
    const titleKey = title.toLowerCase();
    if (!title || usedTitles.has(titleKey)) continue;

    const titleTokens = keywords([title]);
    const organTokens = keywords([preparation.organ]);
    const tagTokens = keywords(Array.isArray(card.tags) ? card.tags : []);

    let score = 0;
    for (const token of queryTokens) {
      if (titleTokens.has(token)) score += 3;
      else if (organTokens.has(token)) score += 2;
      else if (tagTokens.has(token)) score += 1;
    }
    // Меньше полного совпадения названия — не прикладываем: фото должно быть
    // про то же самое, а не «рядом по теме».
    if (score < 3) continue;

    usedTitles.add(titleKey);
    ranked.push({
      score,
      image: {
        card_id: String(card.id || ""),
        title,
        kind: String(card.mode_set || "") === "electronogram" ? "electronogram" : "preparation",
      },
    });
  }

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((item) => item.image)
    .filter((image) => image.card_id);
}

/** Карточки тренажёра с фото к вопросу; ошибка банка не ломает ответ тьютора. */
export async function selectAnswerImages(
  supabase: any,
  subjectSlug: string | null | undefined,
  query: string,
  limit = 2,
): Promise<AnswerImage[]> {
  if (!wantsCourseImage(subjectSlug, query)) return [];
  try {
    const { data, error } = await supabase
      .from("trainer_feed_cards")
      .select("id,mode_set,preparation,tags")
      .eq("is_published", true)
      .limit(400);
    if (error || !Array.isArray(data)) return [];
    return pickAnswerImages(data, query, limit);
  } catch (error) {
    console.error("[ai:answer-images]", error);
    return [];
  }
}
