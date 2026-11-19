"use client";

/** Область преподавателя: список текущих назначений. */
import { Loader2, Trash2 } from "lucide-react";
import type { TeacherAssignment } from "@/lib/api/teacher";

export function TeachersAssignmentsList({
  assignments,
  loading,
  busy,
  onRefresh,
  onRemove,
  onChangeDetailLevel,
}: {
  assignments: TeacherAssignment[];
  loading: boolean;
  busy: boolean;
  onRefresh: () => void;
  onRemove: (id: string) => void;
  onChangeDetailLevel: (assignment: TeacherAssignment, level: number) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Текущие назначения
        </h2>
        <button type="button" className="btn-secondary text-xs" onClick={onRefresh}>
          Обновить
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm" aria-busy="true">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
        </div>
      ) : assignments.length === 0 ? (
        <div className="card p-4 text-sm" style={{ color: "var(--muted)" }}>
          Назначений пока нет: преподаватели видят только собственные задания.
        </div>
      ) : (
        <ul className="space-y-2">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{assignment.teacher_name || assignment.teacher_id}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {assignment.group_id
                    ? `Группа: ${assignment.group_name || assignment.group_id}`
                    : `Студент: ${assignment.student_name || assignment.student_id}`}
                  {" · "}
                  {assignment.role}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <span style={{ color: "var(--muted)" }}>Детализация:</span>
                  <select
                    value={assignment.detail_level ?? 4}
                    disabled={busy}
                    onChange={(event) => onChangeDetailLevel(assignment, Number(event.target.value))}
                    className="rounded-lg border bg-transparent px-1.5 py-1 text-xs"
                    style={{ borderColor: "var(--border)" }}
                    aria-label="Уровень детализации результатов"
                  >
                    <option value={1}>1 · только статистика</option>
                    <option value={2}>2 · + ответы</option>
                    <option value={3}>3 · + разбор</option>
                    <option value={4}>4 · полный отчёт</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={busy}
                onClick={() => onRemove(assignment.id)}
                aria-label="Снять назначение"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Снять
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
