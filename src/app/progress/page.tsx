"use client";

import { useEffect, useState } from "react";
import { getProgress } from "@/lib/api";
import { RadialProgress } from "@/components/ui/RadialProgress";
import { Award, BookOpen, Clock3, Loader2, Target, TrendingUp } from "lucide-react";

type SubjectProgress = { id: string; name: string; percent: number; semester?: number | null; control_type?: string | null; completed_topics_count?: number };
type WeakTopic = { id: string; title: string; percent: number; status?: string | null; last_activity_at?: string | null };
type Recent = { id?: string; object_type?: string; status?: string; percent?: number | null; last_activity_at?: string | null };

type ProgressPayload = {
  overall_pct?: number;
  subjects?: SubjectProgress[];
  weak_topics?: WeakTopic[];
  recent_activity?: Recent[];
  ledger?: { count?: number };
  homework?: { total: number; done: number; percent?: number; items?: unknown[] };
  tests?: { attempts: number; finished?: number; avg_score?: number | null; items?: unknown[] };
  note?: string;
};

const objectLabels: Record<string, string> = {
  subject: "Предмет", module: "Модуль", topic: "Тема", material: "Материал", question: "Вопрос",
  test: "Тест", ticket: "Билет", trainer: "Тренажёр", homework: "ДЗ",
};

function pct(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

export default function ProgressPage() {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getProgress();
        if (cancelled) return;
        if (res.ok) {
          setData(res.data as ProgressPayload);
          setError(null);
        } else {
          setError(res.error.message);
        }
      } catch {
        if (!cancelled) setError("Не удалось загрузить прогресс");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const overall = data?.overall_pct ?? 0;
  const subjects = data?.subjects ?? [];
  const weakTopics = data?.weak_topics ?? [];
  const recent = data?.recent_activity ?? [];
  const hw = data?.homework ?? { total: 0, done: 0, percent: 0 };
  const tests = data?.tests ?? { attempts: 0, finished: 0, avg_score: null };
  const hwPct = hw.percent ?? (hw.total ? Math.round((hw.done / hw.total) * 100) : 0);
  const testPct = tests.attempts ? Math.round(((tests.finished ?? 0) / tests.attempts) * 100) : 0;
  const avg = tests.avg_score != null ? Number(tests.avg_score) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Прогресс</h1>
        <p className="page-subtitle">Единый прогресс по предметам, темам, ДЗ, тестам, билетам и тренажёрам{data?.note ? ` · ${data.note}` : ""}</p>
      </header>

      {loading && <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Синхронизация прогресса…</div>}
      {error && <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "color-mix(in srgb,var(--danger) 25%,var(--border))", background: "color-mix(in srgb,var(--danger) 8%,var(--card))", color: "var(--danger)" }}>{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex items-center justify-center py-6"><RadialProgress value={overall} label="общий" /></div>
        <div className="card flex items-center justify-center py-6"><RadialProgress value={avg} label="тесты" /><div className="ml-4"><div className="text-sm font-semibold">Средний результат</div><div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>по завершённым попыткам</div></div></div>
        <div className="card flex items-center justify-center py-6"><RadialProgress value={hwPct} label="ДЗ" /><div className="ml-4"><div className="text-sm font-semibold">{hw.done} из {hw.total}</div><div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>заданий выполнено</div></div></div>
        <div className="card flex items-center justify-center py-6"><RadialProgress value={testPct} label="попытки" /><div className="ml-4"><div className="text-sm font-semibold">{tests.finished ?? 0} из {tests.attempts}</div><div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>тестов завершено</div></div></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold">Прогресс по предметам</h2><p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Берётся из user_subject_progress и единого ledger.</p></div><BookOpen className="h-5 w-5" style={{ color: "var(--primary)" }} /></div>
          {subjects.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Прогресс по предметам появится после первой активности.</div>
          ) : (
            <div className="space-y-4">
              {subjects.map((subject) => (
                <div key={subject.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{subject.name}</span><span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{pct(subject.percent)}%</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--primary-soft)" }}><div className="h-full rounded-full" style={{ width: `${pct(subject.percent)}%`, background: "linear-gradient(90deg,var(--primary),var(--accent))" }} /></div>
                  <div className="mt-1 flex gap-3 text-[11px]" style={{ color: "var(--muted)" }}><span>{subject.semester ? `Семестр ${subject.semester}` : ""}</span><span>{subject.completed_topics_count ?? 0} тем завершено</span>{subject.control_type ? <span>{subject.control_type}</span> : null}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold">Слабые темы</h2><p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Темы с самым низким текущим процентом.</p></div><Target className="h-5 w-5" style={{ color: "var(--accent)" }} /></div>
          {weakTopics.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>Недостаточно активности для рекомендаций.</div> : <div className="space-y-3">{weakTopics.map((topic) => <div key={topic.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "color-mix(in srgb,var(--card) 80%,var(--primary-soft))" }}><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{topic.title}</span><span className="text-xs font-bold" style={{ color: topic.percent < 50 ? "var(--danger)" : "var(--warning)" }}>{pct(topic.percent)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}><div className="h-full rounded-full" style={{ width: `${pct(topic.percent)}%`, background: topic.percent < 50 ? "var(--danger)" : "var(--warning)" }} /></div></div>)}</div>}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5" style={{ color: "var(--primary)" }} /><h2 className="text-lg font-bold">Активность</h2></div>
          {recent.length === 0 ? <p className="text-sm" style={{ color: "var(--muted)" }}>Активность пока не накоплена.</p> : <div className="space-y-2">{recent.slice(0, 8).map((item) => <div key={String(item.id)} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border)" }}><div className="flex min-w-0 items-center gap-2"><Clock3 className="h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} /><span className="truncate text-sm">{objectLabels[item.object_type || ""] || "Учебная активность"}</span></div><span className="shrink-0 text-xs font-semibold" style={{ color: "var(--primary)" }}>{item.percent != null ? `${pct(Number(item.percent))}%` : item.status || ""}</span></div>)}</div>}
        </section>

        <section className="card">
          <div className="mb-4 flex items-center gap-2"><Award className="h-5 w-5" style={{ color: "var(--accent)" }} /><h2 className="text-lg font-bold">Сводка</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><div className="text-xs" style={{ color: "var(--muted)" }}>Предметов</div><div className="mt-1 text-2xl font-extrabold">{subjects.length}</div></div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><div className="text-xs" style={{ color: "var(--muted)" }}>Ledger записей</div><div className="mt-1 text-2xl font-extrabold">{data?.ledger?.count ?? 0}</div></div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><div className="text-xs" style={{ color: "var(--muted)" }}>Выполнено ДЗ</div><div className="mt-1 text-2xl font-extrabold">{hw.done}/{hw.total}</div></div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><div className="text-xs" style={{ color: "var(--muted)" }}>Средний тест</div><div className="mt-1 text-2xl font-extrabold">{tests.avg_score != null ? `${tests.avg_score}%` : "—"}</div></div>
          </div>
        </section>
      </div>
    </div>
  );
}
