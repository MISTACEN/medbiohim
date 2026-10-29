"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Menu, Microscope } from "lucide-react";
import { getAccountSettings } from "@/lib/settings-api";
import {
  answerTrainingQuestion, cancelTraining, completeTraining, createHistologyTraining,
  getTraining, listTrainerFeed, listTrainings, type Training, type TrainingContentType,
  type TrainingLabelMode, type TrainingLayout, type TrainingQuestion,
} from "@/lib/content-api";
import { compareLessons, isElectronogramCard, lessonKeyOf } from "@/lib/histologyOrder";
import { HistologyQuestionCard } from "@/components/trainers/HistologyQuestionCard";
import { topicLabel, ImageBox, Dots, historyLabel } from "@/components/trainers/HistologyTrainerParts";
import { HistologyAtlas } from "@/components/trainers/HistologyAtlas";
import { groupAtlasCards } from "@/lib/histologyAtlas";
import { describeApiError } from "@/lib/errors";

type AnswerRow = {
  id: string;
  question_id: string;
  order: number;
  user_answer?: string | null;
  is_correct?: boolean | null;
  is_skipped?: boolean;
  options: Array<{ id: string; label: string; correct?: boolean }>;
  question_snapshot: TrainingQuestion;
  review_snapshot?: any;
};

