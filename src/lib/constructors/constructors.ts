/**
 * Пользовательские конструкторы учебных материалов (раздел 15 задания).
 *
 * Создание не зависит от AI: пользователь сам заполняет структуру.
 * Поддержка: карточки (База пирамиды знаний), чек-лист (Алгоритм),
 * таблица, пошаговая последовательность. Черновики в localStorage,
 * предпросмотр и экспорт/импорт JSON. Связь с предметом — через
 * канонические области learning-системы; отдельная админ-панель не трогается.
 */

export type ConstructorKind = "cards" | "checklist" | "table" | "steps";

export const CONSTRUCTOR_KIND_LABELS: Record<ConstructorKind, string> = {
  cards: "Флеш-карточки (База)",
  checklist: "Чек-лист (Алгоритм)",
  table: "Таблица",
  steps: "Пошаговый разбор",
};

/** Единый тип блока с пирамидой знаний (base/algo/deep как в лекциях). */
export type PyramidBlock = "base" | "algo" | "deep" | null;

export interface ConstructorDraft {
  id: string;
  kind: ConstructorKind;
  title: string;
  /** Каноническая область предмета (см. learning/modules.ts). */
  subjectArea: string | null;
  topic: string;
  block: PyramidBlock;
  /** Контент, зависит от kind. */
  data: ConstructorData;
  createdAt: string;
  updatedAt: string;
}

export type ConstructorData =
  | { kind: "cards"; items: Array<{ term: string; definition: string }> }
  | { kind: "checklist"; items: Array<{ text: string; done?: boolean }> }
  | { kind: "table"; columns: string[]; rows: string[][] }
  | { kind: "steps"; items: Array<{ title: string; description: string }> };

export function emptyDraft(kind: ConstructorKind): ConstructorDraft {
  const now = new Date().toISOString();
  return {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: "",
    subjectArea: null,
    topic: "",
    block: kind === "cards" ? "base" : kind === "checklist" || kind === "steps" ? "algo" : null,
    data:
      kind === "cards"
        ? { kind: "cards", items: [{ term: "", definition: "" }] }
        : kind === "checklist"
          ? { kind: "checklist", items: [{ text: "" }] }
          : kind === "table"
            ? { kind: "table", columns: ["Параметр", "Значение"], rows: [["", ""]] }
            : { kind: "steps", items: [{ title: "", description: "" }] },
    createdAt: now,
    updatedAt: now,
  };
}

/** Валидация: честно возвращает список проблем, не выбрасывает исключение. */
export function validateDraft(draft: ConstructorDraft): string[] {
  const problems: string[] = [];
  if (!draft.title.trim()) problems.push("Укажите название материала.");
  switch (draft.data.kind) {
    case "cards":
      if (!draft.data.items.some((i) => i.term.trim() && i.definition.trim()))
        problems.push("Заполните хотя бы одну карточку (термин и определение).");
      break;
    case "checklist":
      if (!draft.data.items.some((i) => i.text.trim())) problems.push("Добавьте хотя бы один пункт чек-листа.");
      break;
    case "table":
      if (draft.data.columns.some((c) => !c.trim())) problems.push("Заполните названия столбцов.");
      if (draft.data.rows.every((r) => r.every((c) => !c.trim()))) problems.push("Таблица пуста.");
      break;
    case "steps":
      if (!draft.data.items.some((i) => i.title.trim())) problems.push("Добавьте хотя бы один шаг.");
      break;
  }
  return problems;
}

export function exportDraft(draft: ConstructorDraft): string {
  return JSON.stringify({ format: "medbiohim-constructor", version: 1, draft }, null, 2);
}

export function importDraft(json: string): { draft?: ConstructorDraft; error?: string } {
  try {
    const parsed = JSON.parse(json) as { format?: string; version?: number; draft?: ConstructorDraft };
    if (parsed.format !== "medbiohim-constructor" || !parsed.draft) {
      return { error: "Файл не является материалом конструктора MEDBIOHIM." };
    }
    const draft = parsed.draft;
    if (!draft.id || !draft.kind || !CONSTRUCTOR_KIND_LABELS[draft.kind]) {
      return { error: "Неизвестный тип материала." };
    }
    if (!draft.data || draft.data.kind !== draft.kind) return { error: "Несовпадение типа и содержимого." };
    return { draft };
  } catch {
    return { error: "Некорректный JSON." };
  }
}

const STORAGE_KEY = "mb_constructors_v1";

export function listDrafts(): ConstructorDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ConstructorDraft[]) : [];
  } catch {
    return [];
  }
}

export function saveDraft(draft: ConstructorDraft): void {
  if (typeof window === "undefined") return;
  try {
    const drafts = listDrafts().filter((d) => d.id !== draft.id);
    drafts.unshift({ ...draft, updatedAt: new Date().toISOString() });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // приватный режим — черновики не критичны
  }
}

export function deleteDraft(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(listDrafts().filter((d) => d.id !== id)));
  } catch {
    // игнорируем
  }
}
