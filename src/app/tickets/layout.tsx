import type { Metadata } from "next";
import { pageMetadata, subjectName } from "@/lib/seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = await searchParams;
  const raw = query.subject_slug ?? query.slug ?? query.subject;
  const param = Array.isArray(raw) ? raw[0] : raw;
  const name = param ? subjectName(param) : "";
  return pageMetadata({
    title: name ? `Билеты: ${name}` : "Экзаменационные билеты",
    description: name
      ? `Экзаменационные билеты по предмету «${name}»: тренировка и режим экзамена.`
      : "Экзаменационные билеты по предметам: тренировка и режим экзамена.",
    path: "/tickets",
  });
}

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
