"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { listLectures, type LectureListItem } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";

export default function LecturesPage() {
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("");

  // D9: единый слой отмены вместо ручного cancelled-флага.
  const { data, loading, error } = useApiRequest<LectureListItem[]>(async () => {
    const r = await listLectures(subject || undefined);
    if (!r.ok) throw new Error(describeApiError(r.error) || "Не удалось загрузить лекции");
    return r.data.items || [];
  }, [subject]);
  const items = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter(
      (x) =>
        x.title.toLowerCase().includes(n) ||
        x.topic.toLowerCase().includes(n) ||
        x.subject.toLowerCase().includes(n)
    );
  }, [items, q]);

  const subjects = useMemo(() => {
    const s = new Set(items.map((x) => x.subject).filter(Boolean));
    return Array.from(s).sort();
  }, [items]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="page-title">Лекции</h1>
        <p className="page-subtitle">
          Опубликованные материалы по специальности «Медицинская биохимия». Черновики видит только админ.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по теме…"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
          />
        </div>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm"
        >
          <option value="">Все предметы</option>
          {subjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      {loading ? (
        <div className="card p-6 text-sm text-[var(--muted)]">Загрузка…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Пока нет опубликованных лекций. Админ может сгенерировать и утвердить их в CMS.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((lec) => (
            <Link
              key={lec.id}
              href={`/lectures/${encodeURIComponent(lec.id)}`}
              className="card group flex gap-3 p-4 transition hover:-translate-y-0.5 hover:border-[var(--primary)]/40"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold leading-snug group-hover:text-[var(--primary)]">{lec.title}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">{lec.subject}</div>
                {lec.summary && (
                  <p className="mt-2 line-clamp-2 text-xs text-[var(--muted)]">{lec.summary}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
