import { NextResponse } from "next/server";
import { resolvePubChem } from "@/lib/chemistry/pubchem";
import { validateChemicalMolecule } from "@/lib/chemistry/validation";
import type { ChemicalResolverResponse } from "@/lib/chemistry/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() || "";

  if (!query || query.length > 500) {
    return NextResponse.json(
      { query, molecule: null, error: "query must contain 1–500 characters" } satisfies ChemicalResolverResponse,
      { status: 400 },
    );
  }

  try {
    const molecule = await resolvePubChem(query);
    if (!molecule) {
      return NextResponse.json({ query, molecule: null, error: "compound not found" } satisfies ChemicalResolverResponse, { status: 404 });
    }

    const validation = validateChemicalMolecule(molecule);
    if (!validation.valid) {
      return NextResponse.json(
        { query, molecule: null, error: `invalid chemical record: ${validation.errors.join("; ")}` } satisfies ChemicalResolverResponse,
        { status: 502 },
      );
    }

    return NextResponse.json({ query, molecule } satisfies ChemicalResolverResponse);
  } catch (error) {
    console.error("chemical resolver failed", error);
    return NextResponse.json(
      { query, molecule: null, error: "chemical source unavailable" } satisfies ChemicalResolverResponse,
      { status: 502 },
    );
  }
}
