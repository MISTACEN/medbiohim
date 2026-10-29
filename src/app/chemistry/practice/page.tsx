import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PracticeRunner } from "@/components/chemistry/PracticeRunner";

export const metadata: Metadata = {
  title: "Химия · генератор вариантов задач",
  description:
    "Банк задач по химии с детерминированным генератором вариантов: молярная масса, растворы, pH, газы, титрование, термохимия и кинетика. Пошаговые решения, проверка ответа, экспорт CSV и печать.",
};

export default function ChemistryPracticePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="print:hidden">
        <Link href="/chemistry" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Химическое ядро
        </Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Генератор вариантов</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
          Вариант собирается по seed: его можно продиктовать группе и получить те же задачи. Ответы проверяются с
          допуском, решения раскрываются по шагам, а результаты выгружаются в CSV или печатаются в PDF.
        </p>
      </div>
      <PracticeRunner />
    </div>
  );
}
