/** Общие типы и хелперы страницы темы: сопоставление занятия, лекции и теста. */

export type LectureRow = {
  id: string;
  title?: string;
  topic?: string;
  summary?: string;
  body_markdown?: string | null;
  subject_slug?: string;
};

export type TestRow = { id: string; title?: string; subject_slug?: string; topic_id?: string | null };

export const _CHEM_SLUGS = new Set(["organic_chemistry", "chemistry_organic_physical"]);

const STOP_WORDS = new Set([
  "общая", "общие", "характеристика", "свойства", "строение", "получение", "классификация",
  "реакционная", "способность", "занятие", "занятия", "работа", "контрольная", "тема", "темы",
]);

/** Значимые слова названия: по ним сопоставляем занятие, лекцию и тест. */
export function keywords(title: string): string[] {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, " ")
    .split(/\s+/)
    .map((word) => word.replace(/(ами|ями|ов|ев|ый|ий|ая|ое|ые|ой|ах|ях|и|ы|а|е|у|о)$/u, ""))
    .filter((word) => word.length >= 5 && !STOP_WORDS.has(word));
}

export function overlapScore(a: string, b: string): number {
  const setB = new Set(keywords(b));
  return keywords(a).reduce((score, word) => (setB.has(word) ? score + 1 : score), 0);
}

/** «занятие 08» из поля topic лекции. */
export function lessonNumberFromTopic(topic?: string): number | null {
  // [а-яё]* — \w в JS не покрывает кириллицу, без этого «занятие 11» не находилось.
  const m = /занят[а-яё]*\s+(\d{1,2})/i.exec(String(topic || ""));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function textSnippet(body: string | null | undefined, query: string): string | null {
  const plain = String(body || "").replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`]/g, " ").replace(/\s+/g, " ").trim();
  if (!plain || !query) return null;
  const index = plain.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return null;
  const from = Math.max(0, index - 70);
  return `${from > 0 ? "…" : ""}${plain.slice(from, index + query.length + 90)}…`;
}
