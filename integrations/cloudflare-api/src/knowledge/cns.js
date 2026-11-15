// Корпус знаний «Подготовка к ЦНС» для RAG тьютора.
//
// Записи генерируются tools/physiology/build_cns_knowledge.mjs из md-файлов
// подготовки к коллоквиуму (шпаргалка, конспекты, задачи, банк тестов) и
// лежат рядом в cns-knowledge.json. Корпус подмешивается только в RAG-контекст
// тьютора (buildLectureContext, subject_slug === "physiology") и не попадает
// в таблицу лекций — студенты не увидят его на /lectures.

import bundle from "./cns-knowledge.json";

/**
 * Записи корпуса в форме, совместимой с LectureDoc из workers/api
 * (lib/lecture-rag.ts): тот же набор полей, что у строк histology_lectures.
 * subjectSlug фиксирован — корпус относится к физиологии ЦНС.
 */
export function getCnsKnowledgeEntries() {
  return bundle.entries.map((entry) => ({
    id: String(entry.id || ""),
    title: String(entry.title || ""),
    body: String(entry.body || ""),
    subjectSlug: "physiology",
  }));
}

/** Темы корпуса для UI (экран приветствия тьютора, панель «Подготовка ЦНС»). */
export function getCnsKnowledgeIndex() {
  return {
    topic: String(bundle.topic || ""),
    subjectSlug: String(bundle.subject_slug || "physiology"),
    generatedAt: String(bundle.generated_at || ""),
    entryCount: bundle.entries.length,
  };
}
