import Link from "next/link";
import {
  Calendar,
  BookOpen,
  ClipboardList,
  Clock,
  MapPin,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import {
  currentUser,
  todaySchedule,
  homeworks,
  announcements,
  stats,
} from "@/lib/mock-data";

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
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}
    >
      {labels[status] || status}
    </span>
  );
}

export default function DashboardPage() {
  const nearest = todaySchedule[0];
  const nextHw = homeworks.find(
    (h) => h.status === "pending" || h.status === "overdue"
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Добро пожаловать, {currentUser.name}!
        </h1>
        <p className="mt-1 text-gray-500">
          Удачного дня и продуктивной учёбы!
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          Сейчас важно
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <Calendar className="h-4 w-4" />
              Ближайшее занятие
            </div>
            {nearest ? (
              <>
                <div className="text-lg font-semibold">{nearest.subject}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {nearest.startTime}–{nearest.endTime}
                  </span>
                  {nearest.isNonStandard && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                      нестандартное время
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-gray-500">Суббота</div>
                <Link
                  href="/schedule"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Открыть день <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="text-gray-500">Нет занятий</p>
            )}
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <BookOpen className="h-4 w-4" />
              Контроль
            </div>
            <div className="text-lg font-semibold">
              Экзамен: Гистология, цитология
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Подготовьтесь к итоговому контролю
            </p>
            <Link
              href="/tests"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Подготовка <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <ClipboardList className="h-4 w-4" />
              Домашнее задание
            </div>
            {nextHw ? (
              <>
                <div className="text-lg font-semibold leading-snug">
                  {nextHw.title}
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  до {nextHw.dueAt}
                </div>
                <StatusBadge status={nextHw.status} />
                <Link
                  href="/homework"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Все задания <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="text-gray-500">Нет активных заданий</p>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
            <Calendar className="h-4 w-4 text-primary" />
            Расписание на сегодня
          </h3>
          <ul className="space-y-3">
            {todaySchedule.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-gray-100 bg-gray-50/80 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-900">
                      {entry.subject}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {entry.type}
                      {entry.topic ? ` · ${entry.topic}` : ""}
                    </div>
                  </div>
                  {entry.isNonStandard && (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {entry.startTime}–{entry.endTime}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {entry.room}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/schedule"
            className="mt-4 block text-center text-sm font-medium text-primary hover:underline"
          >
            Полное расписание →
          </Link>
        </section>

        <section className="card p-5">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
            <ClipboardList className="h-4 w-4 text-primary" />
            Домашние задания
          </h3>
          <ul className="space-y-3">
            {homeworks.map((hw) => (
              <li
                key={hw.id}
                className="rounded-lg border border-gray-100 bg-gray-50/80 p-3"
              >
                <div className="font-medium text-gray-900 leading-snug">
                  {hw.title}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{hw.subject}</span>
                  <span>·</span>
                  <span>до {hw.dueAt}</span>
                </div>
                <div className="mt-2">
                  <StatusBadge status={hw.status} />
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/homework"
            className="mt-4 block text-center text-sm font-medium text-primary hover:underline"
          >
            Все задания →
          </Link>
        </section>

        <section className="card p-5">
          <h3 className="mb-4 font-semibold text-gray-800">Объявления</h3>
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li
                key={a.id}
                className="rounded-lg border border-gray-100 bg-gray-50/80 p-3"
              >
                <div className="font-medium text-gray-900">{a.title}</div>
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                  {a.body}
                </p>
                <div className="mt-1 text-xs text-gray-400">{a.createdAt}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card p-5">
        <h3 className="mb-4 font-semibold text-gray-800">
          В цифрах (демо)
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-primary/5 p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.disciplines}
            </div>
            <div className="text-sm text-gray-600">дисциплин</div>
          </div>
          <div className="rounded-lg bg-primary/5 p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.questions}+
            </div>
            <div className="text-sm text-gray-600">вопросов</div>
          </div>
          <div className="rounded-lg bg-primary/5 p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.labs}</div>
            <div className="text-sm text-gray-600">лабораторных</div>
          </div>
          <div className="rounded-lg bg-primary/5 p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.semesters}
            </div>
            <div className="text-sm text-gray-600">семестров</div>
          </div>
        </div>
      </section>
    </div>
  );
}
