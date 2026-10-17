"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, ChevronDown, Circle, Loader2, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { getAcademicState, getCurriculum, saveAcademicState } from "@/lib/api";

type CurriculumItem = {
  id: string;
  title?: string;
  description?: string | null;
  item_type?: string | null;
  course_number?: number | null;
  semester?: number | null;
  planned_date?: string | null;
  due_at?: string | null;
  is_required?: boolean | null;
  order_index?: number | null;
  metadata?: Record<string, unknown> | null;
  subjects?: { name?: string; slug?: string; course_number?: number; semester?: number } | Array<{ name?: string; slug?: string; course_number?: number; semester?: number }> | null;
};

type AcademicRow = {
  id?: string;
  target_type?: string;
  target_id?: string;
  learning_status?: string;
  academic_status?: string;
  execution_status?: string;
  note?: string | null;
};

const typeLabels: Record<string, string> = {
  lecture: "Лекция",
  practice: "Практика",
  lab: "Лабораторная",
  seminar: "Семинар",
  exam: "Экзамен",
  credit: "Зачёт",
  other: "Другое",
};

function subjectName(item: CurriculumItem) {
  const value = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
  return value?.name || "";
}

function subjectSlug(item: CurriculumItem) {
  const value = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
  return value?.slug || "";
}

function hours(item: CurriculumItem) {
  const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const lecture = Number((meta as any).lecture_hours ?? (meta as any).hours_lecture ?? 0) || 0;
  const practice = Number((meta as any).practice_hours ?? (meta as any).hours_practice ?? 0) || 0;
  const total = Number((meta as any).total_hours ?? lecture + practice) || lecture + practice;
  return { lecture, practice, total };
}

