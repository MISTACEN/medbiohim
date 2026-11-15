/**
 * Отбор фрагментов лекций для RAG-контекста тьютора.
 *
 * Раньше источники набирались простым подсчётом вхождений слов запроса: любое
 * совпадение давало балл, поэтому на вопрос «объясни механизм гемолиза
 * эритроцитов» в «Источники» попадали «Физиология мышечного сокращения» и
 * «Рефлекс как элементарный акт» — там встречается слово «механизм». Слова в
 * запросе стоят в косвенном падеже («гемолиза», «эритроцитов»), а в лекциях — в
 * именительном («гемолиз», «эритроцит»), поэтому нужная лекция не находилась
 * вовсе.
 *
 * Что делает отбор:
 *  1. Приводит слова запроса к основе (срезает падежные окончания), чтобы
 *     «гемолиза» находило «гемолиз», а «желудок» и «желудке» находились по
 *     одной основе.
 *  2. Взвешивает основы по редкости в корпусе предмета (idf): слово, которое
 *     есть почти в каждой лекции («физиология», «строение»), почти ничего не
 *     доказывает, редкое («гемолиз») — доказывает.
 *  3. Считает релевантность как долю веса запроса, которую покрывает лекция, и
 *     выбрасывает всё ниже порога.
 *  4. Ставит совпадения в названии темы выше совпадений в тексте: название —
 *     это тема лекции, а не случайное упоминание.
 *  5. Требует плотности упоминаний, если название темы не совпало: одно слово
 *     «желудок» в 43 КБ лекции о крови ещё не делает её источником ответа о
 *     пищеварении.
 *  6. Не считает темой вопросы-рамки: «механизм», «расскажи», «отличие» —
 *     это просьба, а не предмет разговора.
 *  7. Оставляет в источниках только лекции, совпавшие с названием темы не
 *     слабее лидера: остальные лишь упоминают слова вопроса.
 */

/** Лекция в том виде, в каком её отдаёт Supabase. */
export type LectureDoc = {
  id: string;
  title: string;
  body: string;
  subjectSlug?: string | null;
};

/** Отобранный фрагмент: позиция первого вхождения основы — якорь вырезки. */
export type LectureExcerpt = {
  id: string;
  title: string;
  body: string;
  subjectSlug: string | null;
  score: number;
  relevance: number;
  /** Сколько разных основ запроса нашлось в названии темы. */
  titleMatches: number;
  /** Индекс лучшего вхождения в тексте, -1 если в тексте совпадений нет. */
  anchor: number;
};

/** Минимальная доля веса запроса, покрытая лекцией. */
export const MIN_RELEVANCE = 0.34;
/** Лекция слабее лидера больше чем в 1,6 раза — уже не источник, а шум. */
export const MIN_RELATIVE_SCORE = 0.6;
/** Совпадение основы в названии темы весит как три совпадения в тексте. */
export const TITLE_BOOST = 3;
/** Минимум упоминаний основы на 1000 символов текста (без совпадения в названии). */
export const MIN_DENSITY = 0.1;
/** Основа в такой доле лекций корпуса считается общей и в скоринг не идёт. */
export const UBIQUITOUS_DF_SHARE = 0.8;

/** Вопросные и служебные слова: они не описывают тему. */
const STOPWORDS = new Set([
  "объясни", "объясните", "объяснить", "расскажи", "расскажите", "опиши", "опишите",
  "подскажи", "подскажите", "покажи", "покажите", "напиши", "напишите", "ответь",
  "ответьте", "пожалуйста", "кратко", "коротко", "подробно", "простыми", "словами",
  "вопрос", "вопросы", "задание", "задания", "пример", "примеры", "тема", "тему",
  "такой", "такая", "такие", "такое", "такого", "такому", "таким", "этого",
  "этом", "этим", "этот", "это", "бывает", "бывают", "называется", "называются",
  "образует", "образуют", "образуется", "образуются", "относят", "относятся",
  "что", "чем", "чего", "как", "какие", "какая", "какой", "каких", "почему",
  "зачем", "когда", "где", "можно", "нужно", "надо", "если", "чтобы", "также",
  "очень", "более", "менее", "между", "после", "перед", "через", "свой", "свои",
  "свое", "своей", "все", "весь", "есть", "быть", "было", "были", "будет",
  "может", "могут", "должен", "должно", "происходит", "отличается", "отличие",
  "отличия", "разница", "роль", "роли", "значение", "суть", "сущность",
]);

