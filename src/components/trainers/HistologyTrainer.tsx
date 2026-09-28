"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Menu, RefreshCw, SkipForward, X } from "lucide-react";
import { getTrainerImageUrl, retryTrainerImage } from "@/lib/api";
import { getAccountSettings } from "@/lib/settings-api";
import {
  answerTrainingQuestion, cancelTraining, completeTraining, createHistologyTraining,
  getTraining, listTrainerFeed, listTrainings, type Training, type TrainingContentType,
  type TrainingLabelMode, type TrainingLayout, type TrainingQuestion,
} from "@/lib/content-api";

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

const topicNames: Record<string, string> = {
  mbh: "МБХ", electronogram: "Электронограммы", identify: "Определение препарата",
  stom_mbh: "Стом. гистология", orofacial: "Орофациальная область", histology: "Гистология",
};
const topicLabel = (x: string) => topicNames[x] || x.replaceAll("_", " ");

function ImageBox({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const load = async (retry = false) => {
    setLoading(true);
    const u = retry ? await retryTrainerImage(id) : await getTrainerImageUrl(id);
    setSrc(u);
    setLoading(false);
    setRetrying(false);
  };
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getTrainerImageUrl(id).then((u) => { if (alive) { setSrc(u); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);
  if (loading) return <div className="flex min-h-[300px] items-center justify-center bg-slate-100 text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />Загрузка изображения…</div>;
  if (!src) return <div className="flex min-h-[300px] flex-col items-center justify-center bg-slate-100 p-6 text-center"><span className="text-4xl">?</span><b className="mt-2">Изображение временно недоступно</b><button disabled={retrying} onClick={() => { setRetrying(true); void load(true); }} className="mt-3 rounded-xl border bg-white px-4 py-2 text-sm font-semibold"><RefreshCw className="mr-2 inline h-4 w-4" />Повторить</button></div>;
  return <img src={src} onError={() => setSrc(null)} className="max-h-[650px] min-h-[300px] w-full bg-slate-100 object-contain" alt="Гистологический препарат" draggable={false} />;
}

function AtlasThumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getTrainerImageUrl(id).then((u) => { if (alive) setSrc(u); });
    return () => { alive = false; };
  }, [id]);
  if (!src) return <div className="flex h-full min-h-[100px] items-center justify-center text-xs text-slate-400">…</div>;
  return <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />;
}

function Dots({ answers, current, onSelect }: { answers: AnswerRow[]; current: number; onSelect: (n: number) => void }) {
  return <div className="flex flex-wrap gap-1.5">{answers.map((a, i) => {
    const cls = a.is_correct === true ? "bg-emerald-500 text-white" : a.is_correct === false ? "bg-rose-500 text-white" : a.is_skipped ? "bg-slate-300" : "border bg-white";
    return <button key={a.id} onClick={() => onSelect(i)} className={"h-8 min-w-8 rounded-full px-2 text-xs font-bold " + (i === current && !a.is_correct && !a.is_skipped ? "ring-2 ring-indigo-300 " : "") + cls}>{i + 1}</button>;
  })}</div>;
}

function historyLabel(t: Training) {
  if (t.status === "in_progress") return "Не завершено";
  if (t.status === "completed") return "Пройдено";
  return "Отменено";
}

