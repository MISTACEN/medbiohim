"use client";

/** Вкладки «Тренажёры», «Препараты», «Лабораторные», «Аттестации», «Прогресс». */
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import AttestationList from "@/components/attestations/AttestationList";
import Labs from "@/components/Labs";
import SubjectTrainersHub from "@/components/trainers/SubjectTrainersHub";
import HistologyTrainer from "@/components/trainers/HistologyTrainer";
import TabFallback from "@/components/subjects/TabFallback";
import type { SubjectController } from "@/components/subjects/useSubjectPage";

export function SubjectPracticePanels({ page }: { page: SubjectController }) {
  const { tab, slug, subject, subjectId, histology, selectTab, tests, materials, progress } = page;

  return (
    <>
      {tab === "trainer" && (
        histology ? (
          <HistologyTrainer embedded />
        ) : (
          <TabFallback
            title="Микропрепараты"
            description="Для этого предмета микропрепараты пока не подключены. Потренируйтесь на вопросах с эталонами или запустите тест."
            onOpenTab={selectTab}
          />
        )
      )}

      {tab === "trainers" && (
        histology ? (
          <SubjectTrainersHub lectureHref={`/subjects/${encodeURIComponent(subjectId)}?tab=lectures`} />
        ) : (
          <TabFallback
            title="Тренажёры"
            description="Интерактивные тренажёры по этому предмету пока не подключены. Можно отработать материал в базе вопросов или в тестах."
            onOpenTab={selectTab}
          />
        )
      )}

      {tab === "labs" && (
        <section className="space-y-3">
          <div className="card p-5">
            <h2 className="text-lg font-bold">Интерактивные лабораторные</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Пошаговые лабораторные работы по этому предмету: задания внутри сессии, ответы и проверка преподавателем.
            </p>
          </div>
          <Labs subject={slug} />
        </section>
      )}

      {tab === "attestations" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">
              <ClipboardList className="h-4 w-4" /> Аттестации
            </div>
            <h2 className="mt-1.5 font-serif text-xl font-semibold">Коллоквиумы, экзамены, зачёты и контрольные</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Открывайте аттестацию по этапам: теория с конспектом ответа, проверяемые тесты и задачи с эталонным решением. Прогресс сохраняется автоматически.
            </p>
          </div>
          <AttestationList subjectSlug={slug} subjectName={subject?.name} />
        </section>
      )}

      {/* Список вопросов к экзамену уже отрисован в объединённой вкладке
          «Экзамен / Билеты» — второй экземпляр дублировал его на странице. */}

      {tab === "progress" && (
        <section className="card p-5">
          <h2 className="text-lg font-bold">Прогресс</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Общий</div>
              <b className="text-2xl">{progress?.overall_pct != null ? Math.round(progress.overall_pct) + "%" : "—"}</b>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Тесты</div>
              <b className="text-2xl">{tests.length}</b>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs text-slate-500">Материалы</div>
              <b className="text-2xl">{materials.length}</b>
            </div>
          </div>
          {tests.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {tests.slice(0, 6).map((t) => (
                <Link key={t.id} href={"/tests/preparation/" + encodeURIComponent(t.id)} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
                  {t.title || t.name || "Тест"} · {t.questions_count || 0} вопросов
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
