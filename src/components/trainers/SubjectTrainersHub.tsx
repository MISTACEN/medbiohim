"use client";

import { useEffect, useMemo, useState } from "react";
import { Brain, Droplets, RotateCcw, Check, Flame, Loader2, Sparkles, Table2 } from "lucide-react";
import { LeukocyteDifferentialTrainer } from "@/components/lectures/LeukocyteDifferentialTrainer";
import BloodNormTableTrainer from "@/components/trainers/BloodNormTableTrainer";
import BloodMeaningTrainer from "@/components/trainers/BloodMeaningTrainer";
import {
  srsSummary, srsDue, srsReview, srsEnsure, srsAddCard,
  type SrsCard, type SrsSummary,
} from "@/lib/features-api";

type HubMode = "leukocytes" | "norms" | "meaning" | "srs";
type Rating = 1 | 2 | 3 | 4;

const RATINGS: Array<{ r: Rating; label: string; hint: string; className: string }> = [
  { r: 1, label: "Снова", hint: "~1 мин", className: "bg-red-500 hover:bg-red-600 text-white" },
  { r: 2, label: "Трудно", hint: "короче", className: "bg-amber-500 hover:bg-amber-600 text-white" },
  { r: 3, label: "Хорошо", hint: "SM-2", className: "bg-emerald-500 hover:bg-emerald-600 text-white" },
  { r: 4, label: "Легко", hint: "длиннее", className: "bg-sky-500 hover:bg-sky-600 text-white" },
];

