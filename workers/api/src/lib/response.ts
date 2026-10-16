/** Frontend contract from src/lib/api.ts */
export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
  stale?: boolean;
};

export type ApiErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiErrorBody;

export function requestId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function ok<T>(data: T, rid?: string): ApiSuccess<T> {
  return { ok: true, data, requestId: rid ?? requestId() };
}

export function fail(
  code: string,
  message: string,
  status: number,
  rid?: string,
  details?: unknown
): { body: ApiErrorBody; status: number } {
  return {
    status,
    body: {
      ok: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
      requestId: rid ?? requestId(),
    },
  };
}
