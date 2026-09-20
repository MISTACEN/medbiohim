"use client";

import { useEffect, useRef, useState } from "react";
import { tutorAsk, tutorMeta, type TutorAnswer, type TutorSource } from "@/lib/api";
import { Bot, Loader2, Send, BookOpen, Sparkles, Filter } from "lucide-react";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: TutorSource[];
  mode?: string;
};

export default function TutorPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Array<{ subject: string; subject_slug: string; chunks: number }>>([]);
  const [subjectSlug, setSubjectSlug] = useState("");
  const [meta, setMeta] = useState<{ chunks: number; llm: boolean; model?: string | null } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    tutorMeta().then((res) => {
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setSubjects(res.data.subjects || []);
      setMeta({
        chunks: res.data.index?.chunks ?? 0,
        llm: !!res.data.llm_enabled,
        model: res.data.model,
      });
    });
    try {
      const pre = sessionStorage.getItem("tutor_prefill");
      if (pre) {
        setInput(pre);
        sessionStorage.removeItem("tutor_prefill");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setError(null);
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: q };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    const res = await tutorAsk(q, {
      subject_slug: subjectSlug || undefined,
      history,
      top_k: 6,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error.message);
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "Не удалось получить ответ: " + res.error.message,
        },
      ]);
      return;
    }
    const data: TutorAnswer = res.data;
    setMessages((m) => [
      ...m,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        mode: data.mode,
      },
    ]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-5.5rem)] max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bot className="h-7 w-7 text-[var(--primary)]" />
            AI-тьютор
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Вопросы по любому предмету платформы. Ответ строится на базе методичек, билетов и тренажёров.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          {meta && (
            <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 font-medium text-[var(--primary)]">
              {meta.chunks.toLocaleString("ru-RU")} фрагментов
              {meta.llm ? ` · LLM ${meta.model || ""}` : " · локальный RAG"}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-[var(--muted)]" />
        <select
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          value={subjectSlug}
          onChange={(e) => setSubjectSlug(e.target.value)}
        >
          <option value="">Все предметы</option>
          {subjects.map((s) => (
            <option key={s.subject_slug} value={s.subject_slug}>
              {s.subject} ({s.chunks})
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--muted)]">фильтр необязателен</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--primary-soft)]">
                <Sparkles className="h-8 w-8 text-[var(--primary)]" />
              </div>
              <div className="max-w-md space-y-2">
                <p className="font-semibold">Задайте вопрос по учёбе</p>
                <p className="text-sm text-[var(--muted)]">
                  Например: «Строение мембраны клетки», «Почему метформин осторожно при ХБП»,
                  «Уровни организации живого».
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  "Транспорт веществ через мембрану",
                  "Что такое клиренс креатинина",
                  "Уровни организации живого",
                ].map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--primary-soft)]"
                    onClick={() => {
                      setInput(ex);
                      inputRef.current?.focus();
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[85%] ${
                  m.role === "user"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--background)] border border-[var(--border)]"
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-2">
                    <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      <BookOpen className="h-3 w-3" /> Источники
                      {m.mode ? ` · ${m.mode}` : ""}
                    </div>
                    {m.sources.slice(0, 5).map((s) => (
                      <div key={s.id} className="text-xs text-[var(--muted)]">
                        <span className="font-medium text-[var(--text)]">
                          {s.subject}
                          {s.topic ? ` · ${s.topic}` : ""}
                        </span>
                        <span className="opacity-70"> · {s.source} · score {s.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Ищу в базе знаний…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--border)] p-3 sm:p-4">
          {error && (
            <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ваш вопрос… (Enter — отправить, Shift+Enter — новая строка)"
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || !input.trim()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow disabled:opacity-40"
              aria-label="Отправить"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
