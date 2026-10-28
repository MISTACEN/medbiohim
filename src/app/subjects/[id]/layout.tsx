import type { Metadata } from "next";
import { pageMetadata, subjectName } from "@/lib/seo";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const name = subjectName(id);
  return pageMetadata({
    title: name || "Предмет",
    description: name
      ? `План, лекции, материалы, тесты и аттестации по предмету «${name}» на платформе Медбиохим.`
      : "План, лекции, материалы, тесты и аттестации по предмету на платформе Медбиохим.",
    path: `/subjects/${encodeURIComponent(id)}`,
  });
}

export default function SubjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
