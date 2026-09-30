import type { ChemicalMolecule } from "./types";

export function validateChemicalMolecule(molecule: ChemicalMolecule) {
  const errors: string[] = [];
  if (!molecule.name.trim()) errors.push("name is required");
  if (!molecule.cid && !molecule.inchikey && !molecule.isomericSmiles) {
    errors.push("at least one stable chemical identifier is required");
  }
  if (molecule.molecularWeight !== undefined && (!Number.isFinite(molecule.molecularWeight) || molecule.molecularWeight <= 0)) {
    errors.push("molecularWeight must be a positive finite number");
  }
  return { valid: errors.length === 0, errors };
}