export default function CurriculumPage() {
  const [items, setItems] = useState<CurriculumItem[]>([]);
  const [states, setStates] = useState<AcademicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [course, setCourse] = useState("all");
  const [semester, setSemester] = useState("all");
  const [kind, setKind] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [curriculumResult, academicResult] = await Promise.all([getCurriculum(), getAcademicState()]);
    if (!curriculumResult.ok) {
      setError(curriculumResult.error.message || "Не удалось загрузить учебный план");
      setItems([]);
    } else {
      const rows = Array.isArray(curriculumResult.data?.items) ? curriculumResult.data.items : [];
      setItems(rows);
      if (curriculumResult.data?.degraded || curriculumResult.data?.service_notice) {
        setError(String(curriculumResult.data.service_notice || "Учебный план загружен в ограниченном режиме."));
      } else if (rows.length === 0) {
        setError("В учебном плане пока нет активных пунктов. Если вы ожидаете список — обратитесь к администратору.");
      }
    }
    if (academicResult.ok) setStates(Array.isArray(academicResult.data?.states) ? academicResult.data.states : []);
    else if (curriculumResult.ok) setError((prev) => prev || "Учебный план загружен, но индивидуальный прогресс пока недоступен.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stateByItem = useMemo(() => {
    const map = new Map<string, AcademicRow>();
    for (const row of states) if (row.target_type === "curriculum_item") map.set(String(row.target_id), row);
    return map;
  }, [states]);

  const courses = useMemo(() => [...new Set(items.map((x) => Number(x.course_number || 0)).filter((x) => x > 0))].sort((a, b) => a - b), [items]);
  const semesters = useMemo(() => [...new Set(items.filter((x) => course === "all" || String(x.course_number) === course).map((x) => Number(x.semester || 0)).filter((x) => x > 0))].sort((a, b) => a - b), [items, course]);
  const kinds = useMemo(() => [...new Set(items.map((x) => String(x.item_type || "other")))].sort(), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (course !== "all" && String(item.course_number || "") !== course) return false;
      if (semester !== "all" && String(item.semester || "") !== semester) return false;
      if (kind !== "all" && String(item.item_type || "other") !== kind) return false;
      if (q && ![item.title, item.description, subjectName(item)].some((v) => String(v || "").toLocaleLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, course, semester, kind, query]);

  const totals = useMemo(() => {
    let completed = 0;
    for (const item of items) {
      const state = stateByItem.get(item.id);
      if (state?.learning_status === "completed" || state?.academic_status === "passed") completed++;
    }
    return { total: items.length, completed, remaining: Math.max(0, items.length - completed) };
  }, [items, stateByItem]);

  async function markDone(item: CurriculumItem) {
    setSavingId(item.id);
    setError(null);
    const previous = stateByItem.get(item.id);
    const result = await saveAcademicState({
      target_type: "curriculum_item",
      target_id: item.id,
      learning_status: "completed",
      academic_status: previous?.academic_status || "not_required",
      execution_status: "done",
      note: previous?.note || null,
      metadata: item.metadata || {},
    });
    setSavingId(null);
    if (!result.ok) setError(result.error.message || "Не удалось сохранить прогресс");
    else {
      const refreshed = await getAcademicState();
      if (refreshed.ok) setStates(Array.isArray(refreshed.data?.states) ? refreshed.data.states : []);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-5xl items-center justify-center px-4">
        <div className="flex items-center gap-3 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /><span>Загрузка учебного плана…</span></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Учёба</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Учебный план</h1>
          <p className="mt-1 text-sm text-slate-500">Лекции, практики, зачёты и экзамены по курсам и семестрам. Отмечайте пройденное.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw className="h-4 w-4" /> Обновить
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Всего пунктов</p><p className="mt-1 text-2xl font-semibold text-slate-900">{totals.total}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Пройдено</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{totals.completed}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">Осталось</p><p className="mt-1 text-2xl font-semibold text-indigo-700">{totals.remaining}</p></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="relative md:col-span-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по названию" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" /></label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Курс</span><select value={course} onChange={(e) => { setCourse(e.target.value); setSemester("all"); }} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все курсы</option>{courses.map((n) => <option key={n} value={String(n)}>{n} курс</option>)}</select><ChevronDown className="h-4 w-4 text-slate-400" /></label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Семестр</span><select value={semester} onChange={(e) => setSemester(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все семестры</option>{semesters.map((n) => <option key={n} value={String(n)}>{n} семестр</option>)}</select></label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Тип</span><select value={kind} onChange={(e) => setKind(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все типы</option>{kinds.map((k) => <option key={k} value={k}>{typeLabels[k] || k}</option>)}</select></label>
        </div>
      </section>

      {visible.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 font-semibold text-slate-800">По выбранным фильтрам ничего нет</h2>
          <p className="mt-1 text-sm text-slate-500">Снимите фильтры или измените поисковый запрос.</p>
        </section>
      ) : (
        <section className="space-y-3">
          {visible.map((item) => {
            const h = hours(item);
            const status = stateByItem.get(item.id);
            const subject = subjectName(item);
            const slug = subjectSlug(item);
            const done = status?.learning_status === "completed" || status?.academic_status === "passed";
            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{typeLabels[String(item.item_type || "other")] || item.item_type || "Пункт"}</span>
                      {item.course_number ? <span>{item.course_number} курс</span> : null}
                      {item.semester ? <span>{item.semester} сем.</span> : null}
                      {item.planned_date ? <span>{item.planned_date}</span> : null}
                      {item.is_required ? <span className="text-amber-700">обязательно</span> : null}
                    </div>
                    <h2 className="mt-2 text-base font-semibold text-slate-900 sm:text-lg">{item.title || "Без названия"}</h2>
                    {subject ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {slug ? <Link href={`/subjects/${slug}`} className="text-indigo-600 hover:underline">{subject}</Link> : subject}
                      </p>
                    ) : null}
                    {item.description ? <p className="mt-2 text-sm text-slate-500 line-clamp-3">{item.description}</p> : null}
                    {(h.total > 0 || h.lecture > 0 || h.practice > 0) ? (
                      <p className="mt-2 text-xs text-slate-500">Часы: лекц. {h.lecture} · практ. {h.practice} · всего {h.total}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-40">
                    <div className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-400" />}
                      {done ? "Пройдено" : "Не отмечено"}
                    </div>
                    <button
                      type="button"
                      disabled={savingId === item.id || done}
                      onClick={() => void markDone(item)}
                      className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {savingId === item.id ? "Сохранение…" : done ? "Готово" : "Отметить"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
