import { NextResponse } from "next/server";
import { resolvePubChem } from "@/lib/chemistry/pubchem";
import type { ChemicalResolverResponse } from "@/lib/chemistry/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() || "";

  if (!query) {
    return NextResponse.json(
      { query, molecule: null, error: "query is required" } satisfies ChemicalResolverResponse,
      { status: 400 },
    );
  }

  try {
    const molecule = await resolvePubChem(query);
    return NextResponse.json({ query, molecule } satisfies ChemicalResolverResponse);
  } catch (error) {
    console.error("chemical resolver failed", error);
    return NextResponse.json(
      { query, molecule: null, error: "chemical source unavailable" } satisfies ChemicalResolverResponse,
      { status: 502 },
    );
  }
}
