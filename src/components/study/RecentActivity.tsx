"use client";

/**
 * «Недавно» — лента учебных событий студента (Фаза 5 дорожной карты).
 *
 * События пишет сервер (тест завершён, лекция открыта, вопрос тьютору, повторение
 * карточки, отметка ДЗ, отработка), клиент только читает свои строки. Пока
 * миграция activity_events не применена, блок честно молчит, а не показывает
 * пустую выдумку.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Brain,
  ClipboardCheck,
  HelpCircle,
  History,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import { getRecentActivity, type ActivityEvent } from "@/lib/api/misc";

const META: Record<string, { icon: typeof BookOpen; title: string; href: string }> = {
  test_finished: { icon: ClipboardCheck, title: "Тест завершён", href: "/tests" },
  lecture_opened: { icon: BookOpen, title: "Открыта лекция", href: "/lectures" },
  tutor_message: { icon: Sparkles, title: "Вопрос тьютору", href: "/tutor" },
  srs_review: { icon: Layers, title: "Повторение карточки", href: "/cards" },
  homework_marked: { icon: Brain, title: "Отметка по ДЗ", href: "/homework" },
  assignment_updated: { icon: HelpCircle, title: "Отработка обновлена", href: "/study#assignments" },
};

/** Относительное время без зависимостей: минуты → часы → дни. */
export function relativeTime(iso: string, now = Date.now()): string {
  const at = Date.parse(String(iso || ""));
  if (!Number.isFinite(at)) return "";
  const diff = Math.max(0, now - at);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return days === 1 ? "вчера" : `${days} дн назад`;
}

function detail(event: ActivityEvent): string {
  const payload = event.payload || {};
  if (event.kind === "test_finished") {
    const percent = payload.percent;
    if (typeof percent === "number") return `${Math.round(percent)}%`;
    const score = payload.score;
    const max = payload.max_score;
    if (typeof score === "number") return `${score} из ${typeof max === "number" ? max : "?"}`;
  }
  if (event.kind === "srs_review") {
    const rating = payload.rating;
    if (typeof rating === "number") return `оценка ${rating} из 4`;
  }
  if (event.kind === "tutor_message" && typeof payload.mode === "string") {
    return payload.mode === "fast" ? "быстрый режим" : "точный режим";
  }
  if (event.kind === "assignment_updated" && typeof payload.status === "string") {
    return payload.status;
  }
  return event.subject_slug ? String(event.subject_slug) : "";
}

export function RecentActivity() {
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRecentActivity(10).then((result) => {
      if (cancelled) return;
      if (result.ok) setItems(result.data.items || []);
      else setUnavailable(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="card p-4">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <History className="h-4 w-4 text-[var(--primary)]" /> Недавно
        </h2>
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Собираем события…
        </p>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="card p-4">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <History className="h-4 w-4 text-[var(--primary)]" /> Недавно
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {unavailable
            ? "Лента появится после применения миграции activity_events."
            : "Пока пусто: пройдите тест, откройте лекцию или спросите тьютора — события появятся здесь."}
        </p>
      </section>
    );
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <History className="h-4 w-4 text-[var(--primary)]" /> Недавно
        </h2>
        <span className="text-xs text-[var(--muted)]">последние действия — вход для рекомендаций</span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {items.map((event) => {
          const meta = META[event.kind] || { icon: History, title: event.kind, href: "/study" };
          const Icon = meta.icon;
          const extra = detail(event);
          return (
            <li key={event.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-[var(--primary)]" />
              <Link href={meta.href} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {meta.title}
              </Link>
              {extra ? <span className="shrink-0 text-xs text-[var(--muted)]">{extra}</span> : null}
              <time className="shrink-0 text-xs text-[var(--muted)]" dateTime={event.created_at}>
                {relativeTime(event.created_at)}
              </time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
