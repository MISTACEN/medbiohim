/** Справочники глобального поиска и клиентские дополнения (без React). */
import {
  BookOpen, ClipboardCheck, FileQuestion, FileText, GraduationCap, Layers, Library, Microscope,
} from "lucide-react";
import type { SearchHit, SearchSuggestion } from "@/lib/features-api";
import { normalizeLibraryText, searchLibrary } from "@/lib/library";

/**
 * Значения должны совпадать со словарём Worker'а (`workers/api/src/routes/search.ts`),
 * иначе фильтр снова начнёт возвращать 422 на любой выбор.
 */
export const TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "preparations", label: "Препараты" },
  { value: "materials", label: "Учебники и материалы" },
  { value: "subjects", label: "Предметы" },
  { value: "tests", label: "Тесты" },
  { value: "questions", label: "Вопросы" },
  { value: "tickets", label: "Билеты" },
  { value: "lectures", label: "Лекции" },
  { value: "packs", label: "Паки карточек" },
];

export const TYPE_LABEL: Record<string, string> = {
  preparation: "Микропрепарат",
  subject: "Предмет",
  material: "Материал",
  question: "Вопрос",
  ticket: "Билет",
  lecture: "Лекция",
  test: "Тест",
  pack: "Пак карточек",
};

export const TYPE_ICON: Record<string, typeof BookOpen> = {
  preparation: Microscope,
  subject: Library,
  material: FileText,
  question: FileQuestion,
  ticket: GraduationCap,
  lecture: BookOpen,
  test: ClipboardCheck,
  pack: Layers,
};

export const OPEN_LABEL: Record<string, string> = {
  preparation: "Открыть препарат →",
  subject: "Открыть предмет →",
  material: "Открыть материал →",
  lecture: "Открыть лекции →",
  question: "Открыть вопросы →",
  ticket: "Открыть билеты →",
  test: "Открыть тест →",
  pack: "Открыть пак →",
};

export const DEFAULT_EXAMPLES = [
  "препарат почка",
  "кровь мазок",
  "учебник по гистологии",
  "учебник по физиологии",
  "билет физиология",
];

/** Старые ссылки с типом «question»/«ticket» продолжают работать. */
export const TYPE_ALIASES: Record<string, string> = {
  question: "questions",
  questions: "questions",
  ticket: "tickets",
  tickets: "tickets",
  test: "tests",
  tests: "tests",
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
};

/**
 * Статические пособия (физиология) не лежат в таблице materials, поэтому
 * подмешиваем их на клиенте. Дубли с API отбрасываем по нормализованному
 * названию, фильтры типа и предмета — те же, что у сервера.
 */
export function withLibrary(
  hits: SearchHit[],
  query: string,
  type?: string,
  subjectSlug?: string
): SearchHit[] {
  if (type && type !== "materials") return hits;
  const local = searchLibrary(query, subjectSlug || undefined);
  if (!local.length) return hits;
  const seen = new Set(hits.map((hit) => normalizeLibraryText(hit.title)));
  const extra = local.filter((hit) => !seen.has(normalizeLibraryText(hit.title)));
  if (!extra.length) return hits;
  return [...hits, ...extra].sort((a, b) => (b.score || 0) - (a.score || 0));
}

export function librarySuggestions(query: string): SearchSuggestion[] {
  return searchLibrary(query).slice(0, 3).map((hit) => ({
    id: hit.href,
    type: hit.type,
    type_label: hit.type_label,
    title: hit.title,
    subject: hit.subject,
    hint: hit.hint,
    href: hit.href,
    count: 1,
  }));
}

/** Конспекты портала: лёгкий индекс (id/предмет/название/ссылка), грузится один раз. */
export type LectureSearchItem = { id: string; setId: string; subject: string; title: string; href: string };
let lectureIndexCache: LectureSearchItem[] | null = null;

export async function loadLectureIndex(): Promise<LectureSearchItem[]> {
  if (lectureIndexCache) return lectureIndexCache;
  try {
    const response = await fetch("/content/lectures-search-index.json", { cache: "no-cache" });
    if (!response.ok) return [];
    const data = (await response.json()) as { items: LectureSearchItem[] };
    lectureIndexCache = data.items ?? [];
  } catch {
    lectureIndexCache = [];
  }
  return lectureIndexCache;
}

export function searchLectures(items: LectureSearchItem[], query: string): LectureSearchItem[] {
  const normalized = query.trim().toLowerCase().replace(/[–—−]/g, "-");
  if (!normalized) return [];
  const tight = normalized.replace(/[^a-zа-яё0-9]/gi, "");
  return items
    .filter((item) => {
      const title = item.title.toLowerCase().replace(/[–—−]/g, "-");
      return title.includes(normalized) || title.replace(/[^a-zа-яё0-9]/gi, "").includes(tight);
    })
    .slice(0, 8);
}
