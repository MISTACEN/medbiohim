import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Лекция",
    description: "Конспект лекции на платформе Медбиохим: текст, схемы и материалы для подготовки.",
    path: `/lectures/${encodeURIComponent(id)}`,
    type: "article",
  });
}

export default function LectureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
