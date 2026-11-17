import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Метаданные для client-страницы /english (metadata нельзя экспортировать из "use client"). */
export const metadata: Metadata = {
  title: "Английский язык — топики для медиков — MEDBIOHIM",
  description:
    "Английские топики с лексикой для студентов-медиков: письмо студента-медика, будущая профессия, история ДВГМУ, врач-биохимик.",
};

export default function EnglishLayout({ children }: { children: ReactNode }) {
  return children;
}
