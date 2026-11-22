import { redirect } from "next/navigation";

/**
 * Латынь — раздел предмета «Латинский язык», а не отдельная страница: рецепты
 * и конспекты открываются вкладкой «Рецепты» (LatinArea). Адрес оставлен
 * редиректом, чтобы старые ссылки и закладки не ломались.
 */
export default function LatinPage() {
  redirect("/subjects/latin?tab=latin");
}
