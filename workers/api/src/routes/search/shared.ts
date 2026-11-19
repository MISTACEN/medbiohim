import { normalizeSearchText, type SearchIntentKind } from "../../lib/search-query";

export type SearchKind = SearchIntentKind;

export type SearchHit = {
  type: string;
  type_label: string;
  id: string;
  title: string;
  subject: string;
  subject_slug: string | null;
  topic: string;
  snippet: string;
  hint: string;
  has_answer: boolean;
  answer?: string;
  href: string;
  score: number;
  count?: number;
};

export const TYPE_LABEL: Record<string, string> = {
  preparation: "Микропрепарат",
  subject: "Предмет",
  material: "Материал",
  lecture: "Лекция",
  question: "Вопрос",
  ticket: "Билет",
  test: "Тест",
  pack: "Пак карточек",
};

/** При равном счёте важнее предмет и препарат, чем вопрос из практики. */
export const TYPE_PRIORITY: Record<string, number> = {
  subject: 6,
  preparation: 5,
  material: 4,
  test: 3,
  lecture: 3,
  ticket: 2,
  question: 1,
  pack: 1,
};

export const MATERIAL_TYPE_LABEL: Record<string, string> = {
  lecture: "Лекция",
  pdf: "PDF",
  pptx: "Презентация",
  docx: "Word",
  lab: "Лабораторная",
  table: "Таблица",
  html: "Страница",
  video: "Видео",
  other: "Материал",
};

export const KIND_ALIASES: Record<string, SearchKind> = {
  question: "questions",
  questions: "questions",
  ticket: "tickets",
  tickets: "tickets",
  exam: "tickets",
  lecture: "lectures",
  lectures: "lectures",
  material: "materials",
  materials: "materials",
  textbook: "materials",
  textbooks: "materials",
  preparation: "preparations",
  preparations: "preparations",
  subject: "subjects",
  subjects: "subjects",
  test: "tests",
  tests: "tests",
  pack: "packs",
  packs: "packs",
  cardpack: "packs",
  cardpacks: "packs",
};

export function materialHintLabel(title: string, type: string): string {
  const label = MATERIAL_TYPE_LABEL[String(type || "").toLowerCase()] || "Материал";
  const lower = title.toLowerCase();
  if (/учебник/.test(lower)) return `Учебник · ${label}`;
  if (/атлас/.test(lower)) return `Атлас · ${label}`;
  if (/лекц/.test(lower)) return `Курс лекций · ${label}`;
  if (/методич|пособ/.test(lower)) return `Методичка · ${label}`;
  return label;
}

export function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function primaryTerm(query: string): string {
  return normalizeSearchText(query)
    .split(" ")
    .filter((word) => word.length >= 2)
    .sort((a, b) => b.length - a.length)[0] || "";
}

export type SubjectRow = {
  id: string;
  name: string;
  slug: string | null;
  description?: string | null;
  course_number?: number | null;
  semester?: number | null;
};

export type CollectOptions = {
  query: string;
  kind?: SearchKind;
  subjectSlug?: string;
  limit: number;
  /** «Учебник»/«атлас»: обязательный вид материала плюс бонус к ранжированию. */
  materialHint?: string;
  /** Для подсказок не трогаем тяжёлые разделы. */
  kinds?: SearchKind[];
};

export type SourceContext = {
  db: any;
  query: string;
  term: string;
  subjectSlug?: string;
  materialHint?: string;
  results: SearchHit[];
  subjects: Array<SubjectRow & { score: number }>;
  matchedSubjects: Array<SubjectRow & { score: number }>;
  matchedIds: string[];
  matchedSlugs: string[];
  subjectNameBySlug: Map<string, string>;
  TYPE_PRIORITY: Record<string, number>;
};

export function readKind(raw: string): SearchKind | undefined | "invalid" {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return undefined;
  return KIND_ALIASES[normalized] || "invalid";
}
