"use client";

import { useEffect, useState } from "react";
import type { ChemicalFigureSpec, ChemicalMolecule, ChemicalRepresentation } from "@/lib/chemistry/types";
import { StructureView } from "@/components/chemistry/StructureView";
import { ProjectionView } from "@/components/chemistry/ProjectionView";
import type { ProjectionKind } from "@/lib/chemistry/projections";

const PROJECTIONS = new Set<string>(["fischer", "haworth", "newman", "sawhorse", "chair"]);

type Props = {
  spec: ChemicalFigureSpec;
  className?: string;
};

/**
 * Universal chemical figure for lectures, tests, tickets, trainers, cards.
 * 1) photoUrl/imageUrl  2) resolve query/smiles  3) projections
 */
export function ChemicalFigure({ spec, className }: Props) {
  const [molecule, setMolecule] = useState<ChemicalMolecule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const representation: ChemicalRepresentation = spec.representation || "skeletal";
  const isProjection = PROJECTIONS.has(representation);
  const size = spec.size || "default";
  const maxH =
    size === "compact" ? "max-h-40" : size === "large" ? "max-h-[520px]" : "max-h-72";

  const resolveKey =
    spec.query ||
    spec.smiles ||
    (spec.cid != null ? `cid:${spec.cid}` : "") ||
    spec.inchi ||
    spec.name ||
    "";

  useEffect(() => {
    let cancelled = false;
    if (spec.photoUrl || spec.imageUrl) {
      setMolecule(null);
      setError("");
      return;
    }
    if (!resolveKey) return;

    setLoading(true);
    setError("");
    (async () => {
      try {
        let q = resolveKey;
        if (spec.smiles && !spec.query) q = `SMILES:${spec.smiles}`;
        if (spec.inchi && !spec.query && !spec.smiles) q = spec.inchi;
        if (spec.cid != null && !spec.query && !spec.smiles) {
          q = spec.name || String(spec.cid);
        }
        const res = await fetch(`/api/chemistry/resolve?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok || data.error || !data.molecule) {
          throw new Error(data.error || "structure not found");
        }
        if (!cancelled) setMolecule(data.molecule as ChemicalMolecule);
      } catch (e) {
        if (!cancelled) {
          setMolecule(null);
          setError(e instanceof Error ? e.message : "resolve failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveKey, spec.photoUrl, spec.imageUrl, spec.smiles, spec.inchi, spec.cid, spec.name, spec.query]);

  const photo = spec.photoUrl || spec.imageUrl;
  const caption = spec.caption || molecule?.name || spec.name;
  const showProv = spec.showProvenance !== false;

  return (
    <figure
      className={
        "chemical-figure my-3 " +
        (size === "compact" ? "text-xs " : "") +
        (className || "")
      }
      data-chem-rep={representation}
    >
      {photo ? (
        <div className={`flex items-center justify-center overflow-hidden rounded-xl border bg-white p-2 ${maxH}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt={spec.alt || caption || "Структурная формула"}
            className={`${maxH} w-full object-contain`}
          />
        </div>
      ) : loading ? (
        <div className="rounded-xl border p-6 text-center text-sm opacity-60">Загрузка структуры…</div>
      ) : error ? (
        <div className="rounded-xl border border-dashed p-4 text-sm opacity-70">
          Структура недоступна: {error}
        </div>
      ) : molecule && isProjection ? (
        <ProjectionView molecule={molecule} kind={representation as ProjectionKind} />
      ) : molecule ? (
        <StructureView
          molecule={molecule}
          representation={
            representation === "3d"
              ? "3d"
              : "2d"
          }
        />
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm opacity-60">
          Укажите query, smiles, photoUrl или imageUrl
        </div>
      )}

      {(caption || (showProv && photo)) && (
        <figcaption className="mt-2 space-y-0.5 text-center text-xs opacity-75">
          {caption && <div>{caption}</div>}
          {photo && showProv && (
            <div className="opacity-60">Источник: фото / загруженное изображение структурной формулы</div>
          )}
        </figcaption>
      )}
    </figure>
  );
}
