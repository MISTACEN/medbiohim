"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, Atom, BookOpen, Bot, Brain, Calculator, ChevronRight, Cpu,
  Dumbbell, FlaskConical, HeartPulse, Layers, Microscope, Network, Search,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { listSubjects, listSubjectsCatalog } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { useApiRequest } from "@/hooks/useApiRequest";

type Item = {
  id: string;
  name: string;
  course_number?: number | null;
  semester?: number | null;
  control_type?: string | null;
  slug?: string;
  hours_note?: string;
  total_hours?: number | null;
  credits?: number | null;
  category?: string;
  icon?: string;
  blurb?: string;
  course?: number;
};

type Tool = { id: string; name: string; href: string; icon?: string; blurb?: string };

const CATEGORY_ORDER = [
  "Естественно-научные",
  "Математика и IT",
  "Гуманитарные",
  "Клинические навыки",
  "Элективы",
  "Другое",
];

function subjectIcon(key?: string) {
  switch (key) {
    case "activity": return Activity;
    case "microscope": return Microscope;
    case "flask": return FlaskConical;
    case "atom": return Atom;
    case "cpu": return Cpu;
    case "network": return Network;
    case "chart": return Activity;
    case "book": return BookOpen;
    case "brain": return Brain;
    case "heart": return HeartPulse;
    case "dumbbell": return Dumbbell;
    case "bot": return Bot;
    case "layers": return Layers;
    case "calculator": return Calculator;
    case "search": return Search;
    default: return BookOpen;
  }
}

function controlLabel(v?: string | null) {
  if (!v) return null;
  const m: Record<string, string> = { exam: "Экзамен", credit: "Зачёт", diff_credit: "Дифф. зачёт" };
  return m[v] || v;
}

export default function SubjectsPage() {
  const { user } = useAuth();
  const [course, setCourse] = useState<number | "">(user?.course ?? "");
  const [semester, setSemester] = useState<number | "">(user?.semester ?? "");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (user?.course != null) setCourse(user.course);
    if (user?.semester != null) setSemester(user.semester);
  }, [user?.course, user?.semester]);

  const { data, loading } = useApiRequest<{ items: Item[]; tools: Tool[]; note: string | null }>(async () => {
    try {
      const [cat, r] = await Promise.all([
        listSubjectsCatalog(),
        listSubjects(
          course === "" ? undefined : course,
          semester === "" ? undefined : semester
        ),
      ]);
      const catalogMeta = cat.ok ? (cat.data as { items?: Item[]; tools?: Tool[] }) : null;
      const tools = catalogMeta?.tools || [];

      if (r.ok && (r.data.items || []).length > 0) {
        const byName = new Map((catalogMeta?.items || []).map((x) => [x.name.toLowerCase(), x]));
        return {
          tools,
          note: null,
          items: (r.data.items || []).map((s: any) => {
            const meta = byName.get((s.name || "").toLowerCase());
            return {
              ...s,
              category: meta?.category || "Другое",
              icon: meta?.icon,
              blurb: meta?.blurb,
              slug: s.slug || meta?.slug || s.id,
            };
          }),
        };
      }
      if (cat.ok) {
        return {
          items: [],
          tools,
          note: "Для выбранного курса и семестра данные из основной БД недоступны. Устаревший каталог не подставляется.",
        };
      }
      return { items: [], tools, note: r.ok ? "Пусто" : describeApiError(r.error) };
    } catch {
      return { items: [], tools: [], note: "Не удалось загрузить предметы" };
    }
  }, [course, semester]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const tools = data?.tools ?? [];
  const note = data?.note ?? null;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.blurb || "").toLowerCase().includes(needle) ||
        (s.category || "").toLowerCase().includes(needle)
    );
  }, [items, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const s of filtered) {
      const cat = s.category || "Другое";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [filtered]);

  const sems = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  function openTutor(name: string) {
    try { sessionStorage.setItem("tutor_prefill", `Объясни тему по предмету «${name}»`); } catch { /* ignore */ }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Начнём с главного</p>
        <h1 className="page-title mt-1">Какой предмет вы сейчас учите?</h1>
        <p className="page-subtitle">Выберите предмет — откроется план, билеты и AI-тьютор. Поиск работает по названию.</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти предмет — например, «физ» или «химия»"
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-3.5 pl-10 pr-4 text-sm shadow-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/25"
        />
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Курс</span>
          <select value={course} onChange={(e) => setCourse(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
            <option value="">Все</option>
            {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>{c} курс</option>)}
          </select>
        </label>
        <label className="min-w-[160px] flex-1">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">Семестр</span>
          <select value={semester} onChange={(e) => setSemester(e.target.value ? Number(e.target.value) : "")} className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm">
            <option value="">Все</option>
            {sems.map((s) => <option key={s} value={s}>{s} семестр</option>)}
          </select>
        </label>
      </div>

      {note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{note}</div>
      )}

      {tools.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Инструменты обучения</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tools.map((t) => {
              const Icon = subjectIcon(t.icon);
              return (
                <Link key={t.id} href={t.href} className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)]/40 hover:shadow-md">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="h-5 w-5" /></div>
                  <div className="font-semibold">{t.name}</div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{t.blurb}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {loading ? (
        <div className="card p-6 text-sm text-[var(--muted)]">Загрузка предметов…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--muted)]">Ничего не найдено{q ? ` по запросу «${q}»` : ""}.</div>
      ) : (
        grouped.map(({ category, items: list }) => (
          <section key={category} className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => {
                const Icon = subjectIcon(s.icon);
                const href = `/subjects/${encodeURIComponent(s.id)}`;
                return (
                  <div key={s.id} className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)]/35 hover:shadow-md">
                    <Link href={href} className="flex flex-1 gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-snug text-[var(--text)]">{s.name}</div>
                        {s.blurb && <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{s.blurb}</p>}
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {controlLabel(s.control_type) && <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[var(--primary)]">{controlLabel(s.control_type)}</span>}
                          {s.total_hours != null && <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{s.total_hours} ч{s.credits != null ? ` / ${s.credits} з.е.` : ""}</span>}
                          {s.hours_note && <span className="rounded-full border border-[var(--border)] px-2 py-0.5">{s.hours_note}</span>}
                        </div>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 opacity-40 transition group-hover:opacity-80" />
                    </Link>
                    <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3">
                      <Link href={href} className="flex-1 rounded-xl border border-[var(--border)] px-3 py-1.5 text-center text-xs font-semibold hover:bg-[var(--primary-soft)]">Открыть</Link>
                      <Link href="/tutor" onClick={() => openTutor(s.name)} className="flex-1 rounded-xl bg-[var(--primary)] px-3 py-1.5 text-center text-xs font-semibold text-white">Спросить тьютора</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
