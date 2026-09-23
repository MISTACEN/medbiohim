"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronRight, CircleHelp, Loader2, RotateCcw, SkipForward } from "lucide-react";
import { answerTrainerCard, getTrainerFeed, hasToken, type TrainerFeedCard } from "@/lib/api";

export default function TrainerFeedPage({ params }: { params: Promise<{ subject: string }> }) {
  const [subject, setSubject] = useState("histology");
  const [cards, setCards] = useState<TrainerFeedCard[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const startedAt = useMemo(() => Date.now(), [index]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await params;
      if (cancelled) return;
      const slug = p.subject || "histology";
      setSubject(slug);
      if (!hasToken()) { setNote("Войдите, чтобы проходить тренажёр."); setLoading(false); return; }
      const r = await getTrainerFeed(slug, "mbh", 100, 0);
      if (cancelled) return;
      if (r.ok) setCards(r.data.items || []); else setNote(r.error.message);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [params]);

  const card = cards[index];

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
    setIndex((i) => (i + 1) % Math.max(cards.length, 1));
    setSelected(null);
    setResult(null);
  }

  if (!hasToken()) return <div className="card mx-auto mt-10 max-w-md p-8 text-center"><p className="text-slate-600">Войдите, чтобы проходить тренажёр.</p><Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link></div>;
  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Загружаем тренажёр…</div>;
  if (!card) return <div className="card mx-auto mt-10 max-w-2xl p-8 text-center"><CircleHelp className="mx-auto h-8 w-8 text-indigo-500" /><h1 className="mt-3 text-xl font-bold">Тренажёр пока пуст</h1><p className="mt-2 text-sm text-slate-500">Для предмета «{subject}» опубликованные карточки ещё не импортированы.</p><Link href="/subjects" className="btn-primary mt-5 inline-flex">К предметам</Link></div>;

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 text-white">
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/subjects" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"><ArrowLeft className="h-4 w-4" /> Предметы</Link>
          <div className="text-center"><div className="text-xs uppercase tracking-[0.2em] text-white/50">Гистология · МБХ</div><div className="mt-1 text-sm font-semibold">{index + 1} / {cards.length}</div></div>
          <button type="button" onClick={() => { setIndex(0); setSelected(null); setResult(null); }} className="rounded-xl bg-white/10 p-2 hover:bg-white/15" aria-label="Начать сначала"><RotateCcw className="h-4 w-4" /></button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
              <div className="relative aspect-[4/3] bg-slate-900">
                <img src={"/api/v1/trainers/feed/" + encodeURIComponent(card.id) + "/image"} alt={card.preparation?.name || "Препарат"} className="h-full w-full object-contain" />
                <div className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold backdrop-blur">{card.mode_set === "electronogram" ? "Электронограмма" : "Препарат"}</div>
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
                {result !== null && <div className={"mt-5 rounded-2xl p-4 text-sm " + (result ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}><div className="flex items-center gap-2 font-bold">{result ? <CheckCircle2 className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}{result ? "Правильно" : "Неверно"}</div>{card.question?.explanation && <p className="mt-2 leading-6">{card.question.explanation}</p>}</div>}
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
