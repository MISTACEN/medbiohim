"use client";

/**
 * Авторский предпросмотр теста (план §9.1, BACKLOG п.2).
 *
 * Преподаватель проходит свой тест в том же интерфейсе, который увидит
 * студент: те же варианты, порядок и проверка. Отличия от попытки студента:
 *  - попытка на сервере не создаётся, статистика и результаты не меняются;
 *  - проверка закрытых вопросов идёт общим детерминированным грейдером
 *    (src/lib/question-types), открытые — сверяются с эталоном вручную;
 *  - эталон виден сразу, сервер отдаёт его только teacher/admin.
 *
 * Состояние — в useTeacherPreview, разметка — в PreviewQuestionCard
 * (прохождение) и PreviewFinished (итог с разбором).
 */
import Link from "next/link";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";

import { useTeacherPreview } from "@/components/teacher/preview/useTeacherPreview";
import { PreviewFinished } from "@/components/teacher/preview/PreviewFinished";
import { PreviewQuestionCard } from "@/components/teacher/preview/PreviewQuestionCard";

export default function TeacherPreviewPage() {
  const view = useTeacherPreview();

  if (view.loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка предпросмотра…
      </div>
    );
  }

  if (view.error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">
          {view.error}
        </div>
        <Link href="/teacher" className="btn-secondary inline-block">
          В кабинет
        </Link>
      </div>
    );
  }

  if (!view.questions.length) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="card p-5 text-sm">В этом тесте нет опубликованных вопросов.</div>
        <Link href="/teacher" className="btn-secondary inline-block">
          В кабинет
        </Link>
      </div>
    );
  }

  if (view.finished) {
    return <PreviewFinished view={view} />;
  }

  if (!view.q || !view.norm) return null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {view.subject && <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">{view.subject}</span>}
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-warn-bg)] px-2.5 py-1 text-xs font-bold text-[var(--status-warn-fg)]">
              <FlaskConical className="h-3 w-3" /> Предпросмотр автора — попытка не создаётся
            </span>
          </div>
          <h1 className="page-title">{view.title}</h1>
          <p className="page-subtitle">Вопрос {view.idx + 1} из {view.questions.length}</p>
        </div>
        <Link href="/teacher" className="text-sm text-slate-500">
          <ArrowLeft className="mr-1 inline h-4 w-4" /> В кабинет
        </Link>
      </div>

      <div className="h-2 rounded bg-slate-100">
        <div className="h-2 rounded bg-indigo-500" style={{ width: ((view.idx + 1) / view.questions.length) * 100 + "%" }} />
      </div>

      <PreviewQuestionCard view={view} />
    </div>
  );
}
