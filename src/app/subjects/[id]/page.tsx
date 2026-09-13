import Link from "next/link";
import { subjects } from "@/lib/mock-data";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const subject = subjects.find((s) => s.id === id) || subjects[0];

  return (
    <div className="space-y-6">
      <Link href="/subjects" className="text-sm text-primary hover:underline">
        ← К предметам
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">{subject.name}</h1>
      <p className="text-gray-500">
        Курс {subject.course} · Семестр {subject.semester} ·{" "}
        {subject.controlType === "exam" ? "Экзамен" : "Зачёт"}
      </p>
      <div className="card p-8 text-center text-gray-500">
        Модули и материалы предмета будут загружены из Supabase.
      </div>
    </div>
  );
}
