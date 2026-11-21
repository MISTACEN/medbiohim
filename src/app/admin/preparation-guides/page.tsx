import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { PreparationGuideEditor } from "@/components/admin/PreparationGuideEditor";

export default function AdminPreparationGuidesPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin" className="text-sm text-indigo-600">
          ← Админ
        </Link>
        <h1 className="page-title mt-1 flex items-center gap-2">
          <BookOpenCheck className="h-6 w-6" />
          Методические карточки препаратов
        </h1>
        <p className="page-subtitle">
          Тот же контент, что видят атлас и диагностикум: признаки, структуры, шаги поиска и
          дифференциал. Ключ карточки — стабильный id препарата.
        </p>
      </header>
      <PreparationGuideEditor />
    </main>
  );
}
