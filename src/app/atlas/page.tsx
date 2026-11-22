import { redirect } from "next/navigation";

/**
 * Атлас — часть предмета, а не отдельный раздел и не вкладка «Инструментов»:
 * он открывается вкладкой «Микропрепараты» гистологии (атлас · тренажёр ·
 * диагностикум на одном экране). Адрес оставлен редиректом, deep-links
 * `?card=` и `?lesson=` передаются дальше.
 */
export default async function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ tab: "trainer" });
  for (const key of ["card", "lesson"]) {
    const value = params[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  redirect(`/subjects/histology?${query.toString()}`);
}
