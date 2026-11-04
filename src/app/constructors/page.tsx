import type { Metadata } from "next";
import { Hammer } from "lucide-react";
import ConstructorBuilder from "@/components/constructors/ConstructorBuilder";

export const metadata: Metadata = {
  title: "Конструктор материалов — MEDBIOHIM",
  description:
    "Создание собственных учебных материалов: флеш-карточки, чек-листы, таблицы и пошаговые разборы без зависимости от AI.",
};

export default function ConstructorsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
          <Hammer className="h-4 w-4" /> Конструкторы
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Свои учебные материалы</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Карточки для «Базы», чек-листы для «Алгоритма», таблицы и пошаговые разборы. Черновики
          хранятся локально, материал экспортируется в JSON — создание не зависит от AI.
        </p>
      </header>
      <ConstructorBuilder />
    </div>
  );
}
