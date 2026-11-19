"use client";

/** Итоги попытки: счёт, AI-разбор и разбор каждого вопроса. */
import { ChemRichText } from "@/modules/subjects/submodules/chemistry";
import { answerCorrect, answerDisplay, etalonDisplay } from "@/components/test-prep/answers";
import type { PreparationController } from "@/components/test-prep/usePreparation";

export function PreparationResults({ page }: { page: PreparationController }) {
  const { meta, stats, ai, questions, answers, checked, grading, returnHref, router } = page;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {meta?.subject && <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">{meta.subject}</p>}
        <h1 className="page-title">Тест завершён — ответы зафиксированы</h1>
        {meta?.title && <p className="mt-1 text-sm font-semibold text-slate-700">{meta.title}</p>}
        <p className="page-subtitle">
          Правильно {stats.stats?.correct ?? 0} из {stats.stats?.total ?? 0} · {stats.stats?.percent ?? 0}%.
          Изменить ответы больше нельзя, ниже — разбор.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {returnHref ? (
          <button onClick={() => router.push(returnHref)} className="btn-primary">
            Вернуться в предмет
          </button>
        ) : null}
        <button
          onClick={() => router.push("/tests")}
          className={returnHref ? "rounded-xl border px-4 py-2 font-semibold" : "btn-primary"}
        >
          К списку тестов
        </button>
      </div>
      {ai && (
        <div className="card space-y-2 p-5 text-sm">
          <b>AI-разбор</b>
          <p>{String(ai.summary || "")}</p>
        </div>
      )}
      <div className="space-y-3">
        <h2 className="text-lg font-bold">Разбор вопросов</h2>
        {questions.map((qq, i) => {
          const user = answerDisplay(qq, answers[qq.id]);
          const etalon = etalonDisplay(qq, grading[qq.id]);
          const ok = checked[qq.id] && answerCorrect(qq, answers[qq.id], grading[qq.id]);
          const missed = user === "";
          return (
            <div
              key={qq.id}
              className={
                "rounded-xl border p-4 text-sm " +
                (ok ? "border-[var(--status-ok-border)] bg-[var(--status-ok-bg)]/50" : missed ? "border-slate-200 bg-white" : "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)]/40")
              }
            >
              <div className="text-xs text-slate-500">Вопрос {i + 1}</div>
              <ChemRichText text={String(qq.text || qq.body || "")} className="mt-1 font-medium" />
              <div className="mt-3 space-y-1">
                <div>
                  <span className="text-slate-500">Ваш ответ: </span>
                  {user || <span className="italic text-slate-400">нет ответа</span>}
                </div>
                <div>
                  <span className="text-slate-500">Правильный ответ: </span>
                  <div className="font-semibold text-[var(--status-ok-fg)]"><ChemRichText text={etalon || "—"} asHtml={qq.is_closed !== true} className="inline" /></div>
                </div>
                {qq.explanation ? (
                  <div className="mt-2 rounded-lg bg-white/70 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Пояснение кафедры</div>
                    <ChemRichText text={String(qq.explanation)} className="mt-1 space-y-1" />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
