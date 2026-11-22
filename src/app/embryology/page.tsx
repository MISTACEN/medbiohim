import { redirect } from "next/navigation";

/**
 * Эмбриология — раздел гистологии, а не отдельный раздел платформы: таймлайн
 * стадий и режим определения стадии открываются во вкладке «Материалы»
 * предмета «Гистология, цитология». Адрес оставлен редиректом для старых
 * ссылок и закладок.
 */
export default function EmbryologyPage() {
  redirect("/subjects/histology?tab=materials");
}
