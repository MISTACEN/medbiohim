import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import SimulationRunner from "@/components/labs/SimulationRunner";

export const metadata: Metadata = {
  title: "Симуляции — MEDBIOHIM",
  description:
    "Интерактивные учебные модели: кинетика ферментов, титрование слабой кислоты, мембранный потенциал покоя.",
};

export default function SimulationsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            <FlaskConical className="h-4 w-4" /> Симуляции
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Интерактивные модели</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Меняйте параметры и смотрите, как меняется результат. Это учебные модели с явными
            ограничениями — не замена учебнику и не клинический расчёт.
          </p>
        </div>
        <Link
          href="/labs"
          className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300"
        >
          К лабораторным
        </Link>
      </header>

      <SimulationRunner />
    </div>
  );
}
