import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "medbiohim-chemistry",
    status: "ok",
    version: "main",
    capabilities: {
      pubchemResolver: true,
      provenance: true,
      twoDImage: true,
      threeDRecord: true,
      structureEditor: false,
      projections: ["fischer", "haworth", "newman", "sawhorse", "chair"],
      reactions: false,
      spectra: false,
      imageRecognition: "planned",
    },
  });
}
