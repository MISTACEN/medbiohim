"use client";

/**
 * Латинский язык — «100 рецептов» по Чернявскому + конспекты
 * (лексические минимумы, афоризмы, фарма-терминология, диагнозы).
 * Тренажёр формы рецепта: разделы, поиск, карточки Rp./Da./Signa.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import LatinRecipes from "@/components/portals/LatinRecipes";
import ArchiveLectures from "@/components/portals/ArchiveLectures";

type Tab = "recipes" | "notes";

export default function LatinPage() {
  const [tab, setTab] = useState<Tab>("recipes");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> На главную
      </Link>
      <Link
        href="/english"
        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
      >
        Английский язык: топики и лексика →
      </Link>
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
    </div>
  );
}
