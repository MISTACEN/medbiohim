"use client";

/**
 * Область преподавателя (этап H, план §10).
 *
 * Администратор выдаёт преподавателю группы или отдельных студентов. Без этих
 * назначений преподаватель видит только собственные задания; проверка работ
 * ограничена той же областью на сервере.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  teacherAssignments,
  teacherCandidates,
  teacherCreateAssignment,
  teacherRemoveAssignment,
  type TeacherAssignment,
  type TeacherCandidate,
} from "@/lib/api/teacher";

type GroupOption = { id: string; name: string | null; code: string | null; course_number: number | null };
type Target = "group" | "student";

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<TeacherCandidate[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [target, setTarget] = useState<Target>("group");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [role, setRole] = useState<"teacher" | "curator" | "assistant">("teacher");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [options, list] = await Promise.all([teacherCandidates(), teacherAssignments()]);
    if (options.ok) {
      setTeachers(options.data.teachers);
      setGroups(options.data.groups);
    } else {
      setError(describeApiError(options.error));
    }
    if (list.ok) setAssignments(list.data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!teacherId) {
      setNote("Выберите преподавателя");
      return;
    }
    if (target === "group" && !groupId) {
      setNote("Выберите группу");
      return;
    }
    if (target === "student" && !studentId.trim()) {
      setNote("Укажите ID студента");
      return;
    }
    setBusy(true);
    setNote("");
    const result = await teacherCreateAssignment({
      teacher_id: teacherId,
      group_id: target === "group" ? groupId : undefined,
      student_id: target === "student" ? studentId.trim() : undefined,
      role,
    });
    setBusy(false);
    if (!result.ok) {
      setNote(describeApiError(result.error));
      return;
    }
    setNote("Назначение сохранено");
    setStudentId("");
    void load();
  }

  async function remove(id: string) {
    setBusy(true);
    setNote("");
    const result = await teacherRemoveAssignment(id);
    setBusy(false);
    if (!result.ok) {
      setNote(describeApiError(result.error));
      return;
    }
    setAssignments((rows) => rows.filter((row) => row.id !== id));
    setNote("Назначение снято");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="page-title">Преподаватели и их область</h1>
        <p className="page-subtitle">
          Назначенная группа или студент открывают преподавателю работы и
          результаты. Без назначения остаются только собственные задания.
        </p>
      </header>

      {error ? (
        <div className="card border-l-4 p-4 text-sm" role="alert" style={{ borderColor: "var(--status-critical-fg)" }}>
          {error}
        </div>
      ) : null}
      {note ? <div className="card p-3 text-sm" role="status">{note}</div> : null}

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Новое назначение</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span style={{ color: "var(--muted)" }}>Преподаватель</span>
            <select
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
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
              onChange={(event) => setTarget(event.target.value === "student" ? "student" : "group")}
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
                onChange={(event) => setGroupId(event.target.value)}
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
                onChange={(event) => setStudentId(event.target.value)}
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
                setRole(next === "curator" || next === "assistant" ? next : "teacher");
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
        <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => void create()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Назначить
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Текущие назначения
          </h2>
          <button type="button" className="btn-secondary text-xs" onClick={() => void load()}>
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
                </div>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={busy}
                  onClick={() => void remove(assignment.id)}
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
    </div>
  );
}
