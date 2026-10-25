/**
 * University Hub API — public pages of FESMU (ДВГМУ).
 *
 * `GET /api/university`                     → overview (feeds + schedule + registry)
 * `GET /api/university?faculty=<id>`        → one faculty's schedule documents
 * `GET /api/university?status=1`            → live service probes
 *
 * `?refresh=1` is an additive extension used by the UI «Обновить» button: it
 * skips the 30-minute cache and re-reads the source (a failed refresh still
 * serves the previous value with `stale: true`).
 *
 * Partial failures never fail the whole payload: each section carries its own
 * `error` string while `ok` stays true.
 */
import { NextRequest } from "next/server";
import { getOverview } from "@/lib/university/fesmu";
import { errorMessage, facultyScheduleResponse, jsonResponse, serviceStatusResponse } from "@/lib/university/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const force = params.get("refresh") === "1";

  // V-5: a *present* faculty parameter selects the faculty branch even when the
  // value is empty, so this route and its /schedule alias agree: `?faculty=`
  // is an unknown id → 404 on both.
  if (params.has("faculty")) return facultyScheduleResponse(params.get("faculty"), force);
  if (params.get("status") === "1") return serviceStatusResponse(force);

  try {
    return jsonResponse(await getOverview({ force }));
  } catch (cause) {
    return jsonResponse(
      { ok: false, error: errorMessage(cause, "Не удалось загрузить данные ФЕСМУ") },
      500,
    );
  }
}
