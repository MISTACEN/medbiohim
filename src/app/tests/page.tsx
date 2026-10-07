"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Loader2, CheckCircle2 } from "lucide-react";
import {
  listTests,
  getTestCurriculumMap,
  getChemistryMaster,
  getTest,
  startTestAttempt,
  finishAttempt,
  saveTestAnswer,
  getFile,
  listMyAttempts,
  hasToken,
  type ApiTest,
} from "@/lib/api";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { Confetti } from "@/components/ui/Confetti";
import { QuestionReport } from "@/components/QuestionReport";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import { useAuth } from "@/components/auth/AuthProvider";

type UiTest = {
  id: string;
  title: string;
  subject: string;
  type: string;
  questionCount: number;
  sourceFileId?: string | null;
  sourceFileName?: string | null;
  moduleTitle?: string | null;
  topicTitle?: string | null;
  topicId?: string | null;
};

type Option = string | { label?: unknown; correct?: boolean };
type Q = {
  id: string;
  body: string;
  options: Option[];
  answer?: string | number | null;
  type?: string;
};

export default function TestsPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<UiTest[]>([]);
  const [curriculumMap, setCurriculumMap] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState<{
    testId: string;
    attemptId: string;
    title: string;
    questions: Q[];
  } | null>(null);
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const [result, setResult] = useState<{ score: number; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [grading, setGrading] = useState<Record<number, any>>({});
  const [chemistryItems, setChemistryItems] = useState<any[]>([]);
  const [chemistryTotal, setChemistryTotal] = useState(0);
  const [chemistryPage, setChemistryPage] = useState(1);
  const [chemistryPages, setChemistryPages] = useState(1);
  const [chemistryQuery, setChemistryQuery] = useState("");
  const [chemistryKind, setChemistryKind] = useState("");
  const [chemistryFormula, setChemistryFormula] = useState("");
  const [chemistryLoading, setChemistryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authLoading) return;
      if (!hasToken()) {
        setLoading(false);
        return;
      }
      try {
        const [res, mapRes] = await Promise.all([
          listTests(undefined, user?.groupId),
          getTestCurriculumMap(undefined, user?.groupId),
        ]);
        if (cancelled) return;
        if (res.ok) {
          setItems(
            (res.data.items || []).map((t: ApiTest & { questions_count?: number; type?: string }) => ({
              id: String(t.id),
              title: String(t.title || t.name || "Тест"),
              subject: String(t.subject_name || "—"),
              type: String(t.type || "test"),
              questionCount: Number(t.questions_count || 0),
              sourceFileId: t.source_file_id || null,
              sourceFileName: t.source_file_name || null,
              moduleTitle: t.module_title || null,
              topicTitle: t.topic_title || null,
              topicId: t.topic_id || null,
            }))
          );
        } else setNote(res.error.message);
        if (mapRes.ok) setCurriculumMap(mapRes.data.items || []);
        const history = await listMyAttempts(undefined, user?.groupId);
        if (!cancelled && history.ok) setAttempts(history.data.items || []);
      } catch {
        if (!cancelled) setNote("Не удалось загрузить тесты");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.groupId]);

  useEffect(() => {
    if (authLoading || !hasToken()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setChemistryLoading(true);
      void getChemistryMaster({q: chemistryQuery, kind: chemistryKind, formula: chemistryFormula, page: chemistryPage, limit: 12}).then((res:any) => {
        if (cancelled) return;
        if (res.ok) { setChemistryItems(res.data.items || []); setChemistryTotal(Number(res.data.pagination?.total || 0)); setChemistryPages(Math.max(1, Number(res.data.pagination?.pages || 1))); }
        else setNote(res.error.message);
      }).finally(() => { if (!cancelled) setChemistryLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [authLoading, chemistryQuery, chemistryKind, chemistryFormula, chemistryPage]);

  async function openSource(test: UiTest) {
    if (!test.sourceFileId) return;
    const r = await getFile(test.sourceFileId);
    if (r.ok && r.data.download?.url) window.open(r.data.download.url, "_blank", "noopener,noreferrer");
    else setNote(r.ok ? "Исходный файл сейчас недоступен" : r.error.message);
  }

  async function openTest(id: string) {
    setBusy(true);
    setResult(null);
    setPicks({});
    setGrading({});
    try {
      const detail = await getTest(id, user?.groupId);
      if (!detail.ok) {
        setNote(detail.error.message);
        return;
      }
      const attempt = await startTestAttempt(id, user?.groupId);
      if (!attempt.ok) {
        setNote(attempt.error.message);
        return;
      }
      const questions = (detail.data.questions || []).map((q: Record<string, unknown>, i: number) => {
        const rawOptions = Array.isArray(q.options) ? (q.options as unknown[]) : [];
        const options: Option[] = rawOptions.map((x: unknown) => {
          if (typeof x === "object" && x !== null && "label" in x) {
            return { label: String((x as { label?: unknown }).label ?? ""), correct: (x as { correct?: unknown }).correct === true };
          }
          return String(x);
        });
        return {
          id: String(q.id || i),
          body: String(q.body || q.q || q.text || ""),
          options,
          type: String(q.type || "mcq"),
          allowMultiple: Boolean(q.allow_multiple),
        };
      });
      setActive({
        testId: id,
        attemptId: attempt.data.attempt.id,
        title: String(detail.data.test.title || "Тест"),
        questions,
      });
    } catch {
      setNote("Не удалось начать тест");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!active) return;
    setBusy(true);
    try {
      const writes = active.questions.map((q, i) =>
        saveTestAnswer(active.attemptId, q.id, q.allowMultiple ? JSON.stringify(picks[i] || []) : ((picks[i] || [])[0] || ""))
      );
      const saved = await Promise.all(writes);
      const failed = saved.find((x:any) => !x.ok);
      setGrading(Object.fromEntries(saved.map((x:any, i:number) => [i, x.ok ? x.data?.answer : null])));
      if (failed) {
        setNote(failed.error?.message || "Не удалось сохранить ответы");
        setBusy(false);
        return;
      }
      const finished = await finishAttempt(active.attemptId);
      if (!finished.ok) {
        setNote(finished.error.message);
        setBusy(false);
        return;
      }
      const attempt=finished.data.attempt;
      setAttempts((prev) => [attempt, ...prev.filter((x:any) => x.id !== attempt.id)]);
      const score=Number(attempt.score||0);
      const max=Number(attempt.max_score||active.questions.length);
      setResult({ score, max });
      if (max > 0 && score / max >= 0.7) {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 2500);
      }
    } catch {
      setNote("Не удалось сохранить ответы");
    } finally {
      setBusy(false);
    }
  }

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600">Войдите, чтобы проходить тесты</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Войти
        </Link>
      </div>
    );
  }

  if (loading) return <SkeletonCards count={3} />;

  if (active) {
    return (
      <div className="tests-page space-y-4 sm:space-y-6">
        <Confetti active={celebrate} />
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="page-title">{active.title}</h1>
            <p className="page-subtitle">{active.questions.length} вопросов</p>
          </div>
          <button type="button" className="text-sm text-slate-500" onClick={() => setActive(null)}>
            ← К списку
          </button>
        </div>
        {active.questions.map((q, i) => (
          <div key={q.id} className="test-question-card card space-y-3">
            <div className="font-medium">
              {i + 1}.{" "}
              <ChemRichText text={q.body} className="mt-1 space-y-2 text-sm font-medium" />
            </div>
            {q.type === "open" || q.type === "problem" || q.type === "theory" || q.type === "practical" ? (
              <textarea
                value={(picks[i] || [])[0] || ""}
                onChange={(e) => setPicks((p) => ({ ...p, [i]: [e.target.value] }))}
                className="min-h-32 w-full rounded-xl border p-3 text-sm"
                placeholder="Введите ответ…"
              />
            ) : (
              <>
                {q.allowMultiple && (
                  <div className="text-xs text-slate-500">Можно выбрать несколько вариантов.</div>
                )}
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const label = typeof opt === "string" ? opt : String(opt.label ?? "");
                    const multi = Boolean(q.allowMultiple);
                    const selected = (picks[i] || []).includes(label);
                    return (
                      <label
                        key={oi}
                        className={"flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm " + (selected ? "border-blue-500 bg-blue-50" : "border-slate-100")}
                      >
                        <input
                          type={multi ? "checkbox" : "radio"}
                          name={"q-" + i}
                          checked={selected}
                          onChange={() =>
                            setPicks((p) => {
                              const current = p[i] || [];
                              const next = multi
                                ? current.includes(label)
                                  ? current.filter((x) => x !== label)
                                  : [...current, label]
                                : [label];
                              return { ...p, [i]: next };
                            })
                          }
                        />
                        <ChemRichText text={label} className="flex-1 space-y-1 text-sm" />
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            {grading[i] && (
              <div className={"rounded-xl px-3 py-2 text-xs " + (
                grading[i].is_correct === true ? "bg-emerald-50 text-emerald-700" :
                grading[i].is_correct === false ? "bg-rose-50 text-rose-700" :
                "bg-amber-50 text-amber-700"
              )}>
                {grading[i].grading_status === "ai" ? "ИИ-проверка" : "Автопроверка"}: {
                  grading[i].is_correct === true ? "ответ засчитан" :
                  grading[i].is_correct === false ? "ответ не засчитан" :
                  "ответ требует повторной проверки"
                }
                {grading[i].grading_confidence != null ? " · уверенность " + Math.round(Number(grading[i].grading_confidence) * 100) + "%" : ""}
                {grading[i].feedback ? <div className="mt-1">{String(grading[i].feedback)}</div> : null}
              </div>
            )}
            <QuestionReport questionId={q.id} />
          </div>
        ))}
        {result ? (
          <div className="card flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="h-6 w-6" />
            Результат: {result.score} из {result.max}
          </div>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сдать тест"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Тесты и билеты</h1>
        <p className="page-subtitle">Проверка знаний по предметам</p>
        {note && <p className="mt-2 text-sm text-amber-700">{note}</p>}
      </div>

      {curriculumMap.length > 0 && (
        <section className="card p-5 space-y-5">
          <div>
            <h2 className="font-semibold">Темы занятий → что готовить</h2>
            <p className="mt-1 text-sm text-slate-500">Вопросы и тесты привязаны к темам. Начинай подготовку с темы ближайшего занятия.</p>
          </div>
          <div className="space-y-4">
            {curriculumMap.map((subject: any) => (
              <div key={String(subject.subject_id)} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-800">{String(subject.subject_name || "Предмет")}</h3>
                  {Number(subject.unclassified_questions || 0) > 0 && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      {Number(subject.unclassified_questions)} вопросов пока без темы
                    </span>
                  )}
                </div>
                {subject.modules?.map((module: any) => (
                  <div key={String(module.module_id)} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 sm:p-4">
                    <div className="mb-2 text-sm font-semibold text-slate-700">{String(module.title || "Раздел")}</div>
                    <div className="space-y-2">
                      {(module.topics || []).map((topic: any) => {
                        const topicTests = items.filter((item) => item.topicId === topic.topic_id);
                        return (
                          <div key={String(topic.topic_id)} className="rounded-xl border bg-white px-3 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="font-medium text-slate-800">{String(topic.title)}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {Number(topic.question_count || 0)} вопросов · {Number(topic.test_count || 0)} тестов
                                </div>
                                {topic.planned_date && <div className="mt-1 text-xs font-medium text-indigo-600">Занятие: {new Date(topic.planned_date + "T00:00:00").toLocaleDateString("ru-RU")}</div>}
                                {topic.is_extra && <div className="mt-1 text-xs font-medium text-amber-700">Дополнительно / вне текущего календаря</div>}
                              </div>
                              {topicTests.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {topicTests.map((item) => (
                                    <Link key={item.id} href={"/tests/bank/" + item.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800">
                                      Открыть банк
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card p-5 mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold">Единый банк заданий по химии</h2>
            <p className="mt-1 text-sm text-slate-500">436 элементов из двух методических источников и текущего банка. Структурные и скелетные формулы не подменяются догадками.</p>
          </div>
          <div className="text-xs text-slate-500">{chemistryTotal} найдено</div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input value={chemistryQuery} onChange={(e)=>{setChemistryQuery(e.target.value);setChemistryPage(1);}} placeholder="Поиск по вопросу или теме…" className="rounded-xl border px-3 py-2 text-sm" />
          <select value={chemistryKind} onChange={(e)=>{setChemistryKind(e.target.value);setChemistryPage(1);}} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">Все типы</option><option value="open_task">Открытые задания</option><option value="test_question">Тестовые вопросы</option>
          </select>
          <select value={chemistryFormula} onChange={(e)=>{setChemistryFormula(e.target.value);setChemistryPage(1);}} className="rounded-xl border px-3 py-2 text-sm">
            <option value="">Формулы: все</option><option value="true">Формулы сохранены</option><option value="false">Без формулы</option>
          </select>
        </div>
        {chemistryLoading ? (
          <div className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Загружаю задания…</div>
        ) : (
          <div className="mt-4 space-y-2">
            {chemistryItems.map((item:any,index:number)=>
              <details key={String(item.item_id)} className="rounded-xl border bg-white">
                <summary className="cursor-pointer list-none px-3 py-3">
                  <div className="flex gap-3">
                    <span className="min-w-7 text-xs font-semibold text-slate-400">{(chemistryPage-1)*12+index+1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{String(item.question||"Без текста")}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{item.kind==="test_question"?"Тест":"Задание"}</span>
                        {item.topic&&<span>· {String(item.topic)}</span>}
                        {item.formula_preserved&&<span className="font-medium text-indigo-600">· формула сохранена</span>}
                        {item.answer_status==="prepared_from_text"&&<span className="font-medium text-emerald-600">· ответ подготовлен</span>}
                      </div>
                    </div>
                  </div>
                </summary>
                <div className="border-t bg-slate-50/60 px-3 py-3 sm:px-5">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ответ</div>
                  {item.answer?<ChemRichText text={String(item.answer)} className="mt-2 space-y-2 text-sm text-slate-700"/>:<p className="mt-2 text-sm text-amber-700">Ответ ещё не подготовлен. Исходная формулировка сохранена.</p>}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    {item.source&&<span className="rounded-full bg-white px-2 py-1 border">Источник: {String(item.source)}</span>}
                    {item.source_number&&<span className="rounded-full bg-white px-2 py-1 border">№ {String(item.source_number)}</span>}
                    {item.answer_status&&<span className="rounded-full bg-white px-2 py-1 border">{String(item.answer_status)}</span>}
                  </div>
                </div>
              </details>
            )}
            {chemistryItems.length===0&&<div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">По заданным фильтрам ничего не найдено.</div>}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" disabled={chemistryPage<=1||chemistryLoading} onClick={()=>setChemistryPage(p=>Math.max(1,p-1))} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40">← Назад</button>
          <span className="text-xs text-slate-500">Страница {chemistryPage} из {chemistryPages}</span>
          <button type="button" disabled={chemistryPage>=chemistryPages||chemistryLoading} onClick={()=>setChemistryPage(p=>Math.min(chemistryPages,p+1))} className="rounded-xl border px-3 py-2 text-sm disabled:opacity-40">Вперёд →</button>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">История попыток</h2>
            <p className="mt-1 text-xs text-slate-500">Последние 50 завершённых и незавершённых попыток.</p>
          </div>
        </div>
        {attempts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Попыток пока нет.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {attempts.slice(0, 12).map((a:any) => (
              <div key={String(a.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 px-3 py-2.5 text-sm">
                <div>
                  <div className="font-semibold text-slate-800">{String(a.test_title || "Тест")}</div>
                  <div className="text-xs text-slate-500">{a.started_at ? String(a.started_at).slice(0,16).replace("T"," ") : "—"} · {String(a.status || "—")}</div>
                </div>
                <div className="font-bold text-indigo-700">{a.percent != null ? String(a.percent) + "%" : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          Пока нет опубликованных тестов. Админ может добавить их в панели управления.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((t) => (
            <div key={t.id} className="test-list-card card flex flex-col gap-3">
              <div>
                <div className="text-xs text-slate-500">{t.subject}</div>
                <div className="text-lg font-semibold">{t.title}</div>
                <div className="text-sm text-slate-500">{t.questionCount || "—"} вопросов</div>
                {t.moduleTitle && <div className="mt-2 text-xs font-medium text-slate-500">{t.moduleTitle}</div>}
                {t.topicTitle && <div className="text-xs text-indigo-600">{t.topicTitle}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/tests/bank/${t.id}`} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">Банк вопросов</Link><Link href={`/tests/preparation/${t.id}`} className="rounded-xl border px-4 py-2 text-sm font-semibold text-indigo-700">Подготовка</Link><Link href={`/tests/preparation/${t.id}?mode=exam`} className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700">Экзамен</Link>
                {t.sourceFileId && <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => void openSource(t)}>Исходник{t.sourceFileName ? " · " + t.sourceFileName : ""}</button>}
                <button
                type="button"
                className="btn-primary inline-flex items-center gap-2 self-start"
                disabled={busy}
                onClick={() => void openTest(t.id)}
              >
                <Play className="h-4 w-4" /> Тест
              </button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
