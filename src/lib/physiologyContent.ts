/** Static physiology practice content, generated from the department manuals
 *  by tools/physiology/build_content.py into public/content/physiology. */

export type PhysiologyQuestion = {
  number: number;
  text: string;
  options: string[];
  answer: string;
};

export type PhysiologyTestGroup = {
  title: string;
  questions: PhysiologyQuestion[];
};

export type PhysiologyPractical = {
  number: number;
  title: string;
  body: string[];
};

export type PhysiologyLesson = {
  number: number;
  id: string;
  title: string;
  actuality: string;
  goals: string;
  questions: string[];
  tasks: string[];
  practical: PhysiologyPractical[];
  situational: string[];
  essays: string[];
  notes: string[];
  tests: PhysiologyTestGroup[];
};

export type PhysiologyBank = {
  title: string;
  questions: PhysiologyQuestion[];
};

export type PhysiologyManual = {
  slug: string;
  title: string;
  subtitle: string;
  semester: number;
  year: number;
  hours: number;
  source: { file: string; url: string; title: string };
  sections: { number: number; title: string; lesson_ids: string[] }[];
  lessons: PhysiologyLesson[];
  banks: PhysiologyBank[];
  stats: { lessons: number; groups: number; questions: number; answered: number };
};

export type PhysiologyManualSummary = {
  slug: string;
  title: string;
  subtitle: string;
  semester: number;
  hours: number;
  file: string;
  source_url: string;
};

export type PhysiologyIndex = {
  subject: string;
  manuals: PhysiologyManualSummary[];
  reference: { title: string; author: string; url: string };
};

const cache = new Map<string, PhysiologyManual>();

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Не удалось загрузить материал (${response.status})`);
  return (await response.json()) as T;
}

export async function loadPhysiologyIndex(): Promise<PhysiologyIndex> {
  return getJson<PhysiologyIndex>("/content/physiology/index.json");
}

export async function loadPhysiologyManual(slug: string): Promise<PhysiologyManual> {
  const cached = cache.get(slug);
  if (cached) return cached;
  const manual = await getJson<PhysiologyManual>(`/content/physiology/${slug}.json`);
  cache.set(slug, manual);
  return manual;
}

export function answersAsSet(answer: string): number[] {
  return answer
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
}

export function isCorrect(picks: number[], answer: string): boolean {
  const expected = answersAsSet(answer);
  const chosen = [...picks].sort((a, b) => a - b);
  return expected.length > 0 && expected.length === chosen.length && expected.every((value, index) => value === chosen[index]);
}

export function groupHasAnswers(group: PhysiologyTestGroup): boolean {
  return group.questions.some((question) => question.answer);
}
