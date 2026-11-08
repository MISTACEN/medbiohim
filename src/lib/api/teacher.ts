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
  subjects: TeacherSubject[];
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
  detail_level?: number | null;
  created_at: string;
  teacher_name?: string | null;
  group_name?: string | null;
  student_name?: string | null;
};

export type TeacherCandidate = { id: string; name: string; email: string | null };

export type TeacherTestItem = {
  id: string;
  title: string;
  subject_id: string | null;
  subject_name: string | null;
  question_count: number;
  is_published: boolean;
  teacher_visible: boolean;
  /** Тест создан этим преподавателем/администратором. */
  is_mine: boolean;
  created_by: string | null;
  created_at: string | null;
};

export type TeacherSubject = { id: string; name: string };

export type PreviewQuestion = {
  id: string;
  topic_title: string | null;
  type: string;
  text: string;
  is_closed: boolean;
  options: Array<string | { key?: unknown; label?: unknown; correct?: boolean }>;
  option_count: number;
  allow_multiple: boolean;
  requires_order: boolean;
  difficulty: number | null;
  answer: string | null;
  answer_display: string;
  answer_resolution: string | null;
  answer_indexes: number[];
};

export type TestPreview = {
  test: {
    id: string;
    title: string;
    subject_id: string | null;
    subject_name: string | null;
    time_limit_sec: number | null;
    max_attempts: number | null;
    is_published: boolean;
  };
  questions: PreviewQuestion[];
  mode: "author_preview";
};

export function teacherTests(query?: string) {
  return api<{
    items: TeacherTestItem[];
    total: number;
    is_admin: boolean;
    my_subjects: TeacherSubject[];
  }>(endpoints.teacher.tests(query));
}

export type TeacherStudent = {
  id: string;
  name: string;
  group: string | null;
  group_id: string;
  attempts: number;
  finished: number;
  avg_percent: number | null;
};

