"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ListChecks, Loader2, Search } from "lucide-react";
import { listExamQuestions } from "@/lib/api";
import { ErrorState } from "@/components/ui/ErrorState";
import { ChemRichText } from "@/components/chemistry/ChemRichText";

type ExamQuestion = {
  id: string;
  text: string;
  answer: string | null;
  has_answer: boolean;
  topic: string | null;
  kind: string | null;
  type: string | null;
};

type TopicCount = { topic: string; count: number };

const PAGE = 50;

/**
 * Вопросы к экзамену с кафедры: список для подготовки, сгруппированный по темам.
 * Это не билеты — билеты генерируются из другого набора (`for_ticket`).
 */
export default function ExamQuestionsPanel({ subjectSlug }: { subjectSlug: string }) {
  const [items, setItems] = useState<ExamQuestion[]>([]);
  const [topics, setTopics] = useState<TopicCount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [openAnswers, setOpenAnswers] = useState<Set<string>>(new Set());
  const requestSeq = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const seq = ++requestSeq.current;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const response = await listExamQuestions({
        subject: subjectSlug,
        q: appliedQuery || undefined,
        topic: topic || undefined,
        limit: PAGE,
        offset,
      });
      if (seq !== requestSeq.current) return;
      setLoading(false);
      setLoadingMore(false);
      if (!response.ok) {
        setError({ message: response.error.message, requestId: response.requestId });
        return;
      }
      const nextItems: ExamQuestion[] = Array.isArray(response.data?.items) ? response.data.items : [];
      setItems((current) => (offset === 0 ? nextItems : [...current, ...nextItems]));
      setTopics(Array.isArray(response.data?.topics) ? response.data.topics : []);
      setTotal(Number(response.data?.total) || nextItems.length);
    },
    [subjectSlug, appliedQuery, topic]
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  function toggleAnswer(id: string) {
    setOpenAnswers((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setAppliedQuery(query.trim());
  }

  if (loading) {
    return (
      <div className="card space-y-3 p-5" aria-label="Загрузка вопросов">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Вопросы к экзамену не загрузились" message={error.message} requestId={error.requestId} retry={() => void load(0)} />;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-[var(--card)] p-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">
          <ListChecks className="h-4 w-4" /> Вопросы к экзамену
        </div>
        <h2 className="mt-1.5 font-serif text-xl font-semibold">Что спросят на экзамене</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          Перечень вопросов кафедры: {total > 0 ? `${total} вопросов` : "пока пусто"}. Отмечайте, что уже разобрано, и повторяйте по темам.
        </p>

        <form onSubmit={submitSearch} className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти вопрос по тексту"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
              aria-label="Поиск по вопросам к экзамену"
            />
          </div>
          {topics.length > 1 && (
            <select
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                setAppliedQuery(query.trim());
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              aria-label="Тема"
            >
              <option value="">Все темы</option>
              {topics.map((entry) => (
                <option key={entry.topic} value={entry.topic}>
                  {entry.topic} ({entry.count})
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="btn-secondary text-sm">
            Найти
          </button>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="card p-6 text-sm" style={{ color: "var(--muted)" }}>
          {appliedQuery || topic
            ? "По этому фильтру вопросов нет — попробуйте другой запрос."
            : "Вопросы к экзамену для этого предмета пока не загружены."}
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const open = openAnswers.has(item.id);
            return (
              <li key={item.id} className="rounded-2xl border bg-[var(--card)] p-4" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6" style={{ color: "var(--text)" }}>
                      {item.text}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {item.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold">{item.topic}</span>}
                      {item.type && <span className="rounded-full bg-slate-50 px-2 py-0.5">{item.type}</span>}
                      {item.has_answer ? (
                        <button
                          type="button"
                          onClick={() => toggleAnswer(item.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700"
                          aria-expanded={open}
                        >
                          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {open ? "Скрыть ответ" : "Показать ответ"}
                        </button>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">ответ готовится</span>
                      )}
                    </div>
                    {open && item.answer && (
                      <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                        <ChemRichText text={item.answer} className="space-y-1" />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {items.length > 0 && items.length < total && (
        <button type="button" className="btn-secondary inline-flex items-center gap-2 text-sm" onClick={() => void load(items.length)} disabled={loadingMore}>
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
          Показать ещё ({total - items.length})
        </button>
      )}
    </section>
  );
}
