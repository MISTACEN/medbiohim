import type {
  ChemicalMolecule,
  StructureImage,
  StructureImageKind,
} from "./types";
import { STRUCTURE_IMAGE_PRIORITY } from "./types";

/** Build PubChem verified 2D PNG image descriptor. */
export function pubchemImage2d(cid: number, size = 500): StructureImage {
  return {
    kind: "verified",
    format: "png",
    url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=${size}x${size}`,
    representation: "2d",
    generator: "pubchem",
    provenance: {
      source: "pubchem",
      sourceId: String(cid),
      sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      retrievedAt: new Date().toISOString(),
      representation: "2d",
      label: `PubChem, CID ${cid}`,
    },
    width: size,
    height: size,
  };
}

/** PubChem 3D SDF record link (not a raster — open in 3Dmol later). */
export function pubchemImage3d(cid: number): StructureImage {
  return {
    kind: "verified",
    format: "sdf",
    url: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`,
    representation: "3d",
    generator: "pubchem",
    provenance: {
      source: "pubchem",
      sourceId: String(cid),
      sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      retrievedAt: new Date().toISOString(),
      representation: "3d",
      label: `PubChem 3D, CID ${cid}`,
    },
  };
}

export function pickStructureImage(
  molecule: ChemicalMolecule,
  representation: StructureImage["representation"] = "2d",
  prefer?: StructureImageKind,
): StructureImage | null {
  const list = (molecule.images || []).filter((i) => i.representation === representation);
  if (!list.length) {
    if (representation === "2d" && molecule.image2dUrl) {
      return {
        kind: "verified",
        format: "png",
        url: molecule.image2dUrl,
        representation: "2d",
        generator: "pubchem",
        provenance: molecule.provenance,
      };
    }
    return null;
  }
  const order = prefer
    ? [prefer, ...STRUCTURE_IMAGE_PRIORITY.filter((k) => k !== prefer)]
    : STRUCTURE_IMAGE_PRIORITY;
  for (const kind of order) {
    const hit = list.find((i) => i.kind === kind);
    if (hit) return hit;
  }
  return list[0] || null;
}

/** Attach standard PubChem images onto a resolved molecule. */
export function attachPubChemImages(molecule: ChemicalMolecule): ChemicalMolecule {
  if (!molecule.cid) return molecule;
  const images: StructureImage[] = [
    ...(molecule.images || []),
    pubchemImage2d(molecule.cid),
    pubchemImage3d(molecule.cid),
  ];
  return {
    ...molecule,
    image2dUrl: molecule.image2dUrl || images.find((i) => i.representation === "2d")?.url,
    image3dUrl: molecule.image3dUrl || images.find((i) => i.representation === "3d")?.url,
    images,
  };
}
