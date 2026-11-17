"use client";

/**
 * Английский язык — топики и лексика для медиков.
 * Конспекты открываются без PDF: письмо, профессия, ДВГМУ, врач-биохимик.
 */
import Link from "next/link";
import { ArrowLeft, Languages } from "lucide-react";
import ArchiveLectures from "@/components/portals/ArchiveLectures";

export default function EnglishPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> На главную
      </Link>
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
          <Languages className="h-4 w-4" /> Английский язык
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Топики и лексика</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Конспекты для подготовки к парам и зачёту. Тренажёр рецептов и термины — на{" "}
          <Link href="/latin" className="font-semibold text-indigo-600 hover:underline">
            странице латыни
          </Link>
          .
        </p>
      </header>
      <ArchiveLectures setId="english" />
    </div>
  );
}
