import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ChemTools from "@/components/chemistry/ChemTools";

export const metadata: Metadata = {
  title: "Растворы и pH — MEDBIOHIM",
  description: "Разведение растворов по C₁V₁ = C₂V₂ и расчёт pH сильных и слабых электролитов.",
};

export default function ChemToolsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/chemistry" className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline">
        <ArrowLeft className="h-4 w-4" /> К химии
      </Link>
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Растворы и pH</h1>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Практические расчёты для лабораторных: разведение, сильные и слабые электролиты,
          буферные системы.
        </p>
      </header>
      <ChemTools />
    </div>
  );
}