function HistologyTrainerInner({ embedded = false }: { embedded?: boolean }) {
  const searchParams = useSearchParams();
  const [topics, setTopics] = useState<string[]>([]);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [sessions, setSessions] = useState<Training[]>([]);
  const [training, setTraining] = useState<Training | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [active, setActive] = useState(0);
  const [setup, setSetup] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [mobileList, setMobileList] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [pickMode, setPickMode] = useState(false);
  const [contentType, setContentType] = useState<TrainingContentType>("all");
  const [count, setCount] = useState("20");
  const [custom, setCustom] = useState("");
  const [allQuestions, setAllQuestions] = useState(false);
  const [labelMode, setLabelMode] = useState<TrainingLabelMode>("without");
  const [layout, setLayout] = useState<TrainingLayout>("top");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [section, setSection] = useState<"atlas" | "trainer">("atlas");
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTrainerFeed("histology", "mbh", 500), listTrainings(), getAccountSettings()]).then(([feed, history, account]) => {
      if (cancelled) return;
      if (feed.ok) {
        setFeedItems(feed.data.items || []);
        setTopics(Array.from(new Set(feed.data.items.flatMap((x: any) => Array.isArray(x.tags) ? x.tags : []))).sort());
      } else {
        setError(feed.error?.message || "Не удалось загрузить микропрепараты.");
      }
      if (history.ok) setSessions(history.data.items);
      if (account.ok) {
        const saved = String(account.data.preferences?.trainer_layout || "top");
        if (saved === "sidebar" || saved === "list" || saved === "top") setLayout(saved);
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError("Не удалось загрузить микропрепараты.");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const loadSession = async (id: string, showResult = false) => {
    setWorking(true);
    setError(null);
    const r = await getTraining(id);
    if (!r.ok) { setError(describeApiError(r.error)); setWorking(false); return; }
    const nextAnswers = r.data.answers as AnswerRow[];
    setTraining(r.data.training);
    setAnswers(nextAnswers);
    setActive(Math.min(r.data.training.current_index || 0, Math.max(0, nextAnswers.length - 1)));
    setSetup(false);
    setReview(false);
    if (showResult || r.data.training.status === "completed") {
      const total = nextAnswers.length;
      const correct = nextAnswers.filter((x) => x.is_correct === true).length;
      const wrong = nextAnswers.filter((x) => x.is_correct === false).length;
      const skipped = nextAnswers.filter((x) => x.is_skipped || x.user_answer == null).length;
      const percent = total ? Number(((correct / total) * 100).toFixed(1)) : Number(r.data.training.score || 0);
      setResult({ total, correct, wrong, skipped, percent, grade: percent >= 90 ? 5 : percent >= 75 ? 4 : percent >= 60 ? 3 : 2 });
    } else setResult(null);
    setWorking(false);
  };

  const trainingFromQuery = searchParams.get("training") || "";
  useEffect(() => {
    if (trainingFromQuery) void loadSession(trainingFromQuery);
  }, [trainingFromQuery]);

  // Прямые ссылки из атласа и поиска:
  //  ?cards=<id,id> — сразу выбранные карточки,  ?topic=<занятие> — тема,
  //  ?all=1 — все карточки,  ?card=<id> — открытый препарат в атласе.
  const cardsParam = searchParams.get("cards") || "";
  const topicParam = searchParams.get("topic") || "";
  const allParam = searchParams.get("all") || "";
  const kindParam = searchParams.get("kind") || "";
  const cardParam = searchParams.get("card") || "";
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current || !feedItems.length) return;
    if (!cardsParam && !topicParam && !allParam) return;
    deepLinkApplied.current = true;
    if (topicParam) setSelectedTopics([topicParam]);
    if (cardsParam) setSelectedCardIds(cardsParam.split(",").map((id) => id.trim()).filter(Boolean));
    if (kindParam === "preparation" || kindParam === "electronogram" || kindParam === "all") {
      setContentType(kindParam);
    }
    if (allParam === "1") setAllQuestions(true);
    setSection("trainer");
  }, [feedItems.length, cardsParam, topicParam, allParam, kindParam]);

  const start = async () => {
    setWorking(true);
    setError(null);
    const n = allQuestions ? 500 : Math.max(1, Number(custom || count));
    const r = await createHistologyTraining({
      topics: selectedTopics,
      content_type: contentType,
      question_count: n,
      all_questions: allQuestions || selectedCardIds.length > 0,
      label_mode: labelMode === "with" ? "without" : labelMode,
      layout_mode: layout,
      card_ids: selectedCardIds.length ? selectedCardIds : undefined,
      force: true,
    });
    if (!r.ok) { setError(describeApiError(r.error)); setWorking(false); return; }
    const tid = r.data.training.id;
    if (embedded && typeof window !== "undefined") {
      window.location.assign("/trainers/feed/histology?training=" + encodeURIComponent(tid));
      return;
    }
    await loadSession(tid);
  };

  const answer = async (value: string | null, skip = false) => {
    if (!training || !answers[active] || working) return;
    const a = answers[active];
    if (a.user_answer != null || a.is_skipped) return;
    setWorking(true);
    const r = await answerTrainingQuestion(training.id, a.order, value, skip);
    if (!r.ok) { setError(describeApiError(r.error)); setWorking(false); return; }
    const snapshot = a.question_snapshot as any;
    const mode = String(snapshot?.mode_set || snapshot?.modeSet || "").toLowerCase();
    const tags = Array.isArray(snapshot?.tags) ? snapshot.tags.map(String) : [];
    const isElectronogram = training.content_type === "electronogram"
      || mode.includes("electron")
      || tags.some((tag: string) => tag.includes("electron") || tag.includes("электронограм"));
    setAnswers((v) => v.map((x, i) => i === active ? {
      ...x,
      user_answer: value,
      is_correct: r.data.correct,
      is_skipped: skip,
      options: r.data.correct === true && value != null
        ? x.options.map((option) => ({ ...option, correct: option.id === value }))
        : x.options,
    } : x));
    setSessions((v) => v.map((x) => x.id === training.id ? { ...x, answered_count: (x.answered_count || 0) + 1, current_index: a.order } : x));

    // Unanswered snapshots intentionally omit the answer key. Refresh only when
    // the user needs the post-answer review data (wrong/skipped/free-text/EM).
    if (skip || r.data.correct !== true || isElectronogram) {
      const refreshed = await getTraining(training.id);
      if (refreshed.ok) {
        setTraining(refreshed.data.training);
        setAnswers(refreshed.data.answers as AnswerRow[]);
      }
    }
    setWorking(false);
  };

  const finish = async () => {
    if (!training) return;
    setWorking(true);
    const r = await completeTraining(training.id);
    if (!r.ok) { setError(describeApiError(r.error)); setWorking(false); return; }
    setTraining(r.data.training);
    setResult(r.data.stats);
    setSessions((v) => v.map((x) => x.id === training.id ? { ...x, ...r.data.training, answered_count: answers.length } : x));
    setWorking(false);
  };

  const restart = async (id: string) => {
    setWorking(true);
    const r = await cancelTraining(id);
    if (!r.ok) setError(describeApiError(r.error));
    else setSessions((v) => v.map((x) => x.id === id ? { ...x, status: "cancelled" } : x));
    setWorking(false);
  };

  const current = answers[active];
  const answered = answers.filter((x) => x.user_answer != null || x.is_skipped).length;
  const wrong = answers.filter((x) => x.is_correct === false);
  // Атлас «под рукой» открывается на теме текущего препарата.
  const currentLesson = current ? lessonKeyOf((current.question_snapshot || {}) as never) : "";

  // Фильтр атласа — по темам занятий (название темы плана; если привязки к
  // плану ещё нет, lessonKeyOf возвращается к первой метке карточки).
  const topicsForSetup = useMemo(() => {
    const filtered = feedItems.filter((x) => {
      if (contentType === "electronogram") return isElectronogramCard(x);
      if (contentType === "preparation") return !isElectronogramCard(x);
      return true;
    });
    if (!filtered.length) return topics.slice().sort(compareLessons);
    const set = new Set<string>();
    for (const x of filtered) set.add(lessonKeyOf(x));
    return Array.from(set).sort(compareLessons);
  }, [topics, feedItems, contentType]);

  // Список для выбора конкретных карточек: тот же порядок, что и в атласе.
  const atlasByTopic = useMemo(
    () =>
      groupAtlasCards(feedItems, { kind: contentType, sort: "plan" }).map(
        (group) => [group.lesson, group.items] as [string, any[]],
      ),
    [feedItems, contentType],
  );

  const visibleSessions = historyExpanded ? sessions : sessions.slice(0, 4);
  const hasMoreHistory = sessions.length > 4;

  const question = (a: AnswerRow, i: number, compact = false) => (
    <HistologyQuestionCard
      key={a.id}
      a={a}
      i={i}
      total={answers.length}
      compact={compact}
      labelMode={training?.label_mode}
      contentType={training?.content_type}
      working={working}
      ImageBox={ImageBox}
      onAnswer={(value, skip) => void answer(value, !!skip)}
    />
  );

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка…</div>;

  if (setup && !training) {
    return (
      <div className={embedded ? "space-y-5" : "mx-auto max-w-6xl space-y-5"}>
        {!embedded && (
          <header>
            <Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="h-4 w-4" />К предметам</Link>
            <h1 className="page-title mt-3">Микропрепараты</h1>
            <p className="page-subtitle">
              Атлас — только препараты; схемы, методички, тесты и учебники остаются в материалах предмета.
            </p>
          </header>
        )}
        {embedded && (<div><h2 className="text-lg font-bold">Микропрепараты</h2><p className="mt-1 text-sm text-slate-500">Атлас с подписями или тренажёр.</p></div>)}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSection("atlas")} className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (section === "atlas" ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white")}>Атлас</button>
          <button type="button" onClick={() => setSection("trainer")} className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (section === "trainer" ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white")}>Тренажёр</button>
        </div>

        {section === "atlas" && (
          <HistologyAtlas
            cards={feedItems}
            loading={loading}
            focusCardId={cardParam || undefined}
            onTrain={({ ids, lesson: chosenLesson }) => {
              setSelectedTopics(chosenLesson ? [chosenLesson] : []);
              setSelectedCardIds(ids);
              setSection("trainer");
            }}
          />
        )}

        {section === "trainer" && (
          <div className="space-y-5">
            <section className="card space-y-4 p-5">
              <div>
                <h2 className="font-bold">Тип</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([["all", "Всё"], ["preparation", "Микропрепараты"], ["electronogram", "Электронограммы"]] as [TrainingContentType, string][]).map((x) => (
                    <label key={x[0]} className={"rounded-xl border px-4 py-2 text-sm " + (contentType === x[0] ? "border-indigo-400 bg-indigo-50" : "")}>
                      <input type="radio" className="mr-2" checked={contentType === x[0]} onChange={() => setContentType(x[0])} />{x[1]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="font-bold">Режим ответа</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([["without", "Варианты"], ["manual", "Ввод вручную"]] as [TrainingLabelMode, string][]).map((x) => (
                    <label key={x[0]} className={"rounded-xl border px-4 py-2 text-sm " + (labelMode === x[0] ? "border-indigo-400 bg-indigo-50" : "")}>
                      <input type="radio" className="mr-2" checked={labelMode === x[0]} onChange={() => setLabelMode(x[0])} />{x[1]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="font-bold">Количество</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {["10", "20", "30", "50"].map((n) => (
                    <button key={n} type="button" onClick={() => { setCount(n); setAllQuestions(false); }} className={"rounded-xl border px-3 py-2 text-sm " + (!allQuestions && count === n ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>{n}</button>
                  ))}
                  <button type="button" onClick={() => setAllQuestions(true)} className={"rounded-xl border px-3 py-2 text-sm " + (allQuestions ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>Все</button>
                  <input value={custom} onChange={(e) => { setCustom(e.target.value); setAllQuestions(false); }} placeholder="своё" className="w-20 rounded-xl border px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold">Темы занятий / выбор карточек</h2>
                  <button type="button" onClick={() => setPickMode(!pickMode)} className="text-sm text-indigo-600">
                    {pickMode ? "Скрыть выбор" : "Выбрать конкретные"}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {topicsForSetup.map((tg) => {
                    const on = selectedTopics.includes(tg);
                    return (
                      <button key={tg} type="button" onClick={() => setSelectedTopics((v) => on ? v.filter((x) => x !== tg) : [...v, tg])}
                        className={"rounded-xl border px-3 py-2 text-sm " + (on ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>
                        {topicLabel(tg)}
                      </button>
                    );
                  })}
                </div>
                {selectedTopics.length > 0 && (
                  <button type="button" className="mt-2 text-xs text-slate-500" onClick={() => setSelectedTopics([])}>Сбросить темы</button>
                )}
                {pickMode && (
                  <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl border p-3">
                    {atlasByTopic.map(([topic, items]) => (
                      <div key={topic}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <b className="text-sm">{topicLabel(topic)}</b>
                          <button type="button" className="text-xs text-indigo-600" onClick={() => {
                            const ids = items.map((c: any) => String(c.id));
                            setSelectedCardIds((prev) => {
                              const allOn = ids.every((id: string) => prev.includes(id));
                              return allOn ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]));
                            });
                          }}>все / снять</button>
                        </div>
                        <div className="space-y-1">
                          {items.map((card: any) => {
                            const id = String(card.id);
                            const on = selectedCardIds.includes(id);
                            const em = isElectronogramCard(card);
                            return (
                              <label key={id} className={"flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-1.5 text-xs " + (on ? "border-indigo-300 bg-indigo-50" : "")}>
                                <input type="checkbox" className="mt-0.5" checked={on} onChange={() => setSelectedCardIds((v) => on ? v.filter((x) => x !== id) : [...v, id])} />
                                <span>
                                  <span className="font-medium">{card.preparation?.name || "Препарат"}</span>
                                  {em ? <span className="ml-1 text-indigo-500">ЭМ</span> : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {selectedCardIds.length > 0 && (
                      <p className="text-xs text-slate-600">Выбрано: {selectedCardIds.length}. Будут только эти карточки.</p>
                    )}
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button disabled={working} onClick={() => void start()} className="btn-primary">
                {selectedCardIds.length ? `Начать (${selectedCardIds.length})` : "Начать"}
              </button>
            </section>

            {sessions.length > 0 && (
              <section className="card p-5">
                <h2 className="font-bold">История</h2>
                <div className="mt-3 space-y-2">
                  {visibleSessions.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                      <span>{historyLabel(t)} · {t.content_type || "all"} · {t.answered_count || 0}/{t.total_questions || t.question_count}</span>
                      <div className="flex gap-2">
                        {t.status === "in_progress" && <button type="button" onClick={() => void loadSession(t.id)} className="rounded-lg border px-2 py-1">Продолжить</button>}
                        {t.status === "completed" && <button type="button" onClick={() => void loadSession(t.id, true)} className="rounded-lg border px-2 py-1">Разбор</button>}
                        {t.status === "in_progress" && <button type="button" onClick={() => void restart(t.id)} className="rounded-lg border px-2 py-1 text-rose-600">Отменить</button>}
                      </div>
                    </div>
                  ))}
                </div>
                {hasMoreHistory && (
                  <button type="button" onClick={() => setHistoryExpanded(!historyExpanded)} className="mt-2 text-sm text-indigo-600">
                    {historyExpanded ? "Свернуть" : "Показать ещё"} <ChevronDown className="inline h-4 w-4" />
                  </button>
                )}
              </section>
            )}
          </div>
        )}

      </div>
    );
  }

  if (result && !review) {
    return (
      <div className={embedded ? "space-y-5" : "mx-auto max-w-3xl space-y-5"}>
        <div className="card p-6 text-center">
          <h2 className="text-2xl font-bold">Результат</h2>
          <p className="mt-2 text-4xl font-bold text-indigo-600">{result.percent}%</p>
          <p className="mt-1 text-sm text-slate-500">Оценка: {result.grade} · верно {result.correct} · ошибки {result.wrong} · пропуски {result.skipped}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => setReview(true)} className="btn-primary">Разбор</button>
            <button type="button" onClick={() => { setTraining(null); setAnswers([]); setSetup(true); setResult(null); }} className="rounded-xl border px-4 py-2">К списку</button>
          </div>
        </div>
      </div>
    );
  }

  const finishBar = (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      <button type="button" disabled={working} onClick={() => void finish()} className="btn-primary flex-1 sm:flex-none">Завершить</button>
      {layout === "sidebar" && (
        <button type="button" onClick={() => setMobileList(!mobileList)} className="rounded-xl border px-3 py-2 md:hidden" aria-label="Список вопросов">
          <Menu className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  const statusNav = (
    <div className="mobile-scroll-x overflow-x-auto pb-1">
      <Dots answers={answers} current={active} onSelect={setActive} />
    </div>
  );

  const listMode = layout === "list";
  const sidebarMode = layout === "sidebar";

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-6xl space-y-4"}>
      <div className="sticky top-16 z-20 -mx-1 rounded-2xl border bg-white/95 p-3 shadow-sm backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm text-slate-500">Отвечено {answered} / {answers.length}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAtlasOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300"
              title="Атлас препаратов по теме"
            >
              <Microscope className="h-4 w-4" /> Атлас
            </button>
            {finishBar}
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        {layout === "top" && <div className="mt-2">{statusNav}</div>}
      </div>

      {sidebarMode ? (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className={(mobileList ? "fixed inset-x-3 top-20 z-40 max-h-[70vh] overflow-auto shadow-2xl " : "hidden md:block ") + "rounded-2xl border bg-white p-3"}>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Навигация по вопросам</div>
            <Dots answers={answers} current={active} onSelect={(n) => { setActive(n); setMobileList(false); }} />
            <div className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-slate-500">
              <span>● отвечено</span><span>○ не отвечено</span>
            </div>
          </aside>
          {current && question(current, active)}
        </div>
      ) : listMode ? (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white px-3 py-2 text-xs text-slate-500">Режим «Списком» · {answers.length} вопросов</div>
          {answers.map((a, i) => question(a, i, true))}
        </div>
      ) : (
        <>
          {current && question(current, active)}
          <div className="flex gap-2">
            <button type="button" disabled={active <= 0} onClick={() => setActive(active - 1)} className="min-h-11 flex-1 rounded-xl border px-4 py-2">
              <ChevronLeft className="inline h-4 w-4" />Назад
            </button>
            <button type="button" disabled={active >= answers.length - 1} onClick={() => setActive(active + 1)} className="min-h-11 flex-1 rounded-xl border px-4 py-2">
              Далее<ChevronRight className="inline h-4 w-4" />
            </button>
          </div>          </>
        )}

      {atlasOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-slate-950/55"
          role="dialog"
          aria-modal="true"
          aria-label="Атлас препаратов"
        >
          <button type="button" className="hidden flex-1 sm:block" onClick={() => setAtlasOpen(false)} aria-label="Закрыть атлас" />
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-slate-50 p-3 shadow-2xl sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">
                {currentLesson ? topicLabel(currentLesson) : "Атлас препаратов"}
              </div>
              <Link href="/atlas" className="text-xs font-semibold text-indigo-700 hover:underline">
                Открыть полный атлас →
              </Link>
            </div>
            <HistologyAtlas
              cards={feedItems}
              compact
              initialLesson={currentLesson}
              onClose={() => setAtlasOpen(false)}
              showAtlasLink={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistologyTrainer({ embedded = false }: { embedded?: boolean }) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка…</div>}>
      <HistologyTrainerInner embedded={embedded} />
    </Suspense>
  );
}
