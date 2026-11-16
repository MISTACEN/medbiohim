"use client";

/**
 * «Лига недели» (фаза 2.10): место среди своей группы по очкам активности
 * за 7 дней. Очки считает сервер из activity_events, имена не отдаются —
 * карточка показывает только свои очки, место и отставание от следующего.
 * Нет группы или в группе один человек — блок честно молчит.
 */
import { useEffect, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { getWeeklyLeague, type WeeklyLeague as League } from "@/lib/api/misc";

export function WeeklyLeague() {
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await getWeeklyLeague();
      if (cancelled) return;
      setLeague(response.ok ? response.data : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Лига недели…
      </div>
    );
  }
  if (!league?.available) return null;

  const points = league.points ?? 0;
  const rank = league.rank ?? 0;
  const members = league.members ?? 0;
  const gap = league.next_gap;
  const hint =
    gap === null
      ? "Вы первые в группе — удерживайте темп."
      : `До следующего места ${gap} XP${rank > 1 ? "" : ""}.`;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)]">
          <Trophy className="h-5 w-5 text-[var(--primary)]" />
        </span>
        <div className="min-w-0">
          <div className="font-bold">Лига недели</div>
          <div className="mt-0.5 text-sm text-[var(--muted)]">
            {rank}-е место из {members} · {points} XP за 7 дней
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-[var(--primary)]"
          style={{ width: `${Math.min(100, members > 1 ? ((members - rank + 1) / members) * 100 : 100)}%` }}
        />
      </div>
      <div className="mt-2 text-xs text-[var(--muted)]">{hint}</div>
    </div>
  );
}
