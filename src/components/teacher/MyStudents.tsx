"use client";

/**
 * Студенты области преподавателя: ростер по назначенным группам и карточка
 * студента с историей попыток по тестам автора (кабинет 8.25–8.31).
 * Преподаватель не видит ничего вне своей области — сервер проверяет scope.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Users } from "lucide-react";
import { describeApiError } from "@/lib/errors";
import {
  teacherStudentAttempts,
  teacherStudentTestAnswers,
  teacherStudents,
  type StudentAnswerRow,
  type StudentAttempt,
  type TeacherStudent,
} from "@/lib/api/teacher";

function percentTone(percent: number | null): string {
  if (percent == null) return "bg-slate-100 text-slate-600";
  if (percent >= 80) return "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]";
  if (percent >= 60) return "bg-[var(--status-warn-bg)] text-[var(--status-warn-fg)]";
  return "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]";
}

function AttemptBreakdown({ studentId, attempt }: { studentId: string; attempt: StudentAttempt }) {
  const [rows, setRows] = useState<StudentAnswerRow[] | null>(null);
  const [error, setError] = useState("");
  const [detailLevel, setDetailLevel] = useState(4);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await teacherStudentTestAnswers(studentId, attempt.test_id);
      if (cancelled) return;
      if (result.ok) {
        setRows(result.data.items);
        setDetailLevel(result.data.detail_level);
      } else setError(describeApiError(result.error));
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, attempt.test_id]);

  if (error) return <div className="text-[var(--status-critical-fg)]">{error}</div>;
  if (rows === null)
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Загрузка разбора…
      </div>
    );
  if (rows.length === 0) return <div className="text-[var(--muted)]">Ответов в этой сессии нет.</div>;

  return (
    <div className="space-y-1.5">
      {detailLevel < 2 && (
        <div className="rounded-lg bg-[var(--status-warn-bg)] p-2 text-xs text-[var(--status-warn-fg)]">
          Уровень детализации {detailLevel}: ответы студентов скрыты (админ может поднять до 2+).
        </div>
      )}
      {rows.map((row) => (
        <div key={row.question_id} className="rounded-lg bg-white p-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1">{row.text || "—"}</span>
            {row.is_correct != null && (
              <span
                className={
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold " +
                  (row.is_correct
                    ? "bg-[var(--status-ok-bg)] text-[var(--status-ok-fg)]"
                    : "bg-[var(--status-critical-bg)] text-[var(--status-critical-fg)]")
                }
              >
                {row.is_correct ? "верно" : "неверно"}
              </span>
            )}
          </div>
          {detailLevel >= 2 && (
            <div className="mt-1 text-xs text-slate-600">
              Ответ: <span className="whitespace-pre-wrap">{row.student_answer || "—"}</span>
            </div>
          )}
          {detailLevel >= 3 && row.etalon && (
            <div className="mt-1 text-xs text-[var(--status-ok-fg)]">Эталон: {row.etalon}</div>
          )}
          {detailLevel >= 3 && row.grading_feedback && (
            <div className="mt-0.5 text-xs text-[var(--muted)]">Комментарий: {row.grading_feedback}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function StudentCard({ student }: { student: TeacherStudent }) {
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<StudentAttempt[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggle() {
    setOpen((value) => !value);
    if (open || attempts) return;
    setError("");
    const result = await teacherStudentAttempts(student.id);
    if (result.ok) setAttempts(result.data.items);
    else setError(describeApiError(result.error));
  }

  return (
    <div className="card p-0">
      <button
        type="button"
        onClick={() => void toggle()}
        className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left text-sm"
      >
        <div>
          <div className="font-semibold text-slate-900">{student.name}</div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">
            {student.group || "персонально"} · попыток: {student.attempts}
            {student.avg_percent != null ? ` · средний ${student.avg_percent}%` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {student.avg_percent != null && (
            <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + percentTone(student.avg_percent)}>
              {student.avg_percent}%
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-4 text-sm">
          {error && <div className="text-[var(--status-critical-fg)]">{error}</div>}
          {attempts === null && !error && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка попыток…
            </div>
          )}
          {attempts?.length === 0 && (
            <div className="text-[var(--muted)]">Попыток по вашим тестам пока нет.</div>
          )}
          {attempts && attempts.length > 0 && (
            <ul className="space-y-1.5">
              {attempts.map((attempt) => (
                <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-medium">{attempt.test_title || "Тест"}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {attempt.status && <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-600">{attempt.status}</span>}
                    {attempt.percent != null && (
                      <span className={"rounded-full px-2 py-0.5 font-bold " + percentTone(attempt.percent)}>
                        {attempt.percent}%
                      </span>
                    )}
                    {attempt.finished_at && (
                      <span className="text-[var(--muted)]">
                        {new Date(attempt.finished_at).toLocaleString("ru-RU")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function MyStudents() {
  const [items, setItems] = useState<TeacherStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await teacherStudents();
    if (result.ok) setItems(result.data.items);
    else setError(describeApiError(result.error));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Users className="h-5 w-5 text-indigo-600" /> Мои студенты
      </h2>
      {error && (
        <div className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-3 text-sm text-[var(--status-critical-fg)]">
          {error}
        </div>
      )}
      {loading && (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="card p-5 text-sm text-[var(--muted)]">
          Пока нет студентов в назначенных группах. Группы выдаёт администратор в разделе «Преподаватели».
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((student) => (
            <StudentCard key={student.id} student={student} />
          ))}
        </div>
      )}
    </section>
  );
}
