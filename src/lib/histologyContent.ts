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

import { fetchContentJson as getJson } from "./content-json";

export type HistologyQuestion = PhysiologyQuestion;
export type HistologyTestGroup = PhysiologyTestGroup;
export type HistologyBank = PhysiologyBank;
export type HistologyManual = PhysiologyManual;
export type HistologyManualSummary = PhysiologyManualSummary;
export type HistologyIndex = PhysiologyIndex;

const cache = new Map<string, HistologyManual>();

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
