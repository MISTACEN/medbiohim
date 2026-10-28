import { ImageResponse } from "next/og";

export const alt = "Медбиохим — образовательная платформа";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Latin-only text: the bundled default font has no Cyrillic glyphs.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 28,
          background: "linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 104, fontWeight: 700, letterSpacing: -2 }}>MEDBIOHIM</div>
        <div style={{ display: "flex", fontSize: 40, opacity: 0.85 }}>Medical education platform</div>
      </div>
    ),
    size
  );
}
