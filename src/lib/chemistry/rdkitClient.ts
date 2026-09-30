/**
 * Optional client-only RDKit WASM bridge.
 * Does not hard-depend on @rdkit/rdkit at build time — dynamic import.
 * If package is missing, returns null and UI falls back to PubChem images.
 */

export type RdkitModule = {
  get_mol: (input: string) => {
    is_valid: () => boolean;
    get_svg: (w?: number, h?: number) => string;
    get_smiles: () => string;
    get_molblock: () => string;
    delete: () => void;
  } | null;
};

let rdkitPromise: Promise<RdkitModule | null> | null = null;

export function loadRdkit(): Promise<RdkitModule | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (rdkitPromise) return rdkitPromise;

  rdkitPromise = (async () => {
    try {
      // Optional dependency — install with: npm i @rdkit/rdkit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import(/* webpackIgnore: true */ "@rdkit/rdkit");
      const init = mod.default || mod;
      const RDKit = typeof init === "function" ? await init() : init;
      if (!RDKit?.get_mol) return null;
      return RDKit as RdkitModule;
    } catch {
      return null;
    }
  })();

  return rdkitPromise;
}

/** SMILES → SVG markup via RDKit, or null if unavailable. */
export async function smilesToSvg(
  smiles: string,
  width = 400,
  height = 300,
): Promise<string | null> {
  const RDKit = await loadRdkit();
  if (!RDKit) return null;
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) {
    mol?.delete();
    return null;
  }
  try {
    const svg = mol.get_svg(width, height);
    return svg || null;
  } finally {
    mol.delete();
  }
}
