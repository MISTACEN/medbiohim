"use client";

import Link from "next/link";
import { ArrowLeft, Bookmark } from "lucide-react";
import { ImportsProvider } from "@/components/university/ImportsProvider";
import SavedImports from "@/components/university/SavedImports";

export default function UniversitySavedPage() {
  return (
    <ImportsProvider>
      <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <header className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm">
                <Bookmark className="h-3.5 w-3.5" /> Сохранённое из порталов вуза
              </div>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Материалы ДВГМУ в MEDBIOHIM</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Здесь собраны новости, объявления и PDF-документы расписания, которые вы сохранили из университетского хаба.
                Первоисточник всегда открывается по ссылке, пароль ЕИОС не запрашивается.
              </p>
            </div>
            <Link href="/university" className="btn-secondary inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Назад в хаб
            </Link>
          </div>
        </header>

        <SavedImports compact />
      </main>
    </ImportsProvider>
  );
}
