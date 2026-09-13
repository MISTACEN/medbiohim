import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { subjects } from "@/lib/mock-data";

export default function SubjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Предметы</h1>
        <p className="mt-1 text-gray-500">Дисциплины вашего курса</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((s) => (
          <Link
            key={s.id}
            href={`/subjects/${s.id}`}
            className="card block p-5 hover:border-primary/30"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-semibold text-gray-900">{s.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="rounded bg-gray-100 px-2 py-0.5">
                Курс {s.course}
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5">
                Семестр {s.semester}
              </span>
              <span
                className={`rounded px-2 py-0.5 font-medium ${
                  s.controlType === "exam"
                    ? "bg-danger/10 text-danger"
                    : "bg-success/10 text-success"
                }`}
              >
                {s.controlType === "exam" ? "Экзамен" : "Зачёт"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1 text-sm font-medium text-primary">
              Открыть <ChevronRight className="h-4 w-4" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
