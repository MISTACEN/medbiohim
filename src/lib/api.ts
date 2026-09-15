/**
 * API client for SpaceWeb backend.
 * NEXT_PUBLIC_API_URL=https://your-spaceweb/api/v1
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://ryazansev3.temp.swtest.ru/public/api/v1";

export type ApiSuccess<T> = { ok: true; data: T; requestId: string };
export type ApiError = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  requestId: string;
};
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

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isForm && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...options,
    headers,
  });

  return (await res.json()) as ApiResult<T>;
}

export async function login(email: string, password: string) {
  return api<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email: string };
    profile?: unknown;
    roles?: string[];
  }>("/auth/login", {
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
  return api<{
    items: Array<{
      id: string;
      name: string;
      course_number?: number;
      semester?: number;
      control_type?: string;
    }>;
  }>(`/subjects${qs ? `?${qs}` : ""}`);
}

export async function listGroups() {
  return api<{ items: unknown[] }>("/groups");
}

export type ApiTest = {
  id: string;
  title?: string;
  name?: string;
  subject_id?: string;
  subject_name?: string;
  questions_count?: number;
  time_limit_min?: number;
};

export async function listTests(subjectId?: string) {
  const q = subjectId ? `?subject_id=${encodeURIComponent(subjectId)}` : "";
  return api<{ items: ApiTest[] }>(`/tests${q}`);
}

export async function getTest(id: string) {
  return api<{ test: ApiTest; questions?: unknown[] }>(`/tests/${id}`);
}

export async function startTestAttempt(testId: string) {
  return api<{ attempt: { id: string } }>(`/tests/${testId}/start`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function finishAttempt(
  attemptId: string,
  score?: number,
  maxScore?: number
) {
  return api<{ attempt: unknown }>(`/tests/attempts/${attemptId}/finish`, {
    method: "POST",
    body: JSON.stringify({ score, max_score: maxScore }),
  });
}

export type ApiHomework = {
  id: string;
  title: string;
  description?: string;
  subject_name?: string;
  due_at?: string;
  submission_id?: string;
  submission_status?: string;
  grade?: number;
};

export async function listHomeworks() {
  return api<{ items: ApiHomework[] }>("/homeworks");
}

export async function submitHomework(
  id: string,
  textAnswer?: string,
  fileId?: string
) {
  return api<{ submission: unknown }>(`/homeworks/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ text_answer: textAnswer, file_id: fileId }),
  });
}

export async function uploadFile(file: File, groupId?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (groupId) fd.append("group_id", groupId);
  return api<{ file: { id: string } }>("/files", { method: "POST", body: fd });
}

export async function uploadFileBase64(
  name: string,
  contentBase64: string,
  mime?: string,
  groupId?: string
) {
  return api<{ file: { id: string } }>("/files", {
    method: "POST",
    body: JSON.stringify({
      original_name: name,
      content_base64: contentBase64,
      mime_type: mime,
      group_id: groupId,
    }),
  });
}

export async function getFile(id: string) {
  return api<{ download_url?: string; url?: string; file?: unknown }>(`/files/${id}`);
}

export async function register(email: string, password: string, fullName?: string) {
  return api<{
    access_token?: string | null;
    refresh_token?: string | null;
    user?: { id: string; email: string };
    needs_email_confirm?: boolean;
    profile?: unknown;
    roles?: string[];
  }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
}

export async function getSite() {
  return api<{
    site: {
      title: string;
      subtitle?: string;
      description?: string;
      contacts?: { email?: string; phone?: string; address?: string };
      announcement_banner?: string;
    };
    announcements: Array<{
      id: string;
      title: string;
      body: string;
      pinned?: boolean;
      created_at?: string;
    }>;
  }>("/site");
}

export async function adminOverview() {
  return api<{
    site: Record<string, unknown>;
    counts: { announcements: number; groups: number; subjects: number };
  }>("/admin/overview");
}

export async function adminUpdateSite(data: Record<string, unknown>) {
  return api<{ site: Record<string, unknown> }>("/admin/site", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function adminListAnnouncements() {
  return api<{
    items: Array<{
      id: string;
      title: string;
      body: string;
      pinned?: boolean;
      created_at?: string;
    }>;
  }>("/admin/announcements");
}

export async function adminCreateAnnouncement(
  title: string,
  body: string,
  pinned?: boolean
) {
  return api<{ item: { id: string; title: string; body: string } }>(
    "/admin/announcements",
    { method: "POST", body: JSON.stringify({ title, body, pinned }) }
  );
}

export async function adminUpdateAnnouncement(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean }
) {
  return api<{ item: unknown }>(`/admin/announcements/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function adminDeleteAnnouncement(id: string) {
  return api<{ deleted: boolean }>(`/admin/announcements/${id}`, {
    method: "DELETE",
  });
}

export async function createGroup(payload: {
  name: string;
  code?: string;
  course_number?: number;
}) {
  return api<Record<string, unknown>>("/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createSubject(payload: {
  name: string;
  course_number?: number;
  semester?: number;
  control_type?: string;
}) {
  return api<Record<string, unknown>>("/subjects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getDashboard() {
  return api<{
    profile: {
      user: { id: string; full_name?: string; email?: string; avatar_url?: string | null };
      roles: string[];
      groups: Array<{ id: string; name: string; code?: string; course_number?: number }>;
    };
    site: Record<string, unknown>;
    announcements: Array<{ id: string; title: string; body: string; created_at?: string }>;
    schedule: Array<Record<string, unknown>>;
    homeworks: Array<Record<string, unknown>>;
    tests: Array<Record<string, unknown>>;
  }>("/dashboard");
}

export async function listSchedule() {
  return api<{ items: Array<Record<string, unknown>> }>("/schedule");
}

export async function listMaterials(groupId?: string) {
  const q = groupId ? `?group_id=${encodeURIComponent(groupId)}` : "";
  return api<{
    items: Array<{
      id: string;
      original_name: string;
      mime_type?: string;
      size_bytes?: number;
      created_at?: string;
      visibility?: string;
    }>;
    note?: string;
  }>(`/materials${q}`);
}

export async function listCommunityPosts() {
  return api<{
    items: Array<{
      id: string;
      title: string;
      body: string;
      author_name?: string;
      created_at?: string;
    }>;
  }>("/community/posts");
}

export async function createCommunityPost(title: string, body: string) {
  return api<{ post: Record<string, unknown> }>("/community/posts", {
    method: "POST",
    body: JSON.stringify({ title, body }),
  });
}

export async function getProgress() {
  return api<{
    homework: { total: number; done: number; items: Array<Record<string, unknown>> };
    tests: {
      attempts: number;
      avg_score: number | null;
      items: Array<Record<string, unknown>>;
    };
  }>("/progress");
}

export async function getSubject(id: string) {
  return api<{
    subject: {
      id: string;
      name: string;
      course_number?: number;
      semester?: number;
      control_type?: string;
    };
    modules?: Array<{ id: string; title: string; topics?: Array<{ id: string; title: string }> }>;
  }>(`/subjects/${id}`);
}

export function hasToken(): boolean {
  return !!getToken();
}
