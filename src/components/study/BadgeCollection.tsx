"use client";

/**
 * «Значки» — коллекция достижений. Все пороги считает сервер из activity_events,
 * поэтому значок нельзя получить кликом в консоли и нельзя потерять при смене
 * браузера. Не полученные значки видны с прогрессом — это цель, а не упрёк.
 */
import { useEffect, useState } from "react";
import { Award, Loader2 } from "lucide-react";
import { getAchievements, type Badge } from "@/lib/api/misc";

export function BadgeCollection() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await getAchievements();
      if (cancelled) return;
      if (response.ok) {
        setBadges(Array.isArray(response.data?.badges) ? response.data.badges : []);
        setEarned(Number(response.data?.earned || 0));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Значки…
      </div>
    );
  }
  if (!badges.length) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary-soft)]">
            <Award className="h-4.5 w-4.5 text-[var(--primary)]" />
          </span>
          Значки
        </div>
        <span className="text-xs text-[var(--muted)]">
          {earned} из {badges.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {badges.map((badge) => (
          <div
            key={badge.id}
            title={badge.earned ? badge.title : `${badge.title} · ${badge.value} из ${badge.goal}`}
            className={
              "rounded-xl border px-2 py-2 text-center " +
              (badge.earned
                ? "border-[var(--primary)]/40 bg-[var(--primary-soft)]"
                : "border-[var(--border)] opacity-70")
            }
          >
            <div className={"text-base " + (badge.earned ? "" : "grayscale")} aria-hidden>
              {badge.earned ? "🏅" : "🔒"}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-tight">{badge.title}</div>
            <div className="text-[10px] text-[var(--muted)]">
              {badge.earned ? "получен" : `${badge.value}/${badge.goal}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
