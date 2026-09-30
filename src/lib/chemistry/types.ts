export type ChemicalSource = "pubchem" | "chebi" | "rhea" | "local" | "generated";

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
  | "chair";

export interface ChemicalProvenance {
  source: ChemicalSource;
  sourceId?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  representation?: ChemicalRepresentation;
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
  provenance: ChemicalProvenance;
}

export interface ChemicalResolverResponse {
  query: string;
  molecule: ChemicalMolecule | null;
  candidates?: ChemicalMolecule[];
  error?: string;
}
