/**
 * Общие типы, константы и чистые хелперы admin-панелей.
 * Без React: только типы, константы и функции без состояния.
 */

/* ---------------- Преподаватели (/admin/teachers) ---------------- */

export type TeachersGroupOption = { id: string; name: string | null; code: string | null; course_number: number | null };
export type TeachersTarget = "group" | "student";
export type TeachersRole = "teacher" | "curator" | "assistant";

/* ---------------- Доступы (/admin/access) ---------------- */

export type AccessScope = "user" | "group";
export type AccessUserOption = { id: string; name: string };
export type AccessGroupOption = { id: string; name: string | null; code: string | null };

/* ---------------- Модерация (/admin/moderation) ---------------- */

export type ModerationFixChange = { field: string; label: string; before: unknown; after: unknown };

export const MODERATION_TARGETS: Record<string, { label: string; fields: string[] }> = {
  tests: { label: "Тест", fields: ["title", "subject_id", "module_id", "topic_id", "time_limit_sec", "is_published"] },
  questions: { label: "Вопрос", fields: ["text", "answer", "subject_id", "module_id", "topic_id", "is_published"] },
  materials: { label: "Материал", fields: ["title", "external_url", "subject_id", "module_id", "topic_id", "is_published"] },
  topics: { label: "Тема", fields: ["title", "archived_at"] },
  workshop_items: { label: "Материал мастерской", fields: ["title", "summary", "topic", "tags", "status"] },
};

export const MODERATION_FIELD_LABEL: Record<string, string> = {
  title: "Название", text: "Текст", answer: "Ответ", subject_id: "ID предмета", module_id: "ID модуля",
  topic_id: "ID темы", time_limit_sec: "Лимит, сек", is_published: "Опубликовано", external_url: "Ссылка",
  archived_at: "В архиве", summary: "Описание", topic: "Тема", tags: "Теги", status: "Статус",
};

export const MODERATION_REQUEST_LABEL: Record<string, string> = {
  course_change: "Смена курса",
  admission_year_change: "Смена года поступления",
  material_publish: "Публикация для других групп",
  role_change: "Смена роли",
};

export function formatModerationValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatModerationDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ---------------- Аудит (/admin/audit) ---------------- */

export type AuditRow = {
  id: string;
  table_name: string;
  row_key?: { id?: string } | string | null;
  version_no?: number;
  source?: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  created_at?: string;
};

export type AuditDetail = {
  version: { table_name: string; row_id: string | null; version_no?: number; source?: string; created_at?: string };
  fields: string[];
  snapshot: Record<string, unknown>;
  current: Record<string, unknown> | null;
  row_missing: boolean;
  rollback_supported: boolean;
  truncated?: boolean;
};

export const AUDIT_TABLE_LABEL: Record<string, string> = {
  questions: "Вопрос",
  tests: "Тест",
  materials: "Материал",
};

export const AUDIT_SOURCE_LABEL: Record<string, string> = {
  admin_ui: "правка в админке",
  admin_archive: "архивирование",
  admin_move: "перемещение",
  admin_rollback: "откат",
};

export const AUDIT_PAGE_SIZE = 50;

export function auditRowId(row: AuditRow): string {
  const key = row.row_key;
  if (key && typeof key === "object") return String(key.id || "");
  if (typeof key === "string") {
    try {
      return String(JSON.parse(key)?.id || "");
    } catch {
      return "";
    }
  }
  return "";
}

export function auditFormatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "string") {
    const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 180 ? `${text.slice(0, 180)}…` : text || "—";
  }
  if (Array.isArray(value)) return value.length ? value.map((item) => auditFormatValue(item)).join(", ") : "[]";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 180);
  return String(value);
}

export function auditFormatTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/* ---------------- Telegram (/admin/telegram) ---------------- */

export type TelegramGroup = { id: string; name?: string; code?: string };
export type TelegramAiStatus = {
  provider?: string;
  cloudflareAi?: { configured?: boolean; model?: string };
  gigachat?: { configured?: boolean; transport?: string; model?: string };
  ingest?: { configured?: boolean; verifier?: string };
  webhook?: { configured?: boolean };
};
export type TelegramMessageRow = {
  id: string;
  telegram_chat_id: number;
  telegram_message_id: number;
  message_text?: string | null;
  caption?: string | null;
  telegram_date?: string | null;
  classification?: string | null;
  classification_confidence?: number | null;
  processing_status?: string | null;
  ai_reason?: string | null;
  ai_subject_hint?: string | null;
  ai_due_hint?: string | null;
  created_at?: string | null;
  telegram_homework_links?: Array<{ homework_id?: string | null; relation_type?: string | null }> | { homework_id?: string | null } | null;
};

