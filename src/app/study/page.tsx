"use client";

/**
 * «Учёба» — центральный учебный хаб.
 *
 * Раскладка (по референсам Stitch, тема Clinical Precision): сверху компактная
 * сводка с цифрами и полосками прогресса, дальше две колонки — слева то, что
 * делаем сегодня (ИИ-план дня, лента «Ближайшее», план подготовки), справа
 * вспомогательное (слабые места, карточки, недавнее). Ниже — тяжёлые разделы
 * академического состояния, прогресса и отработок; к ним ведут якоря в шапке,
 * чтобы страница не читалась одной сплошной простынёй.
 *
 * Смысловые блоки страницы:
 *  1. сводка — прогресс, ДЗ, тесты, долги, дни до КР;
 *  2. план на сегодня — ИИ-план (context_scope=study) с фолбэком по срокам;
 *  3. лента «Ближайшее» — аттестации, ДЗ, отработки одним таймлайном
 *     (общий buildAgenda с /schedule), у аттестаций — ИИ-чеклист и план;
 *  4. слабые места и очередь карточек SRS;
 *  5. ИИ-ассистент с учебным контекстом;
 *  6. подробные разделы: план, прогресс, отработки, подготовка к КР.
 *
 * Старые адреса /academic, /assignments и /progress ведут сюда якорями.
 *
 * Состояние — в useStudyHub, сводка в шапке — в StudySummaryHeader,
 * остальные блоки — готовые компоненты раздела study.
 */
import Link from "next/link";
import { FileText } from "lucide-react";

import { AcademicSection } from "@/components/learning/AcademicSection";
import { AssignmentsSection } from "@/components/learning/AssignmentsSection";
import { ProgressSection } from "@/components/learning/ProgressSection";
import { StudySection } from "@/components/learning/StudySection";
import { AgendaTimeline } from "@/components/study/AgendaTimeline";
import { PrepChecklist } from "@/components/study/PrepChecklist";
import { PrepPlan } from "@/components/study/PrepPlan";
import { RecentActivity } from "@/components/study/RecentActivity";
import { StreakHeatmap } from "@/components/study/StreakHeatmap";
import { DailyQuests } from "@/components/study/DailyQuests";
import { DailyCard } from "@/components/study/DailyCard";
import { PresenceBadge } from "@/components/study/PresenceBadge";
import { BadgeCollection } from "@/components/study/BadgeCollection";
import ExamAgent from "@/components/study/ExamAgent";
import { SrsDueCard } from "@/components/study/SrsDueCard";
import { LeagueCard } from "@/components/study/LeagueCard";
import { StudyAssistant } from "@/components/study/StudyAssistant";
import { TodayPlan } from "@/components/study/TodayPlan";
import { WeakTopics } from "@/components/study/WeakTopics";
import { useStudyHub } from "@/components/study/useStudyHub";
import { StudySummaryHeader } from "@/components/study/StudySummaryHeader";

export default function StudyPage() {
  const hub = useStudyHub();

  return (
    <div className="mx-auto max-w-[1320px] space-y-5">
      <StudySummaryHeader hub={hub} />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="space-y-5 lg:col-span-2">
          <section id="today" className="scroll-mt-24">
            <TodayPlan agenda={hub.agenda} />
          </section>
          <section id="timeline" className="scroll-mt-24">
            <AgendaTimeline agenda={hub.agenda} loading={hub.agendaLoading} onPrep={hub.setPrepTarget} onPlan={hub.setPlanTarget} />
          </section>
        </div>

        <aside className="space-y-5">
          <div><PresenceBadge /></div>
          <WeakTopics academic={hub.academic} />
          <SrsDueCard />
          <LeagueCard />
          <RecentActivity />
          <StreakHeatmap />
          <DailyCard />
          <DailyQuests />
          <BadgeCollection />
        </aside>
      </div>

      <section id="prep" className="scroll-mt-24">
        <StudySection />
      </section>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <ExamAgent />
        <StudyAssistant />
      </div>

      <section id="import" className="scroll-mt-24">
        <Link
          href="/study/import"
          className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition hover:border-[var(--primary)]/50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-soft)]">
            <FileText className="h-5 w-5 text-[var(--primary)]" />
          </span>
          <span className="min-w-0">
            <span className="block font-bold">Конспект из файла</span>
            <span className="mt-0.5 block text-sm text-[var(--muted)]">Фото лекции, PDF или txt — ИИ соберёт конспект и сохранит в личные лекции</span>
          </span>
        </Link>
      </section>

      <section id="plan" className="scroll-mt-24">
        <AcademicSection />
      </section>

      <section id="progress" className="scroll-mt-24">
        <ProgressSection />
      </section>

      <section id="assignments" className="scroll-mt-24">
        <AssignmentsSection />
      </section>

      {hub.prepTarget ? <PrepChecklist item={hub.prepTarget} onClose={() => hub.setPrepTarget(null)} /> : null}
      {hub.planTarget ? <PrepPlan item={hub.planTarget} onClose={() => hub.setPlanTarget(null)} /> : null}
    </div>
  );
}