/**
 * Вопросные обороты и слова-рамки в основе: «устроен», «объясни», «механизм» —
 * не тема вопроса. «Механизм» особенно важен: именно он раньше притягивал в
 * источники лекции о мышечном сокращении и рефлексах на любой вопрос.
 */
const STOP_STEMS = new Set([
  "объясн", "рассказ", "описан", "опиши", "подсказ", "покаж", "напиш",
  "устроен", "устрои", "отлича", "отличи", "функционир",
  "механизм", "процесс", "появл", "возник", "образу",
]);

/**
 * Окончания: падежные (короткие) и словообразовательные (длинные).
 *
 * Срезаются по одному, пока основа не короче 5 букв — а короткие окончания
 * («-а», «-ы», «-ов») — пока не короче 4. Порог в 5 букв не даёт «строению»
 * превратиться в «стро», а «эритроцитов» → «эритроцит», «гемолиза» →
 * «гемолиз», «сокращения»/«сокращается» → «сокращ», «всасывания» →
 * «всасыван», «набухают» → «набух», «выделяется» → «выдел».
 */
const RU_SUFFIXES = [
  "уется", "ается", "яется", "иться", "ениями", "ением", "ению", "ения",
  "иями", "ями", "ами", "ыми", "ими", "ого", "его", "ому", "ему",
  "ение", "ание", "ется", "ются", "ешь", "ишь", "ают", "яют", "уют",
  "ует", "ает", "яет", "ать", "ять", "ить", "еть", "ость", "ов", "ев",
  "ий", "ия", "ие", "ии", "ей", "ой", "ый", "ая", "ое", "ые", "ых", "их",
  "ым", "им", "ую", "юю", "ах", "ях", "ам", "ям", "ом", "ем", "ы", "и",
  "а", "я", "о", "е", "у", "ю", "ь",
].sort((a, b) => b.length - a.length);

/** Словообразовательное окончание требует основы не короче 5 букв. */
const minStemLength = (suffix: string): number => (suffix.length >= 3 ? 5 : 4);

function normalize(text: string): string {
  return String(text ?? "").toLowerCase().replace(/ё/g, "е");
}

