/**
 * `GET /api/university/oziz` — public course catalog of the ОЗиЗ Moodle (U7).
 * `?refresh=1` skips the 30-minute cache. Contents behind the login are never
 * requested; a failed refresh serves the previous value with `stale: true`.
 */
import { NextRequest } from "next/server";
import { getOzizCatalog } from "@/lib/university/oziz";
import { jsonResponse } from "@/lib/university/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  return jsonResponse(await getOzizCatalog({ force: request.nextUrl.searchParams.get("refresh") === "1" }));
}
