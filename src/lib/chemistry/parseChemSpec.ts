import type { ChemicalFigureSpec, ChemicalRepresentation } from "./types";

const REPS = new Set<string>([
  "2d", "3d", "structural", "skeletal", "lewis",
  "fischer", "haworth", "newman", "sawhorse", "chair", "resonance",
]);

/**
 * Parse ```chem JSON or key=value lines into ChemicalFigureSpec.
 */
export function parseChemSpec(raw: string): ChemicalFigureSpec | null {
  const text = raw.trim();
  if (!text) return null;

  if (text.startsWith("{")) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      return normalizeSpec(o);
    } catch {
      /* fall through */
    }
  }

  const o: Record<string, string> = {};
  for (const line of text.split(/\n+/)) {
    const m = line.match(/^\s*([a-zA-Z_]+)\s*[:=]\s*(.+)\s*$/);
    if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  if (Object.keys(o).length) return normalizeSpec(o);

  if (text.length < 200 && !text.includes("\n")) {
    return { query: text, representation: "2d", showProvenance: true };
  }
  return null;
}

function normalizeSpec(o: Record<string, unknown>): ChemicalFigureSpec {
  const rep = String(o.representation || o.rep || "2d").toLowerCase();
  const representation = (REPS.has(rep) ? rep : "2d") as ChemicalRepresentation;
  const sizeRaw = String(o.size || "default");
  const size =
    sizeRaw === "compact" || sizeRaw === "large" ? sizeRaw : "default";

  return {
    query: str(o.query),
    name: str(o.name),
    smiles: str(o.smiles),
    inchi: str(o.inchi),
    cid: num(o.cid),
    photoUrl: str(o.photoUrl || o.photo),
    imageUrl: str(o.imageUrl || o.url),
    representation,
    caption: str(o.caption),
    alt: str(o.alt),
    showProvenance: o.showProvenance !== false && o.provenance !== false,
    size,
  };
}

function str(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  return String(v);
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function extractInlineChemShortcodes(text: string): Array<{
  full: string;
  spec: ChemicalFigureSpec;
  index: number;
}> {
  const out: Array<{ full: string; spec: ChemicalFigureSpec; index: number }> = [];
  const re = /\[chem(?::([^\]]+)|(\s+[^\]]+))\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = (m[1] || m[2] || "").trim();
    let spec: ChemicalFigureSpec | null = null;
    if (body.includes("=") || body.includes(":")) {
      const o: Record<string, string> = {};
      for (const part of body.match(/(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*(\S+)/g) || []) {
        const mm = part.match(/(\w+)\s*=\s*"?([^"]*)"?/);
        if (mm) o[mm[1]] = mm[2];
      }
      if (o.rep && !o.representation) o.representation = o.rep;
      spec = normalizeSpec(o);
    } else if (body) {
      spec = { query: body.replace(/^:/, "").trim(), representation: "2d", showProvenance: true, size: "compact" };
    }
    if (spec) out.push({ full: m[0], spec, index: m.index });
  }
  return out;
}
