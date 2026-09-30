"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSdf, load3Dmol, type ThreeDmolViewer } from "@/lib/chemistry/threedmolClient";

type StyleMode = "stick" | "line" | "sphere";

type Props = {
  sdfUrl?: string;
  sdfText?: string;
  className?: string;
  height?: number;
  caption?: string;
  sourceLabel?: string;
  sourceUrl?: string;
};

/** Interactive 3D via 3Dmol.js (CDN). Universal: /chemistry, ChemicalFigure, StructureView. */
export function Mol3DView({
  sdfUrl,
  sdfText,
  className,
  height = 320,
  caption,
  sourceLabel,
  sourceUrl,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeDmolViewer | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const [style, setStyle] = useState<StyleMode>("stick");
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus("loading");
      setError("");
      const ns = await load3Dmol();
      if (cancelled || !hostRef.current) return;
      if (!ns) {
        setStatus("error");
        setError("Не удалось загрузить 3Dmol.js");
        return;
      }

      let data = sdfText || null;
      if (!data && sdfUrl) data = await fetchSdf(sdfUrl);
      if (cancelled) return;
      if (!data) {
        setStatus("error");
        setError("Нет 3D-данных (SDF)");
        return;
      }

      hostRef.current.innerHTML = "";
      const viewer = ns.createViewer(hostRef.current, {
        backgroundColor: "white",
        antialias: true,
      });
      viewerRef.current = viewer;
      viewer.addModel(data, "sdf");
      applyStyle(viewer, "stick");
      viewer.zoomTo();
      viewer.render();
      setStatus("ok");
    })();

    return () => {
      cancelled = true;
      viewerRef.current = null;
    };
  }, [sdfUrl, sdfText]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || status !== "ok") return;
    applyStyle(v, style);
    v.render();
  }, [style, status]);

  useEffect(() => {
    const v = viewerRef.current;
    if (!v || status !== "ok") return;
    try {
      if (spin) v.spin("y");
      else v.spin(false);
    } catch {
      /* ignore */
    }
    v.render();
  }, [spin, status]);

  return (
    <figure className={className}>
      <div className="mb-2 flex flex-wrap gap-2">
        {(["stick", "line", "sphere"] as StyleMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setStyle(m)}
            className={
              "rounded-lg border px-2.5 py-1 text-xs " +
              (style === m ? "font-semibold" : "opacity-70")
            }
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSpin((s) => !s)}
          className="rounded-lg border px-2.5 py-1 text-xs"
        >
          {spin ? "Стоп" : "Вращение"}
        </button>
      </div>

      <div
        ref={hostRef}
        className="w-full overflow-hidden rounded-xl border bg-white"
        style={{ height, position: "relative" }}
      />

      {status === "loading" && (
        <p className="mt-2 text-center text-xs opacity-60">Загрузка 3D…</p>
      )}
      {status === "error" && (
        <p className="mt-2 text-center text-xs text-red-600">
          {error}
          {sdfUrl && (
            <>
              {" · "}
              <a className="underline" href={sdfUrl} target="_blank" rel="noreferrer">
                SDF
              </a>
            </>
          )}
        </p>
      )}

      <figcaption className="mt-2 space-y-0.5 text-xs opacity-75">
        {caption && <div>{caption}</div>}
        <div>
          <strong>3D:</strong> 3Dmol.js
          {sourceLabel ? ` · ${sourceLabel}` : ""}
          {sourceUrl && (
            <>
              {" · "}
              <a className="underline" href={sourceUrl} target="_blank" rel="noreferrer">
                источник
              </a>
            </>
          )}
        </div>
        <div className="opacity-60">Тяните мышью — поворот · колесо — zoom</div>
      </figcaption>
    </figure>
  );
}

function applyStyle(viewer: ThreeDmolViewer, mode: StyleMode) {
  viewer.setStyle({}, {});
  if (mode === "stick") {
    viewer.setStyle({}, { stick: { radius: 0.15 }, sphere: { scale: 0.25 } });
  } else if (mode === "line") {
    viewer.setStyle({}, { line: {} });
  } else {
    viewer.setStyle({}, { sphere: { scale: 0.35 } });
  }
}
