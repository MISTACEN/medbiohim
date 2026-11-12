import { redirect } from "next/navigation";

/** Старый адрес: учебный план теперь часть единой страницы «Учёба». */
export default function AcademicRedirectPage() {
  redirect("/study#plan");
}
