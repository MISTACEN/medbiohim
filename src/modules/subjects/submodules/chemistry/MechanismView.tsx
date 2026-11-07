"use client";

import { useState } from "react";
import type { Mechanism } from "@/lib/chemistry/mechanism";
import { mechanismStepSvg } from "@/lib/chemistry/mechanism";

type Props = {
  mechanism: Mechanism;
  className?: string;
};

export function MechanismView({ mechanism, className }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = mechanism.steps[stepIdx] || mechanism.steps[0];
  const svg = step ? mechanismStepSvg(step) : "";

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{mechanism.name}</h3>
        <span className="text-sm opacity-70">{mechanism.reactionSummary}</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {mechanism.steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStepIdx(i)}
            className={
              "rounded-lg border px-3 py-1.5 text-sm " +
              (i === stepIdx ? "font-semibold opacity-100" : "opacity-70")
            }
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </div>
      {step?.description && <p className="mb-2 text-sm opacity-80">{step.description}</p>}
      <div
        className="overflow-auto rounded-xl border bg-white p-2"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="mt-2 text-xs opacity-60">
        Красные стрелки — движение электронных пар (curly arrows). Схема учебная; координаты
        не из RDKit. {mechanism.provenance?.note || ""}
      </p>
    </div>
  );
}
