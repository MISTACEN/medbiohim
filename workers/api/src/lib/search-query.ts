/**
 * Нормализация поискового запроса и оценка совпадения.
 *
 * Живая проблема: «учебник по гистологии» не находил «Гистология… учебник
 * (Афанасьев)», потому что ilike искал всю фразу в заголовке, а «препарат
 * почка» — потому что слово «препарат» вообще не встречается в названиях
 * препаратов. Здесь запрос разбирается на слова, отбрасывает служебные слова
 * и грубо стеммится, чтобы «гистологии» совпадало с «Гистология», а «почки» —
 * с «Почка».
 */

export type SearchIntentKind =
  | "preparations"
  | "materials"
  | "subjects"
  | "lectures"
  | "tickets"
  | "questions";

export type SearchIntent = {
  /** Тип, если пользователь явно назвал его первым словом. */
  kind?: SearchIntentKind;
  /** Запрос без служебных слов («препарат», «лекции», «по»). */
  query: string;
  /** Исходный нормализованный запрос. */
  normalized: string;
  /** Что ищем — для подсказки в интерфейсе. */
  hint: string;
  /**
   * «Учебник», «атлас», «методичка» — не часть названия, а вид материала.
   * Из запроса слово убирается, иначе любой учебник совпадал бы по нему и
   * запрос «учебник по физиологии» приносил бы учебники по гистологии.
   */
  materialHint?: string;
};

/** Слова-типы: задают фильтр и не участвуют в совпадении. */
const META_TYPE_WORDS: Record<string, SearchIntentKind> = {
  препарат: "preparations",
  препараты: "preparations",
  препаратов: "preparations",
  микропрепарат: "preparations",
  микропрепараты: "preparations",
  лекция: "lectures",
  лекции: "lectures",
  лекций: "lectures",
  билет: "tickets",
  билеты: "tickets",
  билетов: "tickets",
  вопрос: "questions",
  вопросы: "questions",
  вопросов: "questions",
  тест: "questions",
  тесты: "questions",
  предмет: "subjects",
  предметы: "subjects",
  предметов: "subjects",
};

/**
 * Слова вида материала: задают раздел, но не требуют совпадения в каждой
 * строке. Их стемма служит бонусом при ранжировании (см. route/search).
 */
const MATERIAL_HINTS = new Set([
  "учебник",
  "учебники",
  "учебника",
  "учебников",
  "атлас",
  "атласы",
  "атласа",
  "пособие",
  "пособия",
  "методичка",
  "методички",
]);

const STOPWORDS = new Set([
  "по", "для", "в", "на", "и", "с", "из", "о", "об", "к", "у", "от", "до",
  "the", "a", "an", "of", "for", "in", "on",
]);

/** Русские окончания; длинные — первыми, чтобы «-иями» не резалось как «-и». */
const SUFFIXES = [
  "иями", "ями", "ами", "ов", "ев", "ий", "ия", "ии", "ей", "ой",
  "ая", "ые", "ых", "ому", "ему", "ам", "ям", "ах", "ях", "ию",
  "ью", "и", "ы", "е", "у", "ю", "я", "а", "о", "ь",
];

/** Нижний регистр, ё→е, пунктуация → пробел. */
export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Грубый стеммер: срезает одно русское окончание у достаточно длинного слова. */
export function stemToken(token: string): string {
  const normalized = normalizeSearchText(token);
  if (normalized.length <= 4 || normalized.includes(" ")) return normalized;
  for (const suffix of SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 4) {
      return normalized.slice(0, -suffix.length);
    }
  }
  return normalized;
}

/** Слова запроса без служебных, уже со стеммингом. */
export function searchTokens(value: string): string[] {
  return [...new Set(
    normalizeSearchText(value)
      .split(" ")
      .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
      .map(stemToken)
      .filter(Boolean),
  )];
}

function hasTokenMatch(haystack: string, token: string): boolean {
  if (!token) return false;
  return haystack.split(" ").some((word) => word === token || word.startsWith(token) || haystack.includes(token));
}

/**
 * 0 — нет совпадения; 120 — точная фраза; 100 — фраза внутри поля;
 * 1…60 — доля найденных слов (плюс небольшая надбавка за точное слово).
 */
