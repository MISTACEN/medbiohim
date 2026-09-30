"use client";

import { useEffect, useState } from "react";
import type { ChemicalMolecule, StructureImage } from "@/lib/chemistry/types";
import { pickStructureImage } from "@/lib/chemistry/structureImages";
import { smilesToSvg } from "@/lib/chemistry/rdkitClient";

type Props = {
  molecule: ChemicalMolecule;
  representation?: StructureImage["representation"];
  className?: string;
};

/**
 * Renders structure with priority:
 * 1) RDKit SVG from SMILES (generated) when WASM available
 * 2) PubChem verified PNG
 * 3) any other image on the molecule
 * Always shows provenance under the figure.
 */
export function StructureView({ molecule, representation = "2d", className }: Props) {
  const [rdkitSvg, setRdkitSvg] = useState<string | null>(null);
  const [rdkitTried, setRdkitTried] = useState(false);

  const smiles = molecule.isomericSmiles || molecule.canonicalSmiles;

  useEffect(() => {
    let cancelled = false;
    setRdkitSvg(null);
    setRdkitTried(false);
    if (!smiles || representation !== "2d") {
      setRdkitTried(true);
      return;
    }
    (async () => {
      const svg = await smilesToSvg(smiles, 420, 320);
      if (!cancelled) {
        setRdkitSvg(svg);
        setRdkitTried(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [smiles, representation]);

  const fallback = pickStructureImage(molecule, representation, "verified");

  const provenance =
    rdkitSvg && smiles
      ? {
          label: "Сгенерировано RDKit",
          detail: `Input: SMILES · Generator: RDKit`,
          sourceUrl: molecule.provenance.sourceUrl,
        }
      : fallback
        ? {
            label: fallback.provenance.label || fallback.provenance.source,
            detail: [
              fallback.kind === "verified" ? "Проверенный источник" : fallback.kind,
              fallback.generator,
              fallback.provenance.sourceId ? `ID ${fallback.provenance.sourceId}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
            sourceUrl: fallback.provenance.sourceUrl,
          }
        : null;

  return (
    <figure className={className}>
      <div className="flex min-h-72 items-center justify-center rounded-xl border bg-white p-4">
        {rdkitSvg ? (
          <div
            className="max-h-80 max-w-full [&_svg]:h-auto [&_svg]:max-h-80 [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: rdkitSvg }}
          />
        ) : representation === "3d" && fallback?.url ? (
          <div className="space-y-3 p-6 text-center text-sm">
            <p className="font-medium">3D-конформер (SDF)</p>
            <a className="underline" href={fallback.url} target="_blank" rel="noreferrer">
              Скачать / открыть SDF
            </a>
            <p className="text-xs opacity-60">Интерактивный 3Dmol — следующий слой (beta → main).</p>
          </div>
        ) : fallback?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fallback.url}
            alt={`Структура ${molecule.name}`}
            className="max-h-80 max-w-full object-contain"
          />
        ) : rdkitTried ? (
          <span className="text-sm opacity-60">Нет изображения структуры</span>
        ) : (
          <span className="text-sm opacity-60">Загрузка…</span>
        )}
      </div>
      {provenance && (
        <figcaption className="mt-3 space-y-1 text-xs opacity-80">
          <p>
            <strong>Источник структуры:</strong> {provenance.label}
          </p>
          <p>{provenance.detail}</p>
          {provenance.sourceUrl && (
            <a className="inline-block underline" href={provenance.sourceUrl} target="_blank" rel="noreferrer">
              Открыть источник
            </a>
          )}
          {rdkitSvg && fallback?.url && (
            <p className="opacity-60">Также доступно: PubChem 2D (verified)</p>
          )}
        </figcaption>
      )}
    </figure>
  );
}
