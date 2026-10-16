"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, CheckCircle2, ChevronDown, Clock3, GraduationCap, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { getAcademicState, getCurriculum, saveAcademicState } from "@/lib/api";

type CurriculumItem = {
  id: string;
  subject_id?: string | null;
  parent_id?: string | null;
  course_number?: number | null;
  semester?: number | null;
  item_type?: string | null;
  title: string;
  description?: string | null;
  planned_date?: string | null;
  due_at?: string | null;
  order_index?: number | null;
  is_required?: boolean;
  metadata?: Record<string, unknown> | null;
  subjects?: { name?: string; slug?: string; course_number?: number; semester?: number } | Array<{ name?: string; slug?: string; course_number?: number; semester?: number }> | null;
};
type AcademicRow = {
  target_type: string;
  target_id: string;
  subject_id?: string | null;
  learning_status?: string;
  academic_status?: string;
  execution_status?: string;
  manual_override?: boolean;
  note?: string | null;
  last_result?: number | null;
  last_result_max?: number | null;
};

const typeLabels: Record<string,string> = { subject: "Дисциплина", exam: "Экзамен", credit: "Зачёт", lecture: "Лекция", practice: "Практика", seminar: "Семинар", lab: "Лабораторная", topic: "Тема", module: "Модуль", assessment: "Контроль", other: "Учебный элемент" };