export function scoreFields(fields: Array<unknown>, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  const haystacks = fields.map(normalizeSearchText).filter(Boolean);
  if (!haystacks.length) return 0;

  if (haystacks.some((field) => field === normalizedQuery)) return 120;
  if (haystacks.some((field) => field.includes(normalizedQuery))) return 100;

  const tokens = searchTokens(query);
  if (!tokens.length) return 0;

  let matched = 0;
  let exact = 0;
  for (const token of tokens) {
    if (haystacks.some((field) => hasTokenMatch(field, token))) {
      matched += 1;
      if (haystacks.some((field) => field.split(" ").includes(token))) exact += 1;
    }
  }
  if (!matched) return 0;
  return Math.round((matched / tokens.length) * 60) + Math.min(exact * 3, 12);
}

/**
 * Совпадает ли материал с видом из запроса. «Методичка» и «пособие» в
 * реальных названиях часто сокращены до «метод.», поэтому проверяем корень,
 * а не точное слово.
 */
export function matchesMaterialHint(fields: Array<unknown>, hint?: string): boolean {
  if (!hint) return false;
  const text = fields.map(normalizeSearchText).join(" ");
  if (/^методич|^пособ/.test(hint)) return /методич|метод|пособ/.test(text);
  return text.includes(hint);
}

/** Первое слово запроса задаёт тип, если это «препарат», «лекция», «билет» и т.п. */
export function parseSearchIntent(raw: string): SearchIntent {
  const normalized = normalizeSearchText(raw);
  if (!normalized) return { query: "", normalized: "", hint: "" };

  const words = normalized.split(" ");
  let kind: SearchIntentKind | undefined;
  let materialHint: string | undefined;
  const kept: string[] = [];
  for (const word of words) {
    const meta = META_TYPE_WORDS[word];
    if (meta) {
      kind = kind || meta;
      continue;
    }
    if (STOPWORDS.has(word)) continue;
    if (MATERIAL_HINTS.has(word)) {
      kind = kind || "materials";
      materialHint = materialHint || stemToken(word);
      continue;
    }
    kept.push(word);
  }

  const query = kept.join(" ");
  const kindHint: Record<SearchIntentKind, string> = {
    preparations: "ищем микропрепарат",
    materials: "ищем материал или учебник",
    subjects: "ищем предмет",
    lectures: "ищем лекцию",
    tickets: "ищем билет",
    questions: "ищем вопрос",
  };
  return {
    query,
    normalized,
    kind,
    materialHint,
    hint: kind ? kindHint[kind] : query ? "ищем по всем разделам" : "",
  };
}

/** Человеческие примеры для пустого поиска. */
/**
 * Примеры только из реально существующих материалов: раньше здесь был
 * «препарат печень», которого нет в банке, и поиск выглядел сломанным.
 */
export const SEARCH_EXAMPLES = [
  "препарат почка",
  "кровь мазок",
  "учебник по гистологии",
  "учебник по физиологии",
  "билет физиология",
  "гиалиновый хрящ",
];

/** Русские подписи тегов гистологии (те же ключи, что в trainer_feed_cards.tags). */
export const HISTOLOGY_TAG_LABELS: Record<string, string> = {
  cytology: "Цитология",
  embryology: "Эмбриология",
  epithelium: "Эпителии",
  connective: "Соединительная ткань",
  bone_muscle: "Костная и мышечная ткань",
  nerve_tissue: "Нервная ткань",
  nervous_system: "Нервная система",
  cvs: "Сердечно-сосудистая система",
  gi: "Желудочно-кишечный тракт",
  glands: "Железы",
  urinary: "Мочевыделительная система",
  reproductive: "Репродуктивная система",
  respiratory: "Дыхательная система",
  skin: "Кожа",
  endocrine: "Эндокринная система",
  hematopoiesis: "Кроветворение",
  stom_mbh: "Стоматология",
};

export function histologyTagLabel(tag: unknown): string {
  const key = String(tag || "").trim();
  return HISTOLOGY_TAG_LABELS[key] || key;
}
