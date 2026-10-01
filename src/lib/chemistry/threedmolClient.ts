/**
 * Client-only 3Dmol.js loader (CDN).
 * No npm dependency — keeps Vercel build lean.
 */

export type ThreeDmolViewer = {
  addModel: (data: string, format: string) => unknown;
  setStyle: (sel: object, style: object) => void;
  zoomTo: () => void;
  render: () => void;
  clear: () => void;
  resize: () => void;
  spin: (axis?: string | boolean, speed?: number) => void;
  setBackgroundColor: (c: string) => void;
};

type ThreeDmolNS = {
  createViewer: (
    element: HTMLElement,
    config?: { backgroundColor?: string; antialias?: boolean },
  ) => ThreeDmolViewer;
};

declare global {
  interface Window {
    $3Dmol?: ThreeDmolNS;
  }
}

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.4.2/3Dmol-min.js";

let loadPromise: Promise<ThreeDmolNS | null> | null = null;

export function load3Dmol(): Promise<ThreeDmolNS | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const existing = document.querySelector(`script[data-3dmol="1"]`);
    if (existing && window.$3Dmol) {
      resolve(window.$3Dmol);
      return;
    }
    const s = document.createElement("script");
    s.src = CDN;
    s.async = true;
    s.dataset["3dmol"] = "1";
    s.onload = () => resolve(window.$3Dmol || null);
    s.onerror = () => resolve(null);
    document.body.appendChild(s);
  });

  return loadPromise;
}

/** Fetch SDF text (PubChem 3D conformer or any SDF URL). */
export async function fetchSdf(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 20) return null;
    return text;
  } catch {
    return null;
  }
}
