import Link from "next/link";
import { ArrowRight, Microscope } from "lucide-react";

export default function TrainersPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Тренажёры</h1>
        <p className="page-subtitle">Актуальные интерактивные тренажёры. Старый JSON-каталог больше не используется.</p>
      </div>
      <Link href="/trainers/feed/histology" className="card group block p-5 transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Microscope className="h-6 w-6" /></div>
          <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-indigo-600" />
        </div>
        <h2 className="mt-5 text-lg font-bold">Гистология · МБХ</h2>
        <p className="mt-1 text-sm text-slate-500">Микропрепараты, электронограммы, подписи и последовательное прохождение банка.</p>
        <span className="mt-4 inline-flex text-sm font-semibold text-indigo-700">Открыть тренажёр →</span>
      </Link>
    </div>
  );
}
