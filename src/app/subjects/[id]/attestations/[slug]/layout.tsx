import type { Metadata } from "next";
import { pageMetadata, subjectName } from "@/lib/seo";

type Props = { params: Promise<{ id: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, slug } = await params;
  const name = subjectName(id);
  return pageMetadata({
    title: name ? `Аттестация: ${name}` : "Аттестация",
    description: name
      ? `Аттестация по предмету «${name}»: программа по этапам, тесты, задачи и эталонные решения.`
      : "Аттестация: программа по этапам, тесты, задачи и эталонные решения.",
    path: `/subjects/${encodeURIComponent(id)}/attestations/${encodeURIComponent(slug)}`,
  });
}

export default function AttestationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
