"use client";

/** Область преподавателя: форма нового назначения. */
import { Loader2, UserPlus } from "lucide-react";
import type { TeacherCandidate } from "@/lib/api/teacher";
import type { TeachersGroupOption, TeachersRole, TeachersTarget } from "@/components/admin/panels/model";

export function TeachersAssignmentForm({
  teachers,
  groups,
  teacherId,
  onTeacherId,
  target,
  onTarget,
  groupId,
  onGroupId,
  studentId,
  onStudentId,
  role,
  onRole,
  busy,
  onCreate,
}: {
  teachers: TeacherCandidate[];
  groups: TeachersGroupOption[];
  teacherId: string;
  onTeacherId: (value: string) => void;
  target: TeachersTarget;
  onTarget: (value: TeachersTarget) => void;
  groupId: string;
  onGroupId: (value: string) => void;
  studentId: string;
  onStudentId: (value: string) => void;
  role: TeachersRole;
  onRole: (value: TeachersRole) => void;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Новое назначение</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span style={{ color: "var(--muted)" }}>Преподаватель</span>
          <select
            value={teacherId}
            onChange={(event) => onTeacherId(event.target.value)}
            className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="">— выберите —</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}{teacher.email ? ` (${teacher.email})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs">
          <span style={{ color: "var(--muted)" }}>Что назначить</span>
          <select
            value={target}
            onChange={(event) => onTarget(event.target.value === "student" ? "student" : "group")}
            className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="group">Группа</option>
            <option value="student">Студент (по ID)</option>
          </select>
        </label>

        {target === "group" ? (
          <label className="space-y-1 text-xs">
            <span style={{ color: "var(--muted)" }}>Группа</span>
            <select
              value={groupId}
              onChange={(event) => onGroupId(event.target.value)}
              className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">— выберите —</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name || group.code || group.id}
                  {group.course_number ? ` · ${group.course_number} курс` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="space-y-1 text-xs">
            <span style={{ color: "var(--muted)" }}>ID студента (users.id)</span>
            <input
              value={studentId}
              onChange={(event) => onStudentId(event.target.value)}
              placeholder="uuid из раздела «Пользователи»"
              className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
          </label>
        )}

        <label className="space-y-1 text-xs">
          <span style={{ color: "var(--muted)" }}>Роль в области</span>
          <select
            value={role}
            onChange={(event) => {
              const next = event.target.value;
              onRole(next === "curator" || next === "assistant" ? next : "teacher");
            }}
            className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          >
            <option value="teacher">Преподаватель</option>
            <option value="curator">Куратор</option>
            <option value="assistant">Ассистент</option>
          </select>
        </label>
      </div>
      <button type="button" className="btn-primary text-sm" disabled={busy} onClick={onCreate}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Назначить
      </button>
    </section>
  );
}