function SrsPanel() {
  const [scope, setScope] = useState<"shared" | "personal">("shared");
  const [summary, setSummary] = useState<SrsSummary | null>(null);
  const [queue, setQueue] = useState<SrsCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneToday, setDoneToday] = useState(0);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [adding, setAdding] = useState(false);

  async function refresh(selectedScope: "shared" | "personal" = scope) {
    setLoading(true);
    setError(null);
    const [sumRes, dueRes] = await Promise.all([
      srsSummary(),
      srsDue(25, "histology", selectedScope),
    ]);
    setLoading(false);
    if (!sumRes.ok) {
      setError(sumRes.error.message);
      return;
    }
    setSummary(sumRes.data);
    if (!dueRes.ok) {
      setError(dueRes.error.message);
      return;
    }
    setQueue(dueRes.data.items || []);
    setIdx(0);
    setFlipped(false);
  }

  useEffect(() => { void refresh("shared"); }, []);

  async function loadMore() {
    if (scope === "personal" || busy) return;
    setBusy(true);
    const res = await srsEnsure(20, "histology");
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await refresh(scope);
  }

  async function rate(r: Rating) {
    const card = queue[idx];
    if (!card || busy) return;
    setBusy(true);
    const res = await srsReview(card.id, r);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSummary(res.data.summary);
    setDoneToday((n) => n + 1);
    setFlipped(false);
    if (idx + 1 < queue.length) setIdx(idx + 1);
    else await refresh(scope);
  }

  async function addPersonal() {
    if (!front.trim() || adding) return;
    setAdding(true);
    setError(null);
    const res = await srsAddCard({
      front: front.trim(),
      back: back.trim(),
      subject_slug: "histology",
    });
    setAdding(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setFront("");
    setBack("");
    setScope("personal");
    await refresh("personal");
  }

  const card = queue[idx] || null;

  if (loading) {
    return <div className="flex items-center gap-2 p-8 text-sm text-[var(--muted)]"><Loader2 className="h-5 w-5 animate-spin" /> Загрузка SRS…</div>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <Brain className="h-5 w-5 text-[var(--primary)]" /> Карточки SRS
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Интервальное повторение для гистологии. Здесь же можно повторять общую колоду и личные карточки.</p>
        </div>
        {summary ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 font-semibold text-[var(--primary)]">К повторению: {summary.due}</span>
            <span className="rounded-full border border-[var(--border)] px-3 py-1">В колоде: {summary.total}</span>
            {doneToday > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-orange-800"><Flame className="h-3.5 w-3.5" /> сегодня {doneToday}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setScope("shared"); void refresh("shared"); }} className={"rounded-full border px-3 py-1.5 text-xs font-bold " + (scope === "shared" ? "border-indigo-500 bg-indigo-100 text-indigo-800" : "bg-white text-slate-600")}>Общие</button>
        <button type="button" onClick={() => { setScope("personal"); void refresh("personal"); }} className={"rounded-full border px-3 py-1.5 text-xs font-bold " + (scope === "personal" ? "border-indigo-500 bg-indigo-100 text-indigo-800" : "bg-white text-slate-600")}>Мои</button>
        {scope === "shared" ? (
          <button type="button" onClick={() => void loadMore()} disabled={busy} className="ml-auto rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40">{busy ? "Загружаю…" : "+20 новых"}</button>
        ) : null}
      </div>

      {scope === "personal" ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 text-sm font-semibold">Новая личная карточка гистологии</div>
          <div className="grid gap-2 md:grid-cols-2">
            <textarea value={front} onChange={(e) => setFront(e.target.value)} placeholder="Вопрос / термин" className="min-h-20 rounded-xl border px-3 py-2 text-sm" />
            <textarea value={back} onChange={(e) => setBack(e.target.value)} placeholder="Ответ / определение" className="min-h-20 rounded-xl border px-3 py-2 text-sm" />
          </div>
          <button type="button" disabled={adding || !front.trim()} onClick={() => void addPersonal()} className="btn-primary mt-3">{adding ? "Сохраняем…" : "Добавить карточку"}</button>
        </div>
      ) : null}

      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {!card ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm">
          <Check className="mx-auto h-9 w-9 text-[var(--success)]" />
          <p className="mt-3 font-semibold">На сейчас карточек нет</p>
          {scope === "shared" ? <button type="button" onClick={() => void loadMore()} className="mt-4 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">Набрать колоду</button> : null}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <div className="text-xs text-[var(--muted)]">{idx + 1} / {queue.length}{card.subject ? " · " + card.subject : ""}</div>
            <button type="button" onClick={() => setFlipped((v) => !v)} className="mt-2 min-h-[240px] w-full rounded-3xl border border-[var(--border)] bg-[var(--card)] p-7 text-left shadow-sm">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{flipped ? "Ответ" : "Вопрос"}</div>
              <div className="whitespace-pre-wrap text-base leading-relaxed">{flipped ? card.back || "—" : card.front}</div>
            </button>
            {!flipped ? (
              <button type="button" onClick={() => setFlipped(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold"><RotateCcw className="h-4 w-4" /> Показать ответ</button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {RATINGS.map((button) => (
                  <button key={button.r} type="button" disabled={busy} onClick={() => void rate(button.r)} className={"rounded-xl px-3 py-3 text-sm font-semibold shadow disabled:opacity-40 " + button.className}>
                    <div>{button.label}</div><div className="text-[10px] font-normal opacity-90">{button.hint}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            <div className="font-bold text-slate-900">Гистология → SRS</div>
            <div className="mt-2">Полезные карточки: термин → определение, препарат → признак, клетка → морфология, норма → значение.</div>
            <div className="mt-3 rounded-xl bg-white p-3"><b>Совет:</b> карточка должна проверять один конкретный факт.</div>
          </aside>
        </div>
      )}
    </section>
  );
}

export function SubjectTrainersHub() {
  const [mode, setMode] = useState<HubMode>("leukocytes");
  const modes = useMemo(() => [
    { id: "leukocytes" as const, label: "Лейкоциты", Icon: Droplets },
    { id: "norms" as const, label: "Нормы крови", Icon: Table2 },
    { id: "meaning" as const, label: "Ответ по смыслу", Icon: Sparkles },
    { id: "srs" as const, label: "Карточки SRS", Icon: Brain },
  ], []);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Тренажёры</h2>
        <p className="mt-1 text-sm text-slate-500">Все практические тренажёры гистологии собраны здесь, без дополнительных пунктов в навигации.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Тренажёры гистологии">
        {modes.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={"inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold " + (mode === id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "leukocytes" ? <LeukocyteDifferentialTrainer raw={JSON.stringify({ title: "Лейкоцитарная формула — тренажёр", mode: "case", sourceMode: "mixed", rounds: 12 })} /> : null}
      {mode === "norms" ? <BloodNormTableTrainer /> : null}
      {mode === "meaning" ? <BloodMeaningTrainer /> : null}
      {mode === "srs" ? <SrsPanel /> : null}
    </section>
  );
}

export default SubjectTrainersHub;
