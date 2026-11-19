"use client";

/** Preview вопросов: выбор, предупреждения и импорт после проверки. */
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import type { UniversityImportState } from "@/components/university/import/useUniversityImport";

export function PreviewSection({ page }: { page: UniversityImportState }) {
  const { bundle, included, setIncluded, includedQuestions, subjectKey, testTitle, busy, toggleQuestion, run } = page;
  if (!bundle) return null;

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900">Preview вопросов</h2>
          <p className="text-xs text-slate-500">
            Выбрано {includedQuestions.length} из {bundle.questions.length}. Снимите галочку, чтобы не импортировать вопрос.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setIncluded(new Set(bundle.questions.map((question) => question.key)))}>Выбрать все</button>
          <button type="button" className="btn-secondary" onClick={() => setIncluded(new Set())}>Снять все</button>
        </div>
      </div>

      {bundle.skipped.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-xs text-[var(--status-warn-fg)]">
          <div className="font-semibold">Пропущено при разборе: {bundle.skipped.length}</div>
          <ul className="mt-1 list-disc pl-5">
            {bundle.skipped.slice(0, 6).map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {bundle.questions.map((question, index) => {
          const isIncluded = included.has(question.key);
          return (
            <article key={question.key} className={`rounded-xl border p-3 transition ${isIncluded ? "border-indigo-100 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={isIncluded} onChange={() => toggleQuestion(question.key)} className="mt-1" aria-label={`Импортировать вопрос ${index + 1}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{index + 1}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{question.type === "open" ? "Открытый" : question.correctCount > 1 ? "Несколько ответов" : "Один ответ"}</span>
                    {question.warning && <span className="rounded-full bg-[var(--status-warn-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-warn-fg)]">{question.warning}</span>}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">{question.text}</div>
                  {question.options.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {question.options.map((option, optionIndex) => (
                        <li key={`${option.label}-${optionIndex}`} className={`rounded-lg px-2 py-1 text-xs ${option.correct ? "bg-[var(--status-ok-bg)] font-semibold text-[var(--status-ok-fg)]" : "text-slate-600"}`}>
                          {option.correct ? "✓" : "○"} {option.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {question.type === "open" && (
                    <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">
                      <b>Эталон:</b> {question.answer || "не указан"}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                    <span className="break-all">source: {question.source.url}</span>
                    <span>key: {question.key}</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button type="button" disabled={busy || !includedQuestions.length || !subjectKey || !testTitle.trim()} onClick={() => void run(true)} className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Проверить через API
        </button>
        <button type="button" disabled={busy || !includedQuestions.length || !subjectKey || !testTitle.trim()} onClick={() => void run(false)} className="btn-primary inline-flex items-center gap-2 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Импортировать
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        Preview и dry-run — локальная/API-проверка, а не подтверждение преподавателя. Для повторного импорта того же
        теста используйте тот же JSON: ключи стабильны, записи обновятся по source_key.
      </p>
    </section>
  );
}
