/**
 * Конфигурация вкладок страницы предмета (ЗАДАЧА A5, шаг 1): id, группы,
 * алиасы старых адресов, подписи. Чистые данные без React.
 */
export type TabId = "plan" | "lessons" | "tests" | "practice" | "lectures" | "materials" | "trainer" | "trainers" | "labs" | "attestations" | "exam" | "progress" | "colloquium" | "portal" | "chem" | "latin";
export type GroupId = "plan" | "lessons" | "tests" | "materials" | "practice" | "attestations" | "progress" | "portal";

export const TAB_IDS: TabId[] = ["plan", "lessons", "tests", "practice", "lectures", "materials", "trainer", "trainers", "labs", "attestations", "exam", "progress", "colloquium", "portal", "chem", "latin"];

// Вкладки сгруппированы: верхний ряд — крупные разделы, внутри — точные режимы.
// «Билеты» и «Вопросы к экзамену» объединены во вкладку exam («Экзамен / Билеты»):
// билеты и есть вопросы к экзамену. Старые адреса ?tab=tickets продолжают
// работать через алиас в normalizeTab — внешние ссылки из планов кафедр и
// sitemap не должны попасть в 404.
export const GROUP_OF: Record<TabId, GroupId> = {
  plan: "plan",
  lessons: "lessons",
  tests: "tests",
  practice: "tests",
  lectures: "materials",
  materials: "materials",
  trainer: "practice",
  trainers: "practice",
  labs: "practice",
  attestations: "attestations",
  exam: "attestations",
  colloquium: "attestations",
  portal: "portal",
  progress: "progress",
  chem: "practice",
  latin: "practice",
};

export const GROUP_DEFAULT: Record<GroupId, TabId> = {
  plan: "plan",
  lessons: "lessons",
  tests: "tests",
  materials: "lectures",
  practice: "trainers",
  attestations: "exam",
  portal: "portal",
  progress: "progress",
};

export function normalizeTab(v: string) {
  // Алиасы старых адресов: билеты теперь живут во вкладке «Экзамен / Билеты».
  if (v === "tickets") return "exam" as TabId;
  if (v === "cards") return "trainers" as TabId;
  return v as TabId;
}

export const slugNames: Record<string, string> = {
  "гистология, цитология": "histology",
  гистология: "histology",
  физиология: "physiology",
  "органическая и физическая химия": "chemistry_organic_physical",
};
export const semester = (n: number) => (n % 2 ? "Осенний" : "Весенний");

export function isTabId(v: string): v is TabId {
  return (TAB_IDS as string[]).includes(v);
}

export function materialTypeLabel(type?: string | null) {
  const map: Record<string, string> = { lecture: "Лекция", pdf: "PDF", pptx: "Презентация", docx: "Word", lab: "Лабораторная", table: "Таблица", html: "Страница", video: "Видео", other: "Материал" };
  return map[String(type || "")] || String(type || "Материал");
}

export function stripHtml(html?: string | null) {
  return String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}