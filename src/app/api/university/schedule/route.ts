/**
 * `GET /api/university/schedule?faculty=<id>` — canonical alias of
 * `/api/university?faculty=<id>` (contract §2). Response:
 * `{ ok, faculty, fetched_at, source, cached, stale, cache_age_seconds, items, error }`.
 * Unknown id → `404 { ok: false, error: "Неизвестный факультет" }`.
 * `?refresh=1` skips the 30-minute cache.
 */
import { NextRequest } from "next/server";
import { facultyScheduleResponse } from "@/lib/university/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return facultyScheduleResponse(params.get("faculty"), params.get("refresh") === "1");
}
