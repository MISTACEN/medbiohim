/**
 * Единая образовательная модель MEDBIOHIM.
 *
 * Предмет → раздел (module) → тема (topic) → материал → активность →
 * проверка → повторение → экзамен. Модель намеренно повторяет реальные
 * таблицы Supabase (`modules`, `topics`, `materials`, `questions`,
 * `srs_cards`, `progress_ledger`), чтобы не появлялось параллельных
 * сущностей: адаптер предмета только описывает, что дисциплина умеет,
 * а данные остаются в общей схеме.
 */

/** Трёхуровневая пирамида знаний (раздел 6 задания). */
export type KnowledgeLevel = 1 | 2 | 3;

export const KNOWLEDGE_LEVELS: Record<
  KnowledgeLevel,
  { slug: "base" | "understanding" | "application"; title: string; description: string }
> = {
  1: {
    slug: "base",
    title: "База",
    description: "Термины, определения, классификации, нормы, формулы, латинские названия, структуры.",
  },
  2: {
    slug: "understanding",
    title: "Понимание",
    description: "Механизмы, причинно-следственные связи, пути процессов, алгоритмы решения.",
  },
  3: {
    slug: "application",
    title: "Применение",
    description: "Клинические ситуации, комплексные задачи, микропрепараты, многоэтапные расчёты.",
  },
};

export function isKnowledgeLevel(value: unknown): value is KnowledgeLevel {
  return value === 1 || value === 2 || value === 3;
}

/**
 * Достоверность материала (раздел 19 задания). Отделяет научный факт от
 * учебной модели и непроверенной заметки — интерфейс обязан показывать
 * эту разницу, а не выдавать одно за другое.
 */
export type SourceKind =
  | "scientific_fact"
  | "teaching_model"
  | "simplified_simulation"
  | "assumption"
  | "unverified";

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  scientific_fact: "Научный факт",
  teaching_model: "Учебная модель",
  simplified_simulation: "Упрощённая симуляция",
  assumption: "Предположение",
  unverified: "Непроверенный материал",
};

export type SourceAttribution = {
  title: string;
  author?: string;
  organization?: string;
  year?: number;
  url?: string;
  kind: SourceKind;
  /** Чем модель ограничена — обязательное поле для симуляций. */
  limitations: string[];
};

/** Что дисциплина реально поддерживает в интерфейсе. */
export type SubjectCapability =
  | "lectures"
  | "tests"
  | "tickets"
  | "cards"
  | "progress"
  | "simulations"
  | "atlas"
  | "library"
  | "clinical_cases"
  | "labs"
  | "chem_reference"
  | "molecule_editor"
  | "reactions";

/**
 * Предметный адаптер. Общий движок читает возможности и не заводит
 * отдельный независимый плеер для каждой дисциплины (раздел 5 задания).
 */
export type SubjectAdapter = {
  slug: string;
  name: string;
  /** Исторические/альтернативные написания slug в базе. */
  aliases: string[];
  levels: KnowledgeLevel[];
  capabilities: SubjectCapability[];
  /** Slug симуляций из общего каталога. */
  simulations: string[];
  notes?: string;
};

/** Тип активности — общий для тестов, задач и лабораторий (раздел 14). */
export type ActivityType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "numeric"
  | "short_text"
  | "formula"
  | "matching"
  | "ordering"
  | "image_hotspot"
  | "clinical_case"
  | "structure_formula"
  | "lab_experiment";

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  single_choice: "Один верный ответ",
  multiple_choice: "Несколько верных ответов",
  true_false: "Верно / неверно",
  numeric: "Численный ответ",
  short_text: "Короткий ответ",
  formula: "Формула",
  matching: "Сопоставление",
  ordering: "Последовательность",
  image_hotspot: "Работа с изображением",
  clinical_case: "Клиническая задача",
  structure_formula: "Структурная формула",
  lab_experiment: "Лабораторный эксперимент",
};

/** Прогресс по одному узлу контента — проекция `progress_ledger`. */
export type ProgressState = "not_started" | "in_progress" | "completed" | "needs_review";

export type ProgressEntry = {
  objectType: "topic" | "material" | "activity" | "simulation" | "ticket" | "test";
  objectId: string;
  state: ProgressState;
  /** 0–100, как `progress_ledger.percent`. */
  percent: number;
  attempts: number;
  lastActivityAt: string | null;
};

/** Узел дерева обучения для навигации по предмету. */
export type LearningNode = {
  id: string;
  kind: "module" | "topic" | "material" | "activity";
  title: string;
  level: KnowledgeLevel | null;
  children: LearningNode[];
};
