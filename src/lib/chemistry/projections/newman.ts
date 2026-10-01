import type { ProjectionInput, ProjectionResult } from "./types";
import { svgWrap, text } from "./svg";

/** Newman projection along a C–C bond. Default: ethane staggered. */
export function renderNewman(input: ProjectionInput): ProjectionResult {
  const conf = input.newman?.conformation || "staggered";
  const front = input.newman?.front || ["H", "H", "H"];
  const back = input.newman?.back || ["H", "H", "H"];
  const name = input.name || "C–C";

  return {
    kind: "newman",
    fidelity: input.newman ? "educational" : "approximate",
    note: `Newman · ${conf} · вид вдоль связи C–C`,
    svg: newmanSvg(front, back, conf, name),
  };
}

function newmanSvg(
  front: [string, string, string],
  back: [string, string, string],
  conf: "staggered" | "eclipsed",
  label: string,
) {
  const cx = 160;
  const cy = 150;
  const r = 70;
  const frontAngles = [-90, 30, 150];
  const backAngles =
    conf === "eclipsed" ? frontAngles : frontAngles.map((a) => a + 60);

  const parts: string[] = [
    `<circle cx="${cx}" cy="${cy}" r="${r + 8}" fill="none" stroke="#999" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="#111" stroke-width="2.5"/>`,
    `<circle cx="${cx}" cy="${cy}" r="10" fill="#111"/>`,
  ];

  function arm(angleDeg: number, labelText: string, color: string, len: number) {
    const rad = (angleDeg * Math.PI) / 180;
    const x2 = cx + Math.cos(rad) * len;
    const y2 = cy + Math.sin(rad) * len;
    const tx = cx + Math.cos(rad) * (len + 18);
    const ty = cy + Math.sin(rad) * (len + 18);
    return (
      `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>` +
      text(tx, ty + 4, labelText, { size: 13, fill: color })
    );
  }

  frontAngles.forEach((a, i) => {
    parts.push(arm(a, front[i], "#111", r - 5));
  });
  backAngles.forEach((a, i) => {
    parts.push(arm(a, back[i], "#2563eb", r + 28));
  });

  parts.push(text(cx, 300, `${label} · Newman (${conf})`, { size: 12, fill: "#555" }));
  parts.push(text(cx, 318, "front ●  back — blue", { size: 11, fill: "#888" }));
  return svgWrap(parts.join(""), 320, 340);
}
