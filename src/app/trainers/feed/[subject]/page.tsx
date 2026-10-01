"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, CircleHelp, ListChecks, Loader2, RotateCcw, SkipForward } from "lucide-react";
import { answerTrainerCard, getTrainerFeed, getTrainerImageUrl, hasToken, type TrainerFeedCard } from "@/lib/api";
import { compareLessons, emPlanRank, isElectronogramCard, lessonKeyOf } from "@/lib/histologyOrder";
import { AtlasThumb } from "@/components/trainers/HistologyTrainerParts";

const HISTO_PLAN_ORDER = [
  ["клетка и ее пр. животная","Клетка животная"],["симпласт","Симпласт"],["межклет","Межклеточное"],["гольдж","Аппарат Гольджи"],["липид","Липидные включения"],["гликоген","Гликоген"],["ядро","Ядро"],["митоз","Митоз"],["тимидин","Тимидин"],["сперматозоид","Сперматозоиды"],["яйцеклет","Яйцеклетка"],["зародышевых лист","зародышевых лист"],["осевых органов","осевых органов"],["мезотел","Мезотелий"],["цилиндрический эпител","Цилиндрический"],["многорядн","Многорядный"],["многослойный плос","Многослойный плос"],["переходный","Переходный"],["мезенхим","Мезенхима"],["кровь","Кровь человека"],["рыхлая волокнист","Рыхлая волокнист"],["фибробласт","Фибробласт"],["эластические волок","Эластические волокна"],["ретикуляр","Ретикулярная"],["жиров","Жировая"],["пигмент","Пигмент"],["сухожил","Сухожилие"],["гиалинов","Гиалинов"],["волокнистый хрящ","Волокнистый"],["эластический хрящ","Эластический"],["трубчатая кость","Трубчатая кость"],["развитие кости","Развитие кости"],["гладкая мыш","Гладкая мыш"],["поперечно-полосат","Поперечно-полосат"],["сердечн","Сердечная"],["нейрофибрил","Нейрофибрил"],["тигроид","Тигроид"],["астроцит","Астроцит"],["миелин","Миелин"],["тактильн","Тактильное"],["пластинчат","Пластинчатое"],["спинной мозг","Спинной мозг"],["спинальный ганг","Спинальный ганг"],["периферический нерв","Периферический нерв"],["кора больших","Кора больших"],["кора мозжеч","Кора мозжеч"],["грушевид","Грушевид"],["передняя часть","Передняя часть"],["задняя стенка","Задняя стенка"],["развитие глаза","Развитие глаза"],["вкусовая почка","Вкусовая почка"],["улитка","Улитка"]
] as const;
const histologyPlanRank = (card: TrainerFeedCard) => {
  const name = String(card.preparation?.name || "").toLowerCase();
  const idx = HISTO_PLAN_ORDER.findIndex(([needle]) => name.includes(needle));
  return idx === -1 ? 9999 : idx;
};
// Общий порядок: сначала микропрепараты по плану, затем блок электронограмм
// в фиксированном порядке атласа (три ряда, заданы методистом).
const cardRank = (card: TrainerFeedCard) =>
  isElectronogramCard(card) ? 100000 + emPlanRank(card) : histologyPlanRank(card);
const sortCardsByPlan = (items: TrainerFeedCard[]) =>
  [...items].sort((a, b) => cardRank(a) - cardRank(b) || String(a.preparation?.name || "").localeCompare(String(b.preparation?.name || ""), "ru"));

type PickFilter = "all" | "preparation" | "electronogram";