export const TELEGRAM_CATEGORY_LABEL: Record<string, string> = {
  homework: "Задание",
  material_candidate: "Материал",
  schedule: "Расписание",
  other: "Другое",
};

export function telegramCategoryClass(category: string | null | undefined) {
  if (category === "homework") return "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)] border-[var(--status-ok-border)]";
  if (category === "material_candidate") return "bg-sky-50 text-sky-700 border-sky-200";
  if (category === "schedule") return "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export function telegramHomeworkId(message: TelegramMessageRow): string | null {
  const raw = message.telegram_homework_links;
  const links = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const link of links) if (link?.homework_id) return String(link.homework_id);
  return null;
}

export function telegramMessageText(message: TelegramMessageRow): string {
  return String(message.message_text || message.caption || "").replace(/\s+/g, " ").trim();
}

export function telegramShortDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

/* ---------------- Пользователи (/admin/users) ---------------- */

export type UsersAdminUser = {
  id: string;
  email?: string;
  full_name?: string;
  roles?: string[];
  group_id?: string | null;
  group_name?: string | null;
  group_code?: string | null;
  course_number?: number | null;
  semester?: number | null;
};
export type UsersGroup = { id: string; name?: string; code?: string; course_number?: number };

export const USERS_ROLES = ["student", "teacher", "moderator", "admin"] as const;
export const USERS_ROLE_LABEL: Record<string, string> = {
  student: "Студент",
  teacher: "Преподаватель",
  moderator: "Модератор",
  admin: "Администратор",
};
export const USERS_PAGE_SIZE = 50;

/* ---------------- Группы (/admin/groups) ---------------- */

export type GroupsGroupRow = {
  id: string; name?: string; code?: string; course_number?: number | null;
  admission_year?: number | null; stream?: string | null; semester?: number | null; is_active?: boolean;
};
export type GroupsMemberRow = {
  membership_id: string; user_id: string; name: string; email: string | null;
  role: string | null; course_number: number | null; course_source?: string; subgroup?: string | null;
};

/* ---------------- Объявления (/admin/announcements) ---------------- */

export const ANNOUNCEMENTS_SITE_FIELDS: Array<{ key: "title" | "subtitle" | "description" | "announcement_banner"; label: string }> = [
  { key: "title", label: "Заголовок сайта" },
  { key: "subtitle", label: "Подзаголовок" },
  { key: "description", label: "Описание" },
  { key: "announcement_banner", label: "Баннер объявления" },
];

export type AnnouncementsItem = { id: string; title?: string; body?: string; pinned?: boolean; created_at?: string };

/* ---------------- Контент-пакет (/admin/content-package) ---------------- */

export type ContentBundle = {
  package_id: string;
  version?: string;
  specialty_slug: string;
  subject_slug: string;
  stats?: Record<string, number>;
  trainer_cards: Array<Record<string, any>>;
  lectures?: Array<Record<string, any>>;
  sources: Array<Record<string, any>>;
  materials: Array<Record<string, any>>;
  tests: Array<Record<string, any>>;
};

export function contentEntryCandidates(path: string): string[] {
  const clean = path.replace(/^\/+/, "");
  const out = new Set<string>([clean]);
  if (!clean.startsWith("features/")) out.add("features/" + clean);
  if (clean.startsWith("5_Фотографии препаратов/")) out.add("features/histology-content/photos/" + clean);
  if (clean.startsWith("electronograms/images/")) out.add("features/histology-content/" + clean);
  if (clean.startsWith("photos/")) out.add("features/histology-content/" + clean);
  return [...out];
}

/* ---------------- Мастерская (/admin/workshop) ---------------- */

export const WORKSHOP_KIND_LABEL: Record<string, string> = {
  photo_lecture: "Фотолекция",
  notes: "Конспект",
  test_questions: "Вопросы",
  pdf: "PDF",
  other: "Материал",
};

export function formatWorkshopDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
