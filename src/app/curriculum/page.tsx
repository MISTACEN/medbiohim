"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, GraduationCap } from "lucide-react";
import { getCurriculum, getSubjectPlan, hasToken, type SubjectPlan, type SubjectPlanWeek } from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";

type Item = {
  id: string;
  subject: string;
  course?: number;
  semester?: number;
  control?: string;
  lecture_hours?: number;
  practice_hours?: number;
  progress_pct?: number;
};

const subjectSlug = (name: string) => {
  const n = name.toLowerCase();
  if (/гистол.*цитол|цитол.*гистол/.test(n)) return "histology";
  if (/физиолог/.test(n)) return "physiology";
  if (/органичес.*физичес.*хим/.test(n)) return "organic_chemistry";
  return "";
};

export default function CurriculumPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [plan, setPlan] = useState<SubjectPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const semesters = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const key = `${item.course ?? "—"} курс · ${item.semester ?? "—"} семестр`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [items]);

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
        if (res.ok) {
          const next = (res.data.items || []) as Item[];
          setItems(next);
          const hist = next.find((x) => subjectSlug(x.subject) === "histology");
          if (hist) {
            setSelected(hist);
            const pr = await getSubjectPlan("histology");
            if (!cancelled && pr.ok) setPlan(pr.data.plan || null);
          }
        } else setError(res.error.message);
      } catch {
        if (!cancelled) setError("Не удалось загрузить учебные планы");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openPlan = async (item: Item) => {
    setSelected(item);
    setPlan(null);
    const slug = subjectSlug(item.subject);
    if (!slug) return;
    setPlanLoading(true);
    try {
      const res = await getSubjectPlan(slug);
      if (res.ok) setPlan(res.data.plan || null);
    } finally {
      setPlanLoading(false);
    }
  };

  if (!hasToken()) {
    return <div className="card p-8 text-center">
      <p className="text-slate-600">Войдите, чтобы видеть учебный план</p>
      <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
    </div>;
  }

  if (loading) return <SkeletonCards count={3} />;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-500">
          <GraduationCap className="h-4 w-4" /> Академический план
        </div>
        <h1 className="page-title mt-1">Учебные планы</h1>
        <p className="page-subtitle">Предметы, семестры и календарно-тематические планы. Для гистологии порядок занятий и препаратов привязан к официальному плану 2026–2027.</p>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </header>

      {semesters.map(([semester, rows]) => (
        <section key={semester} className="space-y-3">
          <h2 className="text-lg font-bold">{semester}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((it) => {
              const active = selected?.id === it.id;
              return (
                <button key={it.id} onClick={() => void openPlan(it)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 ${active ? "border-indigo-400 ring-2 ring-indigo-100" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{it.subject}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {it.lecture_hours ?? "—"} ч лекций · {it.practice_hours ?? "—"} ч практики · {it.control || "контроль не указан"}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {selected && (
        <section className="card overflow-hidden p-0">
          <div className="border-b bg-gradient-to-r from-indigo-50 to-violet-50 p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
              <CalendarDays className="h-4 w-4" /> Детальный план
            </div>
            <h2 className="mt-1 text-xl font-extrabold">{selected.subject}</h2>
            <p className="mt-1 text-sm text-slate-600">Курс {selected.course ?? "—"} · семестр {selected.semester ?? "—"} · {selected.control || "—"}</p>
          </div>

          {planLoading ? <div className="p-6 text-sm text-slate-500">Загрузка календарного плана…</div> :
            plan?.weeks?.length ? (
              <div className="divide-y">
                {(plan.weeks as SubjectPlanWeek[]).map((week: any, i: number) => (
                  <article key={i} className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-700">Занятие {i + 1}</span>
                      <span className="text-sm text-slate-500">{week.date || ""}</span>
                    </div>
                    {week.lecture && <div className="mt-3 text-sm"><b className="text-indigo-700">Лекция:</b> {week.lecture}</div>}
                    {week.practice && <div className="mt-2 text-sm"><b className="text-emerald-700">Практика:</b> {week.practice}</div>}
                    {Array.isArray(week.preparations) && week.preparations.length > 0 && (
                      <div className="mt-3 rounded-xl border bg-slate-50 p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Гистопрепараты</div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {week.preparations.map((prep: any) => (
                            <div key={prep.number} className="rounded-lg bg-white px-3 py-2 text-sm">
                              <b className="text-indigo-600">№{prep.number}</b> {prep.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {week.preparations_range && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Повторение: {week.preparations_range}</div>}
                    {week.electronograms && <div className="mt-2 text-xs font-semibold text-slate-500">Электронограммы входят в занятие.</div>}
                    {week.note && <div className="mt-2 text-xs text-amber-700">{week.note}</div>}
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm text-slate-500">Детальный календарный план для этого предмета пока не импортирован.</div>
            )}
        </section>
      )}
    </div>
  );
}
