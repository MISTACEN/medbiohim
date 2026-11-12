import { redirect } from "next/navigation";

/** Старый адрес: прогресс теперь часть единой страницы «Учёба». */
export default function ProgressRedirectPage() {
  redirect("/study#progress");
}
