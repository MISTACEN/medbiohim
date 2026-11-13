"use client";

/**
 * Блок «Повторить карточки» — очередь SRS (SM-2) из /srs/summary.
 * Ведёт в деку /cards (с подсказкой scope по умолчанию) и подсказывает
 * сформировать колоду из банка, если карточек ещё нет.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, Loader2 } from "lucide-react";
import { srsSummary, type SrsSummary } from "@/lib/features-api";

export function SrsDueCard() {
  const [summary, setSummary] = useState<SrsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void srsSummary().then((response) => {
      if (cancelled) return;
      if (response.ok) setSummary(response.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const due = Number(summary?.due ?? 0);
  const total = Number(summary?.total ?? 0);
  const fresh = Number((summary as any)?.new_available ?? 0);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Layers className="h-4 w-4 text-[var(--primary)]" /> Карточки к повторению
        </h2>
        <Link href="/cards" className="text-xs font-semibold text-[var(--primary)]">Открыть деку →</Link>
      </div>
      {loading ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Считаем очередь…</p>
      ) : !summary ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Дека недоступна — войдите, чтобы собирать и повторять карточки.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "К повторению сегодня", value: due, tone: due ? "text-[var(--status-warn-fg)]" : "text-[var(--status-ok-fg)]" },
            { label: "В колоде", value: total, tone: "" },
            { label: "Новых из банка", value: fresh, tone: "" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-[var(--border)] px-3 py-2">
              <div className={"text-xl font-extrabold tabular-nums " + card.tone}>{card.value}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{card.label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
