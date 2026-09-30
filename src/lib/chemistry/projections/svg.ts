/** Tiny SVG helpers for projection renderers. */

export function svgWrap(
  body: string,
  width = 320,
  height = 360,
  viewBox?: string,
): string {
  const vb = viewBox || `0 0 ${width} ${height}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vb}" ` +
    `font-family="system-ui,Segoe UI,sans-serif" font-size="14">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    body +
    `</svg>`
  );
}

export function text(x: number, y: number, t: string, opts: { anchor?: string; weight?: string; size?: number; fill?: string } = {}) {
  const anchor = opts.anchor || "middle";
  const weight = opts.weight || "normal";
  const size = opts.size || 14;
  const fill = opts.fill || "#111";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-weight="${weight}" font-size="${size}" fill="${fill}">${escapeXml(t)}</text>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, stroke = "#111", w = 1.8) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
}

export function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
