import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import LibraryBrowser from "@/components/library/LibraryBrowser";

export const metadata: Metadata = {
  title: "Библиотека — MEDBIOHIM",
  description:
    "Учебные материалы MEDBIOHIM, методички и внешние каталоги: электронная библиотека ДВГМУ, PubMed и подписные ЭБС.",
};

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
          <BookOpen className="h-4 w-4" /> Библиотека
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Учебные материалы и каталоги</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Свои пособия и лекции, атлас и мастерская — рядом с внешними библиотеками.
          Закрытые тексты не копируются: подписные базы открываются только с доступом вуза.
        </p>
      </header>

      <LibraryBrowser />
    </div>
  );
}
