"use client";

/**
 * «Цели дня» — три конкретных дела на сегодня вместо абстрактного «позанимайся»:
 * повторение карточек, один тест и разбор лекции. Факт берётся из событий за
 * сегодня и очереди SRS на сервере, поэтому галочки честные и обновляются сами.
 * Без штрафов и таймеров: цель не сделана — просто осталась открытой.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Gift, Loader2, Target } from "lucide-react";
import { claimDailyChest, getDailyQuests, type DailyChest, type DailyQuest } from "@/lib/api/misc";
import { describeApiError } from "@/lib/errors";

export function DailyQuests() {
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [done, setDone] = useState(0);
  const [chest, setChest] = useState<DailyChest | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [chestError, setChestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function claimChest() {
    if (claiming) return;
    setClaiming(true);
    setChestError(null);
    const response = await claimDailyChest();
    setClaiming(false);
    if (!response.ok) {
      setChestError(describeApiError(response.error));
      return;
    }
    setChest({
      bonus: Number(response.data?.bonus || 0),
      unlocked: true,
      claimed: true,
      available: false,
    });
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await getDailyQuests();
      if (cancelled) return;
      if (response.ok) {
        setQuests(Array.isArray(response.data?.quests) ? response.data.quests : []);
        setDone(Number(response.data?.done || 0));
        setChest(response.data?.chest ?? null);
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
        <Loader2 className="h-4 w-4 animate-spin" /> Цели дня…
      </div>
    );
  }
  if (!quests.length) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary-soft)]">
            <Target className="h-4.5 w-4.5 text-[var(--primary)]" />
          </span>
          Цели дня
        </div>
        <span className="text-xs text-[var(--muted)]">
          {done} из {quests.length}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {quests.map((quest) => (
          <li key={quest.id}>
            <Link
              href={quest.href}
              className="flex items-start gap-2 rounded-xl border border-[var(--border)] px-2.5 py-2 transition hover:border-[var(--primary)]/50"
            >
              <span
                className={
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
                  (quest.done
                    ? "border-[var(--status-ok-fg)] bg-[var(--status-ok-fg)] text-white"
                    : "border-[var(--border)]")
                }
                aria-hidden
              >
                {quest.done ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="min-w-0">
                <span className={"block text-sm font-semibold " + (quest.done ? "line-through opacity-60" : "")}>
                  {quest.title}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {quest.goal > 1 ? `${Math.min(quest.progress, quest.goal)} из ${quest.goal} · ` : ""}
                  {quest.hint}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {chest && chest.unlocked ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary-soft)]/40 px-2.5 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <Gift className="h-4 w-4 text-[var(--primary)]" />
            {chest.claimed ? `Сундук открыт: +${chest.bonus} XP` : `Все цели закрыты — сундук +${chest.bonus} XP`}
          </span>
          {chest.available ? (
            <button
              type="button"
              className="btn btn-primary h-8 px-3 text-xs"
              disabled={claiming}
              onClick={() => void claimChest()}
            >
              {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Забрать
            </button>
          ) : null}
        </div>
      ) : null}
      {chestError ? <p className="mt-2 text-xs text-[var(--status-warn-fg)]">{chestError}</p> : null}
    </div>
  );
}