export default function TrainerFeedPage({ params }: { params: Promise<{ subject: string }> }) {
  const [subject, setSubject] = useState("histology");
  const [allCards, setAllCards] = useState<TrainerFeedCard[]>([]);
  const [queue, setQueue] = useState<TrainerFeedCard[] | null>(null); // null = экран выбора
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [pickFilter, setPickFilter] = useState<PickFilter>("all");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const startedAt = useMemo(() => Date.now(), [index]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await params;
      if (cancelled) return;
      const slug = p.subject || "histology";
      setSubject(slug);
      if (!hasToken()) { setNote("Войдите, чтобы проходить тренажёр."); setLoading(false); return; }
      const r = await getTrainerFeed(slug, "mbh", 500, 0);
      if (cancelled) return;
      if (r.ok) setAllCards(slug === "histology" ? sortCardsByPlan(r.data.items || []) : (r.data.items || [])); else setNote(r.error.message);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [params]);

  const card = queue ? queue[index] : undefined;

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    if (!card) return;
    setImageLoading(true);
    void getTrainerImageUrl(card.id).then((url) => {
      if (!cancelled) setImageUrl(url);
    }).finally(() => {
      if (!cancelled) setImageLoading(false);
    });
    return () => { cancelled = true; };
  }, [card?.id]);

  // --- выбор карточек ---
  const prepCount = useMemo(() => allCards.filter((c) => !isElectronogramCard(c)).length, [allCards]);
  const emCount = allCards.length - prepCount;
  const pickedCount = useMemo(() => allCards.reduce((n, c) => n + (picked[c.id] ? 1 : 0), 0), [allCards, picked]);

  const pickerGroups = useMemo(() => {
    const visible = allCards.filter((c) =>
      pickFilter === "all" ? true : pickFilter === "electronogram" ? isElectronogramCard(c) : !isElectronogramCard(c));
    const map = new Map<string, TrainerFeedCard[]>();
    for (const c of visible) {
      const key = lessonKeyOf(c);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return Array.from(map.entries())
      .sort((a, b) => compareLessons(a[0], b[0]))
      .map(([title, items]) => ({ title, items: sortCardsByPlan(items) }));
  }, [allCards, pickFilter]);

  const toggleCard = (id: string) =>
    setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = true; return n; });

  const toggleGroup = (items: TrainerFeedCard[]) =>
    setPicked((p) => {
      const n = { ...p };
      const allOn = items.every((c) => n[c.id]);
      for (const c of items) { if (allOn) delete n[c.id]; else n[c.id] = true; }
      return n;
    });

  function startRun(cards: TrainerFeedCard[]) {
    if (!cards.length) return;
    setQueue(cards);
    setIndex(0);
    setSelected(null);
    setResult(null);
  }
  const startPicked = () => startRun(sortCardsByPlan(allCards.filter((c) => picked[c.id])));
  const startAll = () => startRun(sortCardsByPlan(allCards));
  const backToPicker = () => { setQueue(null); setIndex(0); setSelected(null); setResult(null); };

  async function choose(optionId: string) {
    if (!card || busy || result !== null) return;
    setSelected(optionId);
    setBusy(true);
    const r = await answerTrainerCard({ card_id: card.id, option_id: optionId, time_ms: Date.now() - startedAt });
    if (r.ok) setResult(r.data.correct); else setNote(r.error.message);
    setBusy(false);
  }

  async function skip() {
    if (!card || busy || result !== null) return;
    setBusy(true);
    const r = await answerTrainerCard({ card_id: card.id, is_skipped: true, time_ms: Date.now() - startedAt });
    if (!r.ok) setNote(r.error.message);
    next();
    setBusy(false);
  }

  function next() {
    if (!queue) return;
    setIndex((i) => (i + 1) % Math.max(queue.length, 1));
    setSelected(null);
    setResult(null);
  }

  if (!hasToken()) return <div className="card mx-auto mt-10 max-w-md p-8 text-center"><p className="text-slate-600">Войдите, чтобы проходить тренажёр.</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;
  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загружаем тренажёр…</div>;
  if (!allCards.length) return <div className="card mx-auto mt-10 max-w-2xl p-8 text-center"><CircleHelp className="mx-auto h-8 w-8 text-indigo-500" /><h1 className="mt-3 text-xl font-bold">Тренажёр пока пуст</h1><p className="mt-2 text-sm text-slate-500">Для предмета «{subject}» опубликованные карточки ещё не импортированы.</p>{note && <p className="mt-2 text-sm text-rose-500">{note}</p>}<Link href="/subjects" className="btn-primary mt-5 inline-flex">К предметам</Link></div>;

  // --- Экран выбора карточек ---
  if (!queue) {
    return (
      <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950 text-white">
        <div className="mx-auto max-w-5xl px-4 pb-32 sm:px-6">
          <header className="flex items-center justify-between gap-3 py-3">
            <Link href="/subjects" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"><ArrowLeft className="h-4 w-4" /> Предметы</Link>
            <div className="text-center"><div className="text-xs uppercase tracking-[0.2em] text-white/50">Гистология · МБХ</div><div className="mt-1 text-sm font-semibold">Выбор карточек</div></div>
            <div className="w-[92px]" />
          </header>

          <p className="mt-2 text-sm text-white/60">Отметь конкретные препараты и электронограммы для тренировки — или жми «Все подряд». Карточки сгруппированы по темам занятий.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {([["all", `Все · ${allCards.length}`], ["preparation", `Препараты · ${prepCount}`], ["electronogram", `Электронограммы · ${emCount}`]] as [PickFilter, string][]).map(([f, label]) => (
              <button key={f} type="button" onClick={() => setPickFilter(f)} className={"rounded-xl border px-4 py-2 text-sm font-semibold transition " + (pickFilter === f ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10")}>{label}</button>
            ))}
          </div>

          <div className="mt-5 space-y-6">
            {pickerGroups.map(({ title, items }) => {
              const allOn = items.every((c) => picked[c.id]);
              const someOn = items.some((c) => picked[c.id]);
              return (
                <section key={title}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-white/90">{title} <span className="ml-1 font-normal text-white/40">· {items.length}</span></h2>
                    <button type="button" onClick={() => toggleGroup(items)} className={"inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition " + (allOn ? "border-indigo-400 bg-indigo-500/20 text-indigo-200" : "border-white/15 text-white/60 hover:bg-white/10")}>
                      <ListChecks className="h-3.5 w-3.5" />{allOn ? "Снять тему" : someOn ? "Выбрать всю тему" : "Выбрать всю тему"}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {items.map((c) => {
                      const on = !!picked[c.id];
                      const em = isElectronogramCard(c);
                      return (
                        <button key={c.id} type="button" onClick={() => toggleCard(c.id)} className={"relative overflow-hidden rounded-xl border text-left transition " + (on ? "border-indigo-400 ring-2 ring-indigo-400/60" : "border-white/10 hover:border-white/30")}>
                          <div className="aspect-square bg-slate-800"><AtlasThumb id={String(c.id)} /></div>
                          <div className="bg-slate-900 p-2 text-xs font-medium text-white/90 line-clamp-2">{c.preparation?.name || "Препарат"}</div>
                          <span className={"absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur " + (em ? "bg-violet-500/70 text-white" : "bg-black/55 text-white/85")}>{em ? "ЭМ" : "Препарат"}</span>
                          {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow"><Check className="h-4 w-4" /></span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-slate-950/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="text-sm text-white/70">Выбрано: <b className="text-white">{pickedCount}</b></div>
            <div className="flex gap-2">
              <button type="button" onClick={startAll} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10">Все подряд ({allCards.length})</button>
              <button type="button" disabled={pickedCount === 0} onClick={startPicked} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40">Начать ({pickedCount})</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!card) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 text-white">
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={backToPicker} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"><ArrowLeft className="h-4 w-4" /> Выбор</button>
          <div className="text-center"><div className="text-xs uppercase tracking-[0.2em] text-white/50">Гистология · МБХ</div><div className="mt-1 text-sm font-semibold">{index + 1} / {queue.length}</div></div>
          <button type="button" onClick={() => { setIndex(0); setSelected(null); setResult(null); }} className="rounded-xl bg-white/10 p-2 hover:bg-white/15" aria-label="Начать сначала"><RotateCcw className="h-4 w-4" /></button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="relative aspect-[4/3] bg-slate-900">
                {imageUrl ? (
                  <img src={imageUrl} alt={card.preparation?.name || "Препарат"} className="h-full w-full object-contain" />
                ) : imageLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-white/60">Загружаем изображение…</div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/60">
                    <span>Изображение пока недоступно</span>
                    <span className="text-xs">Медиа-файл должен быть установлен в content/histology.</span>
                  </div>
                )}
                <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold backdrop-blur">{card.mode_set === "electronogram" ? "Электронограмма" : "Препарат"}</div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 pb-2 pt-8">
                  <div className="text-sm font-bold text-white">{card.preparation?.name || "Препарат"}</div>
                  {card.preparation?.stain ? <div className="text-[11px] text-white/70">{card.preparation.stain}</div> : null}
                </div>
              </div>
              <div className="p-5 text-slate-900 sm:p-7">
                <div className="text-xs font-semibold uppercase tracking-wider text-indigo-500">{card.preparation?.name || "Препарат"}</div>
                <h1 className="mt-2 text-xl font-extrabold sm:text-2xl">{card.question?.prompt || "Что изображено?"}</h1>
                <div className="mt-5 grid gap-2">
                  {(card.question?.options || []).map((option) => {
                    const active = selected === option.id;
                    const correct = result !== null && option.correct;
                    return <button key={option.id} type="button" disabled={busy || result !== null} onClick={() => void choose(option.id)} className={"rounded-2xl border px-4 py-3 text-left text-sm transition " + (correct ? "border-emerald-400 bg-emerald-50 text-emerald-800" : active && result === false ? "border-rose-400 bg-rose-50 text-rose-800" : active ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-slate-200 hover:bg-slate-50")}>{option.label}</button>;
                  })}
                </div>
                {result !== null && <div className={"mt-5 rounded-2xl p-4 text-sm " + (result ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}><div className="flex items-center gap-2 font-bold">{result ? <CheckCircle2 className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}{result ? "Правильно" : "Неверно"}</div>{result ? (
                  <p className="mt-2">Эталон не показываем — ты ответил правильно.</p>
                ) : (
                  <>
                    <p className="mt-2">Показываем эталонный разбор.</p>
                    {card.hotspots?.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{card.hotspots.map((h, i) => <div key={String(h.id || i)} className="rounded-xl bg-white/70 p-2"><span className="font-semibold">{String(h.id || "")}</span><span className="ml-2">{String(h.label || h.title || "")}</span></div>)}</div>}
                    {card.question?.explanation && <p className="mt-3 leading-6">{card.question.explanation}</p>}
                  </>
                )}</div>}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <button type="button" disabled={busy || result !== null} onClick={() => void skip()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><SkipForward className="h-4 w-4" /> Пропустить</button>
                  {result !== null && <button type="button" onClick={next} className="btn-primary inline-flex items-center gap-2">Следующая <ChevronRight className="h-4 w-4" /></button>}
                </div>
              </div>
            </div>
            {note && <div className="mt-3 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{note}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
