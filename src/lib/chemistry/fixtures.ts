import type { ChemicalMolecule } from "./types";

export const chemistryFixtures: ChemicalMolecule[] = [
  {
    name: "Benzene",
    formula: "C6H6",
    molecularWeight: 78.114,
    cid: 241,
    canonicalSmiles: "C1=CC=CC=C1",
    isomericSmiles: "C1=CC=CC=C1",
    inchikey: "UHOVQNZJYSORNB-UHFFFAOYSA-N",
    provenance: { source: "pubchem", sourceId: "241", sourceUrl: "https://pubchem.ncbi.nlm.nih.gov/compound/241" },
  },
  {
    name: "Ethanol",
    formula: "C2H6O",
    molecularWeight: 46.069,
    cid: 702,
    canonicalSmiles: "CCO",
    isomericSmiles: "CCO",
    inchikey: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N",
    provenance: { source: "pubchem", sourceId: "702", sourceUrl: "https://pubchem.ncbi.nlm.nih.gov/compound/702" },
  },
];
