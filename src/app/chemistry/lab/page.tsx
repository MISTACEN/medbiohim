import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LabBench } from "@/components/chemistry/LabBench";

export const metadata: Metadata = {
  title: "Химия · виртуальная лаборатория",
  description:
    "Расчётные симуляции по химии: кривая титрования с выбором индикатора, гальванический элемент по уравнению Нернста, закон Бугера–Ламберта–Бера. Протокол опыта, CSV и печать.",
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
          Три опыта считают равновесия и оптику по формулам, а не по заранее заготовленным ответам: кривая титрования,
          элемент Нернста и поглощение света. У каждого опыта есть протокол и выгрузка результатов.
        </p>
      </div>
      <LabBench />
    </div>
  );
}
