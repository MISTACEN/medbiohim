import type { ProjectionInput, ProjectionResult } from "./types";
import { line, svgWrap, text } from "./svg";

/**
 * Educational Fischer projection.
 * For D-glucose uses standard textbook substituents; otherwise generic carbon chain.
 */
export function renderFischer(input: ProjectionInput): ProjectionResult {
  const key = (input.name || "").toLowerCase();
  const smiles = (input.smiles || "").toLowerCase();

  if (
    key.includes("glucose") ||
    key.includes("глюкоз") ||
    smiles.includes("c(o)c(o)c(o)c(o)c(o)co") ||
    smiles.includes("oc[c@h](o)[c@@h](o)")
  ) {
    return {
      kind: "fischer",
      fidelity: "educational",
      note: "D-Glucose, open-chain Fischer (учебная проекция)",
      svg: glucoseFischerSvg(),
    };
  }

  if (key.includes("glyceraldehyde") || key.includes("глицеральдегид")) {
    return {
      kind: "fischer",
      fidelity: "educational",
      note: "D-Glyceraldehyde Fischer",
      svg: glyceraldehydeFischerSvg(),
    };
  }

  return {
    kind: "fischer",
    fidelity: "approximate",
    note: "Общая схема Фишера (вертикальная углеродная цепь). Для точной стереохимии нужны координаты RDKit + конфигурация.",
    svg: genericFischerSvg(input.name || "Molecule"),
  };
}

function glucoseFischerSvg() {
  const cx = 160;
  const rows = [
    { y: 40, left: "", mid: "CHO", right: "" },
    { y: 90, left: "H", mid: "C", right: "OH" },
    { y: 140, left: "HO", mid: "C", right: "H" },
    { y: 190, left: "H", mid: "C", right: "OH" },
    { y: 240, left: "H", mid: "C", right: "OH" },
    { y: 290, left: "", mid: "CH₂OH", right: "" },
  ];
  const parts: string[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    parts.push(line(cx, rows[i].y + 8, cx, rows[i + 1].y - 12));
  }
  for (const r of rows) {
    if (r.left) {
      parts.push(line(cx - 50, r.y, cx, r.y));
      parts.push(text(cx - 70, r.y + 5, r.left, { anchor: "end" }));
    }
    if (r.right) {
      parts.push(line(cx, r.y, cx + 50, r.y));
      parts.push(text(cx + 70, r.y + 5, r.right, { anchor: "start" }));
    }
    parts.push(text(cx, r.y + 5, r.mid, { weight: "600" }));
  }
  parts.push(text(160, 330, "D-Glucose · Fischer", { size: 12, fill: "#555" }));
  return svgWrap(parts.join(""), 320, 350);
}

function glyceraldehydeFischerSvg() {
  const cx = 160;
  const parts = [
    line(cx, 48, cx, 100),
    line(cx, 108, cx, 160),
    text(cx, 40, "CHO", { weight: "600" }),
    line(cx - 50, 120, cx, 120),
    line(cx, 120, cx + 50, 120),
    text(cx - 70, 125, "H", { anchor: "end" }),
    text(cx, 125, "C", { weight: "600" }),
    text(cx + 70, 125, "OH", { anchor: "start" }),
    text(cx, 180, "CH₂OH", { weight: "600" }),
    text(160, 220, "D-Glyceraldehyde · Fischer", { size: 12, fill: "#555" }),
  ];
  return svgWrap(parts.join(""), 320, 250);
}

function genericFischerSvg(label: string) {
  const cx = 160;
  const parts = [
    text(cx, 36, "CHO / top", { size: 12, fill: "#666" }),
    line(cx, 50, cx, 200),
    line(cx - 55, 90, cx + 55, 90),
    line(cx - 55, 140, cx + 55, 140),
    text(cx - 70, 95, "H", { anchor: "end" }),
    text(cx + 70, 95, "OH", { anchor: "start" }),
    text(cx - 70, 145, "HO", { anchor: "end" }),
    text(cx + 70, 145, "H", { anchor: "start" }),
    text(cx, 220, "CH₂OH", { weight: "600" }),
    text(cx, 250, label.slice(0, 28), { size: 12, fill: "#555" }),
    text(cx, 270, "Fischer (schema)", { size: 11, fill: "#888" }),
  ];
  return svgWrap(parts.join(""), 320, 290);
}