function subjectName(item: CurriculumItem) {
  const value = Array.isArray(item.subjects) ? item.subjects[0] : item.subjects;
  return value?.name || "";
}
function hours(item: CurriculumItem) {
  const meta = item.metadata || {};
  const total = Number(meta.total_hours || 0);
  const lecture = Number(meta.lecture_hours || 0);
  const practice = Number(meta.practice_hours || 0);
  const self = Number(meta.self_study_hours || 0);
  const credits = Number(meta.credits || 0);
  return { total, lecture, practice, self, credits };
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
      setItems(Array.isArray(curriculumResult.data?.items) ? curriculumResult.data.items : []);
    }
    if (academicResult.ok) setStates(Array.isArray(academicResult.data?.states) ? academicResult.data.states : []);
    else if (curriculumResult.ok) setError("Учебный план загружен, но индивидуальный прогресс пока недоступен.");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stateByItem = useMemo(() => {
    const map = new Map<string, AcademicRow>();
    for (const row of states) if (row.target_type === "curriculum_item") map.set(row.target_id, row);
    return map;
  }, [states]);

  const courses = useMemo(() => [...new Set(items.map((x) => Number(x.course_number || 0)).filter((x) => x > 0))].sort((a,b) => a-b), [items]);
  const semesters = useMemo(() => [...new Set(items.filter((x) => course === "all" || String(x.course_number) === course).map((x) => Number(x.semester || 0)).filter((x) => x > 0))].sort((a,b) => a-b), [items, course]);
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
    let totalHours = 0, credits = 0, completed = 0, tracked = 0;
    for (const item of visible) {
      const h = hours(item);
      totalHours += h.total;
      credits += h.credits;
      const state = stateByItem.get(item.id);
      if (state) tracked++;
      if (state?.learning_status === "completed" || state?.academic_status === "passed") completed++;
    }
    return { totalHours, credits, completed, tracked };
  }, [visible, stateByItem]);

  async function changeStatus(item: CurriculumItem, value: string) {
    setSavingId(item.id);
    setError(null);
    const previous = stateByItem.get(item.id);
    const result = await saveAcademicState({
      target_type: "curriculum_item",
      target_id: item.id,
      subject_id: item.subject_id || null,
      learning_status: value,
      academic_status: previous?.academic_status || "not_required",
      execution_status: value === "completed" ? "done" : previous?.execution_status || "not_done",
      manual_override: true,
      note: previous?.note || null,
      last_result: previous?.last_result ?? null,
      last_result_max: previous?.last_result_max ?? null,
    });
    if (!result.ok) setError(result.error.message || "Не удалось сохранить прогресс");
    else {
      const refreshed = await getAcademicState();
      if (refreshed.ok) setStates(Array.isArray(refreshed.data?.states) ? refreshed.data.states : []);
    }
    setSavingId(null);
  }

  if (loading) return <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-slate-100"/><div className="h-64 animate-pulse rounded-2xl bg-slate-100"/></div>;

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-600"><GraduationCap className="h-5 w-5"/> Учебный план</div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Моя программа обучения</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Дисциплины, контрольные мероприятия и учебные темы из Supabase. Отмечайте выполнение — прогресс сохранится в вашем академическом состоянии.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4"/> Обновить</button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-white bg-white/80 p-4"><div className="text-xs text-slate-500">Элементов</div><div className="mt-1 text-2xl font-bold text-slate-900">{visible.length}</div></div>
          <div className="rounded-2xl border border-white bg-white/80 p-4"><div className="text-xs text-slate-500">Учебная нагрузка</div><div className="mt-1 text-2xl font-bold text-slate-900">{totals.totalHours || "—"} <span className="text-sm font-medium">ч</span></div></div>
          <div className="rounded-2xl border border-white bg-white/80 p-4"><div className="text-xs text-slate-500">Зачётные единицы</div><div className="mt-1 text-2xl font-bold text-slate-900">{totals.credits || "—"}</div></div>
          <div className="rounded-2xl border border-white bg-white/80 p-4"><div className="text-xs text-slate-500">Завершено</div><div className="mt-1 text-2xl font-bold text-emerald-700">{totals.completed} <span className="text-sm font-medium text-slate-500">/ {visible.length}</span></div></div>
        </div>
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти дисциплину или тему" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"/></label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Курс</span><select value={course} onChange={(e) => {setCourse(e.target.value);setSemester("all");}} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все курсы</option>{courses.map((n) => <option key={n} value={String(n)}>{n} курс</option>)}</select><ChevronDown className="h-4 w-4 text-slate-400"/></label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Семестр</span><select value={semester} onChange={(e) => setSemester(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все семестры</option>{semesters.map((n) => <option key={n} value={String(n)}>{n} семестр</option>)}</select></label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><span className="shrink-0 text-xs text-slate-500">Тип</span><select value={kind} onChange={(e) => setKind(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"><option value="all">Все типы</option>{kinds.map((k) => <option key={k} value={k}>{typeLabels[k] || k}</option>)}</select></label>
        </div>
      </section>

      {visible.length === 0 ? <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-300"/><h2 className="mt-3 font-semibold text-slate-800">По выбранным фильтрам ничего нет</h2><p className="mt-1 text-sm text-slate-500">Снимите фильтры или измените поисковый запрос.</p></section> : (
        <section className="space-y-3">
          {visible.map((item) => {
            const h = hours(item);
            const status = stateByItem.get(item.id);
            const subject = subjectName(item);
            return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">{typeLabels[String(item.item_type || "other")] || item.item_type}</span>
                    {item.course_number ? <span>{item.course_number} курс</span> : null}
                    {item.semester ? <span>· {item.semester} семестр</span> : null}
                    {item.is_required ? <span className="rounded-full bg-slate-100 px-2 py-1">Обязательный</span> : null}
                  </div>
                  <h2 className="mt-2 text-base font-bold text-slate-900 sm:text-lg">{item.title}</h2>
                  {subject && <p className="mt-1 text-sm text-indigo-700">{subject}</p>}
                  {item.description && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{item.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                    {h.total > 0 && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5"/>{h.total} ч</span>}
                    {h.lecture > 0 && <span>Лекции: {h.lecture} ч</span>}
                    {h.practice > 0 && <span>Практика: {h.practice} ч</span>}
                    {h.self > 0 && <span>Самостоятельно: {h.self} ч</span>}
                    {h.credits > 0 && <span>{h.credits} з.е.</span>}
                    {item.planned_date && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5"/>{new Date(item.planned_date + "T12:00:00").toLocaleDateString("ru-RU")}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:w-48">
                  <label className="text-xs font-semibold text-slate-500">Мой прогресс</label>
                  <select aria-label={"Статус: " + item.title} value={status?.learning_status || "not_started"} disabled={savingId === item.id} onChange={(e) => void changeStatus(item, e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60">
                    <option value="not_started">Не начато</option><option value="in_progress">В процессе</option><option value="completed">Завершено</option>
                  </select>
                  {savingId === item.id ? <span className="text-xs text-indigo-600">Сохраняем…</span> : status?.learning_status === "completed" ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4"/> Сохранено</span> : null}
                  {item.subject_id && <Link href={"/subjects/" + item.subject_id} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">Открыть предмет →</Link>}
                </div>
              </div>
            </article>;
          })}
        </section>
      )}
      <p className="text-xs text-slate-400">Показываются активные записи учебного плана. Изменения статуса сохраняются отдельно для вашей учётной записи; исходная учебная программа не изменяется.</p>
    </main>
  );
}
