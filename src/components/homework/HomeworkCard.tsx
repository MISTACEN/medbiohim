"use client";

import { CalendarDays, ChevronDown, Clock, Loader2, Send } from "lucide-react";

import { SkeletonList } from "@/components/ui/Skeleton";

import { SUBMISSION_LABELS, fmtDate, isDone, isOverdue, type Homework } from "./model";
import type { HomeworkDataView } from "./useHomeworkData";

/** Карточка одного задания: заголовок со сроком, описание, сдача ответа и оценка. */
export function HomeworkCard({ hw, item }: { hw: HomeworkDataView; item: Homework }) {
  const open = hw.openId === item.id;
  const done = isDone(item);
  const overdue = !done && isOverdue(item);
  const mine = hw.submissions[item.id] || [];
  const graded = mine.find((s) => s.grade != null || s.teacher_comment);
  return (
    <li className="card overflow-hidden">
      <button
        type="button"
        onClick={() => void hw.openCard(item.id)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{item.title || "Без названия"}</span>
            {done && <span className="rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-ok-fg)]">Выполнено</span>}
            {overdue && <span className="rounded-full bg-[var(--status-critical-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--status-critical-fg)]">Просрочено</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            {item.subjects?.name && <span>{item.subjects.name}</span>}
            {(item.due_at || item.due_date) && (
              <span className={"inline-flex items-center gap-1 " + (overdue ? "font-semibold text-[var(--status-critical-fg)]" : "")}>
                <CalendarDays className="h-3.5 w-3.5" /> до {fmtDate(item.due_at || item.due_date)}
              </span>
            )}
            {graded?.grade != null && (
              <span className="font-semibold text-indigo-600">Оценка: {String(graded.grade)}</span>
            )}
          </div>
        </div>
        <ChevronDown className={"mt-1 h-4 w-4 shrink-0 transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
          {item.description && <p className="whitespace-pre-line text-sm">{item.description}</p>}

          {graded?.grade != null && (
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
              <div className="text-sm font-semibold text-indigo-700">Оценка: {String(graded.grade)}</div>
              {graded.teacher_comment && (
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">Комментарий преподавателя: {graded.teacher_comment}</p>
              )}
            </div>
          )}

          {mine.length > 0 && (
            <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
              {mine.slice(0, 3).map((s) => (
                <div key={s.id} className="inline-flex items-center gap-1 rounded-full border bg-[var(--card)] px-2 py-1">
                  <Clock className="h-3 w-3" />
                  {SUBMISSION_LABELS[String(s.status || "").toLowerCase()] || "Сдано"}
                  {s.submitted_at ? ` · ${fmtDate(s.submitted_at)}` : ""}
                </div>
              ))}
            </div>
          )}

          {!done && (
            <div className="mt-3 space-y-2">
              <textarea
                value={hw.answer}
                onChange={(e) => hw.setAnswer(e.target.value)}
                rows={3}
                placeholder="Ваш ответ на задание…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={hw.busyId === item.id}
                  onClick={() => void hw.submit(item)}
                  className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                  {hw.busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Сдать задание
                </button>
                <button
                  type="button"
                  disabled={hw.busyId === item.id}
                  onClick={() => void hw.toggleDone(item)}
                  className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  Отметить выполненным
                </button>
              </div>
            </div>
          )}
          {done && (
            <button
              type="button"
              disabled={hw.busyId === item.id}
              onClick={() => void hw.toggleDone(item)}
              className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Вернуть в работу
            </button>
          )}
          {hw.submissionsLoading && hw.openId === item.id && (
            <div className="mt-3">
              <SkeletonList count={1} rows={2} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
