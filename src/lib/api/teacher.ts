/**
 * Кабинет преподавателя: область, работы на проверку и назначения.
 * Права проверяет Worker; здесь только типы и запросы.
 */
import { api } from "./client";
import { endpoints } from "../endpoints";

export type TeacherScopeSummary = {
  groups: number;
  students: number;
  active: boolean;
  available: boolean;
};

export type TeacherGroup = {
  id: string;
  name: string | null;
  code: string | null;
  course_number: number | null;
  stream: string | null;
};

export type TeacherSubmission = {
  id: string;
  homework_id: string;
  user_id: string;
  status: string | null;
  grade: number | null;
  teacher_comment: string | null;
  text_answer: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  student_name?: string;
  student_email?: string | null;
  homework_title?: string | null;
};

export type TeacherOverview = {
  is_admin: boolean;
  scope: TeacherScopeSummary;
  groups: TeacherGroup[];
  homeworks: Array<{
    id: string;
    title: string;
    group_id: string | null;
    due_at: string | null;
    status: string | null;
    created_at: string | null;
  }>;
  counts: {
    groups: number;
    students: number;
    homeworks: number;
    submissions: number;
    pending: number;
    graded: number;
    returned: number;
  };
  recent_submissions: TeacherSubmission[];
};

export type TeacherAssignment = {
  id: string;
  teacher_id: string;
  group_id: string | null;
  student_id: string | null;
  subject_id: string | null;
  role: string;
  created_at: string;
  teacher_name?: string | null;
  group_name?: string | null;
  student_name?: string | null;
};

export type TeacherCandidate = { id: string; name: string; email: string | null };

export function teacherOverview() {
  return api<TeacherOverview>(endpoints.teacher.overview());
}

export function teacherSubmissions(query?: string) {
  return api<{ items: TeacherSubmission[]; total: number; is_admin: boolean }>(
    endpoints.teacher.submissions(query),
  );
}

export function teacherAssignments() {
  return api<{ items: TeacherAssignment[]; is_admin: boolean }>(endpoints.teacher.assignments());
}

export function teacherCandidates(query?: string) {
  return api<{
    teachers: TeacherCandidate[];
    groups: Array<{ id: string; name: string | null; code: string | null; course_number: number | null }>;
  }>(endpoints.teacher.candidates(query));
}

export function teacherCreateAssignment(payload: {
  teacher_id: string;
  group_id?: string;
  student_id?: string;
  subject_id?: string;
  role?: "teacher" | "curator" | "assistant";
}) {
  return api<{ assignment: TeacherAssignment }>(endpoints.teacher.assignments(), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function teacherRemoveAssignment(id: string) {
  return api<{ removed: boolean; id: string }>(endpoints.teacher.assignment(id), { method: "DELETE" });
}

/** Оценка работы: тот же серверный маршрут, что и в кабинете старосты. */
export function gradeSubmission(id: string, grade: number, comment: string) {
  return api<{ submission: TeacherSubmission }>(endpoints.grading.grade(id), {
    method: "POST",
    body: JSON.stringify({ grade, comment }),
  });
}

export function returnSubmission(id: string, comment: string) {
  return api<{ submission: TeacherSubmission }>(endpoints.grading.returnForRevision(id), {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}
