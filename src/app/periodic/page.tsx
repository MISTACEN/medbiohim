"use client";

/** Отдельный адрес справочника: та же таблица, что во вкладке «Инструменты». */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PeriodicTableView } from "@/components/tools/PeriodicTableView";

export default function PeriodicPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/tools?tab=periodic" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
        <ArrowLeft className="h-3.5 w-3.5" /> Все инструменты
      </Link>
      <PeriodicTableView />
    </main>
  );
}
