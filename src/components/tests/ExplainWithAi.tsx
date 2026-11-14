"use client";

/**
 * «Объяснить · ИИ» — разбор ошибки в один клик (Фаза 3 дорожной карты).
 *
 * Шлёт в /ai/chat текст вопроса, выбранный и правильный ответ, режим «точный»
 * (RAG по лекциям предмета) и показывает короткий разбор со сносками [N],
 * ведущими в лекции. Ничего не сохраняет: это разовая подсказка.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { aiChat } from "@/lib/features-api";
import { describeApiError } from "@/lib/errors";
import { AnswerSources } from "@/components/ai/AnswerSources";

export function ExplainWithAi({
  question,
  chosen,
  correct,
  subjectSlug,
  subjectName,
  className = "",
}: {
  /** Текст вопроса теста. */
  question: string;
  /** Что выбрал студент. */
  chosen?: string;
  /** Правильный ответ из ключа. */
  correct?: string;
  /** Слаг предмета: по нему тьютор берёт лекции. */
  subjectSlug?: string | null;
  subjectName?: string | null;
  className?: string;
}) {
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explain() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setAnswer("");
    const response = await aiChat(
      [
        {
          role: "user",
          content:
            `Разбери мою ошибку в тесте${subjectName ? ` по предмету «${subjectName}»` : ""}.\n`
            + `Вопрос: ${question}\n`
            + (chosen ? `Мой ответ (неверный): ${chosen}\n` : "")
            + (correct ? `Правильный ответ: ${correct}\n` : "")
            + "Объясни коротко (3–6 предложений): почему мой ответ неверен и почему верен правильный. "
            + "Дай одну мнемонику. Опирайся на материалы курса и ставь сноску [N] после утверждений из фрагментов.",
        },
      ],
      "auto",
      { mode: "precise", subjectSlug: subjectSlug || undefined },
    );
    setBusy(false);
    if (!response.ok) {
      setError(describeApiError(response.error));
      return;
    }
    setAnswer(response.data.message.content);
    setSources(response.data.sources ?? null);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void explain()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] transition hover:bg-[var(--primary-soft)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Объяснить · ИИ
      </button>
      {error ? <p className="mt-2 text-xs text-[var(--status-critical-fg)]">{error}</p> : null}
      {answer ? (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm leading-relaxed">
          <div className="whitespace-pre-wrap">{answer}</div>
          <AnswerSources sources={sources} />
        </div>
      ) : null}
    </div>
  );
}
