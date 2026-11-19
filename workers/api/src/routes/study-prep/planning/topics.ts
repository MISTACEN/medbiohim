import { WEAK_PERCENT } from "./constants";
import type { PrepTopic } from "./types";

/** Почему шаг стоит в плане — правило по освоенности темы. */
export function masteryWhy(mastery: number): string {
  if (mastery <= 0) return "тема ещё не начата — начните с лекции и конспекта";
  if (mastery < 40) return `освоено ${mastery}% — база не сформирована, нужен разбор с начала`;
  if (mastery < WEAK_PERCENT) return `освоено ${mastery}% — знаний хватает на узнавание, не на ответ`;
  return `освоено ${mastery}% — короткое повторение перед событием`;
}

export function averageMastery(topics: PrepTopic[]): number {
  if (!topics.length) return 0;
  return Math.round(topics.reduce((sum, topic) => sum + topic.mastery_pct, 0) / topics.length);
}

export function studyHref(subjectSlug: string | null, tab: string): string {
  if (!subjectSlug) return "/study";
  return `/subjects/${encodeURIComponent(subjectSlug)}?tab=${tab}`;
}

/**
 * Готовность к аттестационным событиям — один батч на все события /academic/state.
 * Возвращает Map по id события; события без id и не аттестационные пропускаются.
 */
