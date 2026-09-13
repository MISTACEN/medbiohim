const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8080/api/v1";

export type ApiSuccess<T> = { ok: true; data: T; requestId: string };
export type ApiError = { ok: false; error: { code: string; message: string; details?: unknown }; requestId: string };
export type ApiResult<T> = ApiSuccess<T> | ApiError;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mb_access_token");
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem("mb_access_token", access);
  if (refresh) localStorage.setItem("mb_refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("mb_access_token");
  localStorage.removeItem("mb_refresh_token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isForm && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, { ...options, headers });
  return (await res.json()) as ApiResult<T>;
}

export async function login(email: string, password: string) {
  return api<{ access_token: string; refresh_token: string; user: { id: string; email: string } }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function me() {
  return api<{ user: unknown; roles?: string[]; groups?: unknown[] }>("/me");
}

export async function health() {
  return api<{ status: string; phase?: string }>("/health");
}

export async function listSubjects(course?: number, semester?: number) {
  const q = new URLSearchParams();
  if (course != null) q.set("course", String(course));
  if (semester != null) q.set("semester", String(semester));
  const qs = q.toString();
  return api<{ items: Array<{ id: string; name: string; course_number?: number; semester?: number; control_type?: string }> }>(`/subjects${qs ? `?${qs}` : ""}`);
}

export async function listGroups() {
  return api<{ items: unknown[] }>("/groups");
}

export type ApiTest = {
  id: string;
  title: string;
  description?: string | null;
  time_limit_sec?: number | null;
  subject_id?: string | null;
  subject_name?: string | null;
  is_published?: boolean;
};

export async function listTests(subjectId?: string) {
  const qs = subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : "";
  return api<{ items: ApiTest[] }>(`/tests${qs}`);
}

export async function getTest(id: string) {
  return api<{ test: ApiTest; questions: Array<{ id: string; body: string; difficulty?: number }> }>(`/tests/${id}`);
}

export async function startTestAttempt(testId: string) {
  return api<{ attempt: { id: string; status: string } }>(`/tests/${testId}/attempts`, { method: "POST" });
}

export async function finishAttempt(attemptId: string, score?: number, maxScore?: number) {
  return api<{ attempt: unknown }>(`/attempts/${attemptId}`, {
    method: "PATCH",
    body: JSON.stringify({ score, max_score: maxScore }),
  });
}

export type ApiHomework = {
  id: string;
  title: string;
  description?: string | null;
  due_at?: string | null;
  subject_name?: string | null;
  submission_id?: string | null;
  submission_status?: string | null;
  grade?: number | null;
};

export async function listHomeworks() {
  return api<{ items: ApiHomework[] }>("/homeworks");
}

export async function submitHomework(id: string, textAnswer?: string, fileId?: string) {
  return api<{ submission: unknown }>(`/homeworks/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ text_answer: textAnswer, file_id: fileId }),
  });
}

export async function uploadFile(file: File, groupId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (groupId) fd.append("group_id", groupId);
  return api<{ file: { id: string; object_key: string; original_name: string } }>("/files/upload", {
    method: "POST",
    body: fd,
  });
}

export async function getFile(id: string) {
  return api<{ file: unknown; download: { status: string; url?: string | null; expires_in?: number | null } }>(`/files/${id}`);
}
