"use client";

import type { ChemicalMolecule } from "@/lib/chemistry/types";
import type { ProjectionKind } from "@/lib/chemistry/projections";
import { renderProjection } from "@/lib/chemistry/projections";

type Props = {
  molecule: ChemicalMolecule;
  kind: ProjectionKind;
  className?: string;
};

export function ProjectionView({ molecule, kind, className }: Props) {
  const result = renderProjection(kind, {
    name: molecule.name,
    smiles: molecule.isomericSmiles || molecule.canonicalSmiles,
    formula: molecule.formula,
  });

  return (
    <figure className={className}>
      <div
        className="flex min-h-72 items-center justify-center overflow-auto rounded-xl border bg-white p-3"
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
      <figcaption className="mt-3 space-y-1 text-xs opacity-80">
        <p>
          <strong>Проекция:</strong> {kind}
          {" · "}
          <strong>Точность:</strong> {result.fidelity}
        </p>
        {result.note && <p>{result.note}</p>}
        <p className="opacity-60">
          Источник: MedBioHim projection renderer (educational). Не raster PubChem.
        </p>
      </figcaption>
    </figure>
  );
}
