"use client";

/**
 * Лига недели (фаза 2.10): очки за учебные события (тесты, ДЗ, отработки,
 * SRS, лекции) за текущую неделю — анти-чит по построению, события пишет
 * только воркер. Показываем свою лигу, место в топе и ближайших соперников.
 */
import { useEffect, useState } from "react";
import { Award, Loader2, Trophy } from "lucide-react";
import { getLeague, type LeagueData } from "@/lib/features-api";
import { getWeeklyLeague, type WeeklyLeague as GroupLeague } from "@/lib/api/misc";
import { describeApiError } from "@/lib/errors";

const TIER_STYLES: Record<string, string> = {
  "Алмаз": "text-cyan-300 border-cyan-400/40 bg-cyan-400/10",
  "Платина": "text-slate-200 border-slate-300/40 bg-slate-300/10",
  "Золото": "text-yellow-300 border-yellow-400/40 bg-yellow-400/10",
  "Серебро": "text-zinc-200 border-zinc-300/40 bg-zinc-300/10",
  "Бронза": "text-orange-300 border-orange-400/40 bg-orange-400/10",
};

const KIND_LABELS: Record<string, string> = {
  test_finished: "тесты",
  assignment_updated: "отработки",
  homework_marked: "ДЗ",
  srs_review: "повторения",
  lecture_opened: "лекции",
  quest_chest: "квесты",
  tutor_message: "тьютор",
};

function tierStyle(name: string): string {
  return TIER_STYLES[name] || "text-white/80 border-white/30 bg-white/10";
}

export function LeagueCard() {
  const [data, setData] = useState<LeagueData | null>(null);
  const [group, setGroup] = useState<GroupLeague | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Оба источника — платформенный /league (топ с именами) и групповой
      // /study-prep/league (анонимное место в своей группе) — грузим параллельно;
      // группа не обязательна: её строка рисуется, только если есть группа.
      const [result, groupResult] = await Promise.all([getLeague(), getWeeklyLeague().catch(() => null)]);
      if (cancelled) return;
      setLoading(false);
      if (groupResult?.ok) setGroup(groupResult.data);
      if (!result.ok) {
        setError(describeApiError(result.error));
        return;
      }
      setData(result.data);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="card p-4">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-[var(--primary)]" /> Лига недели</h2>
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Считаем очки…</p>
      </section>
    );
  }

  // Лига недоступна — тихо не рисуем блок: он не обязан появляться в каждой вкладке.
  if (error || !data) return null;

  const { my, top, total } = data;
  const progress = my.next_league && my.points > 0
    ? Math.min(100, Math.round(((my.points / (my.points + my.next_league.remaining)) * 100)))
    : my.points > 0 ? 100 : 0;

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-[var(--primary)]" /> Лига недели</h2>
        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${tierStyle(my.league)}`}>{my.league}</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <div className="text-3xl font-extrabold leading-none">{my.points}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">очков за неделю{my.rank ? ` · ${my.rank} место из ${total}` : ""}</div>
        </div>
        {my.next_league ? (
          <div className="text-right text-xs text-[var(--muted)]">
            до лиги «{my.next_league.name}»<br />
            <b className="text-[var(--text)]">{my.next_league.remaining}</b> очков
          </div>
        ) : (
          <div className="text-right text-xs font-semibold text-[var(--status-ok-fg)]">максимальная лига</div>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--primary)] transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Групповое место (свой источник, без имён) — строкой внутри карточки,
          чтобы на /study не было двух «Лиг недели» с разными очками. */}
      {group?.available && (group.members ?? 0) > 1 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          В своей группе: <b className="text-[var(--text)]">{group.rank}-е из {group.members}</b> · {group.points} XP за 7 дней
        </p>
      ) : null}

      {top.length ? (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--muted)]"><Award className="h-3.5 w-3.5" /> Топ недели</p>
          <ul className="space-y-1">
            {top.map((row) => (
              <li key={row.rank} className={"flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm " + (row.is_me ? "bg-[var(--primary-soft)] font-bold" : "")}>
                <span className="min-w-0 truncate">
                  <span className="mr-2 inline-block w-5 text-right text-xs text-[var(--muted)]">{row.rank}</span>
                  {row.name}{row.is_me ? " — это ты" : ""}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[var(--muted)]">{row.points}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Очки начисляются за тесты (+10), отработки (+8), ДЗ (+5), повторения и лекции (+2), тьютора (+1) — начни сегодня и займи место в топе.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">Как начисляются очки</summary>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
          {Object.entries(my.breakdown || {}).map(([kind, points]) => (
            <span key={kind}>{KIND_LABELS[kind] || kind}: <b className="text-[var(--text)]">+{points}</b></span>
          ))}
        </p>
        <p className="mt-1.5 text-xs text-[var(--muted)]">Окно — календарная неделя с понедельника; очки считает сервер по событиям ленты, подделать их из браузера нельзя.</p>
      </details>
    </section>
  );
}
