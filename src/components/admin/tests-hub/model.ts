import type { AdminDbRow } from "@/lib/api";

/**
 * Общая модель страниц admin/tests-hub: банк вопросов и сборщик тестов,
 * редактор вопросов тестов, импорт теста из документа, предметы и группы.
 */

// --- Сборщик тестов (admin/tests) ---

export type BuildQuestion = AdminDbRow & {
  id: string | number;
  text?: string;
  body?: string;
  question?: string;
  type?: string;
  difficulty?: number;
  subject_id?: string | null;
  module_id?: string | null;
  topic_id?: string | null;
  is_published?: boolean;
  archived_at?: string | null;
};

export function questionText(item: BuildQuestion) {
  return String(item.text ?? item.body ?? item.question ?? "Вопрос без текста");
}

// --- Редактор вопросов тестов (admin/test-questions) ---

export type QuestionOption = { label: string; correct: boolean };

export type QuestionDraft = {
  id: string;
  text: string;
  type: string;
  answer: string;
  options: QuestionOption[];
  difficulty: string;
  is_published: boolean;
  subject_id: string;
  module_id: string;
  topic_id: string;
};

export const QUESTION_TYPES: Array<[string, string]> = [
  ["mcq", "Один вариант (mcq)"],
  ["multiple", "Несколько вариантов (multiple)"],
  ["open", "Открытый ответ"],
  ["short", "Короткий ответ"],
  ["number", "Число"],
  ["ordering", "Установить порядок"],
];

export const CLOSED_TYPES = new Set(["mcq", "multiple", "ordering"]);
export const CORRECT_TYPES = new Set(["mcq", "multiple"]);

/** Row.options может быть массивом {label, correct} или старым массивом строк. */
export function toEditableOptions(raw: unknown): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === "string"
      ? { label: item, correct: false }
      : { label: String(item?.label ?? ""), correct: item?.correct === true },
  );
}

export function toDraft(row: AdminDbRow): QuestionDraft {
  return {
    id: String(row.id),
    text: String(row.text ?? ""),
    type: String(row.type || "mcq"),
    answer: String(row.answer ?? ""),
    options: toEditableOptions(row.options),
    difficulty: row.difficulty == null ? "" : String(row.difficulty),
    is_published: row.is_published !== false,
    subject_id: String(row.subject_id ?? ""),
    module_id: String(row.module_id ?? ""),
    topic_id: String(row.topic_id ?? ""),
  };
}

export function draftToPayload(draft: QuestionDraft): Record<string, unknown> {
  const closed = CLOSED_TYPES.has(draft.type);
  return {
    text: draft.text,
    type: draft.type,
    answer: draft.answer,
    options: closed
      ? draft.options.map((option) => ({ label: option.label.trim(), correct: option.correct }))
      : [],
    is_published: draft.is_published,
    subject_id: draft.subject_id || null,
    module_id: draft.module_id || null,
    topic_id: draft.topic_id || null,
    ...(draft.difficulty === "" ? {} : { difficulty: Number(draft.difficulty) }),
  };
}

// --- Импорт теста из документа (admin/test-import) ---

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100";
export const labelClass = "mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400";

// --- Предметы и группы (admin/academic) ---

export type Subject = { id: string; name?: string; course_number?: number; semester?: number; is_active?: boolean };
export type Group = { id: string; name?: string; code?: string; course_number?: number; is_active?: boolean; member_count?: number };
export type Member = { user_id: string; name?: string; email?: string; course_number?: number; semester?: number };

export function isActive(row: { is_active?: boolean }) {
  return row.is_active !== false;
}
