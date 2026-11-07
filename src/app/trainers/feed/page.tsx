import { redirect } from "next/navigation";

/**
 * У ленты тренажёров нет предмета по умолчанию: `/trainers/feed` без slug
 * раньше отдавал 404 (в том числе при prefetch из интерфейса).
 * Уводим в каталог тренажёров, где предмет выбирается явно.
 */
export default function TrainerFeedIndexPage() {
  redirect("/trainers");
}
