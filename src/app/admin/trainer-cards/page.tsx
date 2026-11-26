import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { TrainerCardEditor } from "@/components/admin/TrainerCardEditor";

export default function AdminTrainerCardsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <Link href="/admin" className="text-sm text-indigo-600">
          ← Админ
        </Link>
        <h1 className="page-title mt-1 flex items-center gap-2">
          <ImageIcon className="h-6 w-6" />
          Карточки препаратов
        </h1>
        <p className="page-subtitle">
          Изображения одного препарата, подписи и указатели на структурах, архив вместо удаления.
          Признаки и структуры препарата остаются в методичке — её правит соседний раздел.
        </p>
      </header>
      <TrainerCardEditor />
    </main>
  );
}