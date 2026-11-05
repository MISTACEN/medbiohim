import type { Metadata } from "next";
import { PenTool } from "lucide-react";
import { MaterialConstructor } from "@/components/constructor/MaterialConstructor";

export const metadata: Metadata = {
  title: "Конструктор материалов — MEDBIOHIM",
  description:
    "Самостоятельное создание учебных материалов без AI: заголовки, текст, таблицы, формулы, карточки терминов (в SRS), пошаговые разборы, упражнения; черновики, предпросмотр, экспорт и публикация в Workshop.",
};

export default function ConstructorPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
          <PenTool className="h-4 w-4" /> Конструктор
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Свои учебные материалы</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
          Пишите конспекты вручную: структура по пирамиде знаний (База → Основной → Углубление),
          карточки терминов уходят в интервальное повторение, готовый материал — в Workshop.
        </p>
      </header>
      <MaterialConstructor />
    </div>
  );
}
