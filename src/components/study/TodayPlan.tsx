"use client";

/**
 * «План на сегодня» — реальный ИИ-план через POST /ai/chat с context_scope=study:
 * воркер сам собирает срез (расписание, ДЗ, слабые темы, SRS) и не сохраняет его
 * в историю. Фолбэк — детерминированный список из ближайших дел ленты, если ИИ
 * недоступен. Результат кэшируется на день в localStorage, обновление — вручную.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles, Loader2, ListChecks } from "lucide-react";
import { aiChat } from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";
import type { AgendaItem } from "@/lib/study/agenda";

const CACHE_PREFIX = "study.ai.day.v1:";

function isoToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function readCache(today: string): string[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + today);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { date?: string; items?: string[] };
    return parsed.date === today && Array.isArray(parsed.items) ? parsed.items : null;
  } catch {
    return null;
  }
}

function writeCache(today: string, items: string[]) {
  try {
    localStorage.setItem(CACHE_PREFIX + today, JSON.stringify({ date: today, items }));
  } catch { /* приватный режим — просто без кэша */ }
}

/** Фолбэк-план: ближайшие срочные дела ленты без ИИ. */
export function fallbackPlan(agenda: AgendaItem[]): string[] {
  const open = agenda.filter((item) => item.done !== true);
  if (!open.length) return [];
  return open.slice(0, 5).map((item) => {
    const when = item.date ? ` (${item.date.split("-").reverse().join(".")}${item.time ? " " + item.time : ""})` : "";
    return `${item.title}${when} — ${item.label.toLowerCase()}`;
  });
}

function parsePlan(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter((line) => line.length > 3 && !/^(план|итог|примечание)/i.test(line))
    .slice(0, 7);
}

export function TodayPlan({ agenda }: { agenda: AgendaItem[] }) {
  const [items, setItems] = useState<string[]>([]);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(isoToday, []);

  useEffect(() => {
    const cached = readCache(today);
    if (cached?.length) {
      setItems(cached);
      setSource("ai");
      return;
    }
    const fallback = fallbackPlan(agenda);
    if (fallback.length) {
      setItems(fallback);
      setSource("fallback");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    const open = agenda.filter((item) => item.done !== true).slice(0, 12);
    const agendaText = open.length
      ? open.map((item) => `- [${item.label}] ${item.title}${item.date ? `, срок ${item.date}` : ""}${item.meta ? ` (${item.meta})` : ""}`).join("\n")
      : "(открытых дел нет)";
    const response = await aiChat(
      [
        {
          role: "user",
          content:
            "Составь план на сегодня для студента: нумерованный список из 3–6 коротких пунктов. "
            + "Опирайся только на приведённые ниже дела — не придумывай новых событий. "
            + "Порядок: сначала близкие по сроку аттестации и просроченное, потом остальное. "
            + "Без вступлений и заключений — только список.\n\nОткрытые дела:\n" + agendaText,
        },
      ],
      "auto",
      { contextScope: "study" },
    );
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      const fallback = fallbackPlan(agenda);
      if (fallback.length) {
        setItems(fallback);
        setSource("fallback");
      }
      return;
    }
    const parsed = parsePlan(response.data.message.content);
    const plan = parsed.length ? parsed : fallbackPlan(agenda);
    setItems(plan);
    setSource(parsed.length ? "ai" : "fallback");
    if (plan.length) writeCache(today, plan);
  }, [agenda, today]);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" /> План на сегодня
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          {source === "ai" ? <span>ИИ · {today.split("-").reverse().join(".")}</span> : source === "fallback" ? <span>по срокам</span> : null}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 font-semibold text-[var(--primary)] transition hover:border-[var(--primary)]/50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {items.length ? "Обновить" : "Составить план"}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--status-critical-fg)]">{error}</p> : null}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Откройте ленту ниже: план появится из ближайших дел, либо составьте его ИИ-кнопкой.
        </p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
