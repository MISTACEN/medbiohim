"use client";

/**
 * Область преподавателя (этап H, план §10): состояние и действия.
 *
 * Администратор выдаёт преподавателю группы или отдельных студентов. Без этих
 * назначений преподаватель видит только собственные задания; проверка работ
 * ограничена той же областью на сервере.
 */
import { useCallback, useEffect, useState } from "react";
import { hasToken } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import {
  teacherAssignments,
  teacherCandidates,
  teacherCreateAssignment,
  teacherRemoveAssignment,
  setAssignmentDetailLevel,
  teacherSetSubjects,
  teacherSetTestOwner,
  teacherSetTestVisibility,
  teacherSubjects,
  teacherTests,
  type TeacherAssignment,
  type TeacherCandidate,
  type TeacherSubject,
  type TeacherTestItem,
} from "@/lib/api/teacher";
import type { TeachersGroupOption, TeachersRole, TeachersTarget } from "@/components/admin/panels/model";

export function useTeachersPanel() {
  const [teachers, setTeachers] = useState<TeacherCandidate[]>([]);
  const [groups, setGroups] = useState<TeachersGroupOption[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [target, setTarget] = useState<TeachersTarget>("group");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [role, setRole] = useState<TeachersRole>("teacher");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [subjectTeacherId, setSubjectTeacherId] = useState("");
  const [subjectCatalog, setSubjectCatalog] = useState<TeacherSubject[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<TeacherSubject[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [tests, setTests] = useState<TeacherTestItem[]>([]);
  const [testFilter, setTestFilter] = useState("");

  const load = useCallback(async () => {
    if (!hasToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [options, list, catalog] = await Promise.all([
      teacherCandidates(),
      teacherAssignments(),
      teacherTests(),
    ]);
    if (options.ok) {
      setTeachers(options.data.teachers);
      setGroups(options.data.groups);
    } else {
      setError(describeApiError(options.error));
    }
    if (list.ok) setAssignments(list.data.items);
    if (catalog.ok) setTests(catalog.data.items);
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

  async function changeDetailLevel(assignment: TeacherAssignment, level: number) {
    const result = await setAssignmentDetailLevel(assignment.id, level);
    if (result.ok) {
      setAssignments((rows) => rows.map((row) =>
        row.id === assignment.id ? { ...row, detail_level: level } : row,
      ));
    }
  }

  async function loadSubjects(nextTeacherId: string) {
    setSubjectTeacherId(nextTeacherId);
    setSubjectFilter("");
    if (!nextTeacherId) {
      setSubjectCatalog([]);
      setAssignedSubjects([]);
      setSelectedSubjectIds([]);
      return;
    }
    const result = await teacherSubjects(nextTeacherId);
    if (!result.ok) {
      setNote(describeApiError(result.error));
      return;
    }
    setSubjectCatalog(result.data.catalog);
    setAssignedSubjects(result.data.items);
    setSelectedSubjectIds(result.data.items.map((subject) => subject.id));
  }

  function toggleSubject(id: string) {
    setSelectedSubjectIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function saveSubjects() {
    if (!subjectTeacherId) {
      setNote("Выберите преподавателя");
      return;
    }
    setBusy(true);
    setNote("");
    const result = await teacherSetSubjects(subjectTeacherId, selectedSubjectIds);
    setBusy(false);
    if (!result.ok) {
      setNote(describeApiError(result.error));
      return;
    }
    setAssignedSubjects(result.data.items);
    setNote(
      result.data.items.length
        ? `Сохранено предметов: ${result.data.items.length}`
        : "Предметы сняты: преподаватель видит весь опубликованный каталог",
    );
  }

  async function toggleTestVisibility(test: TeacherTestItem) {
    setBusy(true);
    setNote("");
    const next = !test.teacher_visible;
    const result = await teacherSetTestVisibility(test.id, next);
    setBusy(false);
    if (!result.ok) {
      setNote(describeApiError(result.error));
      return;
    }
    setTests((rows) =>
      rows.map((row) => (row.id === test.id ? { ...row, teacher_visible: next } : row)),
    );
    setNote(next ? "Тест открыт преподавателям" : "Тест скрыт от преподавателей");
  }

  async function setTestOwner(test: TeacherTestItem, nextTeacherId: string) {
    setBusy(true);
    setNote("");
    const result = await teacherSetTestOwner(test.id, nextTeacherId || null);
    setBusy(false);
    if (!result.ok) {
      setNote(describeApiError(result.error));
      return;
    }
    setTests((rows) =>
      rows.map((row) => (row.id === test.id ? { ...row, created_by: nextTeacherId || null } : row)),
    );
    setNote(nextTeacherId ? "Автор теста назначен" : "Автор теста снят");
  }

  return {
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
  };
}
