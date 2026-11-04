import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ReactionBalancer } from "@/components/chemistry/ReactionBalancer";
import SubjectContextBanner from "@/components/subjects/SubjectContextBanner";

export const metadata: Metadata = {
  title: "Химия · уравнивание реакций",
  description:
    "Уравнивание химических реакций: метод Гаусса над точными дробями подбирает минимальные целые коэффициенты, проверяется сохранение атомов и заряда. Поддержка ионов в квадратных скобках.",
};

export default function ChemistryBalancePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="print:hidden">
        <Link href="/chemistry" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Химическое ядро
        </Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Уравнивание реакций</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Решатель строит матрицу составов (элементы и заряд × вещества) и подбирает минимальные положительные целые
          коэффициенты методом Гаусса над точными дробями. После решения автоматически проверяется сохранение атомов
          и суммарного заряда.
        </p>
      </div>
      <SubjectContextBanner />
      <ReactionBalancer />
    </div>
  );
}