export default function HistologyTrainer({ embedded = false }: { embedded?: boolean }) {
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
  const [contentType, setContentType] = useState<TrainingContentType>("all");
  const [count, setCount] = useState("20");
  const [custom, setCustom] = useState("");
  const [allQuestions, setAllQuestions] = useState(false);
  const [labelMode, setLabelMode] = useState<TrainingLabelMode>("without");
  const [layout, setLayout] = useState<TrainingLayout>("top");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [section, setSection] = useState<"atlas" | "trainer">("atlas");
  const [atlasTopic, setAtlasTopic] = useState<string>("");
  const [lightbox, setLightbox] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listTrainerFeed("histology", "mbh", 500), listTrainings(), getAccountSettings()]).then(([feed, history, account]) => {
      if (feed.ok) {
        setFeedItems(feed.data.items || []);
        setTopics(Array.from(new Set(feed.data.items.flatMap((x: any) => Array.isArray(x.tags) ? x.tags : []))).sort());
      }
      if (history.ok) setSessions(history.data.items);
      if (account.ok) {
        const saved = String(account.data.preferences?.trainer_layout || "top");
        if (saved === "sidebar" || saved === "list" || saved === "top") setLayout(saved);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadSession = async (id: string, showResult = false) => {
    setWorking(true);
    setError(null);
    const r = await getTraining(id);
    if (!r.ok) { setError(r.error.message); setWorking(false); return; }
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("training");
    if (id) void loadSession(id);
  }, []);

  const start = async () => {
    setWorking(true);
    setError(null);
    const n = allQuestions ? 500 : Math.max(1, Number(custom || count));
    const r = await createHistologyTraining({
      topics: selectedTopics,
      content_type: contentType,
      question_count: n,
      all_questions: allQuestions,
      label_mode: labelMode === "with" ? "without" : labelMode,
    });
    if (!r.ok) { setError(r.error.message); setWorking(false); return; }
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
    if (!r.ok) { setError(r.error.message); setWorking(false); return; }
    setAnswers((v) => v.map((x, i) => i === active ? { ...x, user_answer: value, is_correct: r.data.correct, is_skipped: skip } : x));
    setSessions((v) => v.map((x) => x.id === training.id ? { ...x, answered_count: (x.answered_count || 0) + 1, current_index: a.order } : x));
    setWorking(false);
  };

  const finish = async () => {
    if (!training) return;
    setWorking(true);
    const r = await completeTraining(training.id);
    if (!r.ok) { setError(r.error.message); setWorking(false); return; }
    setTraining(r.data.training);
    setResult(r.data.stats);
    setSessions((v) => v.map((x) => x.id === training.id ? { ...x, ...r.data.training, answered_count: answers.length } : x));
    setWorking(false);
  };

  const restart = async (id: string) => {
    setWorking(true);
    const r = await cancelTraining(id);
    if (!r.ok) setError(r.error.message);
    else setSessions((v) => v.map((x) => x.id === id ? { ...x, status: "cancelled" } : x));
    setWorking(false);
  };

  const current = answers[active];
  const answered = answers.filter((x) => x.user_answer != null || x.is_skipped).length;
  const wrong = answers.filter((x) => x.is_correct === false);

  const topicsForSetup = useMemo(() => {
    if (!feedItems.length) return topics;
    const isEm = (x: any) => {
      const tags = Array.isArray(x.tags) ? x.tags.map((tg: string) => String(tg).toLowerCase()) : [];
      const mode = String(x.mode_set || "").toLowerCase();
      return tags.some((tg: string) => tg.includes("electron") || tg.includes("электронограм")) || mode.includes("electron");
    };
    const filtered = feedItems.filter((x) => {
      if (contentType === "electronogram") return isEm(x);
      if (contentType === "preparation") return !isEm(x);
      return true;
    });
    const set = new Set<string>();
    for (const x of filtered) for (const tag of (Array.isArray(x.tags) ? x.tags : [])) set.add(String(tag));
    return Array.from(set).sort();
  }, [topics, feedItems, contentType]);

  const atlasItems = useMemo(() => {
    const isEm = (x: any) => {
      const tags = Array.isArray(x.tags) ? x.tags.map((tg: string) => String(tg).toLowerCase()) : [];
      const mode = String(x.mode_set || "").toLowerCase();
      return tags.some((tg: string) => tg.includes("electron") || tg.includes("электронограм")) || mode.includes("electron");
    };
    let list = feedItems.slice();
    if (contentType === "electronogram") list = list.filter(isEm);
    else if (contentType === "preparation") list = list.filter((x) => !isEm(x));
    if (atlasTopic) {
      list = list.filter((x) => Array.isArray(x.tags) && x.tags.map(String).includes(atlasTopic));
    }
    const seenId = new Set<string>();
    const seenKey = new Set<string>();
    const seenEmName = new Set<string>();
    const deduped: any[] = [];
    for (const item of list) {
      const id = String(item?.id || "");
      const src = String(item?.source_key || item?.preparation?.imagePath || item?.preparation?.imageUrl || "");
      const name = String(item?.preparation?.name || "").trim().toLowerCase();
      const em = isEm(item);
      if (id && seenId.has(id)) continue;
      if (src && seenKey.has(src)) continue;
      if (em && name && seenEmName.has(name)) continue;
      if (id) seenId.add(id);
      if (src) seenKey.add(src);
      if (em && name) seenEmName.add(name);
      deduped.push(item);
    }
    return deduped;
  }, [feedItems, contentType, atlasTopic]);

  const atlasByTopic = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const item of atlasItems) {
      const tags = Array.isArray(item.tags) && item.tags.length ? item.tags.map(String) : ["Без темы"];
      const key = atlasTopic || tags[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [atlasItems, atlasTopic]);

  const visibleSessions = historyExpanded ? sessions : sessions.slice(0, 4);
  const hasMoreHistory = sessions.length > 4;

  const question = (a: AnswerRow, i: number, compact = false) => {
    const q = a.question_snapshot;
    const answeredNow = a.user_answer != null || a.is_skipped;
    const manual = training?.label_mode === "manual";
    return <article key={a.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex justify-between border-b bg-slate-50 px-4 py-3 text-xs text-slate-500"><span>Вопрос {i + 1} / {answers.length}</span><span>{a.is_correct === true ? "Верно" : a.is_correct === false ? "Ошибка" : a.is_skipped ? "Пропущен" : "Не отвечен"}</span></div>
      <ImageBox id={a.question_id} />
      <div className={compact ? "p-4" : "p-5"}>
        <h2 className="text-xl font-bold">{q.question?.prompt || "Что изображено?"}</h2>
        {manual
          ? <div className="mt-4"><input disabled={answeredNow} defaultValue={a.user_answer || ""} id={"answer-" + a.id} placeholder="Введите ответ" className="w-full rounded-xl border px-4 py-3" />{!answeredNow && <button onClick={() => { const e = document.getElementById("answer-" + a.id) as HTMLInputElement | null; void answer(e?.value.trim() || null); }} className="btn-primary mt-2">Ответить</button>}</div>
          : <div className="mt-4 space-y-2">{a.options.map((o) => {
              const good = answeredNow && o.correct;
              const bad = answeredNow && a.user_answer === o.id && !o.correct;
              return <button key={o.id} disabled={answeredNow || working} onClick={() => void answer(o.id)} className={"flex w-full items-center gap-3 rounded-xl border p-3 text-left " + (good ? "border-emerald-400 bg-emerald-50" : bad ? "border-rose-400 bg-rose-50" : "hover:bg-slate-50")}>{good ? <Check className="h-4 w-4" /> : bad ? <X className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border" />}{o.label}</button>;
            })}</div>}
        {!answeredNow && <div className="mt-4 flex gap-2"><button disabled={working} onClick={() => void answer(null, true)} className="rounded-xl border px-3 py-2 text-sm"><SkipForward className="mr-1 inline h-4 w-4" />Пропустить</button><button disabled={working} onClick={() => void answer(null, true)} className="rounded-xl border px-3 py-2 text-sm">Я не знаю</button></div>}
      </div>
    </article>;
  };

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка…</div>;

  if (setup && !training) return <div className={embedded ? "space-y-5" : "mx-auto max-w-6xl space-y-5"}>
    {!embedded && (<header><Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="h-4 w-4" />К предметам</Link><h1 className="page-title mt-3">Микропрепараты</h1><p className="page-subtitle">Атлас с подписями или тренажёр.</p></header>)}
    {embedded && (<div><h2 className="text-lg font-bold">Микропрепараты</h2><p className="mt-1 text-sm text-slate-500">Атлас с подписями или тренажёр.</p></div>)}

    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setSection("atlas")} className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (section === "atlas" ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white")}>Атлас (с подписями)</button>
      <button type="button" onClick={() => setSection("trainer")} className={"rounded-xl border px-4 py-2 text-sm font-semibold " + (section === "trainer" ? "border-indigo-600 bg-indigo-600 text-white" : "bg-white")}>Тренажёр</button>
    </div>

    {section === "atlas" && (
      <div className="space-y-5">
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="font-bold">Тип</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {([["all", "Всё"], ["preparation", "Микропрепараты"], ["electronogram", "Электронограммы"]] as [TrainingContentType, string][]).map((x) => (
                <label key={x[0]} className={"rounded-xl border px-4 py-2 text-sm " + (contentType === x[0] ? "border-indigo-400 bg-indigo-50" : "")}>
                  <input type="radio" className="mr-2" checked={contentType === x[0]} onChange={() => { setContentType(x[0]); setAtlasTopic(""); }} />{x[1]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-bold">Темы</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setAtlasTopic("")} className={"rounded-xl border px-3 py-2 text-sm " + (!atlasTopic ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>Все темы</button>
              {topicsForSetup.map((tg) => (
                <button key={tg} type="button" onClick={() => setAtlasTopic(atlasTopic === tg ? "" : tg)} className={"rounded-xl border px-3 py-2 text-sm " + (atlasTopic === tg ? "border-indigo-400 bg-indigo-50 font-semibold" : "")}>{topicLabel(tg)}</button>
              ))}
            </div>
          </div>
        </section>

        {atlasByTopic.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">Нет фото по выбранному фильтру.</div>
        ) : atlasByTopic.map(([topic, items]) => (
          <section key={topic} className="card p-5">
            <h3 className="text-lg font-bold">{topicLabel(topic)}</h3>
            <p className="mt-1 text-xs text-slate-500">{items.length} фото · нажмите, чтобы открыть с подписями</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((card: any) => {
                const name = card.preparation?.name || card.question?.prompt || "Препарат";
                return (
                  <button key={card.id} type="button" onClick={() => setLightbox(card)} className="group overflow-hidden rounded-2xl border bg-slate-50 text-left transition hover:border-indigo-300 hover:shadow-md">
                    <div className="aspect-[4/3] bg-slate-100"><AtlasThumb id={String(card.id)} /></div>
                    <div className="p-2"><div className="line-clamp-2 text-xs font-semibold text-slate-800">{String(name)}</div></div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {lightbox && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
            <div className="relative max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-bold">{String(lightbox.preparation?.name || lightbox.question?.prompt || "Препарат")}</div>
                  <div className="text-xs text-slate-500">{Array.isArray(lightbox.tags) ? lightbox.tags.map(topicLabel).join(" · ") : ""}</div>
                </div>
                <button type="button" onClick={() => setLightbox(null)} className="rounded-xl border px-3 py-2 text-sm font-semibold">Закрыть</button>
              </div>
              <div className="bg-slate-100"><ImageBox id={String(lightbox.id)} /></div>
              <div className="space-y-3 p-5">
                {lightbox.preparation?.organ ? <div className="text-sm"><b>Орган:</b> {String(lightbox.preparation.organ)}</div> : null}
                {lightbox.preparation?.stain ? <div className="text-sm"><b>Окраска:</b> {String(lightbox.preparation.stain)}</div> : null}
                {Array.isArray(lightbox.preparation?.captions) && lightbox.preparation.captions.length ? (
                  <div>
                    <b className="text-sm">Подписи</b>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {lightbox.preparation.captions.map((c: string, i: number) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Подписи для этого кадра пока не загружены.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {section === "trainer" && (
      <>
        {sessions.length > 0 && <section className="card p-5">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold">Ваши тренировки</h2><p className="mt-1 text-sm text-slate-500">Незавершённые варианты сохраняются автоматически.</p></div>
            {hasMoreHistory && <button onClick={() => setHistoryExpanded((v) => !v)} className="inline-flex shrink-0 items-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold">{historyExpanded ? "Свернуть" : "Показать все"}<ChevronDown className={"h-4 w-4 transition " + (historyExpanded ? "rotate-180" : "")} /></button>}
          </div>
          <div className="mt-4 space-y-2">
            {visibleSessions.map((s) => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-slate-50 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (s.status === "in_progress" ? "bg-amber-100 text-amber-800" : s.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700")}>{historyLabel(s)}</span><span className="text-sm font-semibold">{s.content_type === "preparation" ? "Микропрепараты" : s.content_type === "electronogram" ? "Электронограммы" : "Всё вместе"}</span></div>
                <div className="mt-1 text-sm text-slate-500">{s.status === "in_progress" ? `${s.answered_count || 0} из ${s.total_questions} отвечено` : `${s.score ?? 0}% · ${s.total_questions} вопросов`}</div>
              </div>
              {s.status === "in_progress" ? <div className="flex gap-2"><button disabled={working} onClick={() => { if (embedded && typeof window !== "undefined") { window.location.assign("/trainers/feed/histology?training=" + encodeURIComponent(s.id)); return; } void loadSession(s.id); }} className="btn-primary">Продолжить</button><button disabled={working} onClick={() => void restart(s.id)} className="rounded-xl border bg-white px-3 py-2 text-sm">Начать заново</button></div>
                : s.status === "completed" ? <button disabled={working} onClick={() => { if (embedded && typeof window !== "undefined") { window.location.assign("/trainers/feed/histology?training=" + encodeURIComponent(s.id)); return; } void loadSession(s.id, true); }} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Открыть результат</button> : null}
            </div>)}
          </div>
        </section>}

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        <section className="card space-y-6 p-5">
          <div><h2 className="font-bold">Темы</h2><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setSelectedTopics(selectedTopics.length === topicsForSetup.length ? [] : topicsForSetup)} className="rounded-xl border px-3 py-2 text-sm font-semibold">Выбрать все</button>{topicsForSetup.map((tg) => <label key={tg} className={"rounded-xl border px-3 py-2 text-sm " + (selectedTopics.includes(tg) ? "border-indigo-400 bg-indigo-50" : "")}><input type="checkbox" className="mr-2" checked={selectedTopics.includes(tg)} onChange={(e) => setSelectedTopics(e.target.checked ? [...selectedTopics, tg] : selectedTopics.filter((x) => x !== tg))} />{topicLabel(tg)}</label>)}</div></div>
          <div><h2 className="font-bold">Тип контента</h2><div className="mt-3 flex flex-wrap gap-2">{([["all", "Всё вместе"], ["preparation", "Микропрепараты"], ["electronogram", "Электронограммы"]] as [TrainingContentType, string][]).map((x) => <label key={x[0]} className={"rounded-xl border px-4 py-3 " + (contentType === x[0] ? "border-indigo-400 bg-indigo-50" : "")}><input type="radio" className="mr-2" checked={contentType === x[0]} onChange={() => { setContentType(x[0]); setSelectedTopics([]); }} />{x[1]}</label>)}</div></div>
          <div><h2 className="font-bold">Количество</h2><div className="mt-3 flex flex-wrap items-center gap-2">{["10", "20", "50"].map((n) => <label key={n} className="rounded-xl border px-4 py-3"><input type="radio" className="mr-2" checked={!custom && !allQuestions && count === n} onChange={() => { setCount(n); setCustom(""); setAllQuestions(false); }} />{n}</label>)}<input type="number" min="1" max="500" value={custom} onChange={(e) => { setCustom(e.target.value); setAllQuestions(false); }} placeholder="Своё количество" className="w-36 rounded-xl border px-3 py-3" /><label className="rounded-xl border px-4 py-3"><input type="checkbox" className="mr-2" checked={allQuestions} onChange={(e) => setAllQuestions(e.target.checked)} />Все вопросы</label></div></div>
          <div><h2 className="font-bold">Ответ</h2><p className="mt-1 text-xs text-slate-500">В тренажёре подписи скрыты. Для изучения — вкладка «Атлас».</p><div className="mt-3 grid gap-2 md:grid-cols-2">{([["without", "Варианты ответов"], ["manual", "Ручной ввод"]] as [TrainingLabelMode, string][]).map((x) => <label key={x[0]} className={"rounded-2xl border p-4 " + (labelMode === x[0] ? "border-indigo-400 bg-indigo-50" : "")}><input type="radio" className="mr-2" checked={labelMode === x[0]} onChange={() => setLabelMode(x[0])} /><b>{x[1]}</b></label>)}</div></div>
          <button disabled={working} onClick={() => void start()} className="btn-primary w-full py-3">{working ? "Формируем вариант…" : "Сформировать вариант"}</button>
        </section>
      </>
    )}
  </div>;

  if (result) return <div className={embedded ? "space-y-5" : "mx-auto max-w-5xl space-y-5"}><section className="card p-6 text-center"><div className="text-sm text-slate-500">Тренировка завершена</div><h1 className="mt-2 text-4xl font-black">{result.correct}/{result.total}</h1><p className="mt-2">Правильно · {result.percent}% · Оценка {result.grade}</p><div className="mt-5 flex justify-center gap-2"><button className="btn-primary" onClick={() => setReview(!review)}>Разбор ошибок ({wrong.length})</button><button className="rounded-xl border px-4 py-2" onClick={() => { setResult(null); setTraining(null); setAnswers([]); setSetup(true); }}>Новая тренировка</button></div></section>{review && wrong.map((a) => { const snap = a.review_snapshot || a.question_snapshot; const correct = a.options.find((o) => o.correct); return <article key={a.id} className="card overflow-hidden"><ImageBox id={a.question_id} /><div className="p-5"><h2 className="font-bold">{snap?.preparation?.name || snap?.question?.prompt}</h2><div className="mt-3 rounded-xl bg-emerald-50 p-3"><b>Правильный ответ:</b> {correct?.label || "—"}</div></div></article>; })}</div>;

  const finishBar = <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-600">Отвечено {answered} / {answers.length}</div><div className="flex gap-2"><button disabled={working} onClick={() => setActive(Math.max(0, active - 1))} className="rounded-xl border px-3 py-2"><ChevronLeft className="inline h-4 w-4" /></button><button disabled={working} onClick={() => setActive(Math.min(answers.length - 1, active + 1))} className="rounded-xl border px-3 py-2"><ChevronRight className="inline h-4 w-4" /></button><button disabled={working || answered < answers.length} onClick={() => void finish()} className="btn-primary">Завершить</button></div></div>;

  return <div className={embedded ? "space-y-4" : "mx-auto max-w-7xl space-y-4"}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/subjects" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="h-4 w-4" />К предмету</Link>
          <button type="button" onClick={() => { setResult(null); setTraining(null); setAnswers([]); setSetup(true); if (typeof window !== "undefined") { const u = new URL(window.location.href); u.searchParams.delete("training"); window.history.replaceState(null, "", u.pathname + (u.search || "")); } }} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold">К выбору варианта</button>
        </div>
        <h1 className="page-title mt-2">Тренировка</h1>
        <p className="text-sm text-slate-500">Вопрос {active + 1} из {answers.length} · отвечено {answered}</p>
      </div>
      <button className="rounded-xl border px-3 py-2 md:hidden" onClick={() => setMobileList(!mobileList)}><Menu className="mr-1 inline h-4 w-4" />Список задач</button>
    </header>
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}
    {layout === "sidebar" ? (
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]"><div className="hidden lg:block"><div className="sticky top-4 space-y-2 rounded-2xl border bg-white p-3"><b className="text-sm">Вопросы</b><Dots answers={answers} current={active} onSelect={setActive} /></div></div><div>{current && question(current, active)}{finishBar}</div></div>
    ) : layout === "list" ? (
      <div className="space-y-4">{answers.map((a, i) => question(a, i, true))}{finishBar}</div>
    ) : (
      <div className="mx-auto max-w-4xl"><div className="mb-4 rounded-2xl border bg-white p-3"><Dots answers={answers} current={active} onSelect={setActive} /></div>{current && question(current, active)}<div className="mt-3 flex justify-between"><button disabled={active === 0} onClick={() => setActive(active - 1)} className="rounded-xl border px-4 py-2"><ChevronLeft className="inline h-4 w-4" />Назад</button><button disabled={active === answers.length - 1} onClick={() => setActive(active + 1)} className="rounded-xl border px-4 py-2">Далее<ChevronRight className="inline h-4 w-4" /></button></div>{finishBar}</div>
    )}
  </div>;
}
