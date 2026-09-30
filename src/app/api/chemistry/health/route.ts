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
      imagePriority: ["generated(rdkit-svg)", "verified(pubchem-png)", "external"],
    },
    capabilities: {
      pubchemResolver: true,
      twoDImage: true,
      threeDRecord: true,
      rdkitSvg: "optional-client-wasm",
      structureEditor: false,
      projections: {
        fischer: false,
        haworth: false,
        newman: false,
        sawhorse: false,
        chair: false,
      },
      reactions: false,
      ocr: false,
      spectra: false,
    },
  });
}
