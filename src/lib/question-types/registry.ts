/**
 * Реестр типов вопросов MEDBIOHIM (единый источник подписей и правил проверки).
 *
 * Источники, которые реестр согласует:
 *  - серверный канон `integrations/cloudflare-api/src/question-format.js`
 *    (наборы OPEN_TYPES / CLOSED_TYPES и их легаси-написания);
 *  - единая образовательная модель `src/lib/learning/types.ts` (ActivityType);
 *  - фактические подписи интерфейса (бейджи банка вопросов).
 *
 * Реестр не разбирает `answer` и не угадывает правильность по свободному
 * тексту: это делает сервер. Здесь только типы, подписи и политика проверки.
 */
import type { QuestionTypeDescriptor, QuestionTypeId } from "./types";

export const QUESTION_TYPES: readonly QuestionTypeDescriptor[] = [
  {
    id: "single_choice",
    label: "Один верный ответ",
    shortLabel: "Тест",
    kind: "closed",
    grading: "closed",
    aliases: ["mcq", "mc", "single", "single_choice", "single-choice", "closed", "choice", "test", "quiz"],
    inActivityModel: true,
  },
  {
    id: "multiple_choice",
    label: "Несколько верных ответов",
    shortLabel: "Несколько ответов",
    kind: "closed",
    grading: "closed",
    aliases: ["multiple", "multi", "multi_choice", "multi-choice", "multiple_choice", "multiple-choice"],
    inActivityModel: true,
  },
  {
    id: "true_false",
    label: "Верно / неверно",
    shortLabel: "Верно/неверно",
    kind: "closed",
    grading: "closed",
    aliases: ["true_false", "truefalse", "true-false", "tf", "boolean"],
    inActivityModel: true,
  },
  {
    id: "numeric",
    label: "Численный ответ",
    shortLabel: "Численный",
    kind: "closed",
    grading: "closed",
    aliases: ["numeric", "number"],
    inActivityModel: true,
  },
  {
    id: "short_text",
    label: "Короткий ответ",
    shortLabel: "Открытый",
    kind: "open",
    grading: "open",
    aliases: ["short_text", "short_answer", "short-answer", "short-text"],
    inActivityModel: true,
  },
  {
    id: "formula",
    label: "Формула",
    shortLabel: "Формула",
    kind: "open",
    grading: "open",
    aliases: ["formula"],
    inActivityModel: true,
  },
  {
    id: "ordering",
    label: "Последовательность",
    shortLabel: "Последовательность",
    kind: "closed",
    grading: "closed",
    aliases: ["ordering", "sequence"],
    inActivityModel: true,
  },
  {
    id: "matching",
    label: "Сопоставление",
    shortLabel: "Соответствие",
    kind: "closed",
    grading: "closed",
    aliases: ["matching", "match"],
    inActivityModel: true,
  },
  {
    id: "open_text",
    label: "Развёрнутый ответ",
    shortLabel: "Открытый",
    kind: "open",
    grading: "open",
    aliases: ["open", "text", "theory", "problem", "practical", "case", "preparation", "ticket", "essay", "task", "main"],
    inActivityModel: false,
    notes: "В ActivityType отдельного open_text нет; проверка идёт по нормализованному тексту или по критериям.",
  },
  {
    id: "image_hotspot",
    label: "Работа с изображением",
    shortLabel: "Изображение",
    kind: "closed",
    grading: "none",
    aliases: ["image_hotspot", "image-hotspot", "hotspot"],
    inActivityModel: true,
    notes: "Детерминированной проверки в общем слое пока нет: hotspots проверяются в модуле тренажёров.",
  },
  {
    id: "clinical_case",
    label: "Клиническая задача",
    shortLabel: "Клинический случай",
    kind: "open",
    grading: "none",
    aliases: ["clinical_case", "clinical-case"],
    inActivityModel: true,
    notes: "Проверяется преподавателем или AI-разбором, не этим слоем.",
  },
  {
    id: "structure_formula",
    label: "Структурная формула",
    shortLabel: "Структура",
    kind: "open",
    grading: "none",
    aliases: ["structure_formula", "structure-formula"],
    inActivityModel: true,
    notes: "Химический контур проверяет отдельно (см. src/lib/chemistry).",
  },
  {
    id: "lab_experiment",
    label: "Лабораторный эксперимент",
    shortLabel: "Лаборатория",
    kind: "closed",
    grading: "none",
    aliases: ["lab_experiment", "lab-experiment"],
    inActivityModel: true,
    notes: "Проверка живёт в схеме labs (чекпоинты), а не в общем слое вопросов.",
  },
];

/** Легаси-подписи интерфейса, которые нельзя потерять при переходе на реестр. */
const ALIAS_SHORT_OVERRIDES: Readonly<Record<string, string>> = {
  task: "Задача",
  theory: "Теория",
  practical: "Практика",
  main: "Основной",
  ticket: "Билетный",
};

export function normalizeTypeKey(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

const BY_ALIAS = new Map<string, QuestionTypeDescriptor>();
for (const descriptor of QUESTION_TYPES) {
  for (const alias of [descriptor.id, ...descriptor.aliases]) {
    BY_ALIAS.set(normalizeTypeKey(alias), descriptor);
  }
}

export function resolveQuestionType(raw: unknown): QuestionTypeDescriptor | undefined {
  const key = normalizeTypeKey(raw);
  if (!key) return undefined;
  return BY_ALIAS.get(key);
}

/**
 * Короткая подпись для бейджа. Совместима с прежней функцией банка вопросов:
 * неизвестный тип показывается как есть в верхнем регистре.
 */
export function questionTypeLabel(raw: unknown): string {
  const key = normalizeTypeKey(raw);
  if (!key) return "";
  const override = ALIAS_SHORT_OVERRIDES[key];
  if (override) return override;
  const descriptor = BY_ALIAS.get(key);
  if (descriptor) return descriptor.shortLabel;
  return String(raw).trim().toUpperCase();
}

/** Полное название типа для настроек и редактора. */
export function questionTypeLabelFull(raw: unknown): string {
  const descriptor = resolveQuestionType(raw);
  if (descriptor) return descriptor.label;
  const key = normalizeTypeKey(raw);
  return key ? String(raw).trim() : "";
}

export function isKnownQuestionType(raw: unknown): boolean {
  return Boolean(resolveQuestionType(raw));
}

export const QUESTION_TYPE_IDS: readonly QuestionTypeId[] = QUESTION_TYPES.map((descriptor) => descriptor.id);
