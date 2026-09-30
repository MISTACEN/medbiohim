import type { ProjectionInput, ProjectionResult } from "./types";
import { line, svgWrap, text } from "./svg";

/** Cyclohexane chair (educational). */
export function renderChair(input: ProjectionInput): ProjectionResult {
  const key = (input.name || "").toLowerCase();
  const methyl = key.includes("methylcyclohexane") || key.includes("метилциклогексан");
  return {
    kind: "chair",
    fidelity: "educational",
    note: methyl
      ? "Chair · methylcyclohexane (Me equatorial preferred)"
      : "Chair conformation · cyclohexane scaffold",
    svg: chairSvg(methyl),
  };
}

function chairSvg(withMethyl: boolean) {
  const p = [
    [60, 140],
    [110, 100],
    [180, 100],
    [230, 140],
    [180, 180],
    [110, 180],
  ];
  const parts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = p[i];
    const b = p[(i + 1) % 6];
    parts.push(line(a[0], a[1], b[0], b[1], "#111", 2.4));
  }
  parts.push(line(60, 140, 60, 95));
  parts.push(text(60, 88, "H", { size: 12 }));
  parts.push(line(60, 140, 30, 155));
  parts.push(text(18, 160, withMethyl ? "Me" : "H", { size: 12, anchor: "end", weight: withMethyl ? "700" : "normal" }));
  parts.push(line(180, 100, 180, 60));
  parts.push(text(180, 52, "H", { size: 12 }));
  parts.push(line(230, 140, 230, 185));
  parts.push(text(230, 200, "H", { size: 12 }));
  parts.push(text(160, 240, withMethyl ? "Methylcyclohexane · chair" : "Cyclohexane · chair", { size: 12, fill: "#555" }));
  parts.push(text(160, 258, "ax = vertical · eq = slanted", { size: 11, fill: "#888" }));
  return svgWrap(parts.join(""), 320, 280);
}
