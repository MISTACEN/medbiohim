import type { ElectronArrow, MechanismAtomRef, MechanismStep } from "./types";
import { escapeXml } from "../projections/svg";

function resolvePoint(
  ref: { x: number; y: number } | { atomId: string },
  atoms: MechanismAtomRef[],
): { x: number; y: number } {
  if ("x" in ref) return { x: ref.x, y: ref.y };
  const a = atoms.find((t) => t.id === ref.atomId);
  return a ? { x: a.x, y: a.y } : { x: 0, y: 0 };
}

export function electronArrowPath(
  arrow: ElectronArrow,
  atoms: MechanismAtomRef[],
): string {
  const s = resolvePoint(arrow.from, atoms);
  const e = resolvePoint(arrow.to, atoms);
  const curve = arrow.curvature ?? 0.35;
  const mx = (s.x + e.x) / 2;
  const my = (s.y + e.y) / 2;
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * len * curve;
  const oy = (dx / len) * len * curve;
  const cx = mx + ox;
  const cy = my + oy;
  const marker =
    arrow.type === "single-electron" ? "url(#arrowhead-half)" : "url(#arrowhead-full)";
  return (
    `<path d="M ${s.x} ${s.y} Q ${cx} ${cy} ${e.x} ${e.y}" fill="none" stroke="#c02626" ` +
    `stroke-width="2" marker-end="${marker}"/>` +
    (arrow.label
      ? `<text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="11" fill="#c02626">${escapeXml(arrow.label)}</text>`
      : "")
  );
}

export function mechanismStepSvg(step: MechanismStep, width = 420, height = 280): string {
  const defs = `
  <defs>
    <marker id="arrowhead-full" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#c02626"/>
    </marker>
    <marker id="arrowhead-half" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,3 Z" fill="#c02626"/>
    </marker>
  </defs>`;

  const bonds = step.bonds
    .map((b) => {
      const a = step.atoms.find((t) => t.id === b.from);
      const c = step.atoms.find((t) => t.id === b.to);
      if (!a || !c) return "";
      if (b.order === 2) {
        return (
          `<line x1="${a.x}" y1="${a.y - 3}" x2="${c.x}" y2="${c.y - 3}" stroke="#111" stroke-width="2"/>` +
          `<line x1="${a.x}" y1="${a.y + 3}" x2="${c.x}" y2="${c.y + 3}" stroke="#111" stroke-width="2"/>`
        );
      }
      return `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>`;
    })
    .join("");

  const atoms = step.atoms
    .map((a) => {
      return (
        `<circle cx="${a.x}" cy="${a.y}" r="14" fill="#fff" stroke="#111" stroke-width="1.5"/>` +
        `<text x="${a.x}" y="${a.y + 5}" text-anchor="middle" font-size="13" font-weight="600">${escapeXml(a.label)}</text>`
      );
    })
    .join("");

  const arrows = step.arrows.map((ar) => electronArrowPath(ar, step.atoms)).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `font-family="system-ui,Segoe UI,sans-serif">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    defs +
    bonds +
    arrows +
    atoms +
    `<text x="12" y="22" font-size="13" font-weight="600" fill="#333">${escapeXml(step.title)}</text>` +
    (step.note
      ? `<text x="12" y="${height - 12}" font-size="11" fill="#666">${escapeXml(step.note)}</text>`
      : "") +
    `</svg>`
  );
}
