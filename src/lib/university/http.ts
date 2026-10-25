/**
 * Shared HTTP helpers for the three university route handlers. Keeps the
 * response envelope (frozen contract §2) in one place and guarantees the
 * `cache-control: no-store` header on every JSON answer.
 */
import { NextResponse } from "next/server";
import { getFacultySchedule, getServiceReport } from "./fesmu";

export const NO_STORE_HEADERS = { "cache-control": "no-store" } as const;

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** `?faculty=<id>` payload; returns the 404 envelope for an unknown id. */
export async function facultyScheduleResponse(
  facultyId: string | null,
  force: boolean,
): Promise<NextResponse> {
  try {
    const schedule = await getFacultySchedule(facultyId, { force });
    if (!schedule) return jsonResponse({ ok: false, error: "Неизвестный факультет" }, 404);
    return jsonResponse(schedule);
  } catch (cause) {
    return jsonResponse({ ok: false, error: errorMessage(cause, "Не удалось загрузить расписание") }, 500);
  }
}

/** Service probe payload used by `/api/university/status` and `?status=1`. */
export async function serviceStatusResponse(force: boolean): Promise<NextResponse> {
  try {
    return jsonResponse(await getServiceReport({ force }));
  } catch (cause) {
    return jsonResponse({ ok: false, error: errorMessage(cause, "Не удалось проверить сервисы") }, 500);
  }
}
