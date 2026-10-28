import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Банк тестов",
    description: "Банк тестовых заданий с ответами: тренировка, повторение и разбор ошибок.",
    path: `/tests/bank/${encodeURIComponent(id)}`,
  });
}

export default function TestBankLayout({ children }: { children: React.ReactNode }) {
  return children;
}
