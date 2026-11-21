import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DiagnosticumRunner } from "@/components/trainers/DiagnosticumRunner";

export default function DiagnosticumPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/trainers"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" /> Тренажёры
      </Link>
      <div>
        <h1 className="page-title">Диагностикум</h1>
        <p className="page-subtitle">
          Четыре режима тренировки: определить препарат, найти диагностические структуры, отличить
          похожие препараты и комплексные задания. Подсказки открываются по одной и снижают балл.
        </p>
      </div>
      <DiagnosticumRunner />
    </div>
  );
}
