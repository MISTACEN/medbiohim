import { redirect } from "next/navigation";

/**
 * Английский — раздел предмета «Иностранный язык»: топики и конспекты живут во
 * вкладке «Топики» (EnglishArea). Отдельная страница дублировала этот экран,
 * поэтому адрес оставлен редиректом для старых ссылок.
 */
export default function EnglishPage() {
  redirect("/subjects/english?tab=english");
}