/** Основа слова: нижний регистр, без пунктуации, без падежного окончания. */
export function stemRu(word: string): string {
  let stem = normalize(word).replace(/[^a-zа-я0-9]+/g, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of RU_SUFFIXES) {
      if (stem.length - suffix.length >= minStemLength(suffix) && stem.endsWith(suffix)) {
        stem = stem.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return stem;
}

/** Значимые основы вопроса: без вопросных слов, коротких слов и цифр. */
export function queryStems(query: string): string[] {
  const words = normalize(query).split(/[^a-zа-я0-9]+/).filter(Boolean);
  const stems = new Set<string>();
  for (const word of words) {
    if (word.length < 4 || /^\d+$/.test(word) || STOPWORDS.has(word)) continue;
    const stem = stemRu(word);
    if (stem.length < 4 || STOP_STEMS.has(stem)) continue;
    stems.add(stem);
  }
  return [...stems];
}

/**
 * Основа как начало слова. Длинные основы сравниваются без последней буквы,
 * поэтому «желудок»/«желудке»/«желудка» — одна основа. Короткие («кров»,
 * «мозг») требуют хвоста не длиннее двух букв: иначе «кров» находился бы в
 * «кроветворении», и лекция про костный мозг попадала бы в источники вопроса
 * про кровь.
 */
function stemPattern(stem: string): RegExp {
  if (stem.length >= 5) {
    const core = stem.length > 5 ? stem.slice(0, -1) : stem;
    return new RegExp(`(?:^|[^а-яa-z0-9])${core}[а-яa-z0-9]*`, "g");
  }
  return new RegExp(`(?:^|[^а-яa-z0-9])${stem}[а-яa-z]{0,2}(?![а-яa-z])`, "g");
}

/** Сколько раз основа встречается в тексте (с ограничением на объём работы). */
function countStemHits(haystack: string, stem: string): number {
  if (!stem || !haystack) return 0;
  const pattern = stemPattern(stem);
  let count = 0;
  while (pattern.exec(haystack) && count < 60) count += 1;
  return count;
}

/** Сумма idf-весов отобранных основ вопроса. */
type StemStat = { stem: string; df: number; share: number; idf: number };

/**
 * Отбор лекций под вопрос: только темы, где предмет вопроса действительно
 * обсуждается; название в приоритете, слабые хвосты отброшены.
 */
export function selectLectureExcerpts(
  lectures: readonly LectureDoc[],
  query: string,
  limit = 5,
): LectureExcerpt[] {
  const docs = lectures
    .map((lecture) => {
      const body = String(lecture.body || "");
      const lowerBody = normalize(body);
      return {
        id: String(lecture.id || ""),
        title: String(lecture.title || ""),
        body,
        subjectSlug: lecture.subjectSlug ?? null,
        lowerTitle: normalize(lecture.title || ""),
        lowerBody,
        bodyLength: lowerBody.length,
      };
    })
    .filter((doc) => doc.body.trim().length > 0);
  if (!docs.length) return [];

  const stems = queryStems(query);
  if (!stems.length) return [];

  // Редкость основы в корпусе предмета: общие слова курса почти не весят.
  const stats: StemStat[] = [];
  for (const stem of stems) {
    let df = 0;
    for (const doc of docs) {
      if (countStemHits(doc.lowerTitle, stem) || countStemHits(doc.lowerBody, stem)) df += 1;
    }
    const share = df / docs.length;
    if (!df || share > UBIQUITOUS_DF_SHARE) continue;
    stats.push({ stem, df, share, idf: Math.log(1 + docs.length / df) });
  }
  if (!stats.length) return [];

  const totalIdf = stats.reduce((sum, entry) => sum + entry.idf, 0);
  if (totalIdf <= 0) return [];

  const matches: Array<LectureExcerpt & { titleIdf: number; bestIdf: number }> = [];
  for (const doc of docs) {
    let score = 0;
    let matchedIdf = 0;
    let titleMatches = 0;
    let titleIdf = 0;
    let anchor = -1;
    let bestIdf = 0;
    /** Самая плотная основа: сколько раз она упомянута на 1000 символов. */
    let density = 0;
    for (const entry of stats) {
      const inTitle = countStemHits(doc.lowerTitle, entry.stem) > 0;
      const bodyHits = countStemHits(doc.lowerBody, entry.stem);
      if (!inTitle && bodyHits === 0) continue;
      matchedIdf += entry.idf;
      score += entry.idf * (1 + Math.min(bodyHits, 8) * 0.15) * (inTitle ? TITLE_BOOST : 1);
      if (inTitle) {
        titleMatches += 1;
        titleIdf += entry.idf;
      }
      if (bodyHits > 0) {
        density = Math.max(density, (bodyHits * 1000) / Math.max(1, doc.bodyLength));
        if (entry.idf > bestIdf) {
          bestIdf = entry.idf;
          const found = doc.lowerBody.search(stemPattern(entry.stem));
          anchor = found < 0 ? -1 : found;
        }
      }
    }
    if (!score) continue;
    // Порог релевантности: лекция должна покрывать заметную долю веса вопроса.
    const relevance = matchedIdf / totalIdf;
    // Совпадение в названии темы — это совпадение с темой лекции: такой лекции
    // достаточно. Без него нужен ещё порог релевантности и плотность: одно
    // слово «желудок» в 43 КБ лекции о крови ещё не делает её источником
    // ответа о пищеварении.
    if (titleMatches === 0) {
      if (relevance < MIN_RELEVANCE) continue;
      if (density < MIN_DENSITY) continue;
    }
    matches.push({
      id: doc.id,
      title: doc.title,
      body: doc.body,
      subjectSlug: doc.subjectSlug,
      score,
      relevance,
      titleMatches,
      anchor,
      titleIdf,
      bestIdf,
    });
  }
  if (!matches.length) return [];

  // Совпадение в названии темы важнее любых совпадений в тексте; внутри
  // группы сильнейшая лекция (по весу совпавших основ) — первая.
  matches.sort((a, b) =>
    Number(b.titleMatches > 0) - Number(a.titleMatches > 0)
    || b.titleIdf - a.titleIdf
    || b.score - a.score);
  const topScore = Math.max(...matches.map((entry) => entry.score));
  let picked = matches
    .filter((entry) => entry.score >= topScore * MIN_RELATIVE_SCORE)
    .slice(0, limit);
  // Если лидер совпал с вопросом в названии темы, лекции, совпавшие в названии
  // слабее (общие слова вроде «нервная система»), — уже не источники ответа.
  const topTitleMatches = matches[0].titleMatches;
  if (topTitleMatches > 0) picked = picked.filter((entry) => entry.titleMatches >= topTitleMatches);
  return picked.map(({ titleIdf: _titleIdf, bestIdf: _bestIdf, ...entry }) => entry);
}
