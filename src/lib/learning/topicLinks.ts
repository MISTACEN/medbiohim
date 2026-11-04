/**
 * Связь модулей с реальными темами программы.
 *
 * Реестр модулей описывает темы человеческими метками («Буферные системы»,
 * «Мембранный потенциал»), а в базе темы называются иначе и привязаны к
 * тестам через `tests.topic_id`. Здесь метки превращаются в конкретные
 * `topics.id` по явным ключевым словам — без нечёткого поиска и без
 * выдуманных связей: нет совпадения, нет и ссылки на тест.
 */

import type { LearningModule, SubjectAreaKey } from "./modules";

export type TopicRef = { id: string; title: string };

/** Ключевые слова по модулям: нормализованные подстроки названий тем. */
export const MODULE_TOPIC_KEYWORDS: Record<string, string[]> = {
  "chemistry.elements": ["строение атома", "периодическ", "химическая связь", "электроотрицательн"],
  "chemistry.workbench": ["номенклатур", "изомер", "стерео", "энантио", "механизм", "реакц"],
  "chemistry.solutions": ["раствор", "кислот", "основн", "буфер", "титрован", "концентрац"],
  "chemistry.lab": ["титрован", "физико химическ", "электрохим", "метод анализа", "фотометр"],
  "chemistry.practice": ["задач", "расчет", "расчёт"],
  "sim.enzyme-kinetics": ["фермент", "кинетик", "метабол"],
  "sim.buffer-titration": ["буфер", "кислотно основн", "титрован"],
  "sim.membrane-potential": ["потенциал", "биоэлектрич", "возбудим", "мембран"],
  "sim.osmosis": ["осмос", "осмоляр", "водно солев", "выделительн", "тонус"],
  "sim.oxygen-hemoglobin": ["транспорт газ", "гемоглобин", "дыхани"],
  "sim.hardy-weinberg": ["генетик", "популяц", "аллел", "наслед"],
  "atlas.histology": ["клетк", "ткани", "препарат", "эпител", "цитолог"],
  "trainers.histology": ["клетк", "ткани", "препарат", "эпител", "цитолог"],
  "labs.virtual": ["лаборатор", "практикум", "измерен"],
};

/** Сводные и итоговые темы не должны перетягивать ссылку на себя. */
const AGGREGATE_MARKERS = [
  "итогов",
  "сводн",
  "по разделам",
  "банк тестов",
  "тестовые задания",
  "дополнительные материалы",
  "вне текущего",
];

export function normalizeTopicTitle(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAggregateTopic(title: string): boolean {
  const normalized = normalizeTopicTitle(title);
  return AGGREGATE_MARKERS.some((marker) => normalized.includes(normalizeTopicTitle(marker)));
}

export type TopicMatch = { topic: TopicRef; score: number };

/**
 * Совпадения темы с модулем, лучшие первыми. Учитываются только темы,
 * которые действительно несут содержание модуля (одно ключевое слово),
 * а сводные/итоговые отбрасываются.
 */
export function matchTopics(
  module: LearningModule,
  areaKey: SubjectAreaKey | null | undefined,
  topics: TopicRef[],
): TopicMatch[] {
  if (!areaKey || !module.relations[areaKey]) return [];
  const keywords = MODULE_TOPIC_KEYWORDS[module.id];
  if (!keywords?.length || !topics.length) return [];

  const normalizedKeywords = keywords.map((keyword) => normalizeTopicTitle(keyword)).filter(Boolean);
  const matches: TopicMatch[] = [];

  for (const topic of topics) {
    if (!topic.id || !topic.title || isAggregateTopic(topic.title)) continue;
    const normalizedTitle = normalizeTopicTitle(topic.title);
    if (!normalizedTitle) continue;
    let score = 0;
    for (const keyword of normalizedKeywords) {
      if (normalizedTitle.includes(keyword)) score += keyword.length;
    }
    if (score > 0) matches.push({ topic, score });
  }

  return matches.sort((a, b) => b.score - a.score || a.topic.title.length - b.topic.title.length);
}

export function matchTopicForModule(
  module: LearningModule,
  areaKey: SubjectAreaKey | null | undefined,
  topics: TopicRef[],
): TopicRef | null {
  return matchTopics(module, areaKey, topics)[0]?.topic ?? null;
}

/** Ссылка на вкладку тестов предмета с фильтром по конкретной теме. */
export function topicTestHref(subjectId: string, topicId: string): string {
  const id = encodeURIComponent(String(subjectId ?? "").trim());
  return `/subjects/${id}?tab=tests&topic=${encodeURIComponent(String(topicId ?? "").trim())}`;
}
