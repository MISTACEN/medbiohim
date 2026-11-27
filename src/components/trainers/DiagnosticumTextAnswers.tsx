"use client";

/**
 * Ответ словами на части задания диагностикума.
 *
 * Свободный ввод включается переключателем в тулбаре и доступен в любом режиме.
 * Проверка — по смыслу: сервер сначала сравнивает правила, затем (если формулировка
 * расходится) спрашивает ИИ. Студент видит, как именно зачли ответ.
 */
import type {
  DiagnosticumPart,
  DiagnosticumResult,
  DiagnosticumTextOutcome,
} from "@/lib/diagnosticum-api";

type DiagnosticumTextAnswersProps = {
  parts: DiagnosticumPart[];
  values: Record<string, string>;
  result: DiagnosticumResult | null;
  onChange: (partId: string, value: string) => void;
};

function verdictLine(outcome: DiagnosticumTextOutcome): string {
  if (outcome.verdict === "correct") {
    return outcome.source === "ai"
      ? "Зачтено по смыслу (ИИ): формулировка отличается, объект тот же."
      : "Зачтено: совпало с эталоном.";
  }
  if (outcome.verdict === "unsure") {
    return `Не зачтено автоматически — нужно посмотреть вручную. Эталон: ${outcome.target}.`;
  }
  return `Не зачтено. Эталон: ${outcome.target}.`;
}

export function DiagnosticumTextAnswers({
  parts,
  values,
  result,
  onChange,
}: DiagnosticumTextAnswersProps) {
  return (
    <>
      {parts.map((part) => {
        const outcome = result?.text?.[part.id];
        const correct = outcome?.verdict === "correct";
        return (
          <div key={part.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">{part.title}</h3>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                свободный ответ
              </span>
            </div>
            <input
              value={values[part.id] ?? ""}
              onChange={(event) => onChange(part.id, event.target.value)}
              disabled={Boolean(result)}
              placeholder="Название препарата или структуры"
              aria-label={part.title}
              autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-300 disabled:bg-slate-50 disabled:text-slate-500"
            />
            <p className="text-xs text-slate-500">
              Формулировка может отличаться — сверим по смыслу, а не по буквам.
            </p>
            {outcome ? (
              <p
                className={
                  "rounded-xl px-3 py-2 text-sm " +
                  (correct
                    ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                    : "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")
                }
              >
                {verdictLine(outcome)}
                {outcome.reason ? ` · ${outcome.reason}` : ""}
              </p>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
