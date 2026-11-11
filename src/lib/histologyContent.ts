/** Static histology test content, generated from the department test collections
 *  by tools/histology/build_content.py into public/content/histology.
 *  Формат совпадает с физиологией — типы переиспользованы. */

import type {
  PhysiologyBank,
  PhysiologyIndex,
  PhysiologyManual,
  PhysiologyManualSummary,
  PhysiologyQuestion,
  PhysiologyTestGroup,
} from "./physiologyContent";

export type HistologyQuestion = PhysiologyQuestion;
export type HistologyTestGroup = PhysiologyTestGroup;
export type HistologyBank = PhysiologyBank;
export type HistologyManual = PhysiologyManual;
export type HistologyManualSummary = PhysiologyManualSummary;
export type HistologyIndex = PhysiologyIndex;

const cache = new Map<string, HistologyManual>();

async function getJson<T>(url: string): Promise<T> {
  // no-cache: контент обновляется вместе с деплоем, но браузер не должен
  // годами держать старую копию JSON. Ревалидация дешёвая (304).
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Не удалось загрузить материал (${response.status})`);
  return (await response.json()) as T;
}

export async function loadHistologyIndex(): Promise<HistologyIndex> {
  return getJson<HistologyIndex>("/content/histology/index.json");
}

export async function loadHistologyManual(slug: string): Promise<HistologyManual> {
  const cached = cache.get(slug);
  if (cached) return cached;
  const manual = await getJson<HistologyManual>(`/content/histology/${slug}.json`);
  cache.set(slug, manual);
  return manual;
}

export { answersAsSet, isCorrect, groupHasAnswers } from "./physiologyContent";
