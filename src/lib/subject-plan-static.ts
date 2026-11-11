/**
 * Статические календарно-тематические планы кафедр (файлы в public/content).
 * Раньше карта сидела в src/app/subjects/[id]/page.tsx — вынесена в lib,
 * чтобы и страница предмета, и общий план /academic использовали один источник.
 */
export const SUBJECT_STATIC_PLANS: Record<string, string> = {
  organic_chemistry: "chem/plan-organic-2025-2026.json",
  optics: "chem/plan-optics-2025-2026.json",
  probability: "chem/plan-probability-2025-2026.json",
  informatics: "chem/plan-informatics-2025-2026.json",
  histology: "histology/plan-semester3-2026-2027.json",
  physiology: "physiology/plan-semester3-2026-2027.json",
};

/** Загружает JSON плана кафедры из public/content (отмена через AbortSignal). */
export async function fetchStaticPlan(file: string, signal?: AbortSignal): Promise<unknown> {
  // no-cache = условная проверка: без изменений браузер получает 304, а после
  // правки плана студент видит новый файл сразу, а не старую копию из кеша.
  const res = await fetch(`/content/${file}`, { cache: "no-cache", signal });
  if (!res.ok) throw new Error(`План кафедры недоступен (${res.status})`);
  return res.json();
}
