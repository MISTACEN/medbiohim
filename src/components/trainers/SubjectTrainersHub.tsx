"use client";

/**
 * Практика предмета — одна страница вместо «хаба тренажёров».
 *
 * Раньше здесь был список карточек-упражнений: чтобы что-то сделать, нужно было
 * сначала выбрать пункт меню, а потом ещё раз «назад ко всем темам». Теперь все
 * тренажёры предмета открыты сразу и идут подряд: микропрепараты с атласом и
 * диагностикумом, лейкоцитарная формула, нормы, ответ по смыслу, препараты
 * крови и карточки SRS. Навигация — якорные чипы сверху, без перезагрузки
 * экрана и без промежуточного меню.
 */
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Brain, Check, Droplets, Flame, FlaskConical, ImagePlus, Microscope, RotateCcw, Sparkles, Table2 } from "lucide-react";
import MyPreparations from "@/components/trainers/MyPreparations";
import Labs from "@/components/Labs";
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

/** Разделы страницы: id — якорь, по нему прыгают чипы навигации. */
const SECTIONS: Array<{ id: string; label: string; Icon: typeof Droplets }> = [
  { id: "histology-atlas", label: "Препараты и диагностикум", Icon: Microscope },
  { id: "my-preparations", label: "Свои препараты", Icon: ImagePlus },
  { id: "leukocytes", label: "Лейкоцитарная формула", Icon: Droplets },
  { id: "norms", label: "Возрастные нормы", Icon: Table2 },
  { id: "meaning", label: "Ответ по смыслу", Icon: Sparkles },
  { id: "blood-preparations", label: "Микропрепараты крови", Icon: Microscope },
  { id: "labs", label: "Лабораторные", Icon: FlaskConical },
  { id: "srs", label: "Карточки SRS", Icon: Brain },
];

function SectionHeader({
  id, step, title, hint, Icon,
}: {
  id: string;
  step: string;
  title: string;
  hint: string;
  Icon: typeof Droplets;
}) {
  return (
    <div id={id} className="scroll-mt-24 sm:scroll-mt-28">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">{step}</p>
          <h2 className="mt-0.5 text-lg font-extrabold text-slate-950 sm:text-xl">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">{hint}</p>
        </div>
      </div>
    </div>
  );
}

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
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Лекция → практика</p>
            <h2 className="mt-1 text-xl font-extrabold text-slate-950">Все тренажёры гистологии на одной странице</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Никаких переходов между пунктами меню: атлас, тренажёр и разбор препарата работают по одному банку
              препаратов, а методички открываются прямо в карточке. Ниже — формула крови, нормы, ответы по смыслу,
              препараты крови, лабораторные и карточки повторения.
            </p>
          </div>
          <a href={lectureHref} className="hidden shrink-0 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-50 sm:inline-flex">
            <BookOpen className="h-4 w-4" /> Лекции
          </a>
        </div>
      </header>

      <nav aria-label="Разделы практики" className="sticky top-2 z-10 -mx-1 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 px-2 py-2 backdrop-blur">
        <div className="flex flex-nowrap items-center gap-1.5">
          {SECTIONS.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={"#" + id}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700"
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </a>
          ))}
        </div>
      </nav>

      <section className="space-y-4">
        <SectionHeader
          id="histology-atlas"
          step="Раздел 1"
          title="Микропрепараты, тренажёр и диагностикум"
          hint="Один банк препаратов: посмотреть атлас, пройти карточки и определить препарат в диагностикуме — без перехода на другую страницу."
          Icon={Microscope}
        />
        <HistologyTrainer embedded />
        <MyPreparations subjectSlug="histology" />
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-6">
        <SectionHeader
          id="leukocytes"
          step="Раздел 2"
          title="Лейкоцитарная формула"
          hint="Опознать клетку, оценить её долю в формуле и объяснить отклонение от нормы."
          Icon={Droplets}
        />
        <LeukocyteDifferentialTrainer raw={JSON.stringify({ title: "Лейкоцитарная формула — тренажёр", mode: "case", sourceMode: "mixed", rounds: 12 })} />
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-6">
        <SectionHeader
          id="norms"
          step="Раздел 3"
          title="Возрастные нормы крови"
          hint="Заполнить таблицу показателей по возрастам и сразу увидеть, где ошиблись."
          Icon={Table2}
        />
        <BloodNormTableTrainer />
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-6">
        <SectionHeader
          id="meaning"
          step="Раздел 4"
          title="Ответ по смыслу"
          hint="Сформулировать содержание лекции своими словами — тренажёр сверит смысл, а не дословный текст."
          Icon={Sparkles}
        />
        <BloodMeaningTrainer />
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-6">
        <SectionHeader
          id="blood-preparations"
          step="Раздел 5"
          title="Микропрепараты крови"
          hint="Узнать клетку по реальному препарату и объяснить её признаки."
          Icon={Microscope}
        />
        <BloodPreparationTrainer />
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-6">
        <SectionHeader
          id="labs"
          step="Раздел 6"
          title="Лабораторные"
          hint="Интерактивные практикумы: выбрать лабораторную, пройти сессию по заданиям и увидеть прогресс — без перехода в отдельный раздел."
          Icon={FlaskConical}
        />
        <Labs />
      </section>

      <section className="space-y-4 border-t border-[var(--border)] pt-6">
        <SectionHeader
          id="srs"
          step="Раздел 7"
          title="Карточки SRS"
          hint="Интервальное повторение терминов и фактов: общая колода и свои карточки."
          Icon={Brain}
        />
        <SrsPanel />
      </section>
    </div>
  );
}

export default SubjectTrainersHub;
