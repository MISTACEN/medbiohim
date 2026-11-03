"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Loader2 } from "lucide-react";
import { NextSessionCard, type PlanTimelineLinks } from "@/components/subjects/PlanTimeline";
import { normalizeStaticPlan, splitPlanSessions, type PlanSession } from "@/lib/subject-plan-next";
import { SUBJECT_STATIC_PLANS, fetchStaticPlan } from "@/lib/subject-plan-static";

type SubjectNext = {
  slug: string;
  subjectName: string;
  date: string;
  sessions: PlanSession[];
};

/**
 * Ближайшее занятие по всем предметам сразу — блок вверху /academic.
 * Данные берутся из статических планов кафедр (public/content), поэтому блок
 * не зависит от расписания пользователя: «ближайшее» считается по датам плана.
 */
export default function GlobalNextSession() {
  const [next, setNext] = useState<SubjectNext | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      try {
        const results = await Promise.all(
          Object.entries(SUBJECT_STATIC_PLANS).map(async ([slug, file]) => {
            const plan = normalizeStaticPlan(await fetchStaticPlan(file, controller.signal));
            return { slug, plan };
          })
        );
        if (!alive) return;
        // Для каждого предмета берём его ближайшее занятие, затем выбираем
        // самое раннее по дате среди всех предметов.
        const candidates: SubjectNext[] = results.flatMap(({ slug, plan }) => {
          const split = splitPlanSessions(plan.sessions);
          if (!split.next.length || !split.nextDate) return [];
          return [
            {
              slug,
              subjectName: plan.subject || slug,
              date: split.nextDate,
              sessions: split.next,
            },
          ];
        });
        candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        setNext(candidates[0] || null);
        setLoading(false);
      } catch {
        // Планы кафедр недоступны (например, отмена или сеть) — блок скрываем.
        if (!alive || controller.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="card flex items-center gap-2 p-5 text-sm" style={{ color: "var(--muted)" }}>
        <Loader2 className="size-4 animate-spin" /> Ищем ближайшее занятие по планам предметов…
      </div>
    );
  }
  if (failed) return null; // планы кафедр не загрузились — блок просто не показываем

  const links: PlanTimelineLinks | null = next ? { subjectHref: `/subjects/${encodeURIComponent(next.slug)}` } : null;

  return (
    <section aria-label="Ближайшее занятие по всем предметам" className="space-y-2">
      {next && links ? (
        <>
          <NextSessionCard sessions={next.sessions} date={next.date} links={links} subjectName={next.subjectName} />
          <div className="px-1">
            <Link
              href={`/subjects/${encodeURIComponent(next.slug)}?tab=plan`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
            >
              <CalendarDays className="h-4 w-4" /> Весь план предмета «{next.subjectName}» →
            </Link>
          </div>
        </>
      ) : (
        <div className="card p-4 text-sm" style={{ color: "var(--muted)" }}>
          Будущих занятий по планам предметов нет — семестр завершён или даты ещё не выставлены.
        </div>
      )}
    </section>
  );
}
