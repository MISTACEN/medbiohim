import { progressData, homeworks, stats } from "@/lib/mock-data";
import { TrendingUp, CheckCircle2, Clock } from "lucide-react";

export default function ProgressPage() {
  const totalTestsDone = progressData.reduce((s, p) => s + p.testsDone, 0);
  const totalTests = progressData.reduce((s, p) => s + p.testsTotal, 0);
  const totalHwDone = progressData.reduce((s, p) => s + p.homeworkDone, 0);
  const totalHw = progressData.reduce((s, p) => s + p.homeworkTotal, 0);
  const scored = progressData.filter((p) => p.avgScore > 0);
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, p) => s + p.avgScore, 0) / scored.length)
    : 0;
  const graded = homeworks.filter((h) => h.status === "graded");
  const pending = homeworks.filter((h) => h.status === "pending" || h.status === "overdue");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Прогресс</h1>
        <p className="mt-1 text-gray-500">Тесты, ДЗ и средний балл</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-sm text-gray-500"><TrendingUp className="h-4 w-4 text-primary" /> Средний балл</div>
          <div className="mt-2 text-3xl font-bold text-primary">{avgScore}%</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-gray-500">Тесты</div>
          <div className="mt-2 text-3xl font-bold">{totalTestsDone}/{totalTests}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-gray-500">Домашние задания</div>
          <div className="mt-2 text-3xl font-bold">{totalHwDone}/{totalHw}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-gray-500">Дисциплин</div>
          <div className="mt-2 text-3xl font-bold">{stats.disciplines}</div>
        </div>
      </div>
      <section className="card p-5">
        <h2 className="mb-4 font-semibold">По предметам</h2>
        <ul className="space-y-4">
          {progressData.map((p) => {
            const testPct = p.testsTotal ? Math.round((p.testsDone / p.testsTotal) * 100) : 0;
            const hwPct = p.homeworkTotal ? Math.round((p.homeworkDone / p.homeworkTotal) * 100) : 0;
            return (
              <li key={p.subject} className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{p.subject}</span>
                  {p.avgScore > 0 && <span className="text-sm font-medium text-primary">ср. {p.avgScore}%</span>}
                </div>
                <div className="mt-3 space-y-2">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-gray-500"><span>Тесты {p.testsDone}/{p.testsTotal}</span><span>{testPct}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-primary" style={{ width: `${testPct}%` }} /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-gray-500"><span>ДЗ {p.homeworkDone}/{p.homeworkTotal}</span><span>{hwPct}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-success" style={{ width: `${hwPct}%` }} /></div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-success" /> Оценённые</h2>
          <ul className="space-y-2">
            {graded.map((h) => (
              <li key={h.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div className="font-medium">{h.title}</div>
                <div className="text-gray-500">{h.subject} · оценка {h.grade}{h.feedback ? ` · ${h.feedback}` : ""}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-warning" /> К выполнению</h2>
          <ul className="space-y-2">
            {pending.map((h) => (
              <li key={h.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <div className="font-medium">{h.title}</div>
                <div className="text-gray-500">{h.subject} · до {h.dueAt}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
