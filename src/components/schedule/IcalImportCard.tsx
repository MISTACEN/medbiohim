"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Download, Link2, Loader2, Trash2 } from "lucide-react";
import { deleteIcalEvent, getScheduleFeedLink, importIcalCalendar, listIcalEvents } from "@/lib/api";

type IcalRow = {
  id: string;
  external_id: string;
  title: string;
  subject_id?: string | null;
  topic_id?: string | null;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  source_url?: string | null;
};

type ImportResult = {
  totals?: { events?: number; imported?: number; updated?: number; skipped?: number; with_subject?: number; with_topic?: number };
  preview?: Array<{ uid: string; title: string; subject?: string | null; topic?: string | null; starts_at: string; location?: string | null }>;
};

function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Личный календарь студента: ссылка на iCal-фид или вставленный текст.
 * Учебное расписание при этом не меняется — события живут отдельно и
 * только подсказывают, что ещё происходит в этот день.
 */
export default function IcalImportCard() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [events, setEvents] = useState<IcalRow[]>([]);
  const [feedPath, setFeedPath] = useState<{ download: string; subscribe: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const response = await listIcalEvents();
    if (response.ok) {
      const items = Array.isArray(response.data?.items) ? response.data.items : [];
      setEvents(items);
    }
    const feed = await getScheduleFeedLink();
    if (feed.ok && feed.data?.download_path) {
      setFeedPath({
        download: String(feed.data.download_path),
        subscribe: String(feed.data.path || feed.data.download_path).replace(/&download=1$/, ""),
      });
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    if (mode === "url" && !url.trim()) {
      setError("Вставьте ссылку на календарь");
      setBusy(false);
      return;
    }
    if (mode === "text" && !text.trim()) {
      setError("Вставьте содержимое .ics-файла");
      setBusy(false);
      return;
    }
    const response = await importIcalCalendar(mode === "url" ? { url: url.trim() } : { text });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setResult(response.data as ImportResult);
    setText("");
    await refresh();
  }

  async function copyFeedLink() {
    if (!feedPath) return;
    const absolute = `${window.location.origin}${feedPath.subscribe}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Браузер не дал скопировать ссылку — откройте её вручную");
    }
  }

  async function remove(id: string) {    setBusy(true);
    const response = await deleteIcalEvent(id);
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setEvents((current) => current.filter((item) => item.id !== id));
  }

  const upcoming = events
    .filter((item) => new Date(item.starts_at).getTime() >= Date.now() - 60 * 60 * 1000)
    .slice(0, 8);

  return (
    <section className="rounded-2xl border p-4" style={{ background: "color-mix(in srgb, var(--primary) 4%, var(--card))" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <b className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" style={{ color: "var(--primary)" }} />
            Мой календарь
          </b>
          <p className="text-xs opacity-60">
            Личные события из iCal-фида: консультации, переносы, напоминания кафедры. Учебное расписание они не меняют.
          </p>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => setOpen((value) => !value)}>
          {open ? "Свернуть" : "Импорт и события"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          {feedPath && (
            <div className="rounded-xl border bg-white/60 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Link2 className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                Экспорт и подписка
              </div>
              <p className="mt-1 text-[11px] opacity-70">
                Скачайте файл один раз или добавьте ссылку в Google/Apple Календарь: изменения расписания будут подтягиваться сами.
                В Google: «Другие календари» → «По URL».
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={feedPath.download} className="btn-secondary inline-flex items-center gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" /> Скачать .ics
                </a>
                <button type="button" className="btn-secondary inline-flex items-center gap-1.5 text-xs" onClick={() => void copyFeedLink()}>
                  <Link2 className="h-3.5 w-3.5" /> {copied ? "Скопировано" : "Ссылка для подписки"}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMode("url")}
              className={mode === "url" ? "schedule-tab schedule-tab-active" : "schedule-tab"}
            >
              Ссылка на фид
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className={mode === "text" ? "schedule-tab schedule-tab-active" : "schedule-tab"}
            >
              Текст .ics
            </button>
          </div>

          {mode === "url" ? (
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…/calendar.ics"
              inputMode="url"
              className="w-full rounded-xl border bg-white/70 px-3 py-2 text-sm"
            />
          ) : (
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="BEGIN:VCALENDAR…"
              rows={6}
              className="w-full rounded-xl border bg-white/70 px-3 py-2 font-mono text-xs"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary inline-flex items-center gap-2 text-xs" onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Импортировать
            </button>
            <span className="text-[11px] opacity-60">События обновляются по UID, привязанная тема не перезаписывается.</span>
          </div>

          {error && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          {result?.totals && (
            <div className="rounded-xl border bg-white/60 px-3 py-2 text-xs">
              Найдено {result.totals.events ?? 0} · новых {result.totals.imported ?? 0} · обновлено {result.totals.updated ?? 0} · без изменений{" "}
              {result.totals.skipped ?? 0} · с предметом {result.totals.with_subject ?? 0} · с темой {result.totals.with_topic ?? 0}
            </div>
          )}

          {upcoming.length > 0 && (
            <ul className="space-y-1.5">
              {upcoming.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 rounded-xl border bg-white/60 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{item.title}</div>
                    <div className="text-[11px] opacity-60">
                      {formatMoment(item.starts_at)}
                      {item.location ? ` · ${item.location}` : ""}
                      {item.topic_id ? " · тема привязана" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    className="shrink-0 rounded-lg p-1.5 text-xs opacity-60 hover:opacity-100"
                    aria-label="Удалить событие"
                    disabled={busy}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
