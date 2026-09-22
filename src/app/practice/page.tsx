"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getQuestion,
  listQuestionSubjects,
  listQuestions,
  type BankQuestion,
} from "@/lib/api";
import { Loader2, Search, Eye, EyeOff } from "lucide-react";
import { QuestionReport } from "@/components/QuestionReport";

export default function PracticePage() {
  const [subjects, setSubjects] = useState<
    Array<{ subject: string; subject_slug: string; count: number }>
  >([]);
  const [items, setItems] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [subjectSlug, setSubjectSlug] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<BankQuestion | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    listQuestionSubjects().then((res) => {
      if (res.ok) setSubjects(res.data.items);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await listQuestions({
        subject_slug: subjectSlug || undefined,
        kind: kind || undefined,
        q: q || undefined,
        limit: 40,
      });
      if (cancelled) return;
      if (res.ok) {
        setItems(res.data.items);
        setTotal(res.data.total);
        setNote(null);
      } else {
        setNote(res.error.message);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectSlug, kind, q]);

  async function openQuestion(id: string) {
    setShowAnswer(false);
    setDraft("");
    const res = await getQuestion(id);
    if (res.ok) setSelected(res.data.question);
    else setNote(res.error.message);
  }

  const kinds = useMemo(
    () => [
      { value: "", label: "Все типы" },
      { value: "main", label: "Основной банк" },
      { value: "ticket", label: "Билетные" },
      { value: "mc", label: "MC-тесты" },
      { value: "theory", label: "ХОБА теория" },
      { value: "practical", label: "ХОБА практика" },
      { value: "task", label: "ХОБА задачи" },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Практика</h1>
        <p className="page-subtitle">
          Универсальный банк вопросов · {total} найдено · вопрос → ответ → эталон
        </p>
      </div>

      {note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {note}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={subjectSlug}
          onChange={(e) => setSubjectSlug(e.target.value)}
        >
          <option value="">Все предметы</option>
          {subjects.map((s) => (
            <option key={s.subject_slug} value={s.subject_slug}>
              {s.subject} ({s.count})
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {kinds.map((k) => (
            <option key={k.value || "all"} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
            placeholder="Поиск по тексту…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card max-h-[70vh] overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Ничего не найдено</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openQuestion(item.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-primary/5 ${
                      selected?.id === item.id ? "bg-primary/10 font-medium" : ""
                    }`}
                  >
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">
                      {item.subject}
                      {item.kind ? ` · ${item.kind}` : ""}
                      {item.has_answer ? " · эталон" : ""}
                    </div>
                    <div className="line-clamp-2">{item.text}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card space-y-4 p-5">
          {!selected ? (
            <p className="text-sm text-slate-500">
              Выберите вопрос слева. Режим: свой ответ → показать эталон.
            </p>
          ) : (
            <>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {selected.subject}
                  {selected.topic ? ` · ${selected.topic}` : ""}
                </div>
                <h2 className="mt-1 text-lg font-semibold leading-snug">
                  {selected.text}
                </h2>
              </div>
              <QuestionReport questionId={selected.id} />

              {selected.type === "mc" && selected.options?.length ? (
                <div className="space-y-2">
                  {selected.options.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setDraft(String(idx))}
                      className={`block w-full rounded-xl border px-3 py-2 text-left text-sm ${
                        draft === String(idx)
                          ? "border-primary bg-primary/10"
                          : "border-slate-200"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  className="min-h-[140px] w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Ваш ответ (черновик)…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              )}

              <button
                type="button"
                className="btn-primary inline-flex items-center gap-2 text-sm"
                onClick={() => setShowAnswer((v) => !v)}
              >
                {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showAnswer ? "Скрыть эталон" : "Показать эталон"}
              </button>

              {showAnswer && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-slate-800">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Официальный ответ
                  </div>
                  {selected.type === "mc" && selected.options ? (
                    <p>
                      {selected.options[selected.correct ?? 0] ?? selected.answer ?? "—"}
                    </p>
                  ) : (
                    <div
                      className="whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{
                        __html: (selected.answer || "Эталон пока пуст").replace(/\n/g, "<br/>"),
                      }}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
