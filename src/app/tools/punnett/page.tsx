import type { Metadata } from "next";
import Link from "next/link";
import { Grid3x3 } from "lucide-react";

import PunnettTrainer from "@/components/trainers/PunnettTrainer";

export const metadata: Metadata = {
  title: "Решётка Пеннета — MEDBIOHIM",
  description:
    "Тренажёр по генетике: скрещивания, гаметы, решётка Пеннета и расщепление по генотипам и фенотипам (законы Менделя).",
};

export default function PunnettPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            <Grid3x3 className="h-4 w-4" /> Генетика · тренажёр
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Решётка Пеннета</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Гибридологический анализ скрещиваний: моногибридное и дигибридное, полное
            доминирование, законы Менделя.
          </p>
        </div>
        <Link
          href="/labs/simulations"
          className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300"
        >
          К симуляциям
        </Link>
      </header>

      <PunnettTrainer />
    </div>
  );
}
