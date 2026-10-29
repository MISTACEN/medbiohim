/**
 * Статические учебные пособия из `public/library`.
 *
 * Часть пособий (гистология) уже заведена в таблицу `materials` и приходит из
 * API. Пособия кафедры физиологии в базе отсутствуют — они лежат только
 * файлами, поэтому без этого индекса поиск «учебник по физиологии» не находил
 * ничего. Индекс используется страницей поиска и карточкой предмета, чтобы
 * список файлов не расходился в двух местах.
 */

export type LibraryFile = {
  title: string;
  href: string;
  /** Человеческая подпись файла: формат и назначение. */
  type: string;
  subject: string;
  subject_slug: string;
};

export const LIBRARY_FILES: LibraryFile[] = [
  { title: "Вводное занятие. Физиология возбудимых систем", href: "/library/physiology/vozbudimye-sistemy.docx", type: "Word · практические занятия", subject: "Физиология", subject_slug: "physiology" },
  { title: "Физиология ЦНС", href: "/library/physiology/cns.doc", type: "Word · практические работы и самоподготовка", subject: "Физиология", subject_slug: "physiology" },
  { title: "Физиология крови и эндокринной системы", href: "/library/physiology/krov-endokrin.doc", type: "Word · методичка", subject: "Физиология", subject_slug: "physiology" },
  { title: "Физиология системы кровообращения", href: "/library/physiology/serdce-sosudistaya.doc", type: "Word · методичка", subject: "Физиология", subject_slug: "physiology" },
  { title: "Физиология дыхания и выделения", href: "/library/physiology/dyhanie-vydelenie.doc", type: "Word · методичка", subject: "Физиология", subject_slug: "physiology" },
  { title: "Физиология пищеварения и обмена веществ", href: "/library/physiology/pishchevarenie-obmen.docx", type: "Word · методичка", subject: "Физиология", subject_slug: "physiology" },
  { title: "Сенсорные системы и ВНД", href: "/library/physiology/sensornye-vnd.doc", type: "Word · методичка", subject: "Физиология", subject_slug: "physiology" },
  { title: "Агаджанян Н.А. Основы физиологии человека, том 1", href: "/library/physiology/agadzhanyan-fiziologiya-t1.pdf", type: "PDF · учебник", subject: "Физиология", subject_slug: "physiology" },
];

/* —— Матчинг запроса ——
 * Тот же принцип, что в Worker'е (`workers/api/src/lib/search-query.ts`):
 * нормализация, отбрасывание служебных слов и грубый стемминг, чтобы
 * «физиологии» совпадало с «Физиология», а «учебник по физиологии» находил
 * учебник, хотя слова «по» в названии нет.
 */

const STOPWORDS = new Set(["по", "для", "в", "на", "и", "с", "из", "о", "об", "к", "у", "от", "до"]);

/** Вид материала: задаёт раздел, но не обязан быть в каждом названии. */
const MATERIAL_HINTS = new Set([
  "учебник", "учебники", "учебника", "учебников",
  "атлас", "атласы", "атласа",
  "пособие", "пособия", "методичка", "методички",
]);

const SUFFIXES = [
  "иями", "ями", "ами", "ов", "ев", "ий", "ия", "ии", "ей", "ой",
  "ая", "ые", "ых", "ому", "ему", "ам", "ям", "ах", "ях", "ию",
  "ью", "и", "ы", "е", "у", "ю", "я", "а", "о", "ь",
];

export function normalizeLibraryText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  if (token.length <= 4) return token;
  for (const suffix of SUFFIXES) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

export function libraryTokens(query: string): string[] {
  return [...new Set(
    normalizeLibraryText(query)
      .split(" ")
      .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
      .map(stem),
  )];
}

function scoreFile(file: LibraryFile, query: string): number {
  const fields = [file.title, file.subject, file.type].map(normalizeLibraryText);
  const normalizedQuery = normalizeLibraryText(query);
  if (!normalizedQuery) return 0;
  if (fields.some((field) => field === normalizedQuery)) return 120;
  if (fields.some((field) => field.includes(normalizedQuery))) return 100;

  const tokens = libraryTokens(query);
  if (!tokens.length) return 0;
  let matched = 0;
  let exact = 0;
  for (const token of tokens) {
    const hit = fields.some((field) => field.split(" ").some((word) => word.startsWith(token)));
    if (hit) {
      matched += 1;
      if (fields.some((field) => field.split(" ").includes(token))) exact += 1;
    }
  }
  if (!matched) return 0;
  return Math.round((matched / tokens.length) * 60) + Math.min(exact * 3, 12);
}

export type LibrarySearchHit = {
  type: "material";
  type_label: string;
  id: string;
  title: string;
  subject: string;
  subject_slug: string;
  topic: string;
  snippet: string;
  hint: string;
  has_answer: false;
  href: string;
  score: number;
};

/** Поиск по статическим пособиям. `subjectSlug` — тот же фильтр, что у API. */
/** «Методичка»/«пособие» в названиях часто сокращены до «метод.» — сверяем корень. */
function matchesHint(file: LibraryFile, hint: string): boolean {
  const text = normalizeLibraryText(`${file.title} ${file.type}`);
  if (/^методич|^пособ/.test(hint)) return /методич|метод|пособ/.test(text);
  return text.includes(hint);
}

export function searchLibrary(query: string, subjectSlug?: string): LibrarySearchHit[] {
  const words = normalizeLibraryText(query).split(" ").filter(Boolean);
  const hints = words.filter((word) => MATERIAL_HINTS.has(word)).map(stem);
  const contentQuery = words
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word) && !MATERIAL_HINTS.has(word))
    .join(" ");
  if (!contentQuery && !hints.length) return [];

  return LIBRARY_FILES
    .filter((file) => !subjectSlug || file.subject_slug === subjectSlug.trim().toLowerCase())
    .map((file) => {
      const base = contentQuery ? scoreFile(file, contentQuery) : 0;
      const hintMatch = hints.some((hint) => matchesHint(file, hint));
      // Названный вид материала обязателен, а не просто бонус: «учебник по
      // физиологии» не должен приносить методички, где нет слова «учебник».
      if ((contentQuery && !base) || (hints.length && !hintMatch)) return { file, score: 0 };
      return { file, score: base ? base + (hintMatch ? 50 : 0) : 90 };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.file.title.localeCompare(b.file.title, "ru"))
    .map(({ file, score }) => ({
      type: "material" as const,
      type_label: "Учебное пособие",
      id: file.href,
      title: file.title,
      subject: file.subject,
      subject_slug: file.subject_slug,
      topic: file.type,
      snippet: `${file.type} · ${file.subject}`,
      hint: file.type,
      has_answer: false as const,
      href: file.href,
      score,
    }));
}
