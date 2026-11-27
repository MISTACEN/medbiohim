"use client";

/**
 * Практика предмета — вкладки вместо длинной простыни.
 *
 * Раньше все тренажёры шли подряд одной страницей: чтобы добраться до норм или
 * SRS, нужно было листать вниз через чужие блоки, а «Препараты и диагностикум»
 * терялись среди крови. Теперь сверху четыре вкладки, и в каждый момент открыт
 * ровно один раздел: тренажёр, свои препараты, кровь или SRS.
 */
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Brain, Check, Droplets, Flame, ImagePlus, Microscope, RotateCcw } from "lucide-react";
import MyPreparations from "@/components/trainers/MyPreparations";
import { LeukocyteDifferentialTrainer } from "@/components/lectures/LeukocyteDifferentialTrainer";
import BloodNormTableTrainer from "@/components/trainers/BloodNormTableTrainer";
import BloodMeaningTrainer from "@/components/trainers/BloodMeaningTrainer";
import BloodPreparationTrainer from "@/components/trainers/BloodPreparationTrainer";
import HistologyTrainer from "@/components/trainers/HistologyTrainer";
import { describeApiError } from "@/lib/errors";
import { SkeletonCard } from "@/components/ui/Skeleton";
import {
  srsSummary, srsDue, srsReview, srsEnsure, srsAddCard,
  type SrsCard, type SrsSummary,
} from "@/lib/features-api";

type Rating = 1 | 2 | 3 | 4;

const RATINGS: Array<{ r: Rating; label: string; hint: string; className: string }> = [
  { r: 1, label: "Снова", hint: "~1 мин", className: "bg-red-500 hover:bg-red-600 text-white" },
  { r: 2, label: "Трудно", hint: "короче", className: "bg-[var(--status-warn-fg)] hover:bg-[var(--status-warn-fg)] text-white" },
  { r: 3, label: "Хорошо", hint: "SM-2", className: "bg-[var(--status-ok-fg)] hover:bg-[var(--status-ok-fg)] text-white" },
  { r: 4, label: "Легко", hint: "длиннее", className: "bg-sky-500 hover:bg-sky-600 text-white" },
];

type Tab = "trainer" | "mine" | "blood" | "srs";

const TABS: Array<{ id: Tab; label: string; Icon: typeof Droplets }> = [
  { id: "trainer", label: "Тренажёр", Icon: Microscope },
  { id: "mine", label: "Свои препараты", Icon: ImagePlus },
  { id: "blood", label: "Кровь", Icon: Droplets },
  { id: "srs", label: "Карточки SRS", Icon: Brain },
];

const BLOOD_TABS = [
  { id: "leukocytes", label: "Лейкоцитарная формула" },
  { id: "norms", label: "Возрастные нормы" },
  { id: "meaning", label: "Ответ по смыслу" },
  { id: "blood-preparations", label: "Микропрепараты крови" },
] as const;

type BloodTab = (typeof BLOOD_TABS)[number]["id"];

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
      // Сигнатура: srsDue(limit, subject_id, subject_slug, scope). Слаг
      // гистологии — не UUID, поэтому он идёт в третий слот, а не во второй:
      // иначе запрос уходил с subject_id="histology" и очередь была пуста.
      srsDue(25, undefined, "histology", selectedScope),
    ]);
    setLoading(false);
    if (!sumRes.ok) {
      setError(describeApiError(sumRes.error));
      return;
    }
    setSummary(sumRes.data);
    if (!dueRes.ok) {
      setError(describeApiError(dueRes.error));
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
      setError(describeApiError(res.error));
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
      setError(describeApiError(res.error));
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
      setError(describeApiError(res.error));
      return;
    }
    setFront("");
    setBack("");
    setScope("personal");
    await refresh("personal");
  }

  const card = queue[idx] || null;

  if (loading) {
    return <SkeletonCard height={140} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {summary ? (
            <>
              <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 font-semibold text-[var(--primary)]">К повторению: {summary.due}</span>
              <span className="rounded-full border border-[var(--border)] px-3 py-1">В колоде: {summary.total}</span>
              {doneToday > 0 ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-orange-800"><Flame className="h-3.5 w-3.5" /> сегодня {doneToday}</span> : null}
            </>
          ) : null}
        </div>
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

export function SubjectTrainersHub({ lectureHref = "?tab=lectures" }: { lectureHref?: string }) {
  const [tab, setTab] = useState<Tab>("trainer");
  const [bloodTab, setBloodTab] = useState<BloodTab>("leukocytes");

  return (
    <div className="space-y-4">
      {/* Шапка — одна строка: разделы показывают вкладки ниже, пересказывать их
          абзацем значит занимать экран до начала работы. */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-slate-950">Практика гистологии</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Тренажёр и диагностикум, свои препараты, кровь и повторение — по вкладкам.
          </p>
        </div>
        <a href={lectureHref} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50">
          <BookOpen className="h-4 w-4" /> Лекции
        </a>
      </header>

      <div role="tablist" aria-label="Разделы практики" className="sticky top-2 z-10 -mx-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 px-2 py-2 backdrop-blur">
        <div className="flex flex-nowrap items-center gap-1.5">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={
                  "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition " +
                  (active
                    ? "border-transparent bg-indigo-600 text-white"
                    : "border-[var(--border)] bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700")
                }
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "trainer" && <HistologyTrainer embedded />}

      {tab === "mine" && (
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-slate-950">Свои препараты</h2>
          <MyPreparations subjectSlug="histology" />
        </section>
      )}

      {tab === "blood" && (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Тренажёры крови">
            {BLOOD_TABS.map((item) => {
              const active = bloodTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBloodTab(item.id)}
                  className={
                    "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                    (active
                      ? "border-indigo-400 bg-indigo-50 text-indigo-800"
                      : "border-[var(--border)] bg-white text-slate-600 hover:border-indigo-200")
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {bloodTab === "leukocytes" && (
            <LeukocyteDifferentialTrainer raw={JSON.stringify({ title: "Лейкоцитарная формула — тренажёр", mode: "case", sourceMode: "mixed", rounds: 12 })} />
          )}
          {bloodTab === "norms" && <BloodNormTableTrainer />}
          {bloodTab === "meaning" && <BloodMeaningTrainer />}
          {bloodTab === "blood-preparations" && <BloodPreparationTrainer />}
        </section>
      )}

      {tab === "srs" && (
        <section className="space-y-4">
          <h2 className="text-lg font-extrabold text-slate-950">Карточки SRS</h2>
          <SrsPanel />
        </section>
      )}
    </div>
  );
}

export default SubjectTrainersHub;
