"use client";

/**
 * Вкладка «Лекции» предмета (ЗАДАЧА A5 финал): читалка активной лекции
 * (LectureView) или список лекций с неделями плана. Вынесено из монолита
 * subjects/[id]/page.tsx.
 */
import { BookOpen } from "lucide-react";
import { LectureView } from "@/components/lectures/LectureView";

type Props = {
  activeLecture: any;
  lectureLoading: boolean;
  lectureError: string;
  subjectLectures: any[];
  orderedLectures: any[];
  planLectureWeeks: Map<string, number>;
  onOpenLecture: (id: string) => void;
  onCloseLecture: () => void;
};

export function LecturesTab({ activeLecture, lectureLoading, lectureError, subjectLectures, orderedLectures, planLectureWeeks, onOpenLecture, onCloseLecture }: Props) {
  if (activeLecture) {
    return (
      <LectureView
        lecture={activeLecture}
        lectureId={String(activeLecture.id || "")}
        onBack={onCloseLecture}
        backLabel="К списку лекций"
      />
    );
  }
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">Лекции</h2>
      <p className="mt-1 text-sm text-slate-500">Лекции этого предмета — читаются прямо здесь.</p>
      {lectureLoading && <p className="mt-3 text-sm text-slate-500">Открываю лекцию…</p>}
      {lectureError && <p className="mt-3 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">{lectureError}</p>}
      {subjectLectures.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {orderedLectures.map((lec: any) => (
            <button
              key={lec.id}
              type="button"
              onClick={() => onOpenLecture(String(lec.id))}
              className="flex gap-3 rounded-xl border bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-white"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold leading-snug">{lec.title}</span>
                  {planLectureWeeks.has(String(lec.id)) && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      неделя {planLectureWeeks.get(String(lec.id))}
                    </span>
                  )}
                </div>
                {lec.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{lec.summary}</p>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] p-3 text-sm text-[var(--status-warn-fg)]">
          Опубликованных лекций по этому предмету пока нет.
        </p>
      )}
    </section>
  );
}
