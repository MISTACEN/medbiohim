/**
 * Низкоуровневый транспорт same-origin API (TECH-AUDIT-PLAN-2026-10-27 §6, D5).
 * Поведение не менялось при выносе из src/lib/api.ts: те же таймауты, журнал
 * `mbh:api-log`, отмена/таймаут, 401 → один refresh и классификация ошибок.
 */
import { describeApiError } from "@/lib/errors";
import { isTemporaryFailure, withRetry } from "@/lib/retry";
import { getAccessToken, refreshAccessToken } from "@/lib/auth/session";
import { API_URL } from "../endpoints";
import type { ApiResult } from "./types";

export { API_URL };

function notifyApiLoading(type: "start" | "end") {
  if (typeof window === "undefined") return;
  try { window.dispatchEvent(new CustomEvent(type === "start" ? "mbh:api-start" : "mbh:api-end")); } catch {}
}

async function request<T>(path: string, options: RequestInit = {}, tokenOverride?: string): Promise<{ res: Response; text: string }> {
  const headers: Record<string, string> = { Accept: "application/json", ...(options.headers as Record<string, string> | undefined) };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !isForm && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = tokenOverride ?? getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // Ask for transport tracing only while in the admin area. The server independently
  // verifies the canonical database admin role before it returns any diagnostic header.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
    headers["X-MBH-Transport-Diagnostics"] = "1";
  }

  // One controller combines the caller's cancellation with the client timeout.
  // Passing options.signal directly would disable the timeout whenever a caller
  // supplied its own AbortSignal.
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromCaller = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), (options.method || "GET").toUpperCase() === "GET" ? 12000 : 20000);
  const startedAt = Date.now();
  const method = (options.method || "GET").toUpperCase();
  try {
    const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, { ...options, headers, cache: "no-store", signal: controller.signal });
    if (typeof window !== "undefined") {
      const source = res.headers.get("x-mbh-api-source");
      if (source) {
        const fallback = source === "spaceweb-fallback" || source === "compatibility-fallback" || res.headers.get("x-mbh-transport-fallback") === "true";
        window.dispatchEvent(new CustomEvent("mbh:api-transport", { detail: {
          source,
          fallback,
          path: path.split("?")[0],
          at: Date.now(),
        } }));
      }
    }
    if (typeof window !== "undefined") {
      const safePath = path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
      const source = res.headers.get("x-mbh-api-source") || "unknown";
      const entry = { at: Date.now(), method, path: safePath, status: res.status, durationMs: Date.now() - startedAt, source, requestId: res.headers.get("x-request-id") || "", fallback: source.includes("fallback") || res.headers.get("x-mbh-transport-fallback") === "true", ok: res.ok, kind: "response" };
      try {
        const key = "mbh:api-log-buffer";
        const prior = JSON.parse(sessionStorage.getItem(key) || "[]");
        sessionStorage.setItem(key, JSON.stringify([entry, ...(Array.isArray(prior) ? prior : [])].slice(0, 1000)));
      } catch {}
      window.dispatchEvent(new CustomEvent("mbh:api-log", { detail: entry }));
    }
    return { res, text: await res.text() };
  } catch (error) {
    // Отмена вызывающей стороной и таймаут клиента — не «нет связи»: первая
    // вообще не ошибка (страница ушла/сменились зависимости), второй даёт
    // отдельный код. Иначе отменённый запрос повторялся бы как сетевой сбой.
    const cancelled = Boolean(externalSignal?.aborted);
    const timedOut = !cancelled && controller.signal.aborted;
    if (typeof window !== "undefined") {
      const safePath = path.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
      const entry = { at: Date.now(), method, path: safePath, status: 0, durationMs: Date.now() - startedAt, source: "unavailable", requestId: "", fallback: false, ok: false, kind: cancelled ? "cancelled" : timedOut ? "timeout" : "network_error" };
      try {
        const key = "mbh:api-log-buffer";
        const prior = JSON.parse(sessionStorage.getItem(key) || "[]");
        sessionStorage.setItem(key, JSON.stringify([entry, ...(Array.isArray(prior) ? prior : [])].slice(0, 1000)));
      } catch {}
      window.dispatchEvent(new CustomEvent("mbh:api-log", { detail: entry }));
    }
    if (cancelled || timedOut) {
      const classified = new Error(cancelled ? "Запрос отменён" : "Сервер отвечает слишком долго");
      classified.name = cancelled ? "AbortError" : "TimeoutError";
      (classified as Error & { code?: string }).code = cancelled ? "ABORTED" : "TIMEOUT";
      throw classified;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);
  }
}

async function requestOnce<T>(path: string, options: RequestInit): Promise<ApiResult<T>> {
  try {
    let { res, text } = await request<T>(path, options);
    if (res.status === 401 && path !== "/auth/refresh") {
      const access = await refreshAccessToken();
      if (access) ({ res, text } = await request<T>(path, options, access));
    }
    try {
      return JSON.parse(text) as ApiResult<T>;
    } catch {
      return { ok: false, error: { code: "BAD_RESPONSE", message: describeApiError({ code: "BAD_RESPONSE" }, res.status) }, requestId: res.headers.get("x-request-id") || "client" };
    }
  } catch (cause) {
    // Код отмены/таймаута проставляет request(); всё остальное — сетевой сбой.
    // ABORTED нет в списке временных сбоев, поэтому повторной отправки не будет.
    const causeCode = String((cause as { code?: string } | null)?.code || "");
    const code = causeCode === "ABORTED" ? "ABORTED" : causeCode === "TIMEOUT" ? "TIMEOUT" : "NETWORK";
    return { ok: false, error: { code, message: describeApiError({ code }) }, requestId: "client" };
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  notifyApiLoading("start");
  try {
    const method = (options.method || "GET").toUpperCase();
    // Only idempotent reads are retried, and only after a temporary failure:
    // a rejected write must never be sent twice.
    if (method === "GET" || method === "HEAD") {
      return await withRetry(
        () => requestOnce<T>(path, options),
        (result) => !result.ok && isTemporaryFailure(result.error.code),
      );
    }
    return await requestOnce<T>(path, options);
  } finally {
    notifyApiLoading("end");
  }
}
