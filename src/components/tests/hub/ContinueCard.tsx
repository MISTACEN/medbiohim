"use client";

/**
 * «Продолжить» — незавершённая попытка.
 *
 * Блок стоит первым и содержит одну строку: что за тест, сколько сделано и
 * кнопку возврата. Если незавершённых попыток нет, блок не рендерится и не
 * занимает место перед списком банков.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Timer } from "lucide-react";

import { listMyAttempts } from "@/lib/api/tests";
import { hasToken } from "@/lib/api";

type Attempt = {
  id?: string;
  test_id?: string;
  test_title?: string;
  status?: string;
  percent?: number | null;
  started_at?: string | null;
};

const ACTIVE = /^(in_progress|active|started|pending|resumed)$/i;

export function ContinueCard() {
  const [attempt, setAttempt] = useState<Attempt | null>(null);

  useEffect(() => {
    if (!hasToken()) return;
    let cancelled = false;
    void (async () => {
      const result = await listMyAttempts();
      if (cancelled || !result.ok) return;
      const items: Attempt[] = Array.isArray(result.data?.items) ? result.data.items : [];
      const active = items
        .filter((item) => item.test_id && ACTIVE.test(String(item.status || "")))
        .sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")))[0];
      setAttempt(active || null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!attempt?.test_id) return null;

  return (
    <section
      aria-label="Продолжить попытку"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3"
    >
      <Timer className="h-5 w-5 shrink-0 text-indigo-700" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
          Продолжить
        </p>
        <p className="truncate text-sm font-bold text-slate-900">
          {attempt.test_title || "Незавершённый тест"}
        </p>
        <p className="text-xs text-slate-600">
          {attempt.started_at ? String(attempt.started_at).slice(0, 16).replace("T", " ") : "начат"}
          {attempt.percent != null ? ` · ${Math.round(Number(attempt.percent))}%` : ""}
        </p>
      </div>
      <Link
        href={`/tests/attempt/${encodeURIComponent(attempt.test_id)}`}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
      >
        <Play className="h-4 w-4" /> Продолжить
      </Link>
    </section>
  );
}
