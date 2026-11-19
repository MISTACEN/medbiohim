"use client";

import { Suspense } from "react";
import { useSubjectPage } from "@/components/subjects/useSubjectPage";
import { SubjectHeader } from "@/components/subjects/SubjectHeader";
import { SubjectPortalPanels } from "@/components/subjects/SubjectPortalPanels";
import { SubjectStudyPanels } from "@/components/subjects/SubjectStudyPanels";
import { SubjectPracticePanels } from "@/components/subjects/SubjectPracticePanels";
import { MaterialReader } from "@/components/subjects/MaterialReader";

/**
 * Карточка предмета: страница собирает шапку и панели вкладок. Данные и
 * действия — `components/subjects/useSubjectPage`, разметка — по файлам панелей.
 */
function SubjectPageInner({ params }: { params: Promise<{ id: string }> }) {
  const page = useSubjectPage({ params });

  if (page.loading) return (
    <div className="mx-auto max-w-6xl space-y-4" aria-label="Загрузка">
      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
      <div className="card space-y-3 p-5">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[1, 2, 3, 4].map((n) => <div key={n} className="h-11 w-28 shrink-0 animate-pulse rounded-xl bg-slate-200" />)}
      </div>
      <div className="card min-h-48 animate-pulse p-5" />
    </div>
  );
  if (page.error && !page.subject) return <div className="card p-6 text-sm text-[var(--status-critical-fg)]">{page.error}</div>;

  return (
    <div className="space-y-6">
      <SubjectHeader page={page} />

      <div role="tabpanel" className="min-h-[12rem]">
        <SubjectPortalPanels page={page} />
        <SubjectStudyPanels page={page} />
        <SubjectPracticePanels page={page} />
      </div>

      <MaterialReader page={page} />
    </div>
  );
}

export default function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl space-y-4 p-8 text-sm text-slate-500">Загрузка…</div>}>
      <SubjectPageInner params={params} />
    </Suspense>
  );
}
