"use client";

import { useEffect, useState } from "react";
import { Rows3 } from "lucide-react";

type Density = "comfortable" | "compact";

/** Плотность таблиц: локальная настройка браузера, применяется к data-density. */
export function DensityCard() {
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const saved = localStorage.getItem("mb_density");
    if (saved === "compact" || saved === "comfortable") setDensity(saved);
  }, []);

  function applyDensity(value: Density) {
    setDensity(value);
    localStorage.setItem("mb_density", value);
    document.documentElement.setAttribute("data-density", value);
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Rows3 className="h-5 w-5" /> Плотность таблиц</h2>
      <div className="flex gap-2" role="radiogroup" aria-label="Плотность таблиц">
        {(["comfortable", "compact"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={density === value}
            onClick={() => applyDensity(value)}
            className={"rounded-xl px-4 py-2 text-sm font-semibold " + (density === value ? "bg-[var(--primary)] text-white" : "border")}
            style={density === value ? undefined : { borderColor: "var(--border)" }}
          >
            {value === "comfortable" ? "Обычная" : "Компактная"}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">Влияет на отступы в таблицах расписания, журналов и админки. Настройка хранится в этом браузере.</p>
    </section>
  );
}
