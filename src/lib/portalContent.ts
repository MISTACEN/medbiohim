/** Статический контент легаси-порталов (ХОБА, паразитология, legacy MC-тесты),
 *  импортированный tools/portals/import_portals.py в public/content/portals. */

export type PortalHobaTheoryItem = {
  id: number;
  module: number;
  topic: string;
  number?: string;
  question: string;
  answer: string;
};

export type PortalHobaPracticalItem = {
  id: number;
  module: number;
  topic: string;
  question: string;
  answer: string;
  explanation?: string;
  difficulty?: number;
  keywords?: string[];
};

export type PortalHobaTaskItem = {
  id: number;
  type?: string;
  title?: string;
  problem: string;
  solution?: string;
  explanation?: string;
  formulas?: string[];
  difficulty?: number;
};

export type PortalHobaTheory = { subject: string; course: number; semester: number; kind: string; items: PortalHobaTheoryItem[] };
export type PortalHobaPractical = { subject: string; course: number; semester: number; kind: string; items: PortalHobaPracticalItem[] };
export type PortalHobaTasks = { subject: string; course: number; semester: number; kind: string; items: PortalHobaTaskItem[] };

export type PortalMatchingColumn = { key: string; label: string };
export type PortalMatchingRow = Record<string, string>;
export type PortalMatchingTest = {
  id: string;
  title: string;
  columns: PortalMatchingColumn[];
  rows: PortalMatchingRow[];
};
export type PortalMatchingBank = { subject: string; tests: PortalMatchingTest[] };

export type PortalMcQuestion = {
  id: string | number;
  text: string;
  options: string[];
  correct?: number;
  answer?: string;
  topic?: string;
};
export type PortalMcTest = {
  id: string;
  title: string;
  subject: string;
  subjectId: string;
  course?: number | null;
  semester?: number | null;
  topic?: string;
  questions: PortalMcQuestion[];
};
export type PortalMcIndexEntry = { id: string; title: string; subject: string; subjectId: string; topic: string; count: number };
export type PortalMcIndex = { tests: PortalMcIndexEntry[] };

export type LegacyPortalConfig = {
  /** Подпись вкладки на странице предмета. */
  tabLabel: string;
  hoba?: boolean;
  parasitology?: boolean;
  /** Химия-шпаргалка sdf: тесты с пояснениями, билеты, шпаргалка. */
  sdf?: boolean;
  /** Архивные HTML-лекции course/: "bio" | "math" | "chem". */
  lectures?: "bio" | "math" | "chem";
  /** subjectId легаси MC-тестов, которые относятся к этому предмету. */
  mcSubjectIds?: string[];
};

/** Какие предметы получают вкладку легаси-портала. */
export const LEGACY_PORTALS: Record<string, LegacyPortalConfig> = {
  inorganic_chemistry: { tabLabel: "Коллоквиум", hoba: true, sdf: true },
  // Канонический slug предмета в каталоге: химия живёт внутри предмета.
  chemistry_organic_physical: { tabLabel: "Химия", sdf: true, lectures: "chem", mcSubjectIds: ["chemistry"] },
  biology: { tabLabel: "Портал", parasitology: true, lectures: "bio", mcSubjectIds: ["biology"] },
  organic_chemistry: { tabLabel: "Тренажёры", lectures: "chem", mcSubjectIds: ["chemistry"] },
  physics: { tabLabel: "Тренажёры", mcSubjectIds: ["physics"] },
  math: { tabLabel: "Тренажёры", lectures: "math", mcSubjectIds: ["math"] },
  history: { tabLabel: "Тренажёры", mcSubjectIds: ["history"] },
  // У этих предметов вкладку создаёт только блок внешних платформ.
  physiology: { tabLabel: "Портал" },
  histology: { tabLabel: "Портал" },
  first_aid: { tabLabel: "Портал" },
};

export function legacyPortalConfig(slug?: string | null): LegacyPortalConfig | null {
  return (slug && LEGACY_PORTALS[slug]) || null;
}

const cache = new Map<string, unknown>();

async function getJson<T>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached) return cached as T;
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Не удалось загрузить материал (${response.status})`);
  const data = (await response.json()) as T;
  cache.set(url, data);
  return data;
}

export function loadHobaTheory() {
  return getJson<PortalHobaTheory>("/content/portals/hoba-theory.json");
}
export function loadHobaPractical() {
  return getJson<PortalHobaPractical>("/content/portals/hoba-practical.json");
}
export function loadHobaTasks() {
  return getJson<PortalHobaTasks>("/content/portals/hoba-tasks.json");
}
export function loadParasitologyBank() {
  return getJson<PortalMatchingBank>("/content/portals/parasitology-tests.json");
}
export function loadMcIndex() {
  return getJson<PortalMcIndex>("/content/portals/mc-index.json");
}
export function loadMcTest(id: string) {
  return getJson<PortalMcTest>(`/content/portals/mc-${id}.json`);
}

/** Архивные билетные банки (questions_by_subject), канонический slug предмета. */
export type PortalTicketItem = {
  id: string;
  text: string;
  answer?: string;
  type?: string;
  topic?: string;
  subject?: string;
  options?: string[];
};
export type PortalTicketBank = { subject_slug: string; subject: string; count: number; items: PortalTicketItem[] };
export type PortalTicketBankIndex = { banks: { subject_slug: string; subject: string; count: number }[] };

export async function loadTicketBank(slug?: string | null): Promise<PortalTicketBank | null> {
  if (!slug) return null;
  try {
    return await getJson<PortalTicketBank>(`/content/portals/ticket-banks/${slug}.json`);
  } catch {
    return null;
  }
}
export async function loadTicketBankIndex(): Promise<PortalTicketBankIndex> {
  try {
    return await getJson<PortalTicketBankIndex>("/content/portals/ticket-banks/index.json");
  } catch {
    return { banks: [] };
  }
}

/** Химия-шпаргалка (sdf): шпаргалка, тесты с пояснениями, билеты. */
export type PortalSdfQuestion = { id: string; text: string; options: string[]; correct: number; explanation: string };
export type PortalSdfTest = { id: string; title: string; questions: PortalSdfQuestion[] };
export type PortalSdfTicket = { id: string; title: string; items: { q: string; solution: string }[] };
export type PortalSdf = {
  subject: string;
  tests: PortalSdfTest[];
  tickets: PortalSdfTicket[];
  cheatHtml: string;
  stats: { tests: number; questions: number; tickets: number; cheatSections: number };
};
export function loadChemSdf() {
  return getJson<PortalSdf>("/content/portals/chem-sdf.json");
}

/** Архивные HTML-лекции course/. */
export type PortalLectureSet = { subject: string; items: { id: string; title: string; html: string }[] };
export function loadLectureSet(setId: "bio" | "math" | "chem") {
  return getJson<PortalLectureSet>(`/content/portals/lectures-${setId}.json`);
}

/** Латинский язык: 100 рецептов (по Чернявскому). */
export type PortalLatinRecipe = { num: number; group: string; isNew: boolean; lines: string[] };
export type PortalLatinRecipes = { subject: string; groups: { id: string; label: string }[]; recipes: PortalLatinRecipe[] };
export function loadLatinRecipes() {
  return getJson<PortalLatinRecipes>("/content/portals/latin-recipes.json");
}
