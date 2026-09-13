"use client";

import { progressData, homeworks, stats } from "@/lib/mock-data";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { Sparkline } from "@/components/ui/Sparkline";
import { Award } from "lucide-react";

export default function ProgressPage() {
  const totalTestsDone = progressData.reduce((s, p) => s + p.testsDone, 0);
  const totalTests = progressData.reduce((s, p) => s + p.testsTotal, 0) || 1;
  const totalHwDone = progressData.reduce((s, p) => s + p.homeworkDone, 0);
  const totalHw = progressData.reduce((s, p) => s + p.homeworkTotal, 0) || 1;
  const avgScore =
    progressData.filter((p) => p.avgScore > 0).length > 0
      ? Math.round(
          progressData
            .filter((p) => p.avgScore > 0)
            .reduce((s, p) => s + p.avgScore, 0) /
            progressData.filter((p) => p.avgScore > 0).length
        )
      : 0;

  const chartData = progressData.map((p) => p.avgScore || 40 + (p.testsDone * 12) % 50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Прогресс</h1>
        <p className="page-subtitle">Тесты, домашние задания и средний балл</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex flex-col items-center justify-center py-6">
          <RadialProgress value={avgScore} label="средний" />
        </div>
        <div className="card flex flex-col items-center justify-center py-6">
          <RadialProgress value={(totalTestsDone / totalTests) * 100} label="тесты" color="#10B981" />
          <p className="mt-2 text-xs text-slate-500">{totalTestsDone}/{totalTests}</p>
        </div>
        <div className="card flex flex-col items-center justify-center py-6">
          <RadialProgress value={(totalHwDone / totalHw) * 100} label="ДЗ" color="#8B5CF6" />
          <p className="mt-2 text-xs text-slate-500">{totalHwDone}/{totalHw}</p>
        </div>
        <div className="card flex flex-col items-center justify-center gap-2 py-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Award className="h-7 w-7" />
          </div>
          <div className="text-2xl font-bold">{stats.disciplines}</div>
          <div className="text-xs text-slate-500">дисциплин</div>
        </div>
      </div>

      <section className="card">
        <h2 className="mb-2 font-semibold">Динамика баллов</h2>
        <p className="mb-4 text-xs text-slate-500">По предметам (средний балл)</p>
        <Sparkline data={chartData.length ? chartData : [55, 62, 70, 68, 75, 80]} height={140} />
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">По предметам</h2>
        <ul className="space-y-4">
          {progressData.map((p) => {
            const testPct = p.testsTotal ? Math.round((p.testsDone / p.testsTotal) * 100) : 0;
            const hwPct = p.homeworkTotal ? Math.round((p.homeworkDone / p.homeworkTotal) * 100) : 0;
            return (
              <li key={p.subject} className="rounded-soft border border-slate-100 bg-slate-50/50 p-4 dark:border-white/5 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-semibold">{p.subject}</div>
                  <div className="flex items-center gap-4">
                    <RadialProgress value={testPct} size={56} stroke={5} label="тест" />
                    <RadialProgress value={hwPct} size={56} stroke={5} label="ДЗ" color="#8B5CF6" />
                    <div className="text-center">
                      <div className="text-lg font-bold text-primary">{p.avgScore || "—"}</div>
                      <div className="text-[10px] text-slate-500">балл</div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Достижения</h2>
        <div className="flex flex-wrap gap-3">
          {["Первый тест", "5 ДЗ сдано", "Средний 70+", "Неделя без просрочек"].map((badge, i) => (
            <div key={badge} className="flex items-center gap-2 rounded-soft border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm font-medium text-indigo-800 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
              <span className="text-lg">{["🏅", "⭐", "🎯", "🔥"][i]}</span>
              {badge}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
