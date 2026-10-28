import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Тесты и тренажёры",
  description: "Тесты по предметам: банки заданий, подготовка, тренировка и разбор ошибок.",
  path: "/tests",
});

export default function TestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
