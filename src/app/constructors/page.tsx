import { redirect } from "next/navigation";

/**
 * Конструктор материалов живёт по адресу /builder (сегмент «constructor»
 * конфликтует с Object.prototype.constructor в маппинге выходов Vercel).
 * /constructors — старая копия той же страницы, оставлена редиректом.
 */
export default function ConstructorsPage() {
  redirect("/builder");
}
