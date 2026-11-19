"use client";

/** Область преподавателя: назначение предметов конкретному преподавателю. */
import { Loader2 } from "lucide-react";
import type { TeacherCandidate, TeacherSubject } from "@/lib/api/teacher";

export function TeachersSubjectsSection({
  teachers,
  subjectTeacherId,
  onLoadSubjects,
  subjectFilter,
  onSubjectFilter,
  assignedSubjects,
  subjectCatalog,
  selectedSubjectIds,
  onToggleSubject,
  busy,
  onSaveSubjects,
}: {
  teachers: TeacherCandidate[];
  subjectTeacherId: string;
  onLoadSubjects: (teacherId: string) => void;
  subjectFilter: string;
  onSubjectFilter: (value: string) => void;
  assignedSubjects: TeacherSubject[];
  subjectCatalog: TeacherSubject[];
  selectedSubjectIds: string[];
  onToggleSubject: (id: string) => void;
  busy: boolean;
  onSaveSubjects: () => void;
}) {
  const visibleSubjects = subjectCatalog.filter((subject) =>
    subjectFilter.trim()
      ? subject.name.toLowerCase().includes(subjectFilter.trim().toLowerCase())
      : true,
  );

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Предметы преподавателя</h2>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Предметы ограничивают каталог тестов: преподаватель видит свои тесты всегда, а
        чужие — только опубликованные, разрешённые и по своим предметам. Пустой набор
        означает весь опубликованный каталог. Можно выбрать несколько предметов.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span style={{ color: "var(--muted)" }}>Преподаватель</span>
          <select
            value={subjectTeacherId}
            onChange={(event) => onLoadSubjects(event.target.value)}
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
          <span style={{ color: "var(--muted)" }}>Поиск предмета</span>
          <input
            value={subjectFilter}
            onChange={(event) => onSubjectFilter(event.target.value)}
            disabled={!subjectTeacherId}
            placeholder="Например: физиология"
            className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm"
            style={{ borderColor: "var(--border)" }}
          />
        </label>
      </div>

      {assignedSubjects.length ? (
        <div className="flex flex-wrap gap-2">
          {assignedSubjects.map((subject) => (
            <span
              key={subject.id}
              className="rounded-full border px-3 py-1 text-xs"
              style={{ borderColor: "var(--border)" }}
            >
              {subject.name}
            </span>
          ))}
        </div>
      ) : null}

      {subjectCatalog.length ? (
        <div
          className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2"
          style={{ borderColor: "var(--border)" }}
        >
          {visibleSubjects.map((subject) => (
            <label key={subject.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm">
              <input
                type="checkbox"
                checked={selectedSubjectIds.includes(subject.id)}
                onChange={() => onToggleSubject(subject.id)}
              />
              <span className="min-w-0 truncate">{subject.name}</span>
            </label>
          ))}
          {visibleSubjects.length === 0 ? (
            <div className="p-2 text-xs" style={{ color: "var(--muted)" }}>
              Ничего не найдено
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="btn-primary text-sm"
        disabled={busy || !subjectTeacherId}
        onClick={onSaveSubjects}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Сохранить предметы
      </button>
    </section>
  );
}
