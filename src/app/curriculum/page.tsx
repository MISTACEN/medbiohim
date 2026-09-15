"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurriculum, hasToken } from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";

type Item = {
  id: string;
  subject: string;
  course?: number;
  semester?: number;
  control?: string;
  progress_pct?: number;
  modules?: Array<{ title: string; topics?: string[]; done?: boolean }>;
};

export default function CurriculumPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await getCurriculum();
        if (cancelled) return;
        if (res.ok) setItems((res.data.items || []) as Item[]);
        else setError(res.error.message);
      } catch {
        if (!cancelled) setError("Не удалось загрузить план");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600">Войдите, чтобы видеть учебный план</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );
  }

  if (loading) return <SkeletonCards count={2} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Учебный план</h1>
        <p className="page-subtitle">Ход учёбы по предметам и модулям</p>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">План пока пуст</div>
      ) : (
        <div className="space-y-4">
          {items.map((it) => (
            <div key={it.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">{it.subject}</div>
                  <div className="text-sm text-slate-500">
                    Курс {it.course ?? "—"} · Семестр {it.semester ?? "—"} · {it.control || "—"}
                  </div>
                </div>
                <div className="text-sm font-medium text-blue-600">{it.progress_pct ?? 0}%</div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                  style={{ width: `${Math.min(100, Math.max(0, it.progress_pct ?? 0))}%` }}
                />
              </div>
              <ul className="space-y-2">
                {(it.modules || []).map((m, i) => (
                  <li
                    key={i}
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      m.done ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div className="font-medium">
                      {m.done ? "✓ " : ""}
                      {m.title}
                    </div>
                    {m.topics && m.topics.length > 0 && (
                      <div className="text-xs text-slate-500">{m.topics.join(" · ")}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
