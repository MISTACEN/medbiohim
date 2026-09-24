"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Eye, FileText, SkipForward, X } from "lucide-react";
import { listTrainerFeed, submitTrainerAnswer, type TrainerCard } from "@/lib/content-api";

type Mode = "all" | "preparation" | "electronogram" | "electronogram_label";
type Experience = "study" | "prepare" | "exam";

export default function HistologyTrainerPage() {
  const [cards, setCards] = useState<TrainerCard[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now);
  const [mode, setMode] = useState<Mode>("all");
  const [experience, setExperience] = useState<Experience>("prepare");
  const [examAnswers, setExamAnswers] = useState<Record<string, { optionId: string; correct: boolean }>>({});
  const [examFinished, setExamFinished] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [labelChecked, setLabelChecked] = useState(false);

  useEffect(() => {
    void listTrainerFeed("histology", "mbh", 500).then(r => {
      if (r.ok) setCards(r.data.items || []);
      else setError(r.error.message);
      setLoading(false);
    });
  }, []);

  const visibleCards = useMemo(
    () => mode === "all" ? cards : cards.filter(c => c.mode_set === mode),
    [cards, mode]
  );
  const card: any = visibleCards[index];
  const options = Array.isArray(card?.question?.options) ? card.question.options : [];
  const labelItems = Array.isArray(card?.hotspots) ? card.hotspots : [];
  const answered = result !== null || labelChecked || (experience === "exam" && !!examAnswers[card?.id]);

  function resetCard() {
    setSelected(null);
    setResult(null);
    setShowAnswer(false);
    setLabels({});
    setLabelChecked(false);
    setStartedAt(Date.now());
  }

  function changeMode(next: Mode) {
    setMode(next);
    setIndex(0);
    resetCard();
  }

  async function answer(optionId: string) {
    if (!card || answered) return;
    setSelected(optionId);
    const r = await submitTrainerAnswer({ card_id: card.id, option_id: optionId, time_ms: Date.now() - startedAt });
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    setResult(r.data.correct);
    setShowAnswer(true);
  }

  async function skip() {
    if (!card || answered) return;
    await submitTrainerAnswer({ card_id: card.id, is_skipped: true, time_ms: Date.now() - startedAt });
    next();
  }

  async function finishExam() {
    if (!visibleCards.length) return;
    for (const c of visibleCards) {
      const a = examAnswers[c.id];
      if (a) await submitTrainerAnswer({ card_id: c.id, option_id: a.optionId, time_ms: 0 });
    }
    setExamFinished(true);
  }

  function next() {
    setIndex(i => visibleCards.length ? (i + 1) % visibleCards.length : 0);
    resetCard();
  }

  function checkLabels() {
    if (!labelItems.length) return;
    setLabelChecked(true);
  }

  if (loading) return <div className="card p-6 text-sm text-slate-500">Загрузка тренажёра…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">
            <ArrowLeft className="h-4 w-4" />К предметам
          </Link>
          <div className="mt-3 text-xs font-bold uppercase tracking-wider text-indigo-500">Только МБХ · Гистология</div>
          <h1 className="page-title">Тренажёр препаратов и электронограмм</h1>
          <p className="page-subtitle">Изучение → подготовка → экзамен. Для экзамена правильные ответы открываются только после завершения.</p>
        </div>
        <Link href="/materials?subject_slug=histology" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />Материалы
        </Link>
      </header>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {!card ? (
        <div className="card p-8 text-center text-sm text-slate-500">Карточки пока недоступны для этой специальности.</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Формат:</span>
            {([
              ["study", "📚 Изучение"],
              ["prepare", "🎯 Подготовка"],
              ["exam", "📝 Экзамен"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setExperience(id); setIndex(0); setExamAnswers({}); setExamFinished(false); resetCard(); }}
                className={"rounded-xl px-3 py-2 text-sm font-semibold " + (experience === id ? "bg-indigo-600 text-white" : "border bg-white text-slate-700 hover:bg-slate-50") + (id === "electronogram_label" && cards.filter(c => c.mode_set === "electronogram_label").length === 0 ? " opacity-50 cursor-not-allowed" : "")}>
                {label}
              </button>
            ))}
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <span className="text-sm font-semibold text-slate-700">Материал:</span>
            {([
              ["all", "Все"],
              ["preparation", "Микропрепараты"],
              ["electronogram", "Электронограммы"],
              ["electronogram_label", "Заполнить подписи"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => changeMode(id)} disabled={id === "electronogram_label" && cards.filter(c => c.mode_set === "electronogram_label").length === 0}
                className={"rounded-xl px-3 py-2 text-sm font-semibold " + (mode === id ? "bg-indigo-600 text-white" : "border bg-white text-slate-700 hover:bg-slate-50")}>
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-500">{visibleCards.length} карточек</span>
          </div>

          {examFinished ? (
            <div className="card p-8">
              <h2 className="text-2xl font-bold">Экзамен завершён</h2>
              <p className="mt-2 text-slate-600">Правильные ответы теперь открыты для разбора.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Вопросов</div><b className="text-xl">{visibleCards.length}</b></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Отвечено</div><b className="text-xl">{Object.keys(examAnswers).length}</b></div>
                <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Правильно</div><b className="text-xl">{Object.values(examAnswers).filter(a => a.correct).length}</b></div>
              </div>
              <div className="mt-6 space-y-3">
                {visibleCards.map((c: any, i) => <div key={c.id} className="rounded-xl border p-4"><div className="text-xs text-slate-500">Вопрос {i + 1}</div><div className="font-semibold">{c.question?.prompt || "Что изображено?"}</div><div className="mt-1 text-sm"><b>Эталон:</b> {c.preparation?.name || c.question?.options?.find((o: any) => o.correct)?.label || "—"}</div></div>)}
              </div>
            </div>
          ) : (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-3 text-xs text-slate-500">
              <span>Карточка {index + 1} / {visibleCards.length}</span>
              <span>{card.mode_set === "electronogram_label" ? "Электронограмма · подписи" : card.mode_set === "electronogram" ? "Электронограмма" : "Микропрепарат"} · МБХ</span>
            </div>

            <div className="grid gap-0 lg:grid-cols-[1.15fr_.85fr]">
              <div className="relative flex min-h-[360px] items-center justify-center bg-slate-100">
                <img
                  src={card.preparation?.imageUrl || ("/api/v1/trainers/feed/" + encodeURIComponent(card.id) + "/image")}
                  alt={card.preparation?.name || "Препарат"}
                  className="h-full min-h-[360px] w-full object-contain"
                />
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{experience === "study" ? (card.preparation?.name || "Препарат") : card.mode_set === "preparation" ? "Микропрепарат · определение по фото" : card.preparation?.organ || "Препарат"}</div>
                  <h2 className="mt-1 text-xl font-bold">{card.mode_set === "preparation" ? "Какой это препарат?" : card.question?.prompt || "Что изображено?"}</h2>
                </div>

                {card.question?.mode === "label_fill" ? (
                  <div className="space-y-3">
                    {labelItems.map((item: any) => (
                      <div key={item.id} className="rounded-xl border bg-white p-3">
                        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Метка {item.id}</div>
                        <input
                          value={labels[item.id] || ""}
                          disabled={labelChecked}
                          onChange={e => setLabels(v => ({ ...v, [item.id]: e.target.value }))}
                          placeholder="Введите название структуры"
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                        {labelChecked && <div className="mt-2 text-xs text-slate-600">Эталон: <b>{item.label}</b></div>}
                      </div>
                    ))}
                    <button type="button" disabled={labelChecked || labelItems.some((x: any) => !(labels[x.id] || "").trim())} onClick={checkLabels} className="btn-primary">
                      Проверить подписи
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {options.map((o: any) => {
                      const good = showAnswer && o.correct;
                      const bad = showAnswer && selected === o.id && !o.correct;
                      return (
                        <button key={o.id} type="button" disabled={answered} onClick={() => void answer(o.id)}
                          className={"flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition " + (good ? "border-emerald-400 bg-emerald-50" : bad ? "border-rose-400 bg-rose-50" : selected === o.id ? "border-indigo-400 bg-indigo-50" : "hover:bg-slate-50")}>
                          {good ? <Check className="h-4 w-4 text-emerald-600" /> : bad ? <X className="h-4 w-4 text-rose-600" /> : <span className="h-4 w-4 rounded-full border" />}
                          <span>{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {labelChecked && <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">Сверьте каждую подпись с эталоном. Это экзаменационный режим заполнения, а не угадывание варианта.</div>}

                {(showAnswer || experience === "study") && (<div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950"><b>Эталон:</b> {card.preparation?.name || card.question?.options?.find((o: any) => o.correct)?.label || "Название не указано"}</div>)}{showAnswer && experience !== "study" && (
                  <div className={"rounded-xl p-4 text-sm " + (result ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900")}>
                    <b>{result ? "Правильно" : "Неверно"}</b>
                    {card.question?.explanation && <p className="mt-1 leading-6">{card.question.explanation}</p>}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {!answered && <button type="button" onClick={() => void skip()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><SkipForward className="h-4 w-4" />Пропустить</button>}
                  {answered && <button type="button" onClick={next} className="btn-primary">Следующая</button>}
                  {experience === "exam" && !examFinished && index === visibleCards.length - 1 && Object.keys(examAnswers).length === visibleCards.length && <button type="button" onClick={() => void finishExam()} className="btn-primary">Завершить экзамен</button>}
                  {card.source_key && <Link href={"/materials/source?key=" + encodeURIComponent(card.source_key)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><Eye className="h-4 w-4" />Источник</Link>}
                </div>
              </div>
            </div>
          </div>
          )}
      )}
    </div>
  );
}
