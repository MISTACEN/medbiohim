import type { ChemicalMolecule } from "./types";
import { attachPubChemImages } from "./structureImages";

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

function inputPath(query: string) {
  const value = query.trim();
  if (/^InChI=/i.test(value)) return `inchi/${encodeURIComponent(value)}`;
  if (/^InChIKey=/i.test(value)) return `inchikey/${encodeURIComponent(value.replace(/^InChIKey=/i, ""))}`;
  if (/^(smiles:|SMILES:)/i.test(value)) return `smiles/${encodeURIComponent(value.replace(/^(smiles:|SMILES:)/i, ""))}`;
  return `name/${encodeURIComponent(value)}`;
}

export async function resolvePubChem(query: string): Promise<ChemicalMolecule | null> {
  const value = query.trim();
  if (!value) return null;

  const url =
    `${PUG}/compound/${inputPath(value)}/property/Title,MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,InChI,InChIKey/JSON`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 86400 },
  });

  if (!response.ok) return null;

  const json = (await response.json()) as {
    PropertyTable?: {
      Properties?: Array<{
        CID?: number;
        Title?: string;
        MolecularFormula?: string;
        MolecularWeight?: string;
        CanonicalSMILES?: string;
        IsomericSMILES?: string;
        InChI?: string;
        InChIKey?: string;
      }>;
    };
  };

  const p = json.PropertyTable?.Properties?.[0];
  if (!p?.CID) return null;

  const base: ChemicalMolecule = {
    name: p.Title || value,
    formula: p.MolecularFormula,
    molecularWeight: p.MolecularWeight ? Number(p.MolecularWeight) : undefined,
    cid: p.CID,
    canonicalSmiles: p.CanonicalSMILES,
    isomericSmiles: p.IsomericSMILES,
    inchi: p.InChI,
    inchikey: p.InChIKey,
    provenance: {
      source: "pubchem",
      sourceId: String(p.CID),
      sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
      retrievedAt: new Date().toISOString(),
      representation: "2d",
      label: `PubChem, CID ${p.CID}`,
    },
  };

  return attachPubChemImages(base);
}
