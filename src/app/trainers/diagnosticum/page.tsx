import { redirect } from "next/navigation";

/**
 * Диагностикум больше не отдельная страница: это третий режим тренажёра
 * (`/trainers/feed/histology?section=diagnosticum`), потому что атлас, тренажёр
 * и диагностикум работают по одному банку препаратов. Старые ссылки и закладки
 * продолжают работать через редирект.
 */
export default function DiagnosticumPage() {
  redirect("/trainers/feed/histology?section=diagnosticum");
}
