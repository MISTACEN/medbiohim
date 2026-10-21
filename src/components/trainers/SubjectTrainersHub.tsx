"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Brain, Check, ChevronRight, Droplets, Flame, Loader2, Microscope, RotateCcw, Sparkles, Table2 } from "lucide-react";
import { LeukocyteDifferentialTrainer } from "@/components/lectures/LeukocyteDifferentialTrainer";
import BloodNormTableTrainer from "@/components/trainers/BloodNormTableTrainer";
import BloodMeaningTrainer from "@/components/trainers/BloodMeaningTrainer";
import BloodPreparationTrainer from "@/components/trainers/BloodPreparationTrainer";
import {
  srsSummary, srsDue, srsReview, srsEnsure, srsAddCard,
  type SrsCard, type SrsSummary,
} from "@/lib/features-api";

type HubMode = "leukocytes" | "norms" | "meaning" | "preparations" | "srs";
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

  const refresh = useCallback(async (selectedScope: "shared" | "personal") => {
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
  }, []);

  useEffect(() => { void refresh("shared"); }, [refresh]);

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

type TrainerMode = Exclude<HubMode, "srs">;

const BLOOD_MODES: Array<{
  id: TrainerMode;
  label: string;
  description: string;
  Icon: typeof Droplets;
}> = [
  { id: "leukocytes", label: "Лейкоцитарная формула", description: "Опознать клетку, оценить процент и объяснить отклонение", Icon: Droplets },
  { id: "norms", label: "Возрастные нормы", description: "Заполнить таблицу норм по возрастам и проверить себя", Icon: Table2 },
  { id: "meaning", label: "Ответ по смыслу", description: "Вспомнить содержание лекции и сформулировать ответ", Icon: Sparkles },
  { id: "preparations", label: "Микропрепараты крови", description: "Узнать клетку по реальному препарату и объяснить признаки", Icon: Microscope },
];

export function SubjectTrainersHub({ lectureHref = "?tab=lectures" }: { lectureHref?: string }) {
  const [mode, setMode] = useState<HubMode | null>(null);

  const selectedMode = BLOOD_MODES.find((item) => item.id === mode);

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Учебный план → лекция → практика</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">Тренажёры по темам гистологии</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Отработайте лейкоцитарную формулу, возрастные нормы, микропрепараты и ответы по смыслу. Все упражнения собраны по теме занятия.
            </p>
          </div>
        </div>
        <a href={lectureHref} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50">
          <BookOpen className="h-4 w-4" /> Открыть лекции
        </a>
      </header>

      {mode === null ? (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
            <div className="border-b border-[var(--border)] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-indigo-600">Тема занятия · доступные тренажёры</div>
                  <h3 className="mt-1 text-lg font-extrabold text-slate-950">Кровь и лимфа</h3>
                  <p className="mt-1 text-sm leading-5 text-[var(--muted)]">Лекция 5 · ткани внутренней среды · практические занятия № 12–13</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">4 упражнения</span>
              </div>
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
              {BLOOD_MODES.map(({ id, label, description, Icon }, index) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className="group flex min-h-[124px] w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-400">Упражнение {index + 1}</span>
                    <span className="mt-1 block font-bold leading-5 text-slate-900">{label}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={() => setMode("srs")}
            className="flex min-h-[88px] w-full items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Brain className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold text-slate-900">Карточки SRS · интервальное повторение</span>
              <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">Общая и личная колоды для повторения терминов и фактов по гистологии. Это отдельный инструмент повторения, а не ещё одна лекционная тема.</span>
            </span>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
          </button>
          <p className="px-1 text-xs leading-5 text-[var(--muted)]">
            Сейчас доступны упражнения по теме «Кровь и лимфа». Новые темы появятся здесь по мере публикации проверенных материалов.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setMode(null)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Все темы и тренажёры
          </button>
          {mode === "srs" ? (
            <SrsPanel />
          ) : (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 sm:p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-indigo-600">Кровь и лимфа · лекция 5</div>
                <h3 className="mt-1 font-extrabold text-slate-950">{selectedMode?.label}</h3>
                <p className="mt-1 text-sm leading-5 text-slate-600">{selectedMode?.description}</p>
              </div>
              {mode === "leukocytes" ? <LeukocyteDifferentialTrainer raw={JSON.stringify({ title: "Лейкоцитарная формула — тренажёр", mode: "case", sourceMode: "mixed", rounds: 12 })} /> : null}
              {mode === "norms" ? <BloodNormTableTrainer /> : null}
              {mode === "meaning" ? <BloodMeaningTrainer /> : null}
              {mode === "preparations" ? <BloodPreparationTrainer /> : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default SubjectTrainersHub;
