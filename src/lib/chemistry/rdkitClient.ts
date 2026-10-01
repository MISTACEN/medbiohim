/**
 * Optional client-only RDKit WASM bridge.
 * Loads the RDKit WASM build from CDN at runtime — no build-time dependency
 * and no bundler wasm configuration needed. If loading fails, returns null
 * and the UI falls back to PubChem images.
 *
 * NOTE: a previous version used `import(/* webpackIgnore: true *\/ "@rdkit/rdkit")`,
 * which could never work in the browser (bare specifier at runtime, package
 * not installed). CDN loading matches how 3Dmol.js is already loaded here.
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

declare global {
  interface Window {
    initRDKitModule?: (config?: {
      locateFile?: (file: string, prefix: string) => string;
    }) => Promise<RdkitModule>;
  }
}

const RDKIT_VERSION = "2026.3.6";
const RDKIT_CDN = `https://unpkg.com/@rdkit/rdkit@${RDKIT_VERSION}/dist`;

let rdkitPromise: Promise<RdkitModule | null> | null = null;

export function loadRdkit(): Promise<RdkitModule | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (rdkitPromise) return rdkitPromise;

  rdkitPromise = (async () => {
    try {
      if (typeof window.initRDKitModule !== "function") {
        await injectScript(`${RDKIT_CDN}/RDKit_minimal.js`);
      }
      const init = window.initRDKitModule;
      if (typeof init !== "function") return null;
      const RDKit = await init({
        locateFile: (file) => `${RDKIT_CDN}/${file}`,
      });
      if (!RDKit?.get_mol) return null;
      return RDKit;
    } catch {
      return null;
    }
  })();

  return rdkitPromise;
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "1";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
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
