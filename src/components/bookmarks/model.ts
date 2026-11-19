/** Закладки: типы записей, подписи типов и форматирование дат. */

export type BookmarkItem = {
  target_type: string;
  target_id: string;
  created_at: string;
  title: string | null;
  href: string | null;
  missing?: boolean;
};

export type NoteItem = BookmarkItem & { id: string; text: string; updated_at: string };

export const TYPE_LABEL: Record<string, string> = {
  question: "Вопрос",
  material: "Материал",
  topic: "Тема",
  test: "Тест",
  subject: "Предмет",
  module: "Модуль",
  lecture: "Лекция",
  ticket: "Билет",
};

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
