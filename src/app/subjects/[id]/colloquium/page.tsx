import type { Metadata } from "next";
import { ColloquiumApp } from "@/components/physiology-colloquium/ColloquiumApp";

export const metadata: Metadata = {
  title: "Коллоквиум по физиологии — подготовка | MEDBIOHIM",
  description:
    "План подготовки к коллоквиуму по физиологии возбудимых систем: теория, тесты с разбором ошибок, ситуационные задачи и пробный экзамен.",
};

export default async function PhysiologyColloquiumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ColloquiumApp subjectId={id} />;
}
