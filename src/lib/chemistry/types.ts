export type ChemicalSource =
  | "pubchem"
  | "chebi"
  | "rhea"
  | "kegg"
  | "local"
  | "generated"
  | "ocr"
  | "user";

/** How the structure image was obtained — always shown in UI. */
export type StructureImageKind =
  | "verified"   // official DB image (PubChem/ChEBI)
  | "generated"  // RDKit / local engine SVG|PNG
  | "external";  // other curated source after id check

export type ChemicalRepresentation =
  | "2d"
  | "3d"
  | "structural"
  | "skeletal"
  | "lewis"
  | "fischer"
  | "haworth"
  | "newman"
  | "sawhorse"
  | "chair"
  | "resonance";

export interface ChemicalProvenance {
  source: ChemicalSource;
  sourceId?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  representation?: ChemicalRepresentation;
  /** Human label e.g. "PubChem, CID 241" */
  label?: string;
}

/**
 * One renderable structure image with mandatory provenance.
 * Prefer SVG (scalable, highlightable) over PNG when generator is RDKit.
 */
export interface StructureImage {
  kind: StructureImageKind;
  format: "svg" | "png" | "sdf" | "url";
  /** data: URL, remote URL, or inline SVG markup when format=svg and inline */
  url?: string;
  /** Inline SVG string when generated client-side */
  svg?: string;
  representation: ChemicalRepresentation;
  generator?: "rdkit" | "pubchem" | "chebi" | "unknown";
  provenance: ChemicalProvenance;
  width?: number;
  height?: number;
}

export interface ChemicalMolecule {
  name: string;
  formula?: string;
  molecularWeight?: number;
  cid?: number;
  canonicalSmiles?: string;
  isomericSmiles?: string;
  inchi?: string;
  inchikey?: string;
  /** @deprecated prefer images[] — kept for API compat */
  image2dUrl?: string;
  image3dUrl?: string;
  /** Ordered by trust: verified → generated → external */
  images?: StructureImage[];
  provenance: ChemicalProvenance;
}

export interface ChemicalResolverResponse {
  query: string;
  molecule: ChemicalMolecule | null;
  candidates?: ChemicalMolecule[];
  error?: string;
}

/** Priority when picking default 2D image for UI. */
export const STRUCTURE_IMAGE_PRIORITY: StructureImageKind[] = [
  "generated", // local RDKit SVG preferred when available
  "verified",  // PubChem PNG trusted
  "external",
];
