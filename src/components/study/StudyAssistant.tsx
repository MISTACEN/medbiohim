"use client";

/**
 * Компактный ИИ-ассистент в /study: вопрос → ответ с учебным контекстом
 * студента (context_scope=study: расписание, ДЗ, слабые темы, SRS-очередь).
 * Stateless: история не сохраняется, для диалогов — полный тьютор в /tools.
 */
import { useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Send } from "lucide-react";
import { aiChat } from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";

export function StudyAssistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setAnswer("");
    const response = await aiChat(
      [{ role: "user", content: q }],
      "auto",
      { contextScope: "study" },
    );
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    setAnswer(response.data.message.content);
    setQuestion("");
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Bot className="h-4 w-4 text-[var(--primary)]" /> Спросить ассистента
        </h2>
        <Link href="/tutor" className="text-xs font-semibold text-[var(--primary)]">Полный чат с историей →</Link>
      </div>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        Ассистент видит ваше расписание, ДЗ, слабые темы и очередь повторения — спросите «что мне сегодня делать?» или «что готовить к контрольной?»
      </p>
      <div className="mt-3 flex gap-2">
        <textarea
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}
          disabled={busy}
          placeholder="Ваш вопрос… Enter — отправить"
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={busy || !question.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-white disabled:opacity-40"
          aria-label="Спросить"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--status-critical-fg)]">{error}</p> : null}
      {answer ? (
        <div className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm leading-relaxed">
          {answer}
        </div>
      ) : null}
    </section>
  );
}
