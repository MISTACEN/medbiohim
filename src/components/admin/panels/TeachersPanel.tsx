"use client";

/**
 * Область преподавателя (этап H, план §10): композиция раздела.
 *
 * Администратор выдаёт преподавателю группы или отдельных студентов. Без этих
 * назначений преподаватель видит только собственные задания; проверка работ
 * ограничена той же областью на сервере.
 */
import { TeachersAssignmentForm } from "@/components/admin/panels/TeachersAssignmentForm";
import { TeachersAssignmentsList } from "@/components/admin/panels/TeachersAssignmentsList";
import { TeachersSubjectsSection } from "@/components/admin/panels/TeachersSubjectsSection";
import { TeachersTestsSection } from "@/components/admin/panels/TeachersTestsSection";
import { useTeachersPanel } from "@/components/admin/panels/useTeachersPanel";

export function TeachersPanel() {
  const panel = useTeachersPanel();
  const {
    teachers, groups, assignments,
    teacherId, setTeacherId,
    target, setTarget,
    groupId, setGroupId,
    studentId, setStudentId,
    role, setRole,
    loading, busy,
    error, note,
    subjectTeacherId, subjectCatalog, assignedSubjects, selectedSubjectIds,
    subjectFilter, setSubjectFilter,
    tests, testFilter, setTestFilter,
    load, create, remove, changeDetailLevel,
    loadSubjects, toggleSubject, saveSubjects,
    toggleTestVisibility, setTestOwner,
  } = panel;

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

      <TeachersAssignmentForm
        teachers={teachers}
        groups={groups}
        teacherId={teacherId}
        onTeacherId={setTeacherId}
        target={target}
        onTarget={setTarget}
        groupId={groupId}
        onGroupId={setGroupId}
        studentId={studentId}
        onStudentId={setStudentId}
        role={role}
        onRole={setRole}
        busy={busy}
        onCreate={() => void create()}
      />

      <TeachersAssignmentsList
        assignments={assignments}
        loading={loading}
        busy={busy}
        onRefresh={() => void load()}
        onRemove={(id) => void remove(id)}
        onChangeDetailLevel={(assignment, level) => void changeDetailLevel(assignment, level)}
      />

      <TeachersSubjectsSection
        teachers={teachers}
        subjectTeacherId={subjectTeacherId}
        onLoadSubjects={(nextId) => void loadSubjects(nextId)}
        subjectFilter={subjectFilter}
        onSubjectFilter={setSubjectFilter}
        assignedSubjects={assignedSubjects}
        subjectCatalog={subjectCatalog}
        selectedSubjectIds={selectedSubjectIds}
        onToggleSubject={toggleSubject}
        busy={busy}
        onSaveSubjects={() => void saveSubjects()}
      />

      <TeachersTestsSection
        teachers={teachers}
        tests={tests}
        testFilter={testFilter}
        onTestFilter={setTestFilter}
        busy={busy}
        onToggleVisibility={(test) => void toggleTestVisibility(test)}
        onSetOwner={(test, nextId) => void setTestOwner(test, nextId)}
      />
    </div>
  );
}
