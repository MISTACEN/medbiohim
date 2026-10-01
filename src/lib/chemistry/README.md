# Chemistry library (core)

- `types.ts` — ChemicalMolecule, StructureImage, provenance
- `pubchem.ts` — resolver → molecule + verified images
- `structureImages.ts` — image priority helpers
- `rdkitClient.ts` — optional client WASM SMILES→SVG
- `validation.ts` — guard before UI

UI: `StructureView` prefers RDKit SVG, falls back to PubChem PNG, always shows source.

See `docs/CHEMISTRY-CORE-PLAN.md`.
