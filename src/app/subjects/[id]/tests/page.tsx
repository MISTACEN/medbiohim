"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardCheck, Shuffle } from "lucide-react";
import { getSubject, listTests, type ApiTest } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";

export default function SubjectTestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading: authLoading } = useAuth();
  const [subjectId, setSubjectId] = useState("");
  const [subjectName, setSubjectName] = useState("Тесты");
  const [tests, setTests] = useState<ApiTest[]>([]);
  const [topic, setTopic] = useState("all");
  const [source, setSource] = useState("all");
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return () => { cancelled = true; };
    void (async () => {
      const p = await params;
      if (cancelled) return;
      setSubjectId(p.id);
      const [subject, rows] = await Promise.all([getSubject(p.id), listTests(p.id, user?.groupId)]);
      if (cancelled) return;
      if (subject.ok) setSubjectName(subject.data.subject?.name || "Тесты");
      if (rows.ok) setTests(rows.data.items || []);
      else setError(rows.error.message);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [params, authLoading, user?.groupId]);

  const topics = useMemo(() => tests.map((t) => ({ id: t.id, title: t.title || t.name || "Тест" })), [tests]);
  const sources = useMemo(() => Array.from(new Set(tests.map((t) => t.source_file_name || t.source_key || "база тестов"))), [tests]);
  const visible = useMemo(() => tests.filter((t) => (topic === "all" || t.id === topic) && (source === "all" || (t.source_file_name || t.source_key || "база тестов") === source)), [tests, topic, source]);

  const href = (testId: string, mode: "prepare" | "solve" | "exam") =>
    "/tests/preparation/" + encodeURIComponent(testId) + "?mode=" + mode + "&count=" + count;

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка тестов…</div>;

  return (
    <div className="space-y-6">
      <Link href={"/subjects/" + encodeURIComponent(subjectId)} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> К предмету
      </Link>

      <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Тесты · {subjectName}</p>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{subjectName}</h1>
        <p className="mt-2 text-sm text-slate-600">Выбери тему/источник, режим прохождения и сколько случайных вопросов взять из выбранного банка.</p>
      </header>

      {error && <div className="card p-4 text-sm text-rose-600">{error}</div>}

      <section className="card space-y-4 p-5">
        <div>
          <div className="text-sm font-semibold text-slate-800">Тема / банк</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setTopic("all")} className={"rounded-xl border px-3 py-2 text-sm font-semibold " + (topic === "all" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200")}>Все</button>
            {topics.map((t) => <button key={t.id} type="button" onClick={() => setTopic(t.id)} className={"rounded-xl border px-3 py-2 text-sm font-semibold " + (topic === t.id ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200")}>{t.title}</button>)}
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-slate-800">Источник</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setSource("all")} className={"rounded-xl border px-3 py-2 text-sm font-semibold " + (source === "all" ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200")}>Все источники</button>
            {sources.map((name) => <button key={name} type="button" onClick={() => setSource(name)} className={"rounded-xl border px-3 py-2 text-sm font-semibold " + (source === name ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200")}>{name}</button>)}
          </div>
        </div>

        <label className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-slate-800">Случайных вопросов</span>
          <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2" />
          <span className="text-xs text-slate-500">если вопросов меньше — используются все доступные</span>
        </label>
      </section>

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">Для этого предмета пока нет опубликованных тестов.</div>
      ) : (
        <div className="grid gap-4">
          {visible.map((test) => (
            <article key={test.id} className="card">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-500">
                    <ClipboardCheck className="h-4 w-4" /> Тема / банк
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-slate-900">{test.title || test.name || "Тест"}</h2>
                  <p className="mt-1 text-sm text-slate-500">{test.questions_count || 0} вопросов · источник: {test.source_file_name || test.source_key || "база тестов"}</p>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <Shuffle className="h-4 w-4" /> порядок случайный
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Link href={`/tests/bank/${encodeURIComponent(test.id)}`} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">📚 Банк вопросов<div className="mt-1 text-xs font-normal text-emerald-700">все вопросы + ответы + режимы</div></Link>
                <Link href={href(test.id, "prepare")} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">🎯 Подготовка<div className="mt-1 text-xs font-normal text-indigo-600">случайная выборка, проверка сразу</div></Link>
                <Link href={href(test.id, "solve")} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">📝 Решение<div className="mt-1 text-xs font-normal text-slate-500">случайная выборка, проверка в конце</div></Link>
                <Link href={`/tests/preparation/${encodeURIComponent(test.id)}?flow=sequential&mode=prepare`} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500">↪ Весь банк подряд<div className="mt-1 text-xs font-normal text-emerald-50">1 → весь банк без пропусков</div></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
