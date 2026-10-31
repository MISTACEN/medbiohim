/**
 * Быстрые фиксы: единый список безопасно редактируемых полей и построение
 * предпросмотра «что изменится». Применение и откат живут в routes/staff.ts.
 */

export type FixTarget = "questions" | "tests" | "materials" | "topics" | "workshop_items";

export const FIX_FIELDS: Record<FixTarget, string[]> = {
  questions: ["text", "answer", "options", "topic_id", "module_id", "subject_id", "difficulty", "is_published"],
  tests: ["title", "topic_id", "module_id", "subject_id", "time_limit_sec", "order_index", "is_published"],
  materials: ["title", "external_url", "topic_id", "module_id", "subject_id", "is_published"],
  topics: ["title", "archived_at"],
  workshop_items: ["title", "summary", "topic", "tags", "status"],
};

export const FIX_LABELS: Record<string, string> = {
  title: "Название",
  text: "Текст",
  answer: "Ответ",
  options: "Варианты",
  topic_id: "Тема",
  module_id: "Модуль",
  subject_id: "Предмет",
  difficulty: "Сложность",
  is_published: "Опубликовано",
  time_limit_sec: "Лимит времени",
  order_index: "Порядок",
  external_url: "Ссылка",
  archived_at: "Архив",
  summary: "Описание",
  topic: "Тема (текст)",
  tags: "Теги",
  status: "Статус",
};

export const FIX_TABLES: Record<FixTarget, string> = {
  questions: "questions",
  tests: "tests",
  materials: "materials",
  topics: "topics",
  workshop_items: "workshop_items",
};

export type FixChange = {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isFixTarget(value: unknown): value is FixTarget {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FIX_FIELDS, value);
}

/** Оставляет только разрешённые поля и отбрасывает неизменившиеся значения. */
export function pickChanges(target: FixTarget, current: Record<string, any>, patch: Record<string, any>): FixChange[] {
  const changes: FixChange[] = [];
  for (const field of FIX_FIELDS[target]) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) continue;
    const before = current?.[field] ?? null;
    const after = patch[field] ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({ field, label: FIX_LABELS[field] || field, before, after });
  }
  return changes;
}

/** Проверка типов полей, чтобы «предпросмотр» не обещал того, что БД отклонит. */
export function validateFixPatch(target: FixTarget, patch: Record<string, any>): string | null {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return "Патч должен быть объектом";
  for (const key of Object.keys(patch)) {
    if (!FIX_FIELDS[target].includes(key)) return `Поле ${key} нельзя править быстрым фиксом`;
  }
  for (const field of ["topic_id", "module_id", "subject_id"]) {
    if (field in patch && patch[field] != null && patch[field] !== "" && !isUuid(patch[field])) return `${FIX_LABELS[field]}: некорректный идентификатор`;
  }
  if ("is_published" in patch && typeof patch.is_published !== "boolean") return "is_published должен быть boolean";
  if ("time_limit_sec" in patch) {
    const value = Number(patch.time_limit_sec);
    if (!Number.isInteger(value) || value < 0 || value > 14400) return "Лимит времени — целое число 0…14400 секунд";
  }
  if ("order_index" in patch) {
    const value = Number(patch.order_index);
    if (!Number.isInteger(value) || value < 0 || value > 100000) return "Порядок — целое неотрицательное число";
  }
  if ("tags" in patch && !Array.isArray(patch.tags)) return "tags должен быть массивом";
  if ("status" in patch && !["draft", "pending", "published", "hidden", "rejected"].includes(String(patch.status))) return "Недопустимый статус";
  if ("title" in patch && (typeof patch.title !== "string" || !patch.title.trim() || patch.title.length > 300)) return "Название: 1…300 символов";
  if ("text" in patch && (typeof patch.text !== "string" || patch.text.length > 20000)) return "Текст: до 20000 символов";
  return null;
}

/** Короткое человекочитаемое значение для журнала и уведомлений. */
export function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 160);
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 160)}…` : text || "—";
}
