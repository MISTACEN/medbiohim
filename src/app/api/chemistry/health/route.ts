import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: "medbiohim-chemistry",
    status: "ok",
    version: "main",
    core: {
      chemicalMolecule: true,
      provenance: true,
      structureImages: true,
      projections: ["fischer", "haworth", "newman", "chair", "sawhorse"],
      mechanisms: true,
      electronArrows: true,
    },
    capabilities: {
      pubchemResolver: true,
      twoDImage: true,
      threeDRecord: true,
      rdkitSvg: "optional-client-wasm",
      structureEditor: false,
      projections: {
        fischer: "educational",
        haworth: "educational",
        newman: "educational",
        chair: "educational",
        sawhorse: "approximate",
      },
      reactions: false,
      mechanisms: "educational-svg",
      ocr: false,
      spectra: false,
    },
  });
}
