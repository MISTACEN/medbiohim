"use client";

/** Вкладки «План», «Экзамен / Билеты», «Тесты», «База вопросов», «Лекции», «Материалы». */
import ChemPlan from "@/components/subjects/ChemPlan";
import ExamQuestionsPanel from "@/components/subjects/ExamQuestionsPanel";
import { LecturesTab } from "@/components/subjects/LecturesTab";
import { MaterialsTab } from "@/components/subjects/MaterialsTab";
import { PlanTab } from "@/components/subjects/PlanTab";
import { SubjectAssignments } from "@/components/subjects/SubjectAssignments";
import SubjectModules from "@/components/subjects/SubjectModules";
import SubjectSimulations from "@/components/labs/SubjectSimulations";
import SubjectQuestionBank from "@/components/questions/SubjectQuestionBank";
import TicketGenerator from "@/components/subjects/TicketGenerator";
import TestsHub from "@/components/tests/TestsHub";
import { DB_FIRST_PLAN_SLUGS, SUBJECT_STATIC_PLANS } from "@/lib/subject-plan-static";
import type { TabId } from "@/components/subjects/tabs-config";
import type { SubjectController } from "@/components/subjects/useSubjectPage";

export function SubjectStudyPanels({ page }: { page: SubjectController }) {
  const {
    tab,
    slug,
    subject,
    subjectId,
    user,
    plan,
    modules,
    topicItems,
    topicProgressById,
    planSummary,
    planSessions,
    topicBusy,
    resourceErrors,
    cycleTopicStatus,
    openTopicMaterial,
    selectTab,
    openLectureById,
    activeLecture,
    setActiveLecture,
    lectureLoading,
    lectureError,
    subjectLectures,
    orderedLectures,
    planLectureWeeks,
    materialsRich,
    subjectLibrary,
    setActiveMaterial,
    searchParams,
    histology,
  } = page;

  return (
    <>
      {tab === "plan" && SUBJECT_STATIC_PLANS[slug] && (
        <ChemPlan
          planFile={SUBJECT_STATIC_PLANS[slug]}
          subjectSlug={slug}
          apiPlan={DB_FIRST_PLAN_SLUGS.has(slug) ? plan : undefined}
        />
      )}
      {tab === "plan" && !SUBJECT_STATIC_PLANS[slug] && (
        <PlanTab
          plan={plan}
          resourceErrors={resourceErrors}
          planSessions={planSessions || []}
          planSummary={planSummary}
          modules={modules}
          topicItems={topicItems}
          topicProgressById={topicProgressById}
          topicBusy={topicBusy}
          cycleTopicStatus={cycleTopicStatus}
          openTopicMaterial={openTopicMaterial}
          isAdmin={user?.role === "admin"}
          onSelectTab={(t) => selectTab(t as TabId)}
          onOpenLecture={openLectureById}
          subjectHref={`/subjects/${encodeURIComponent(slug)}`}
        />
      )}

      {/* Объединённая вкладка «Экзамен / Билеты»: всё содержимое билетного
          банка (генератор, банки вопросов, ситуационные задачи, препараты,
          архив) и список вопросов к экзамену — в одном месте. Старые адреса
          ?tab=tickets и ?tab=exam ведут сюда. */}
      {tab === "exam" && (
        <div className="space-y-4">
          <TicketGenerator slug={slug} subjectName={subject?.name} />
          <ExamQuestionsPanel subjectSlug={slug} />
        </div>
      )}

      {/* Унификация: физиология и гистология показывают единый DB-TestsHub
          (банки + «Полные тесты»); статический PhysiologyTests/HistologyTests
          больше не рендерим (одни и те же вопросы дважды). */}
      {tab === "tests" && (
        <SubjectAssignments subjectId={subject?.id || subjectId} />
      )}
      {tab === "tests" && (
        <TestsHub
          subjectId={subject?.id || subjectId}
          subjectSlug={slug}
          subjectName={subject?.name}
          course={subject?.course_number ?? 2}
          semester={subject?.semester ?? 3}
          initialTopicId={searchParams.get("topic") || undefined}
          autoStart={searchParams.get("start") === "1"}
          embedded
        />
      )}

      {tab === "practice" && (
        <div className="space-y-3">
          <SubjectQuestionBank subjectId={subject?.id || ""} subjectSlug={slug} subjectName={subject?.name} />
          <SubjectModules
            slug={slug}
            name={subject?.name}
            subjectId={subject?.id || subjectId}
            topics={modules
              .flatMap((m) => (m.topics || []).map((tp: { id?: string; title?: string }) => ({ id: String(tp.id || ""), title: String(tp.title || "") })))
              .filter((tp) => tp.id && tp.title)}
          />
          <SubjectSimulations slug={slug} name={subject?.name} />
          {modules.length > 0 && (
            <section className="card p-5">
              <h2 className="text-lg font-bold">Темы предмета</h2>
              <p className="mt-1 text-sm text-slate-500">
                {histology ? "Темы, к которым привязаны микропрепараты, электронограммы и задания МБХ." : "Темы и практические задания предмета."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {modules.slice(0, 6).map((m, i) => (
                  <div key={m.id || i} className="rounded-xl border p-3 text-sm font-medium">
                    {m.title}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "lectures" && (
        <LecturesTab
          activeLecture={activeLecture}
          lectureLoading={lectureLoading}
          lectureError={lectureError}
          subjectLectures={subjectLectures}
          orderedLectures={orderedLectures}
          planLectureWeeks={planLectureWeeks}
          onOpenLecture={openLectureById}
          onCloseLecture={() => setActiveLecture(null)}
        />
      )}

      {tab === "materials" && (
        <MaterialsTab
          histology={Boolean(histology)}
          materialsRich={materialsRich}
          subjectLibrary={subjectLibrary}
          onRead={setActiveMaterial}
          onSelectTab={selectTab}
        />
      )}
    </>
  );
}
