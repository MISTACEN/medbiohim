"use client";

/** Область преподавателя: доступ тестов преподавателям и автор теста. */
import type { TeacherCandidate, TeacherTestItem } from "@/lib/api/teacher";

export function TeachersTestsSection({
  teachers,
  tests,
  testFilter,
  onTestFilter,
  busy,
  onToggleVisibility,
  onSetOwner,
}: {
  teachers: TeacherCandidate[];
  tests: TeacherTestItem[];
  testFilter: string;
  onTestFilter: (value: string) => void;
  busy: boolean;
  onToggleVisibility: (test: TeacherTestItem) => void;
  onSetOwner: (test: TeacherTestItem, teacherId: string) => void;
}) {
  const visibleTests = tests.filter((test) =>
    testFilter.trim()
      ? test.title.toLowerCase().includes(testFilter.trim().toLowerCase())
      : true,
  );

  return (
    <section className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Доступ тестов преподавателям</h2>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Снятый флаг скрывает тест из каталога преподавателей. Автор теста и администратор
        видят его по-прежнему.
      </p>
      <input
        value={testFilter}
        onChange={(event) => onTestFilter(event.target.value)}
        placeholder="Поиск теста по названию…"
        className="w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm md:max-w-md"
        style={{ borderColor: "var(--border)" }}
      />
      <div
        className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-2"
        style={{ borderColor: "var(--border)" }}
      >
        {visibleTests.slice(0, 200).map((test) => (
          <div key={test.id} className="flex items-start gap-2 rounded px-1 py-1 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={test.teacher_visible}
              disabled={busy}
              onChange={() => onToggleVisibility(test)}
              aria-label={`Показывать тест «${test.title}» преподавателям`}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate">{test.title}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {test.subject_name || "Без предмета"} · {test.is_published ? "опубликован" : "черновик"}
              </div>
            </div>
            <select
              value={test.created_by || ""}
              disabled={busy}
              onChange={(event) => onSetOwner(test, event.target.value)}
              aria-label={`Автор теста «${test.title}»`}
              className="max-w-[190px] rounded-lg border bg-transparent px-2 py-1 text-xs"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="">— без автора —</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        {visibleTests.length === 0 ? (
          <div className="p-2 text-xs" style={{ color: "var(--muted)" }}>
            Тесты не найдены
          </div>
        ) : null}
      </div>
    </section>
  );
}
