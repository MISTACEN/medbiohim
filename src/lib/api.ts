/**
 * API client for SpaceWeb backend.
 * Set NEXT_PUBLIC_API_URL=https://your-spaceweb/api/v1
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

  const json = (await res.json()) as ApiResult<T>;
  return json;
}

export async function login(email: string, password: string) {
  return api<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email: string; role?: string };
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function me() {
  return api<{ user: { id: string; email: string; role?: string | null } }>(
    "/auth/me"
  );
}

export async function health() {
  return api<{
    status: string;
    phase?: string;
    version?: string;
    checks?: Record<string, unknown>;
  }>("/health");
}
