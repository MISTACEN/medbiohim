# MEDBIOHIM

## Chemical Engine Beta

This beta adds the foundation for a unified chemistry environment inside MedBioHim. The goal is to keep chemistry data as structured chemical objects and generate the visual representations from those objects instead of manually drawing and storing every formula.

### Architecture

```
User input
  ├─ name / synonym
  ├─ SMILES / InChI / InChIKey
  ├─ uploaded formula image
  └─ existing MedBioHim chemical object
             ↓
      Chemical Resolver
             ↓
   trusted source / local data
             ↓
       normalized molecule
             ↓
        RDKit.js WASM
             ↓
  ┌──────────┼──────────┐
  ↓          ↓          ↓
  2D         3D        data
 SVG       3Dmol     SMILES/InChI
  ↓          ↓          ↓
Fischer / Haworth / Newman / chair / wedge-dash
             ↓
     reactions / spectra / tasks
             ↓
          Supabase
```

### Chemical modules planned in the beta

- General chemistry
  - atomic structure, periodicity, bonding, hybridization, VSEPR, molecular orbitals
  - nomenclature, formulas, stoichiometry, gases, solutions and intermolecular forces
- Inorganic chemistry
  - elements, oxides, acids, bases, salts, complexes, hydrolysis, amphoterism, redox and electrolysis
- Organic chemistry
  - hydrocarbons, arenes, halogen derivatives, alcohols, phenols, ethers, carbonyls, acids, esters, amines, amides, heterocycles, amino acids, peptides and carbohydrates
- Physical chemistry
  - thermodynamics, equilibrium, kinetics, electrochemistry, colligative properties and solution models
- Analytical chemistry
  - titrimetry, gravimetry, UV-Vis, IR, NMR, MS, TLC, GC and HPLC
- Stereochemistry
  - R/S, E/Z, cis/trans, D/L, alpha/beta, enantiomers, diastereomers, meso compounds and conformations
- Chemical calculations
  - molar mass, molarity, molality, dilution, ppm/ppb, stoichiometry, yield, pH, pKa, buffers, titration, thermodynamics, kinetics and electrochemistry
- Reaction engine
  - reactants, reagents, conditions, products, reaction classes and mechanism steps
- Chemical learning
  - structure identification, reaction prediction, mechanism exercises, generated variants, structure answer checking and chemistry-specific trainers

### One molecule, many representations

A molecule is stored once and rendered as needed:

- molecular formula
- condensed/semi-structural formula
- skeletal/line-angle structure
- Lewis representation
- resonance representations
- wedge/dash stereochemistry
- Fischer projection
- Haworth projection
- Newman projection
- sawhorse projection
- chair conformations
- 2D SVG
- 3D interactive model

The beta should never require an author to redraw the same molecule for every representation.

### Image and source policy

Chemical images have two supported origins:

1. **Generated** — generated from a normalized chemical structure with RDKit.js.
2. **Trusted external source** — retrieved from an authoritative chemical database such as PubChem/NCBI or ChEBI when appropriate.

The UI must preserve provenance. Every external image/data record should carry:

- source name
- source URL
- source identifier (for example PubChem CID)
- representation type
- retrieval timestamp
- original identifier used for resolution

The product must not use arbitrary image-search results as the primary chemical source. A web image may be displayed only when its provenance is known and the chemical identity has been validated.

### Photo → structure

The beta architecture reserves an ingestion pipeline for uploaded photographs or screenshots of formulas:

`image → chemical OCR/recognition → candidate structure → normalized SMILES/InChI → validation → generated SVG`

Recognition results must be treated as candidates until validated. The original image and confidence/provenance should be retained separately.

### Core technologies

- **RDKit.js** — official RDKit WebAssembly distribution for cheminformatics and 2D structure rendering.
- **Ketcher** — interactive chemical structure/reaction editor.
- **3Dmol.js** — WebGL molecular visualization.
- **KaTeX** — mathematical notation.
- **Plotly.js** — interactive scientific plots.
- **Supabase/PostgreSQL** — structured chemical data, provenance, reactions, spectra and learning links.
- **PubChem PUG REST** — trusted lookup/image source for chemical identifiers and representations.

### Chemical data model

The beta introduces the conceptual model:

- `chemical_molecules`
- `chemical_aliases`
- `chemical_properties`
- `chemical_reactions`
- `chemical_reaction_steps`
- `chemical_sources`
- `chemical_spectra`
- `chemical_functional_groups`
- `chemical_topics`
- `chemical_questions`

The existing MedBioHim subjects/questions/tests remain the learning layer; these chemical entities become reusable objects referenced by that layer.

### Source of truth

- **Chemical identity:** normalized structure and identifiers.
- **Visual representation:** generated from the normalized structure whenever possible.
- **External reference:** stored as provenance, not silently copied.
- **Learning content:** existing MedBioHim content system.
- **User-generated structures:** stored separately from canonical reference data.

### Beta implementation status

Implemented in this beta:

- chemistry architecture and provenance contract
- chemical data model migration
- PubChem resolver API
- RDKit.js dependency for browser-side cheminformatics
- Ketcher dependencies for structure/reaction editing
- 3Dmol.js dependency for 3D visualization
- chemistry utility/types foundation
- initial chemistry UI entry point

Next implementation layers:

1. molecule viewer/editor
2. 2D SVG generation and validation
3. 3D viewer
4. Fischer/Haworth/Newman/chair renderers
5. reaction editor and mechanism renderer
6. spectra and analytical chemistry visualizers
7. calculators
8. photo/OCR ingestion
9. automatic task generation and structure answer checking
10. linkage of chemistry objects to the existing organic/physical chemistry question banks

### Deployment

The existing deployment chain remains unchanged:

`Browser → Vercel /api/v1 → SpaceWeb /api/v1 → PHP front controller → Supabase`

The chemistry resolver is exposed through the existing Next.js application layer and does not require the browser to contain private database credentials.

See also:

- [docs/chemical-engine-beta.md](docs/chemical-engine-beta.md)
- [docs/dev-notes.md](docs/dev-notes.md)
- [docs/platform-concept-medbiohim.md](docs/platform-concept-medbiohim.md)
- [docs/subject-content-matrix.md](docs/subject-content-matrix.md)

Synced: 2026-09-30
