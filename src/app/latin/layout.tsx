import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Метаданные для client-страницы /latin (metadata нельзя экспортировать из "use client"). */
export const metadata: Metadata = {
  title: "Латынь — рецепты и термины — MEDBIOHIM",
  description:
    "Латинский язык для медиков: 100 рецептов по Чернявскому с Rp./Da./Signa, лексические минимумы, афоризмы, фармацевтическая терминология и диагнозы.",
};

export default function LatinLayout({ children }: { children: ReactNode }) {
  return children;
}
