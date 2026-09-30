# Chemical Engine Beta — implementation plan

## Goals

The chemistry section is a reusable engine, not a collection of manually drawn pages.

### Required capabilities

- resolve a chemical entity by name, synonym, SMILES, InChI or InChIKey
- normalize identifiers
- render 2D structures as SVG
- render 3D structures
- edit molecules and reactions
- generate Fischer, Haworth, Newman, sawhorse and chair views
- represent stereochemistry
- represent reactions and reaction steps
- preserve source/provenance
- connect chemical objects to existing questions/tests/trainers
- later accept formula photographs and validate OCR candidates

## Rendering policy

Prefer generated SVG from a canonical structure. External images are a fallback/reference and must retain provenance.

## Trusted-source policy

Primary lookup source in the first beta is PubChem PUG REST. ChEBI/Rhea/other scientific sources can be added behind the same resolver contract. Arbitrary image search is not a source of truth.

## API

`GET /api/chemistry/resolve?query=benzene`

Returns a normalized candidate with source and image URLs.

Future endpoints:

- `POST /api/chemistry/structure`
- `POST /api/chemistry/reaction`
- `POST /api/chemistry/recognize-image`
- `GET /api/chemistry/molecules/:id`
- `GET /api/chemistry/reactions/:id`

## Security

- only public/publishable Supabase credentials may reach the browser
- external source URLs are stored as provenance
- uploaded images are untrusted input
- OCR output is a candidate, never an authoritative structure
- canonical chemical records require validation before publication

## Phases

### Phase A — foundation
Resolver, types, provenance, database tables, 2D/3D dependencies.

### Phase B — structure
RDKit.js rendering, Ketcher editor, molecule viewer and structure comparison.

### Phase C — projections
Fischer, Haworth, Newman, sawhorse and chair.

### Phase D — reactions
Reaction model, reaction editor, reaction SMARTS, mechanism steps and animated electron arrows.

### Phase E — analytical chemistry
UV-Vis, IR, NMR, MS, TLC, GC and HPLC visualizers.

### Phase F — learning
Generated variants, structure-answer checking, reaction prediction exercises and links to existing question banks.

### Phase G — image recognition
Photo upload, OCR/chemical recognition, candidate generation, validation and provenance.
