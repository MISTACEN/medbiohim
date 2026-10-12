"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, Check, ListChecks, Pencil, Play, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { adminUpdateBankQuestion, getBankProgress, getTestBank, hasToken, me, type ApiTest } from "@/lib/api";
import { ChemRichText } from "@/components/chemistry/ChemRichText";
import { QuestionReport } from "@/components/QuestionReport";
import { useAuth } from "@/components/auth/AuthProvider";

type BankOption = string | { label?: unknown; correct?: boolean };
type BankQuestion = {
  id: string;
  text: string;
  answer?: string | null;
  options: BankOption[];
  type?: string;
  topicTitle?: string | null;
};

function labelOf(o: BankOption) {
  return typeof o === "string" ? o : String(o.label ?? "");
}

function correctOf(o: BankOption) {
  return typeof o !== "string" && o.correct === true;
}

function isAdminResponse(payload: any): boolean {
  const candidates = [
    payload?.data?.roles,
    payload?.data?.user?.roles,
    payload?.data?.user?.role,
    payload?.roles,
    payload?.user?.roles,
    payload?.user?.role,
  ];
  return candidates.some((value) => {
    const xs = Array.isArray(value) ? value : value == null ? [] : [value];
    return xs.some((item) => {
      if (typeof item === "string") return item.toLowerCase() === "admin";
      if (item && typeof item === "object") {
        return String(item.code ?? item.slug ?? item.name ?? item.role ?? "").toLowerCase() === "admin";
      }
      return false;
    });
  });
}

type EditOption = { label: string; correct: boolean };

