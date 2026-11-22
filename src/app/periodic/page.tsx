import { redirect } from "next/navigation";

/**
 * Таблица элементов — часть химии, а не самостоятельный раздел: открывается
 * секцией «Элементы» вкладки «Химия» на странице предмета. Отдельный адрес
 * оставлен только как редирект, чтобы не ломать старые ссылки.
 */
export default function PeriodicPage() {
  redirect("/subjects/chemistry_organic_physical?tab=chem&section=elements");
}
