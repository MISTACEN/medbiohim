import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LabBench } from "@/modules/subjects/submodules/chemistry";
import SubjectContextBanner from "@/components/subjects/SubjectContextBanner";

export const metadata: Metadata = {
  title: "Химия · виртуальная лаборатория",
  description:
    "Виртуальная лаборатория по химии: опыты 5.1–5.6, 9.1–9.5, 10.3 и 11.1–11.3 из методички (МБХ-201) плюс расчётные симуляции — титрование, элемент Нернста, Бугер–Ламберт–Бер, кондуктометрия.",
};

export default function ChemistryLabPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="print:hidden">
        <Link href="/chemistry" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Химическое ядро
        </Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Виртуальная лаборатория</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Двенадцать опытов органической химии из методички (5.1–5.6, 9.1–9.5, 10.3, 11.1–11.3) —
          с уравнениями, наблюдениями и ответами на вопросы. Четыре расчётные симуляции считают
          равновесия, оптику и проводимость по формулам: кривая титрования, элемент Нернста,
          поглощение света и кондуктометрия (константа диссоциации слабого электролита).
        </p>
      </div>
      <SubjectContextBanner />
      <LabBench />
    </div>
  );
}
