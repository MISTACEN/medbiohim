import type { ProjectionInput, ProjectionResult } from "./types";
import { line, svgWrap, text } from "./svg";

/** Educational Haworth (pyranose) for D-glucose α/β. */
export function renderHaworth(input: ProjectionInput): ProjectionResult {
  const key = (input.name || "").toLowerCase();
  if (key.includes("glucose") || key.includes("глюкоз")) {
    return {
      kind: "haworth",
      fidelity: "educational",
      note: "α-D-Glucopyranose Haworth (учебная)",
      svg: glucoseHaworthSvg(),
    };
  }
  return {
    kind: "haworth",
    fidelity: "approximate",
    note: "Схема Haworth (пиранозный цикл). Точная стереохимия — после RDKit + ring perception.",
    svg: genericHaworthSvg(input.name || "Sugar"),
  };
}

function glucoseHaworthSvg() {
  const pts = [
    [160, 50],
    [230, 90],
    [230, 160],
    [160, 200],
    [90, 160],
    [90, 90],
  ];
  const poly = pts.map((p) => p.join(",")).join(" ");
  const parts: string[] = [
    `<polygon points="${poly}" fill="#fafafa" stroke="#111" stroke-width="2"/>`,
    text(195, 62, "O", { weight: "700", size: 16 }),
    text(250, 85, "CH₂OH", { anchor: "start", size: 12 }),
    line(230, 90, 248, 78),
    line(160, 50, 160, 28),
    text(160, 22, "H", { size: 12 }),
    line(160, 50, 140, 70),
    text(125, 78, "OH", { size: 12, anchor: "end" }),
    text(250, 165, "OH", { anchor: "start", size: 12 }),
    text(70, 165, "OH", { anchor: "end", size: 12 }),
    text(70, 95, "OH", { anchor: "end", size: 12 }),
    text(160, 240, "α-D-Glucopyranose · Haworth", { size: 12, fill: "#555" }),
  ];
  return svgWrap(parts.join(""), 320, 270);
}

function genericHaworthSvg(label: string) {
  const parts = [
    `<ellipse cx="160" cy="130" rx="90" ry="55" fill="#fafafa" stroke="#111" stroke-width="2"/>`,
    text(220, 90, "O", { weight: "700" }),
    text(160, 220, label.slice(0, 24), { size: 12, fill: "#555" }),
    text(160, 240, "Haworth (schema)", { size: 11, fill: "#888" }),
  ];
  return svgWrap(parts.join(""), 320, 270);
}
