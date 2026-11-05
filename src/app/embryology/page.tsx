import type { Metadata } from "next";
import { Baby } from "lucide-react";
import { EmbryologyTimeline } from "@/components/embryology/EmbryologyTimeline";

export const metadata: Metadata = {
  title: "Эмбриология: этапы развития — MEDBIOHIM",
  description:
    "Пошаговый таймлайн эмбриогенеза: от гаметогенеза до плацентации — схемы, термины, экзаменационный режим определения стадии.",
};

export default function EmbryologyPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            <Baby className="h-4 w-4" /> Эмбриология
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Этапы эмбриогенеза</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Десять ключевых стадий от гаметогенеза до плацентации: срок, механизм, ключевые термины.
            Экзаменационный режим проверяет определение стадии по описанию и схеме.
          </p>
        </div>
      </header>
      <EmbryologyTimeline />
    </div>
  );
}
