import { ClipboardList, Calendar } from "lucide-react";
import { homeworks } from "@/lib/mock-data";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    overdue: "bg-danger/15 text-danger",
    submitted: "bg-primary/15 text-primary",
    graded: "bg-success/15 text-success",
  };
  const labels: Record<string, string> = {
    pending: "К выполнению",
    overdue: "Просрочено",
    submitted: "Сдано",
    graded: "Оценено",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100"}`}
    >
      {labels[status] || status}
    </span>
  );
}

export default function HomeworkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Задания</h1>
        <p className="mt-1 text-gray-500">
          Домашние задания вашей группы
        </p>
      </div>

      <div className="grid gap-4">
        {homeworks.map((hw) => (
          <article key={hw.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm text-primary">
                  <ClipboardList className="h-4 w-4" />
                  {hw.subject}
                </div>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  {hw.title}
                </h2>
                <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar className="h-4 w-4" />
                  Срок: {hw.dueAt}
                </div>
              </div>
              <StatusBadge status={hw.status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-primary text-sm">
                Открыть
              </button>
              <button type="button" className="btn-secondary text-sm">
                Скачать материалы
              </button>
            </div>
          </article>
        ))}
      </div>

      {homeworks.length === 0 && (
        <div className="card p-12 text-center text-gray-500">
          В этом разделе пока нет заданий.
        </div>
      )}
    </div>
  );
}
