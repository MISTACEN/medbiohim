"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, CheckCircle2, Clock3, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { getAcademicState, generateAcademicAiPlan, syncAcademicState, type AcademicState } from "@/lib/api";
import { describeApiError } from "@/lib/errors";

const label: Record<string,string> = {
  retake:"пересдача", makeup:"досдача", exam:"экзамен", credit:"зачёт",
  colloquium:"коллоквиум", control_work:"контрольная", assessment:"аттестация"
};

function eventTitle(e: Record<string,unknown>) {
  return String(e.subject_name || "Предмет") + " — " + (label[String(e.event_kind)] || String(e.event_kind || "занятие"));
}

export default function AcademicPage() {
  const [state,setState]=useState<AcademicState|null>(null);
  const [planItems,setPlanItems]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true); setError(null);
    const r=await getAcademicState();
    if(r.ok) setState({ ...r.data, session: r.data.session ?? null,
      plan: r.data.plan ?? { available: false, items: 0, concrete_items: 0 },
      metrics: r.data.metrics ?? { closed: 0, in_progress: 0, not_started: 0, debts: 0, tracked: 0 },
      debts: Array.isArray(r.data.debts) ? r.data.debts : [],
      upcoming: Array.isArray(r.data.upcoming) ? r.data.upcoming : [],
      weak_topics: Array.isArray(r.data.weak_topics) ? r.data.weak_topics : [],
      recommendations: Array.isArray(r.data.recommendations) ? r.data.recommendations : [],
    }); else setError(describeApiError(r.error));
    setLoading(false);
  },[]);

  useEffect(()=>{ void load(); },[load]);

  const syncNow=async()=>{
    setSyncing(true); setError(null);
    const r=await syncAcademicState();
    if(r.ok) await load(); else setError(describeApiError(r.error));
    setSyncing(false);
  };

  const makePlan=async()=>{
    setGenerating(true); setError(null);
    const r=await generateAcademicAiPlan();
    if(r.ok) {
      setPlanItems(Array.isArray(r.data.items) ? r.data.items : []);
      if(r.data.source_state) setState({ ...r.data.source_state, plan: r.data.source_state.plan ?? state?.plan ?? { available: false, items: 0, concrete_items: 0 } });
      else await load();
    } else setError(describeApiError(r.error));
    setGenerating(false);
  };

  if(loading) return <div className="space-y-4"><div className="h-32 animate-pulse rounded-2xl bg-slate-100"/><div className="h-64 animate-pulse rounded-2xl bg-slate-100"/></div>;
  if(!state) return <div className="rounded-2xl border bg-white p-6 text-[var(--status-critical-fg)]">{error || "Не удалось загрузить академическое состояние"}</div>;

  const session=state.session;
  const events=state.upcoming.slice(0,12);
  const weak=state.weak_topics.slice(0,12);
  const recs=state.recommendations.slice(0,12);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Учебный план и подготовка</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">Академическое состояние</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Официальный план, фактический прогресс, академические требования и подтверждённые события расписания.
              AI использует эти данные для рекомендаций, но не придумывает отсутствующие события.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={syncNow} disabled={syncing} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className="h-4 w-4"/> {syncing ? "Синхронизируем…" : "Синхронизировать"}</button>
            <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <RefreshCw className="h-4 w-4"/> Обновить
            </button>
            <button onClick={makePlan} disabled={generating} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              <Sparkles className="h-4 w-4"/> {generating ? "Анализ…" : "Сформировать план"}
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-[var(--status-critical-fg)]">{error}</p>}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Закрыто",state.metrics?.closed],
          ["В процессе",state.metrics?.in_progress],
          ["Не начато",state.metrics?.not_started],
          ["Долги",state.metrics?.debts],
          ["Отслеживается",state.metrics?.tracked]
        ].map(([k,v])=><div key={String(k)} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-2xl font-bold text-slate-900">{String(v)}</div><div className="text-xs text-slate-500">{String(k)}</div></div>)}
      </section>

      {planItems.length > 0 && <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-semibold">План ближайших учебных шагов</h2>
        <ol className="mt-3 space-y-2">{planItems.map((item,i)=><li key={String(item.target_id||i)} className="rounded-xl border p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Шаг {item.order_index || i+1}</div>
          <div className="mt-1 font-medium">{String(item.title || "Продолжить подготовку")}</div>
        </li>)}</ol>
      </section>}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-[var(--status-ok-fg)]"/><h2 className="font-semibold">Официальный учебный план</h2></div>
          {state.plan?.available ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3"><b>{state.plan?.items}</b><div className="text-xs text-slate-500">элементов</div></div>
              <div className="rounded-xl bg-slate-50 p-3"><b>{state.plan?.concrete_items}</b><div className="text-xs text-slate-500">конкретных требований</div></div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl bg-[var(--status-warn-bg)] p-4 text-sm text-[var(--status-warn-fg)]">
              План текущего курса/семестра ещё не загружен. Система продолжает использовать доступные прогресс и расписание и не создаёт вымышленные даты.
            </div>
          )}
          <Link href="/subjects" className="mt-4 inline-block text-sm font-semibold text-indigo-600">Открыть предметы →</Link>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Calendar className="h-5 w-5 text-indigo-500"/><h2 className="font-semibold">Текущая сессия</h2></div>
          {session ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="font-semibold">{String(session.title || "Сессия")}</div>
              <div className="mt-1 text-sm text-slate-500">{String(session.start_date || "—")} → {String(session.end_date || "—")}</div>
              <div className="mt-2 text-xs uppercase tracking-wide text-indigo-600">{String(session.type || "primary")}</div>
            </div>
          ) : <p className="mt-4 text-sm text-slate-500">Текущая сессия пока не задана.</p>}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><TriangleAlert className="h-5 w-5 text-[var(--status-critical-fg)]"/><h2 className="font-semibold">Академические долги</h2></div>
        {state.debts.length ? <div className="mt-4 space-y-2">{state.debts.map((d,i)=><div key={String(d.id||i)} className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/50 p-3"><b>{String(d.subject_name||"Предмет")}</b><span className="ml-2 text-sm text-slate-500">{String(d.note||"Требование не закрыто")}</span></div>)}</div> : <p className="mt-4 text-sm text-[var(--status-ok-fg)]">Незакрытых долгов по известным данным нет.</p>}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Ближайшие академические события</h2>
          <div className="mt-4 space-y-2">
            {events.length ? events.map((e,i)=><div key={String(e.id||i)} className="rounded-xl border p-3"><div className="font-medium">{eventTitle(e)}</div><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5"/>{String(e.date||"—")} · {String(e.start_time||"").slice(0,5)}{e.room ? " · аудитория "+String(e.room) : ""}</div></div>) : <p className="text-sm text-slate-500">Подтверждённых зачётов, экзаменов, пересдач и других контрольных событий пока нет.</p>}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Слабые темы</h2>
          <div className="mt-4 space-y-2">
            {weak.length ? weak.map((t,i)=><div key={String(t.topic_id||i)} className="rounded-xl border p-3"><div className="font-medium">{String(t.subject_name||"Предмет")} — {String(t.topic_name||"Тема")}</div><div className="mt-1 text-xs text-slate-500">Прогресс: {String(t.percent||0)}%</div></div>) : <p className="text-sm text-slate-500">Недостаточно данных о темах для выделения слабых мест.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-500"/><h2 className="font-semibold">Рекомендации AI/правил</h2></div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">{recs.map((r,i)=><div key={String(r.schedule_entry_id||r.topic_id||i)} className="rounded-xl border p-3"><div className="font-medium">{String(r.title||"Подготовка")}</div><p className="mt-1 text-sm text-slate-500">{String(r.reason||"")}</p>{r.when ? <div className="mt-2 text-xs font-medium text-indigo-600">{String(r.when)}{r.where ? " · "+String(r.where):""}</div>:null}</div>)}</div>
        {recs.length===0 && <p className="mt-4 text-sm text-slate-500">Пока нет рекомендаций. По мере появления учебного плана, прогресса и расписания они появятся автоматически.</p>}
      </section>
    </div>
  );
}
