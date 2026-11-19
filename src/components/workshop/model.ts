/** Справочники и мелкие помощники мастерской (без React). */
export type Draft = { key: string; file: File; fileId?: string; error?: string };
export type Subject = { id: string; name: string };

export const KIND_LABEL: Record<string, string> = {
  photo_lecture: "Фотолекция",
  notes: "Конспект",
  test_questions: "Вопросы",
  pdf: "PDF-материал",
  other: "Материал",
};

export const STATUS_LABEL: Record<string, string> = {
  published: "Опубликован",
  pending: "На проверке",
  hidden: "Скрыт",
  rejected: "Отклонён",
  draft: "Черновик",
  deleted: "Удалён",
};

export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function sortKey(name: string) {
  return name.localeCompare(name, "ru", { numeric: true, sensitivity: "base" });
}
