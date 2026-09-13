/**
 * API client for SpaceWeb backend.
 * NEXT_PUBLIC_API_URL=https://your-spaceweb/api/v1
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8080/api/v1";

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
  if (options.body && !headers["Content-Type"]) {
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
    user: { id: string; email: string; role?: string };
    profile?: { id: string; full_name: string; email: string };
    roles?: string[];
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function me() {
  return api<{
    user: { id: string; email?: string; full_name?: string; role?: string | null };
    roles?: string[];
    groups?: unknown[];
  }>("/me");
}

export async function health() {
  return api<{ status: string; phase?: string; version?: string }>("/health");
}

export async function listSubjects(course?: number, semester?: number) {
  const q = new URLSearchParams();
  if (course != null) q.set("course", String(course));
  if (semester != null) q.set("semester", String(semester));
  const qs = q.toString();
  return api<{ items: unknown[] }>(`/subjects${qs ? `?${qs}` : ""}`);
}

export async function listGroups() {
  return api<{ items: unknown[] }>("/groups");
}