export default function TestBankPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading: authLoading } = useAuth();
  const [testId, setTestId] = useState("");
  const [test, setTest] = useState<ApiTest | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAnswers, setShowAnswers] = useState(true);
  const [topicFilter, setTopicFilter] = useState("all");
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; answer: string; options: EditOption[] } | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await params;
      if (cancelled) return;
      setTestId(p.id);
      if (authLoading) return;
      if (!hasToken()) {
        setLoading(false);
        return;
      }
      const [detail, bankProgress, meRes] = await Promise.all([
        getTestBank(p.id, user?.groupId),
        getBankProgress(p.id, user?.groupId),
        me(),
      ]);
      setIsAdmin(meRes.ok && isAdminResponse(meRes));
      if (cancelled) return;
      if (detail.ok) {
        setTest(detail.data.test);
        setQuestions(
          (detail.data.questions || []).map((q: Record<string, unknown>, i: number) => ({
            id: String(q.id || i),
            text: String(q.text || q.body || q.q || ""),
            answer: q.answer == null ? null : String(q.answer),
            options: Array.isArray(q.options) ? (q.options as BankOption[]) : [],
            type: String(q.type || "mcq"),
            topicTitle: q.topic_title == null ? null : String(q.topic_title),
          }))
        );
      } else setError(detail.error.message);
      if (bankProgress.ok) setProgress(bankProgress.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params, authLoading, user?.groupId]);

  const completedCorrect = Number(progress?.correct ?? 0);
  const answered = Number(progress?.answered ?? 0);
  const total = Number(progress?.total ?? questions.length);
  const percent = total ? Math.round((answered / total) * 100) : 0;

  const topicOptions = useMemo(() => Array.from(new Set(questions.map((q) => q.topicTitle).filter(Boolean))) as string[], [questions]);
  const visibleQuestions = useMemo(() => topicFilter === "all" ? questions : questions.filter((q) => q.topicTitle === topicFilter), [questions, topicFilter]);

  const modeLinks = useMemo(() => ({
    practice: `/tests/preparation/${encodeURIComponent(testId)}?mode=prepare&count=10`,
    solve: `/tests/preparation/${encodeURIComponent(testId)}?mode=solve&count=10`,
    exam: `/tests/preparation/${encodeURIComponent(testId)}?mode=exam&count=10`,
    sequential: `/tests/preparation/${encodeURIComponent(testId)}?flow=sequential&mode=prepare`,
  }), [testId]);

  if (!hasToken()) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-600">Войдите, чтобы открыть банк вопросов</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Войти</Link>
      </div>
    );
  }

  if (loading) return <div className="card p-8 text-sm text-slate-500">Загрузка банка…</div>;

  if (error || !test) {
    return <div className="card p-8 text-sm text-rose-600">{error || "Банк не найден"}</div>;
  }

  function openEditor(q: BankQuestion) {
    setEditingId(q.id);
    setDraft({
      text: q.text,
      answer: q.answer ?? "",
      options: q.options.map((o) => ({
        label: labelOf(o),
        correct: correctOf(o),
      })),
    });
    setSaveMessage("");
  }

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setSaveMessage("");
  }

  function updateDraftOption(index: number, patch: Partial<EditOption>) {
    setDraft((current) => current ? {
      ...current,
      options: current.options.map((o, i) => i === index ? { ...o, ...patch } : o),
    } : current);
  }

  async function saveQuestion() {
    if (!editingId || !draft) return;
    const text = draft.text.trim();
    const options = draft.options.map((o) => ({ label: o.label.trim(), correct: !!o.correct }));
    if (!text) {
      setSaveMessage("Введите формулировку вопроса.");
      return;
    }
    if (options.length < 2 || options.some((o) => !o.label)) {
      setSaveMessage("Нужно минимум 2 непустых варианта ответа.");
      return;
    }
    if (!options.some((o) => o.correct)) {
      setSaveMessage("Отметьте хотя бы один правильный вариант.");
      return;
    }

    setSaving(true);
    setSaveMessage("");
    const r = await adminUpdateBankQuestion(editingId, {
      text,
      answer: draft.answer.trim(),
      type: "mcq",
      options,
    });
    setSaving(false);

    if (!r.ok) {
      setSaveMessage(r.error.message);
      return;
    }

    setQuestions((items) => items.map((item) => item.id === editingId ? {
      ...item,
      text,
      answer: draft.answer.trim(),
      options,
      type: "mcq",
    } : item));
    setSaveMessage(`Сохранено. Версия ${r.data?.version_no ?? "—"}.`);
  }

  function addDraftOption() {
    setDraft((current) => current ? {
      ...current,
      options: [...current.options, { label: "", correct: false }],
    } : current);
  }

  function removeDraftOption(index: number) {
    setDraft((current) => current ? {
      ...current,
      options: current.options.filter((_, i) => i !== index),
    } : current);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <Link href="/tests" className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> К тестам
      </Link>

      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-indigo-500">Банк вопросов</div>
        <h1 className="mt-2 text-2xl font-extrabold">{String(test.title || "Тест")}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {questions.length} вопросов. Здесь можно изучить весь банк с ответами или выбрать режим прохождения.
        </p>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Режим прохождения</h2>
            <p className="text-sm text-slate-500">Для «весь банк» вопросы идут строго подряд и после завершения показывается 41/41.</p>
          </div>
          {progress && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="font-semibold">Прогресс всего банка</div>
              <div className="mt-1 text-slate-600">{answered} / {total} · {percent}% · правильно {completedCorrect}</div>
              {progress.completed && <div className="mt-1 font-semibold text-emerald-600">Банк полностью пройден</div>}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href={modeLinks.practice} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
            <BookOpenCheck className="h-5 w-5 text-indigo-600" />
            <div className="mt-2 font-semibold">Подготовка</div>
            <div className="mt-1 text-xs text-slate-500">случайная выборка, проверка сразу</div>
          </Link>
          <Link href={modeLinks.solve} className="rounded-xl border px-4 py-4">
            <ListChecks className="h-5 w-5 text-slate-700" />
            <div className="mt-2 font-semibold">Решение</div>
            <div className="mt-1 text-xs text-slate-500">случайная выборка, проверка в конце</div>
          </Link>
          <Link href={modeLinks.exam} className="rounded-xl border bg-slate-900 px-4 py-4 text-white">
            <Play className="h-5 w-5" />
            <div className="mt-2 font-semibold">Экзамен</div>
            <div className="mt-1 text-xs text-slate-300">без показа эталонов до конца</div>
          </Link>
          <Link href={modeLinks.sequential} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <RotateCcw className="h-5 w-5 text-emerald-700" />
            <div className="mt-2 font-semibold text-emerald-800">Весь банк подряд</div>
            <div className="mt-1 text-xs text-emerald-700">1 → {questions.length} без пропусков</div>
          </Link>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Все вопросы и ответы</h2>
            <p className="text-sm text-slate-500">Эталон выделен отдельно; для вопросов с несколькими правильными вариантами показаны все правильные пункты.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAnswers((v) => !v)}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            {showAnswers ? "Скрыть ответы" : "Показать ответы"}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-sm font-semibold text-slate-700">
            Тема занятия
            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal sm:min-w-[320px]">
              <option value="all">Все темы</option>
              {topicOptions.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
          </label>
          <div className="text-xs text-slate-500">Показывается {visibleQuestions.length} из {questions.length} вопросов</div>
        </div>

        <div className="mt-5 space-y-3">
          {visibleQuestions.map((q, i) => {
            const originalIndex = questions.findIndex((item) => item.id === q.id);
            const displayNumber = originalIndex >= 0 ? originalIndex + 1 : i + 1;
            const correctOptions = q.options.filter(correctOf).map(labelOf);
            const hasStructuredAnswers = correctOptions.length > 0;
            return (
              <article key={q.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-indigo-600 px-2 text-sm font-extrabold text-white">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-semibold text-slate-500">Вопрос {displayNumber} из {questions.length}</span>
                    {q.topicTitle && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{q.topicTitle}</span>}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => editingId === q.id ? closeEditor() : openEditor(q)}
                      className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"
                    >
                      {editingId === q.id ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      {editingId === q.id ? "Закрыть редактор" : "Исправить вопрос"}
                    </button>
                  )}
                </div>
                <ChemRichText text={q.text} className="mt-3 font-medium" />

                <div className="mt-3 space-y-2">
                  {q.options.map((option, oi) => {
                    const label = labelOf(option);
                    const isCorrect = correctOf(option);
                    return (
                      <div
                        key={oi}
                        className={
                          "rounded-xl border px-3 py-2 text-sm " +
                          (showAnswers && isCorrect
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-100 bg-white")
                        }
                      >
                        <span className="mr-2 font-semibold">{String.fromCharCode(65 + oi)}.</span>
                        <ChemRichText text={label} className="inline" />
                        {showAnswers && isCorrect && <span className="ml-2 text-xs font-bold text-emerald-700">✓ правильный</span>}
                      </div>
                    );
                  })}
                </div>

                {showAnswers && !hasStructuredAnswers && q.answer && (
                  <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                    <span className="font-semibold">Эталон: </span>
                    <ChemRichText text={q.answer} className="inline" />
                  </div>
                )}

                {isAdmin && editingId === q.id && draft && (
                  <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-indigo-900">Быстрое исправление №{i + 1}</div>
                        <div className="mt-1 text-xs text-indigo-700">Изменения сразу попадут в Supabase и будут использоваться при следующем прохождении.</div>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-indigo-700">только admin</div>
                    </div>

                    <label className="mt-4 block">
                      <div className="mb-1 text-xs font-semibold text-slate-600">Формулировка</div>
                      <textarea
                        value={draft.text}
                        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                        className="min-h-28 w-full rounded-xl border bg-white px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="mt-3 block">
                      <div className="mb-1 text-xs font-semibold text-slate-600">Эталонный ответ</div>
                      <input
                        value={draft.answer}
                        onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                        className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                      />
                    </label>

                    <div className="mt-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-600">Варианты ответа</div>
                          <div className="text-[11px] text-slate-500">Отметьте один или несколько правильных.</div>
                        </div>
                        <button
                          type="button"
                          onClick={addDraftOption}
                          className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
                        >
                          <Plus className="h-3.5 w-3.5" /> Добавить вариант
                        </button>
                      </div>

                      <div className="space-y-2">
                        {draft.options.map((option, oi) => (
                          <div key={oi} className="flex items-center gap-2 rounded-xl border bg-white p-2">
                            <button
                              type="button"
                              onClick={() => updateDraftOption(oi, { correct: !option.correct })}
                              className={"inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border " + (option.correct ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400")}
                              title={option.correct ? "Сделать неправильным" : "Отметить правильным"}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <span className="w-6 text-xs font-bold text-slate-400">{String.fromCharCode(65 + oi)}.</span>
                            <input
                              value={option.label}
                              onChange={(e) => updateDraftOption(oi, { label: e.target.value })}
                              className="min-w-0 flex-1 rounded-lg border px-2.5 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeDraftOption(oi)}
                              disabled={draft.options.length <= 2}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 disabled:opacity-30"
                              title="Удалить вариант"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {saveMessage && <div className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-indigo-800">{saveMessage}</div>}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void saveQuestion()}
                        className="btn-primary inline-flex items-center gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {saving ? "Сохранение…" : "Сохранить исправление"}
                      </button>
                      <button type="button" onClick={closeEditor} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
                <QuestionReport questionId={q.id} />
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
