import type { ChemicalRepresentation } from "../types";

export type ProjectionKind = Extract<
  ChemicalRepresentation,
  "fischer" | "haworth" | "newman" | "sawhorse" | "chair"
>;

export interface ProjectionInput {
  name?: string;
  smiles?: string;
  formula?: string;
  newman?: {
    conformation?: "staggered" | "eclipsed";
    front?: [string, string, string];
    back?: [string, string, string];
  };
}

export interface ProjectionResult {
  kind: ProjectionKind;
  svg: string;
  fidelity: "educational" | "approximate" | "exact";
  note?: string;
}
