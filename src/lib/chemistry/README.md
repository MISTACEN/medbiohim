# Chemistry library contract

The chemistry library is deliberately UI-independent.

- `types.ts` defines canonical objects.
- `pubchem.ts` resolves external records.
- `validation.ts` validates resolver output before it reaches UI/storage.
- `fixtures.ts` contains deterministic records for future tests.

New renderers must consume `ChemicalMolecule` and never duplicate source data.
