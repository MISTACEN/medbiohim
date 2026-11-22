"use client";

/**
 * Латынь внутри предмета: рецепты по Чернявскому и конспекты (лексические
 * минимумы, афоризмы, фарма-терминология) в одной вкладке. Отдельная страница
 * /latin больше не нужна — она дублировала ровно этот экран.
 */
import { useState } from "react";
import LatinRecipes from "@/components/portals/LatinRecipes";
import ArchiveLectures from "@/components/portals/ArchiveLectures";

type LatinTab = "recipes" | "notes";

export function LatinArea() {
  const [tab, setTab] = useState<LatinTab>("recipes");

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">Латинский язык</h2>
        <p className="mt-1 text-sm text-slate-500">
          Формы рецептов по Чернявскому: разделы, поиск и карточки Rp./Da./Signa, плюс конспекты по
          терминам, афоризмам и фармакологии.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
        {(
          [
            ["recipes", "Рецепты (Чернявский)"],
            ["notes", "Конспекты: термины, афоризмы, фарма"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              tab === id ? "bg-[var(--primary)] text-white" : "hover:bg-[var(--primary-soft)]",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "recipes" ? <LatinRecipes /> : <ArchiveLectures setId="latin" />}
    </section>
  );
}

export default LatinArea;
