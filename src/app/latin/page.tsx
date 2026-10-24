"use client";

/**
 * Латинский язык — «100 рецептов» по Чернявскому.
 * Тренажёр формы рецепта: разделы, поиск, карточки с формулировками Rp./Da./Signa.
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import LatinRecipes from "@/components/portals/LatinRecipes";

export default function LatinPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> На главную
      </Link>
      <LatinRecipes />
    </div>
  );
}
