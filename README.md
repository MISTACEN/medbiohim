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


## Chemistry beta scope — complete capability map

The chemistry engine is designed as a reusable platform layer. It covers the full learning workflow rather than only displaying formula pictures.

### Representation engine

Every canonical molecule may be rendered on demand as:

- molecular and empirical formula
- condensed/semi-structural formula
- full structural formula
- skeletal/line-angle formula
- Lewis structure
- resonance/contributing structures
- electron-dot representation
- bond/electron annotations
- wedge/dash stereochemistry
- Fischer projection
- Haworth projection
- Newman projection
- sawhorse projection
- chair/boat conformations
- 2D SVG
- interactive 3D model
- atom/bond labels and highlights

### Chemical object capabilities

Each object can carry:

- common and systematic names
- aliases and multilingual names
- molecular formula
- molar/molecular mass
- SMILES and isomeric SMILES
- InChI and InChIKey
- PubChem CID and other external identifiers
- functional groups
- stereocenters
- charge and formal valence
- source/provenance
- generated/external representation status
- linked reactions, spectra, topics and questions

### Reaction and mechanism engine

The planned reaction layer supports:

- reactants and products
- reagents and conditions
- reaction classes
- atom mapping
- reaction SMILES/SMARTS
- multi-step synthesis
- mechanism steps
- curved electron arrows
- bond formation/cleavage
- intermediates
- catalysts
- stereochemical outcomes
- reaction schemes generated from chemical objects

### Analytical chemistry

The chemistry section is prepared for:

- titration curves
- acid-base calculations
- buffers
- pH/pKa
- redox/electrochemistry
- UV-Vis spectra
- IR spectra
- 1H/13C NMR
- mass spectra
- Raman
- chromatography concepts
- TLC
- GC
- HPLC
- calibration curves
- Beer-Lambert calculations
- quantitative analytical tasks

### Physical chemistry

Planned calculators and visualizers include:

- thermochemistry
- thermodynamics
- equilibrium
- kinetics
- Arrhenius
- electrochemistry
- phase equilibria
- colligative properties
- gas laws
- solution chemistry
- activity/ionic strength where appropriate

### General and inorganic chemistry

The content model is designed for:

- periodic trends
- atomic structure
- electron configurations
- bonding
- VSEPR
- hybridization
- molecular orbitals
- acids/bases
- salts
- oxides
- amphoterism
- coordination compounds
- ligand environments
- redox
- electrolysis
- qualitative inorganic analysis
- precipitation and solubility

### Organic and biochemical chemistry

Planned coverage includes:

- hydrocarbons and arenes
- aromaticity
- functional groups
- nomenclature
- substitution/addition/elimination
- carbonyl chemistry
- carboxylic acids and derivatives
- amines/amides
- heterocycles
- stereochemistry and conformational analysis
- amino acids
- peptides/proteins
- carbohydrates
- lipids
- nucleotides/nucleic acids
- biochemical reactions and pathways

### Input without manual drawing

The author/user should not need to redraw structures repeatedly.

Supported/target inputs:

1. chemical name → resolver → canonical object
2. synonym → resolver → canonical object
3. SMILES/InChI/InChIKey → canonical object
4. interactive Ketcher drawing → canonical object
5. uploaded formula image → chemical OCR/recognition → candidate structure → validation
6. trusted external record → imported object with provenance

The recognition pipeline must show uncertainty and require validation before an image-derived structure becomes canonical.

### Image generation and provenance

The system uses a source hierarchy:

1. generated from canonical structure
2. authoritative chemical databases such as PubChem/NCBI and ChEBI
3. other validated scientific sources when an authoritative record is unavailable

Arbitrary image-search results are not treated as chemical truth.

For every imported/generated visual, the application should expose whether it is:

- **Generated by MedBioHim**
- **Retrieved from a trusted source**
- **Uploaded by a user**
- **AI/OCR candidate pending validation**

Each external record stores its source, identifier, URL and retrieval time.

### Learning integration

Chemical objects are reusable across:

- lessons
- flashcards
- quizzes
- tests
- laboratory tasks
- reaction exercises
- structure identification
- nomenclature exercises
- stereochemistry exercises
- mechanism exercises
- calculation tasks
- spectroscopy interpretation
- exam generators

A question should reference a molecule/reaction rather than duplicate the same chemical data.

### Infrastructure

**GitHub** is the source repository and versioned specification.

**Supabase/PostgreSQL** stores canonical chemical entities, aliases, provenance, reactions, spectra, topics and links to learning content. RLS separates published/readable data from future authoring/admin data.

**Vercel** is the intended Next.js delivery/runtime layer. The chemistry API stays server-side so private credentials are not exposed to the browser. No Vercel project is currently connected to this GitHub repository in the available Vercel workspace; therefore no deployment was fabricated or changed.

### Beta acceptance criteria

The chemistry beta is considered structurally complete when:

- one canonical molecule can produce multiple representations without manual redraw
- external structures retain provenance
- the same molecule can be reused by lessons/questions/reactions
- reactions are represented as structured data rather than screenshots
- 2D and 3D viewers consume the same chemical object
- imported/photo-recognized structures remain candidates until validated
- chemical calculations and analytical visualizers can reference the same objects
- the system can add new chemical databases without changing the UI contract
