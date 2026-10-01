export type ChemicalSource =
  | "pubchem"
  | "chebi"
  | "rhea"
  | "kegg"
  | "local"
  | "generated"
  | "ocr"
  | "user";

export type StructureImageKind =
  | "verified"
  | "generated"
  | "external";

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
  label?: string;
}

export interface StructureImage {
  kind: StructureImageKind;
  format: "svg" | "png" | "sdf" | "url";
  url?: string;
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
  image2dUrl?: string;
  image3dUrl?: string;
  images?: StructureImage[];
  provenance: ChemicalProvenance;
}

export interface ChemicalResolverResponse {
  query: string;
  molecule: ChemicalMolecule | null;
  candidates?: ChemicalMolecule[];
  error?: string;
}

export const STRUCTURE_IMAGE_PRIORITY: StructureImageKind[] = [
  "generated",
  "verified",
  "external",
];

/**
 * Universal embed spec — lectures, tests, tickets, trainers, cards.
 * photoUrl = scanned textbook structure; query/smiles = resolver.
 */
export interface ChemicalFigureSpec {
  query?: string;
  name?: string;
  smiles?: string;
  inchi?: string;
  cid?: number;
  photoUrl?: string;
  imageUrl?: string;
  representation?: ChemicalRepresentation;
  caption?: string;
  alt?: string;
  showProvenance?: boolean;
  size?: "compact" | "default" | "large";
}
