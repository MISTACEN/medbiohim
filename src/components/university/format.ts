import type { FeedItem, FeedKind } from "./types";
import type { IntegrationImportKind, IntegrationImportSource } from "@/lib/api";

/** `dd.mm.yyyy` / ISO → читаемая русская дата; пустое значение — честное «нет данных». */
export function formatDateTime(value?: string | null): string {
  if (!value) return "нет данных";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

/** Дата материала портала: сначала `date` источника, затем `date_iso`. */
export function formatFeedDate(item: Pick<FeedItem, "date" | "date_iso">): string {
  if (item.date && item.date.trim()) return item.date.trim();
  if (item.date_iso) {
    const iso = /^\d{4}-\d{2}-\d{2}/.test(item.date_iso) ? item.date_iso.slice(0, 10) : item.date_iso;
    const parts = iso.split("-");
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return iso;
  }
  return "дата не указана";
}

export function toneClasses(tone: string): string {
  const map: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
    emerald: "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)] border-[var(--status-ok-border)]",
    amber: "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)] border-[var(--status-warn-border)]",
    rose: "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)] border-[var(--status-critical-border)]",
  };
  return map[tone] || "bg-slate-50 text-slate-700 border-slate-100";
}

const IMPORT_KINDS: readonly IntegrationImportKind[] = ["announcement", "event", "document", "topic", "link"];

/**
 * §3: feed items are saved as announcements/events. If the adapter already sent
 * an import-compatible `kind`, honour it; otherwise derive it from the tab.
 */
export function importKindForFeed(item: FeedItem, feedKind: FeedKind): IntegrationImportKind {
  const raw = (item.kind || "").trim().toLowerCase();
  if ((IMPORT_KINDS as readonly string[]).includes(raw)) return raw as IntegrationImportKind;
  if (raw === "event" || raw === "events") return "event";
  if (feedKind === "events") return "event";
  return "announcement";
}

export const FESMU_SOURCE: IntegrationImportSource = "fesmu";

export const KIND_LABELS: Record<string, string> = {
  announcement: "Объявление",
  event: "Мероприятие",
  document: "Документ",
  topic: "Тема",
  link: "Ссылка",
};

export const SOURCE_LABELS: Record<string, string> = {
  fesmu: "ДВГМУ",
  eios: "ЕИОС",
  neofamily: "NeoFamily",
  sechenov: "Сеченовский",
  other: "Другое",
};

export function kindLabel(kind?: string | null): string {
  if (!kind) return "Без типа";
  return KIND_LABELS[kind] || kind;
}

export function sourceLabel(source?: string | null): string {
  if (!source) return "не указан";
  return SOURCE_LABELS[source] || source;
}