export type StudentAttempt = {
  id: string;
  test_id: string;
  test_title: string | null;
  percent: number | null;
  score: number | null;
  max_score: number | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type StudentAnswerRow = {
  question_id: string;
  text: string;
  student_answer: string | null;
  etalon?: string | null;
  is_correct: boolean | null;
  score: number | null;
  grading_source: string | null;
  grading_feedback: string | null;
  answered_at: string | null;
};

/** По-вопросный разбор: ответы студента по конкретному тесту (8.31). */
export function teacherStudentTestAnswers(studentId: string, testId: string) {
  return api<{
    items: StudentAnswerRow[];
    student_id: string;
    test_id: string;
    test_title: string | null;
    detail_level: number;
  }>(endpoints.teacher.studentTestAnswers(studentId, testId));
}

/** Ростер студентов области преподавателя. */
export function teacherStudents() {
  return api<{ items: TeacherStudent[]; total: number; is_admin: boolean }>(
    endpoints.teacher.students(),
  );
}

/** Карточка студента: попытки по тестам преподавателя. */
export function teacherStudentAttempts(studentId: string) {
  return api<{ items: StudentAttempt[]; student_id: string }>(
    endpoints.teacher.studentAttempts(studentId),
  );
}

/** Создать свой тест из вопросов личного банка. */
export function createTeacherTest(payload: {
  title: string;
  subject_id: string;
  question_ids: string[];
  time_limit_sec?: number | null;
  max_attempts?: number | null;
  is_published?: boolean;
}) {
  return api<{ test: { id: string; title: string; is_published: boolean }; question_count: number }>(
    endpoints.teacher.testsCreate(),
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/** Правка своего теста. */
export function updateTeacherTest(
  id: string,
  patch: { title?: string; is_published?: boolean; time_limit_sec?: number | null; max_attempts?: number | null },
) {
  return api<{ test: { id: string; title: string; is_published: boolean } }>(
    endpoints.teacher.test(id),
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export function deleteTeacherTest(id: string) {
  return api<{ removed: boolean }>(endpoints.teacher.test(id), { method: "DELETE" });
}

/** Предметы преподавателя. Админ читает любые через teacher_id и получает каталог. */
export function teacherSubjects(teacherId?: string) {
  return api<{
    items: TeacherSubject[];
    catalog: TeacherSubject[];
    is_admin: boolean;
    teacher_id: string;
  }>(endpoints.teacher.subjects(teacherId ? `teacher_id=${encodeURIComponent(teacherId)}` : undefined));
}

/** Полная замена набора предметов преподавателя (только админ). */
export function teacherSetSubjects(teacherId: string, subjectIds: string[]) {
  return api<{ items: TeacherSubject[] }>(endpoints.teacher.subjects(), {
    method: "PUT",
    body: JSON.stringify({ teacher_id: teacherId, subject_ids: subjectIds }),
  });
}

/** Назначить автора теста: он увидит его в «Моих тестах», включая черновик. */
export function teacherSetTestOwner(id: string, teacherId: string | null) {
  return api<{ test: { id: string; title: string; created_by: string | null } }>(
    endpoints.teacher.testOwner(id),
    { method: "PATCH", body: JSON.stringify({ teacher_id: teacherId }) },
  );
}

/** Разрешить/запретить показ теста преподавателям (только админ). */
export function teacherSetTestVisibility(id: string, teacherVisible: boolean) {
  return api<{ test: { id: string; title: string; teacher_visible: boolean } }>(
    endpoints.teacher.testVisibility(id),
    { method: "PATCH", body: JSON.stringify({ teacher_visible: teacherVisible }) },
  );
}

/** Уровень детализации результатов назначения (1–4, только админ). */
export function setAssignmentDetailLevel(id: string, detailLevel: number) {
  return api<{ assignment: { id: string; detail_level: number } }>(
    endpoints.teacher.assignmentDetail(id),
    { method: "PATCH", body: JSON.stringify({ detail_level: detailLevel }) },
  );
}

/** Очередь ручной проверки открытых ответов. */
export type QuestionAnalyticsItem = {
  question_id: string;
  order: number;
  text: string;
  answered: number;
  correct: number;
  low_sample?: boolean;
  correct_percent: number | null;
};

/** Аналитика по вопросам назначения: какой вопрос группа завалила. */
export function testAssignmentAnalytics(id: string) {
  return api<{
    test_title: string | null;
    items: QuestionAnalyticsItem[];
    unique_students: number;
  }>(endpoints.teacher.testAssignmentAnalytics(id));
}

/** Ведомость назначения как CSV-файл (скачивание через blob). */
export async function downloadAssignmentCsv(id: string, fileName: string) {
  const { getAccessToken } = await import("@/lib/auth/session");
  const token = getAccessToken();
  const result = await fetch(endpoints.teacher.testAssignmentExport(id), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!result.ok) throw new Error("Не удалось скачать ведомость");
  const blob = await result.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Предпросмотр теста: вопросы с эталонами. Попытка на сервере не создаётся. */
export function testPreview(id: string) {
  return api<TestPreview>(endpoints.tests.preview(id));
}

export type TeacherTestAssignment = {
  id: string;
  test_id: string;
  test_title: string | null;
  group_id: string | null;
  group_name: string | null;
  individual: boolean;
  analytics_allowed?: boolean;
  students_targeted: number;
  due_at: string | null;
  time_limit_sec: number | null;
  max_attempts: number | null;
  question_count: number | null;
  instructions: string | null;
  created_at: string;
  completed: number;
  pending: number;
  avg_percent: number | null;
};

export function teacherTestAssignments() {
  return api<{ items: TeacherTestAssignment[]; total: number; is_admin: boolean }>(
    endpoints.teacher.testAssignments(),
  );
}

export function createTestAssignment(payload: {
  test_id: string;
  group_ids?: string[];
  student_ids?: string[];
  due_at?: string | null;
  time_limit_sec?: number | null;
  max_attempts?: number | null;
  question_count?: number | null;
  topic_ids?: string[];
  instructions?: string | null;
}) {
  return api<{ assignments: Array<{ id: string }>; test_title: string }>(
    endpoints.teacher.testAssignments(),
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function deleteTestAssignment(id: string) {
  return api<{ removed: boolean }>(endpoints.teacher.testAssignment(id), { method: "DELETE" });
}

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

/** 8.39–8.42: очередь открытых ответов тестов, ожидающих ручной проверки. */
export type OpenAnswerItem = {
  kind: "attempt" | "preparation";
  id: string;
  user_id: string;
  user_name: string;
  test_id: string;
  test_title: string | null;
  question_id: string;
  question_text: string;
  etalon: string | null;
  student_answer: string;
  grading_status: string | null;
  grading_feedback: string | null;
  answered_at: string | null;
};

export function listOpenAnswers() {
  return api<{ items: OpenAnswerItem[]; is_admin: boolean }>(endpoints.teacher.reviewOpenAnswers());
}

/** Вердикт преподавателя по открытому ответу; для попытки пересчитывается балл. */
export function reviewOpenAnswer(payload: {
  kind: "attempt" | "preparation";
  id: string;
  is_correct: boolean;
  feedback?: string;
}) {
  return api<{ answer: { id: string; is_correct: boolean | null; score: number | null; grading_status: string | null }; attempt: { id: string; score: number; max_score: number; percent: number } | null }>(
    endpoints.teacher.reviewOpenAnswers(),
    { method: "POST", body: JSON.stringify(payload) },
  );
}
