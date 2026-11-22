import { redirect } from "next/navigation";

/**
 * Химия больше не живёт отдельным разделом: рабочее ядро, таблица элементов,
 * реакции, растворы, практика, лаборатория и растворимость — секции вкладки
 * «Химия» на странице предмета. Раньше `/chemistry` был хабом ссылок на
 * страницы, которые дублировали предметный экран.
 */
export default function ChemistryPage() {
  redirect("/subjects/chemistry_organic_physical?tab=chem");
}
