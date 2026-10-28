import type { Metadata } from "next";
import { pageMetadata, subjectName } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const name = subjectName(id);
  return pageMetadata({
    title: name ? `Тесты: ${name}` : "Тесты предмета",
    description: name
      ? `Тесты и тренажёры по предмету «${name}»: банки заданий, подготовка и разбор ошибок.`
      : "Тесты и тренажёры по предмету: банки заданий, подготовка и разбор ошибок.",
    path: `/subjects/${encodeURIComponent(id)}/tests`,
  });
}

export default function SubjectTestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
