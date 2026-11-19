"use client";

/**
 * Экзаменационные билеты — отдельно от SRS.
 * ?subject_slug= со страницы предмета; только строгий match.
 */
import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { TicketControls } from "@/components/tickets/TicketControls";
import { TicketQuestionCard } from "@/components/tickets/TicketQuestionCard";
import { useTicketsPage } from "@/components/tickets/useTicketsPage";

function TicketsPageInner() {
  const page = useTicketsPage();
  const { fromSubject, questions, mode, reveal, setReveal, title, note } = page;

  return (
    <div className="space-y-6">
      {fromSubject && (
        <Link
          href={`/subjects/${encodeURIComponent(fromSubject)}?tab=exam`}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />К вопросам экзамена предмета
        </Link>
      )}

      <div>
        <h1 className="page-title">Экзаменационные билеты</h1>
        <p className="page-subtitle">
          Не карточки SRS. {fromSubject ? `Фильтр: ${fromSubject}` : "Выберите банк"}
        </p>
      </div>

      {note && (
        <div className="rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-4 py-3 text-sm text-[var(--status-warn-fg)]">
          {note}
        </div>
      )}

      <TicketControls page={page} />

      {title && <h2 className="text-lg font-semibold">{title}</h2>}

      <ol className="space-y-4">
        {questions.map((qq, idx) => (
          <TicketQuestionCard
            key={qq.id}
            question={qq}
            index={idx}
            mode={mode}
            reveal={reveal}
            onToggleReveal={(id) => setReveal((r) => ({ ...r, [id]: !r[id] }))}
          />
        ))}
      </ol>
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Загрузка билетов…</div>}>
      <TicketsPageInner />
    </Suspense>
  );
}
