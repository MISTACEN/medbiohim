"use client";

/** Подготовка к тесту: режим → попытка → разбор. Состояние — в хуке домена. */
import { Suspense } from "react";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { PreparationModePicker } from "@/components/test-prep/PreparationModePicker";
import { PreparationResults } from "@/components/test-prep/PreparationResults";
import { PreparationRunner } from "@/components/test-prep/PreparationRunner";
import { usePreparation } from "@/components/test-prep/usePreparation";

const LOADING_TEXT = <div className="p-8 text-center text-sm text-slate-500">Загрузка…</div>;

function PreparationInner() {
  const page = usePreparation();

  if (!page.mode) return <PreparationModePicker page={page} />;
  if (page.loading && !page.session) {
    return (
      <>
        <LoadingBar active={page.loading} />
        {LOADING_TEXT}
      </>
    );
  }
  if (page.stats) return <PreparationResults page={page} />;

  if (!page.q) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">
          <div className="font-semibold">Не удалось загрузить вопросы сессии.</div>
          <div className="mt-1">
            {page.error || (page.questions.length === 0
              ? "Сессия создана, но API не вернул список вопросов."
              : "Сохранённая позиция вопроса была вне диапазона.")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {page.questions.length > 0 && (
            <button
              type="button"
              onClick={() => page.setIdx(Math.min(Math.max(0, page.idx), page.questions.length - 1))}
              className="btn-primary"
            >
              Открыть вопросы
            </button>
          )}
          <button type="button" onClick={() => page.router.push("/tests")} className="rounded-xl border px-4 py-2 font-semibold">
            К тестам
          </button>
        </div>
      </div>
    );
  }

  return <PreparationRunner page={page} />;
}

export default function PreparationPage() {
  return (
    <Suspense fallback={<><LoadingBar active />{LOADING_TEXT}</>}>
      <PreparationInner />
    </Suspense>
  );
}
