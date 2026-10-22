"use client";

import Link from "next/link";
import { FlaskConical } from "lucide-react";
import Labs from "@/components/Labs";

export default function LabsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            <FlaskConical className="h-4 w-4" /> Практикум
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Интерактивные лабораторные</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Выберите лабораторную, отвечайте на задания внутри сессии и следите за прогрессом.
          </p>
        </div>
        <Link href="/subjects" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300">
          К предметам
        </Link>
      </header>

      <Labs />
    </div>
  );
}
