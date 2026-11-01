/** Реестр тем «Подготовка к самостоятельной + режим экзамена».
 *
 *  Лекция подключает блоки фенсами ```selfwork / ```exam с id лекции; реестр
 *  по этому id отдаёт контент. Пока тема одна (эмбриология) — остальные лекции
 *  просто не показывают блок, поэтому реестр возвращает null.
 */

import { EMBRYOLOGY_SELF_WORK } from "./embryologySelfWork";
import type { SelfWorkTopic } from "./selfWorkTypes";

const TOPICS: SelfWorkTopic[] = [EMBRYOLOGY_SELF_WORK];

/** Контент темы для конкретной лекции или null, если темы ещё нет. */
export function selfWorkTopicForLecture(lectureId?: string | null): SelfWorkTopic | null {
  const id = String(lectureId ?? "").trim();
  if (!id) return null;
  return TOPICS.find((topic) => topic.lectureId === id) ?? null;
}

export function listSelfWorkTopics(): SelfWorkTopic[] {
  return TOPICS;
}
