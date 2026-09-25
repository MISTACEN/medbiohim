"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, SkipForward, X } from "lucide-react";
import {
  createSession,
  getTrainerImageUrl,
  prefetchTrainerImages,
  listSessions,
  updateSession,
} from "@/lib/api";
import { listTrainerFeed, submitTrainerAnswer, type TrainerCard } from "@/lib/content-api";

type Mode = "all" | "preparation" | "electronogram" | "electronogram_label";
type Experience = "study" | "prepare" | "exam";

const shuffle = <T,>(a: T[]): T[] => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

export default function HistologyTrainerPage() {
  const [cards, setCards] = useState<TrainerCard[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<boolean | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [mode, setMode] = useState<Mode>("all");
  const [experience, setExperience] = useState<Experience>("prepare");
  const [questionCount, setQuestionCount] = useState(20);
  const [practiceCards, setPracticeCards] = useState<TrainerCard[]>([]);
  const [examCards, setExamCards] = useState<TrainerCard[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<string, { optionId: string; correct: boolean }>>({});
  const [examFinished, setExamFinished] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    void listTrainerFeed("histology", "mbh", 500).then((r) => {
      if (!r.ok) {
        setError(r.error.message);
        setLoading(false);
        return;
      }
      setCards(r.data.items || []);
      setLoading(false);
    });
  }, []);

  const base = useMemo(() => {
    let a = mode === "all" ? cards : cards.filter((c) => c.mode_set === mode);
    const shuffled = shuffle(a);
    if (questionCount > 0 && questionCount < 500) {
      return shuffled.slice(0, Math.min(questionCount, shuffled.length));
    }
    return shuffled;
  }, [cards, mode, questionCount]);

  useEffect(() => {
    setIndex(0);
    setSelected(null);
    setResult(null);
    setShowAnswer(false);
    if (experience === "exam") {
      setExamCards(base);
      setExamAnswers({});
      setExamFinished(false);
    } else {
      setPracticeCards(base);
      setExamCards([]);
    }
    const ref = `histology:mbh:${mode}:${experience}:n${questionCount}`;
    void (async () => {
      const list = await listSessions("in_progress");
      if (list.ok) {
        const match = (list.data.items || []).find(
          (s: any) => String(s.type) === "histology_feed" && String(s.ref_id) === ref,
        );
        if (match?.id) {
          setSessionId(String(match.id));
          setIndex(Number(match.current_index) || 0);
          return;
        }
      }
      const created = await createSession({
        type: "histology_feed",
        ref_id: ref,
        title: `Гистология · ${mode} · ${experience}`,
        current_index: 0,
        answers: {},
        payload: { mode, experience, questionCount, cardIds: base.map((c) => c.id) },
      });
      if (created.ok && (created.data as any).session?.id) {
        setSessionId(String((created.data as any).session.id));
      }
    })();
  }, [experience, base, mode, questionCount]);

  const visible = experience === "exam" ? examCards : practiceCards;
  const card: any = visible[index];

  useEffect(() => {
    let alive = true;
    setCurrentImage(null);
    setImageFailed(false);
    if (!card) {
      setImageLoading(false);
      return;
    }
    setImageLoading(true);
    void getTrainerImageUrl(card.id).then((url) => {
      if (!alive) return;
      setCurrentImage(url);
      setImageFailed(!url);
      setImageLoading(false);
    });
    prefetchTrainerImages([visible[index + 1]?.id, visible[index + 2]?.id]);
    return () => {
      alive = false;
    };
  }, [card?.id, index, visible]);

  useEffect(() => {
    if (!sessionId) return;
    void updateSession(sessionId, {
      current_index: index,
      payload: { mode, experience, questionCount, cardIds: visible.map((c) => c.id) },
    });
  }, [index, sessionId]);

  const options = Array.isArray(card?.question?.options) ? card.question.options : [];
  const answered = result !== null || (experience === "exam" && !!examAnswers[card?.id]);

  const reset = () => {
    setSelected(null);
    setResult(null);
    setShowAnswer(false);
    setStartedAt(Date.now());
  };

  async function answer(id: string) {
    if (!card || answered) return;
    setSelected(id);
    const correct = options.some((o: any) => o.id === id && o.correct === true);
    if (experience === "exam") {
      setExamAnswers((v) => ({ ...v, [card.id]: { optionId: id, correct }));
      return;
    }
    const r = await submitTrainerAnswer({
      card_id: card.id,
      option_id: id,
      time_ms: Date.now() - startedAt,
    });
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    setResult(r.data.correct);
    setShowAnswer(true);
  }

  function next() {
    setIndex((i) => (visible.length ? (i + 1) % visible.length : 0));
    reset();
  }

  async function finish() {
    for (const c of visible) {
      const a = examAnswers[c.id];
      if (a) await submitTrainerAnswer({ card_id: c.id, option_id: a.optionId, time_ms: 0 });
    }
    setExamFinished(true);
    if (sessionId) void updateSession(sessionId, { status: "finished" });
  }

  if (loading) return <div className="card p-6 text-sm text-slate-500">Загрузка тренажёра…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">
            <ArrowLeft className="h-4 w-4" />К предметам
          </Link>
          <h1 className="page-title mt-3">Тренажёр препаратов и электронограмм</h1>
          <p className="page-subtitle">Ответ по имени файла не показывается. Фото кэшируются.</p>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["study", "prepare", "exam"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setExperience(id)}
            className={"rounded-xl px-3 py-2 text-sm font-semibold " + (experience === id ? "bg-indigo-600 text-white" : "border bg-white")}
          >
            {id === "study" ? "Изучение" : id === "prepare" ? "Подготовка" : "Экзамен"}
          </button>
        ))}
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="rounded-xl border bg-white px-3 py-2 text-sm">
          <option value="all">Все</option>
          <option value="preparation">Микропрепараты</option>
          <option value="electronogram">Электронограммы</option>
        </select>
        <select value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))} className="rounded-xl border bg-white px-3 py-2 text-sm">
          {[5, 10, 20, 30, 50, 100].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value={500}>Все</option>
        </select>
        <span className="ml-auto text-xs text-slate-500">{visible.length} карточек</span>
      </div>

      {!card ? (
        <div className="card p-8 text-center text-sm text-slate-500">Карточки пока недоступны.</div>
      ) : examFinished ? (
        <div className="card p-6">
          <h2 className="text-2xl font-bold">Экзамен завершён</h2>
          <p className="mt-2">Правильно: {Object.values(examAnswers).filter((x) => x.correct).length} / {visible.length}</p>
          <button type="button" className="btn-primary mt-5" onClick={() => setExperience("exam")}>Ещё раз</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex justify-between border-b bg-slate-50 px-5 py-3 text-xs text-slate-500">
            <span>Карточка {index + 1} / {visible.length}</span>
            <span>МБХ</span>
          </div>
          <div className="grid lg:grid-cols-[1.15fr_.85fr]">
            <div className="relative flex min-h-[360px] items-center justify-center bg-slate-100">
              {currentImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentImage} alt="Гистологический препарат" className="h-full min-h-[360px] w-full object-contain" draggable={false} />
              ) : imageLoading ? (
                <div className="flex flex-col items-center gap-3 p-6 text-sm text-slate-500">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
                  <span>Загрузка фото…</span>
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-slate-500">
                  <b>{imageFailed ? "Изображение временно недоступно" : "Фото ещё не загружено"}</b>
                  <div className="mt-2 text-xs text-slate-400">Название файла не показывается — определите препарат по снимку.</div>
                </div>
              )}
            </div>
            <div className="space-y-4 p-5">
              <h2 className="text-xl font-bold">
                {card.mode_set === "preparation" ? "Какой это препарат?" : card.question?.prompt || "Что изображено?"}
              </h2>
              {experience === "study" && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
                  <b>Эталон:</b> {card.preparation?.name || options.find((o: any) => o.correct)?.label || "—"}
                </div>
              )}
              <div className="space-y-2">
                {options.map((o: any) => {
                  const good = showAnswer && o.correct;
                  const bad = showAnswer && selected === o.id && !o.correct;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={answered}
                      onClick={() => void answer(o.id)}
                      className={
                        "flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm " +
                        (good ? "border-emerald-400 bg-emerald-50" : bad ? "border-rose-400 bg-rose-50" : selected === o.id ? "border-indigo-400 bg-indigo-50" : "hover:bg-slate-50")
                      }
                    >
                      {good ? <Check className="h-4 w-4" /> : bad ? <X className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border" />}
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {showAnswer && experience === "prepare" && (
                <div className={"rounded-xl p-4 text-sm " + (result ? "bg-emerald-50" : "bg-rose-50")}>
                  <b>{result ? "Правильно" : "Неверно"}</b>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {!answered && experience !== "exam" && (
                  <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    <SkipForward className="h-4 w-4" />Пропустить
                  </button>
                )}
                {answered && <button type="button" onClick={next} className="btn-primary">Следующая</button>}
                {experience === "exam" && index === visible.length - 1 && Object.keys(examAnswers).length === visible.length && (
                  <button type="button" onClick={() => void finish()} className="btn-primary">Завершить</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
