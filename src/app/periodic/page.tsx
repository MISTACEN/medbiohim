"use client";

/**
 * Отдельный адрес справочника. Таблица одна на весь сайт — модульная
 * (`PeriodicTable`), а не вторая копия во «Инструментах»: раньше здесь жила
 * `PeriodicTableView`, и правки в двух таблицах расходились.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PeriodicTable } from "@/modules/subjects/submodules/chemistry";

export default function PeriodicPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <Link href="/tools?tab=periodic" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
        <ArrowLeft className="h-3.5 w-3.5" /> Все инструменты
      </Link>
      <PeriodicTable />
    </main>
  );
}
