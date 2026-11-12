import { redirect } from "next/navigation";

/** Старый адрес: трекер отработок теперь часть единой страницы «Учёба». */
export default function AssignmentsRedirectPage() {
  redirect("/study#assignments");
}
