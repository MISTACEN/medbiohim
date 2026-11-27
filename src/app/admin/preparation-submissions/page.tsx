import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { PreparationSubmissions } from "@/components/admin/PreparationSubmissions";

export default function AdminPreparationSubmissionsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin" className="text-sm text-indigo-600">
          ← Админ
        </Link>
        <h1 className="page-title mt-1 flex items-center gap-2">
          <BadgeCheck className="h-6 w-6" />
          Заявки в атлас
        </h1>
        <p className="page-subtitle">
          Снимки из «Своих препаратов». Одобрение публикует карточку в общем атласе гистологии,
          отклонение возвращает её владельцу с пояснением. Дальше карточка правится в разделе
          «Карточки препаратов».
        </p>
      </header>
      <PreparationSubmissions />
    </main>
  );
}
