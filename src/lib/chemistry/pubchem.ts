import type { ChemicalMolecule } from "./types";

const PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

function imageUrl(cid: number, size = 400) {
  return `${PUG}/compound/cid/${cid}/PNG?image_size=${size}x${size}`;
}

export async function resolvePubChem(query: string): Promise<ChemicalMolecule | null> {
  const value = query.trim();
  if (!value) return null;

  const encoded = encodeURIComponent(value);
  const url =
    `${PUG}/compound/name/${encoded}/property/Title,MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,InChI,InChIKey/JSON`;

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

  return {
    name: p.Title || value,
    formula: p.MolecularFormula,
    molecularWeight: p.MolecularWeight ? Number(p.MolecularWeight) : undefined,
    cid: p.CID,
    canonicalSmiles: p.CanonicalSMILES,
    isomericSmiles: p.IsomericSMILES,
    inchi: p.InChI,
    inchikey: p.InChIKey,
    image2dUrl: imageUrl(p.CID),
    image3dUrl: `${PUG}/compound/cid/${p.CID}/record/SDF?record_type=3d`,
    provenance: {
      source: "pubchem",
      sourceId: String(p.CID),
      sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
      retrievedAt: new Date().toISOString(),
      representation: "2d",
    },
  };
}
