"use client";

/**
 * «Серия дней» (фаза геймификации): текущая серия, лучшая серия и карта
 * активности за 16 недель. Считается на сервере из activity_events, поэтому
 * не требует отдельной таблицы и не расходится с лентой «Недавно».
 * Без наказаний: пропущенный день просто светлый, серия не «сгорает».
 */
import { useEffect, useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { getStudyStreak, type StudyStreak } from "@/lib/api/misc";

const LEVELS = [
  "bg-[var(--border)]",
  "bg-[var(--primary)]/25",
  "bg-[var(--primary)]/45",
  "bg-[var(--primary)]/70",
  "bg-[var(--primary)]",
];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

function plural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

export function StreakHeatmap() {
  const [data, setData] = useState<StudyStreak | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await getStudyStreak();
      if (cancelled) return;
      setData(response.ok ? response.data : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Серия дней…
      </div>
    );
  }
  if (!data) return null;

  const current = Number(data.current_streak || 0);
  // Дни идут подряд, по 7 в столбце — недели слева направо.
  const weeks: Array<Array<{ date: string; count: number }>> = [];
  for (let i = 0; i < data.days.length; i += 7) weeks.push(data.days.slice(i, i + 7));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary-soft)]">
            <Flame className="h-4.5 w-4.5 text-[var(--primary)]" />
          </span>
          <div>
            <div className="font-bold">Серия дней</div>
            <div className="text-xs text-[var(--muted)]">
              {current > 0 ? `${current} ${plural(current)} подряд` : "начните сегодня"} · лучшая {data.longest_streak}
            </div>
          </div>
        </div>
        <span className="text-xs text-[var(--muted)]">{data.active_days} активных</span>
      </div>

      <div className="mt-3 flex gap-[3px] overflow-x-auto pb-1" aria-label="Карта активности за 16 недель">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <span
                key={day.date}
                title={`${day.date.split("-").reverse().join(".")} · ${day.count} событий`}
                className={`h-3 w-3 rounded-[3px] ${LEVELS[level(day.count)]}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-[var(--muted)]">
        меньше
        {LEVELS.map((cls, index) => (
          <span key={index} className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
        ))}
        больше
      </div>
    </div>
  );
}
