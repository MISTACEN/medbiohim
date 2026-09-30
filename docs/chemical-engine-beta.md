# Chemical Engine Beta — working-state contract

## Purpose

Beta is an isolated chemistry layer that can be merged into the main application without making the main branch depend on unfinished chemistry features.

## Working now

- chemical resolver API
- PubChem lookup by name, SMILES, InChI and InChIKey
- provenance metadata
- 2D chemical image retrieval
- 3D conformer record retrieval
- chemistry health endpoint
- chemistry landing page
- Supabase chemical schema with RLS
- dependency foundation for RDKit.js, Ketcher and 3Dmol.js
- CI build gate on the beta branch

## Contract

A chemical molecule is represented by identifiers and normalized properties. UI components consume this object; they do not own chemical truth.

External images are references. When possible, a canonical structure is the source from which local SVG/PNG representations are generated.

## Safe promotion path

1. keep beta isolated
2. build and verify each chemistry module
3. populate test fixtures
4. run database migration checks
5. run browser smoke tests
6. compare beta against main
7. open a draft PR
8. merge only after the chemistry contract and regression tests pass

## Next implementation order

1. RDKit.js WASM initialization + SVG renderer
2. Ketcher editor with import/export
3. 3Dmol interactive viewer
4. Fischer/Haworth/Newman/Sawhorse/Chair renderers
5. reaction editor + mechanism graph
6. calculators and analytical visualizers
7. image recognition pipeline with human validation
8. chemistry question generator and structure-answer checker
