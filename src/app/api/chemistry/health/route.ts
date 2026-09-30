import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "medbiohim-chemistry",
    status: "ok",
    version: "beta",
    capabilities: {
      pubchemResolver: true,
      provenance: true,
      twoDImage: true,
      threeDRecord: true,
      structureEditor: true,
      projections: ["fischer", "haworth", "newman", "sawhorse", "chair"],
      reactions: true,
      spectra: true,
      imageRecognition: "planned-validation-pipeline",
    },
  });
}
