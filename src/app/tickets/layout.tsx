import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// Layout не получает searchParams, поэтому метаданные статичны: предмет
// уточняется уже на клиенте внутри страницы билетов.
export const metadata: Metadata = pageMetadata({
  title: "Экзаменационные билеты",
  description: "Экзаменационные билеты по предметам: тренировка и режим экзамена.",
  path: "/tickets",
});

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
