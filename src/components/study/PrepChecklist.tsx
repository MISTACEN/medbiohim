"use client";

/**
 * Модалка «Готовиться»: ИИ-чеклист подготовки к конкретному событию
 * (КР / коллоквиум / зачёт / занятие). Контекст события передаётся в промпт,
 * срез учебного состояния воркер добавляет сам (context_scope=study).
 */
import { useState } from "react";
import { Loader2, X, CheckSquare } from "lucide-react";
import { aiChat } from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";
import { EVENT_LABEL, type AgendaItem } from "@/lib/study/agenda";

export function PrepChecklist({ item, onClose }: { item: AgendaItem; onClose: () => void }) {
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [attempted, setAttempted] = useState(false);

  const kindLabel = EVENT_LABEL[item.kind] || "занятие";

  // Генерация запускается один раз при открытии модалки.
  if (!attempted) {
    setAttempted(true);
    void (async () => {
      const when = item.date ? item.date.split("-").reverse().join(".") : "дата неизвестна";
      const response = await aiChat(
        [
          {
            role: "user",
            content:
              `Составь чек-лист подготовки к событию «${item.title}» (${kindLabel}, ${when}). `
              + "5–8 пунктов: какие темы/лекции повторить, что сдать заранее, что взять. "
              + "Опирайся только на учебный контекст ниже — не придумывай темы и даты. "
              + "Формат: нумерованный список, без вступлений.",
          },
        ],
        "auto",
        { contextScope: "study" },
      );
      if (!response.ok) {
        setError(describeApiError(response.error));
        setBusy(false);
        return;
      }
      const parsed = response.data.message.content
        .split("\n")
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
        .filter((line) => line.length > 3)
        .slice(0, 9);
      setItems(parsed);
      setBusy(false);
    })();
  }

  function toggle(index: number) {
    setDone((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--card)] p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <CheckSquare className="h-5 w-5 text-[var(--primary)]" /> Подготовка
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{item.title}{item.date ? ` · ${item.date.split("-").reverse().join(".")}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </div>
        {busy ? (
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> ИИ собирает чек-лист по вашему плану…
          </p>
        ) : error ? (
          <p className="mt-4 text-sm text-[var(--status-critical-fg)]">{error}</p>
        ) : (
          <>
            <ul className="mt-4 space-y-1.5">
              {items.map((line, index) => (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    className={
                      "flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-sm transition " +
                      (done.has(index)
                        ? "border-transparent bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)] line-through"
                        : "border-[var(--border)] hover:border-[var(--primary)]/40")
                    }
                  >
                    <span className={"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border " + (done.has(index) ? "border-transparent bg-[var(--status-ok-fg)] text-white" : "border-[var(--border)]")}>
                      {done.has(index) ? "✓" : ""}
                    </span>
                    <span>{line}</span>
                  </button>
                </li>
              ))}
            </ul>
            {items.length ? (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Готово: {done.size} из {items.length}. Чек-лист разовый — отметки не сохраняются.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
