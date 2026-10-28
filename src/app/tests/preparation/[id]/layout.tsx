import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Подготовка к тесту",
    description: "Подготовка к тесту: вопросы, таймер и разбор ответов на платформе Медбиохим.",
    path: `/tests/preparation/${encodeURIComponent(id)}`,
  });
}

export default function PreparationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
