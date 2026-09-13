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
    pending: "badge-warning",
    overdue: "badge-danger",
    submitted: "badge-primary",
    graded: "badge-success",
  };
  const labels: Record<string, string> = {
    pending: "К выполнению",
    overdue: "Просрочено",
    submitted: "Сдано",
    graded: "Оценено",
  };
  return (
    <span className={styles[status] || "rounded-pill bg-slate-100 px-2 py-0.5 text-xs text-slate-600"}>
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
      <section className="hero-banner">
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
            Сегодня
          </p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Привет, {currentUser.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-2 text-body text-slate-600">
            Расписание, задания и прогресс — в одном спокойном пространстве.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/schedule" className="btn-primary">
              Открыть расписание
            </Link>
            <Link href="/homework" className="btn-secondary">
              Задания
            </Link>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full bg-indigo-300/30 blur-3xl sm:h-56 sm:w-56"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 right-10 h-32 w-32 rounded-full bg-violet-300/25 blur-3xl"
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Сейчас важно</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <Calendar className="h-4 w-4" />
              Ближайшее занятие
            </div>
            {nearest ? (
              <>
                <div className="text-lg font-semibold">{nearest.subject}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {nearest.startTime}–{nearest.endTime}
                  </span>
                  {nearest.isNonStandard && (
                    <span className="badge-warning">нестандартное время</span>
                  )}
                </div>
                <Link href="/schedule" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Открыть день <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="text-slate-500">Нет занятий</p>
            )}
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <BookOpen className="h-4 w-4" />
              Контроль
            </div>
            <div className="text-lg font-semibold">Экзамен: Гистология, цитология</div>
            <p className="mt-1 text-sm text-slate-500">Подготовьтесь к итоговому контролю</p>
            <Link href="/tests" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Подготовка <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
              <ClipboardList className="h-4 w-4" />
              Домашнее задание
            </div>
            {nextHw ? (
              <>
                <div className="text-lg font-semibold leading-snug">{nextHw.title}</div>
                <div className="mt-1 text-sm text-slate-500">до {nextHw.dueAt}</div>
                <div className="mt-2"><StatusBadge status={nextHw.status} /></div>
                <Link href="/homework" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  Все задания <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="text-slate-500">Нет активных заданий</p>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <Calendar className="h-4 w-4 text-primary" />
            Расписание на сегодня
          </h3>
          <ul className="space-y-3">
            {todaySchedule.map((entry) => (
              <li key={entry.id} className="rounded-soft border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{entry.subject}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {entry.type}{entry.topic ? ` · ${entry.topic}` : ""}
                    </div>
                  </div>
                  {entry.isNonStandard && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{entry.startTime}–{entry.endTime}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.room}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/schedule" className="mt-4 block text-center text-sm font-medium text-primary hover:underline">
            Полное расписание →
          </Link>
        </section>

        <section className="card">
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
            <ClipboardList className="h-4 w-4 text-primary" />
            Домашние задания
          </h3>
          <ul className="space-y-3">
            {homeworks.map((hw) => (
              <li key={hw.id} className="rounded-soft border border-slate-100 bg-slate-50/80 p-3">
                <div className="font-medium leading-snug">{hw.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{hw.subject}</span><span>·</span><span>до {hw.dueAt}</span>
                </div>
                <div className="mt-2"><StatusBadge status={hw.status} /></div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3 className="mb-4 font-semibold text-slate-800">Объявления</h3>
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-soft border border-slate-100 bg-slate-50/80 p-3">
                <div className="font-medium">{a.title}</div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.body}</p>
                <div className="mt-1 text-xs text-slate-400">{a.createdAt}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h3 className="mb-4 font-semibold text-slate-800">В цифрах (демо)</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            [stats.disciplines, "дисциплин"],
            [String(stats.questions) + "+", "вопросов"],
            [stats.labs, "лабораторных"],
            [stats.semesters, "семестров"],
          ].map(([v, l]) => (
            <div key={String(l)} className="rounded-soft bg-primary-soft p-4 text-center">
              <div className="text-2xl font-bold text-primary">{v}</div>
              <div className="text-sm text-slate-600">{l}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
