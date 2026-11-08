"use client";

/**
 * Студенты области преподавателя: ведомость по назначенным группам и разбор
 * попыток конкретного студента по тестам автора (кабинет 8.25–8.31).
 *
 * Посещаемость и оценки коллоквиумов на платформе не ведутся, поэтому в
 * ведомости только те показатели, которые реально приходят из API: попытки,
 * завершённые попытки и средний процент. Ничего не дорисовываем.
 * Преподаватель не видит ничего вне своей области — сервер проверяет scope.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Users, X } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { describeApiError } from "@/lib/errors";
import {
  teacherStudentAttempts,
  teacherStudentTestAnswers,
  teacherStudents,
  type StudentAnswerRow,
  type StudentAttempt,
  type TeacherStudent,
} from "@/lib/api/teacher";

type StatusFilter = "all" | "debt" | "excellent" | "untouched";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Все студенты" },
  { value: "debt", label: "Средний ниже 60%" },
  { value: "excellent", label: "Средний от 85%" },
  { value: "untouched", label: "Без попыток" },
];

function percentStyle(percent: number | null) {
  if (percent == null)
    return { background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)" };
  if (percent >= 80)
    return { background: "var(--status-ok-bg)", color: "var(--status-ok-fg)" };
  if (percent >= 60)
    return { background: "var(--status-warn-bg)", color: "var(--status-warn-fg)" };
  return { background: "var(--status-critical-bg)", color: "var(--status-critical-fg)" };
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
      <div className="flex items-center gap-2 text-[var(--muted)]">
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
        <div key={row.question_id} className="rounded-lg border border-[var(--border)] p-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1">{row.text || "—"}</span>
            {row.is_correct != null && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
                style={
                  row.is_correct
                    ? { background: "var(--status-ok-bg)", color: "var(--status-ok-fg)" }
                    : { background: "var(--status-critical-bg)", color: "var(--status-critical-fg)" }
                }
              >
                {row.is_correct ? "верно" : "неверно"}
              </span>
            )}
          </div>
          {detailLevel >= 2 && (
            <div className="mt-1 text-xs text-[var(--muted)]">
              Ответ: <span className="whitespace-pre-wrap">{row.student_answer || "—"}</span>
            </div>
          )}
          {detailLevel >= 3 && row.etalon && (
            <div className="mt-1 text-xs" style={{ color: "var(--status-ok-fg)" }}>
              Эталон: {row.etalon}
            </div>
          )}
          {detailLevel >= 3 && row.grading_feedback && (
            <div className="mt-0.5 text-xs text-[var(--muted)]">Комментарий: {row.grading_feedback}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function StudentDetail({ student, onClose }: { student: TeacherStudent; onClose: () => void }) {
  const [attempts, setAttempts] = useState<StudentAttempt[] | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setAttempts(null);
      setError("");
      const result = await teacherStudentAttempts(student.id);
      if (cancelled) return;
      if (result.ok) setAttempts(result.data.items);
      else setError(describeApiError(result.error));
    })();
    return () => {
      cancelled = true;
    };
  }, [student.id]);

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{student.name}</div>
          <div className="text-xs text-[var(--muted)]">
            {student.group || "персонально"} · попыток: {student.attempts} · завершено: {student.finished}
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-secondary inline-flex items-center gap-1 text-xs">
          <X className="h-3.5 w-3.5" /> Закрыть
        </button>
      </div>

      {error && <div className="text-sm text-[var(--status-critical-fg)]">{error}</div>}
      {attempts === null && !error && (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка попыток…
        </div>
      )}
      {attempts?.length === 0 && (
        <div className="text-sm text-[var(--muted)]">Попыток по вашим тестам пока нет.</div>
      )}
      {attempts && attempts.length > 0 && (
        <ul className="space-y-1.5">
          {attempts.map((attempt) => {
            const open = expanded === attempt.id;
            return (
              <li key={attempt.id} className="rounded-lg border border-[var(--border)]">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{attempt.test_title || "Тест"}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {attempt.status && (
                      <span
                        className="rounded-full px-2 py-0.5 font-semibold"
                        style={{ background: "var(--status-neutral-bg)", color: "var(--status-neutral-fg)" }}
                      >
                        {attempt.status}
                      </span>
                    )}
                    {attempt.percent != null && (
                      <span className="rounded-full px-2 py-0.5 font-bold" style={percentStyle(attempt.percent)}>
                        {attempt.percent}%
                      </span>
                    )}
                    {attempt.finished_at && (
                      <span className="text-[var(--muted)]">
                        {new Date(attempt.finished_at).toLocaleString("ru-RU")}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : attempt.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-0.5 font-semibold"
                      aria-expanded={open}
                    >
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      Ответы
                    </button>
                  </span>
                </div>
                {open && (
                  <div className="border-t border-[var(--border)] p-3 text-xs">
                    <AttemptBreakdown studentId={student.id} attempt={attempt} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MyStudents() {
  const [items, setItems] = useState<TeacherStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<TeacherStudent | null>(null);

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

  const groups = useMemo(() => {
    const names = new Set<string>();
    for (const student of items) if (student.group) names.add(student.group);
    return [...names].sort((a, b) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" }));
  }, [items]);

  const rows = useMemo(() => {
    return items.filter((student) => {
      if (group !== "all" && (student.group || "") !== group) return false;
      if (status === "debt") return student.avg_percent != null && student.avg_percent < 60;
      if (status === "excellent") return student.avg_percent != null && student.avg_percent >= 85;
      if (status === "untouched") return student.attempts === 0;
      return true;
    });
  }, [items, group, status]);

  const columns: Array<DataTableColumn<TeacherStudent>> = [
    {
      key: "name",
      header: "Студент (ФИО)",
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <div className="font-semibold">{row.name}</div>
          <div className="text-[11px] text-[var(--muted)]">{row.group || "персонально"}</div>
        </div>
      ),
    },
    {
      key: "attempts",
      header: "Попытки",
      sortValue: (row) => row.attempts,
      render: (row) => <span className="tabular-nums">{row.attempts}</span>,
    },
    {
      key: "finished",
      header: "Завершено",
      sortValue: (row) => row.finished,
      render: (row) => <span className="tabular-nums">{row.finished}</span>,
    },
    {
      key: "avg",
      header: "Средний балл",
      sortValue: (row) => row.avg_percent ?? -1,
      render: (row) =>
        row.avg_percent == null ? (
          <span className="text-xs text-[var(--muted)]">нет данных</span>
        ) : (
          <span className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums" style={percentStyle(row.avg_percent)}>
            {row.avg_percent}%
          </span>
        ),
    },
    {
      key: "actions",
      header: "Разбор",
      align: "right",
      render: (row) => (
        <button
          type="button"
          onClick={() => setSelected(row)}
          className="btn-secondary px-2.5 py-1 text-xs"
          title="Попытки студента по вашим тестам и по-вопросный разбор"
        >
          Открыть
        </button>
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5" style={{ color: "var(--primary)" }} /> Назначенные группы и успеваемость
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Персональная ведомость по вашим тестам. Посещаемость и коллоквиумы на платформе не ведутся — этих цифр здесь нет.
          </p>
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border p-3 text-sm"
          style={{
            borderColor: "var(--status-critical-border)",
            background: "var(--status-critical-bg)",
            color: "var(--status-critical-fg)",
          }}
        >
          {error}
        </div>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)] p-1.5">
          <button
            type="button"
            onClick={() => setGroup("all")}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
            style={
              group === "all"
                ? { background: "var(--primary)", color: "#fff" }
                : { color: "var(--muted)" }
            }
          >
            Все группы · {items.length}
          </button>
          {groups.map((name) => {
            const count = items.filter((student) => student.group === name).length;
            const active = group === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setGroup(name)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                style={active ? { background: "var(--primary)", color: "#fff" } : { color: "var(--muted)" }}
              >
                {name} · {count}
              </button>
            );
          })}
        </div>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        searchText={(row) => row.name}
        searchPlaceholder="Поиск по ФИО студента…"
        initialSort={{ key: "name", dir: "asc" }}
        pageSize={25}
        caption="Ведомость студентов назначенных групп"
        empty={
          items.length === 0
            ? "Пока нет студентов в назначенных группах. Группы выдаёт администратор в разделе «Преподаватели»."
            : "По выбранным фильтрам студентов нет"
        }
        filters={
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            aria-label="Фильтр по успеваемости"
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        }
      />

      {selected && <StudentDetail student={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
