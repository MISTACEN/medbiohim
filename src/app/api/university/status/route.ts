/**
 * `GET /api/university/status` — live probes of the FESMU service registry
 * (contract §1.5). HEAD then GET, 6 s per request, ≤4 in parallel, hard 15 s
 * budget, result cached for 10 minutes. `?refresh=1` forces a re-probe.
 *
 * Never reports a service as reachable without a real HTTP response.
 */
import { NextRequest } from "next/server";
import { serviceStatusResponse } from "@/lib/university/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  return serviceStatusResponse(request.nextUrl.searchParams.get("refresh") === "1");
}
