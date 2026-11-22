import { redirect } from "next/navigation";

/**
 * Отдельного «хаба тренажёров» больше нет: все упражнения предмета живут на
 * странице предмета, во вкладке «Тренажёры», и открываются сразу, без меню
 * выбора режима. Старые ссылки и закладки ведут туда же.
 */
export default function TrainersPage() {
  redirect("/subjects/histology?tab=trainers");
}
