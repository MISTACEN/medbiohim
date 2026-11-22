"use client";

/** Вкладки «Платформы», «Рецепты», «Структуры», «Коллоквиум», «Занятия». */
import ArchiveLectures from "@/components/portals/ArchiveLectures";
import ChemSdf from "@/components/portals/ChemSdf";
import HobaPortal from "@/components/portals/HobaPortal";
import LatinRecipes from "@/components/portals/LatinRecipes";
import LegacyMCTests from "@/components/portals/LegacyMCTests";
import MatchingTrainer from "@/components/portals/MatchingTrainer";
import Colloquium from "@/components/physiology/Colloquium";
import PhysiologyPractice from "@/components/physiology/PhysiologyPractice";
import ExternalPlatformLinks from "@/components/university/ExternalPlatformLinks";
import { ChemistryArea } from "@/components/subjects/ChemistryArea";
import type { SubjectController } from "@/components/subjects/useSubjectPage";

export function SubjectPortalPanels({ page }: { page: SubjectController }) {
  const { tab, slug, subjectId, chemistry, latin, portal, externalPlatforms } = page;

  return (
    <>
      {tab === "colloquium" && slug === "physiology" && <Colloquium embedded />}

      {/* Химия живёт целиком внутри предмета: ядро, элементы, реакции,
          растворы, практика, лаборатория и растворимость — без переходов наружу. */}
      {tab === "chem" && chemistry && <ChemistryArea />}

      {tab === "latin" && latin && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Латинский язык · рецепты</h2>
          <p className="mt-1 text-sm text-slate-500">
            Формы рецептов по Чернявскому: разделы, поиск и карточки Rp./Da./Signa — без ухода с предмета.
          </p>
          <div className="mt-4">
            <LatinRecipes />
          </div>
        </section>
      )}

      {tab === "portal" && (portal || externalPlatforms.length > 0) && (
        <div className="space-y-6">
          {portal?.hoba && <HobaPortal />}
          {portal?.sdf && <ChemSdf />}
          {portal?.parasitology && <MatchingTrainer />}
          {(portal?.lectures || portal?.lecturesOrganic) && (
            <ArchiveLectures
              sets={[
                ...(portal?.lectures ? [portal.lectures] : []),
                ...(portal?.lecturesOrganic ? ["chem-organic" as const] : []),
              ]}
            />
          )}
          {portal?.mcSubjectIds?.length ? (
            <section className="space-y-3">
              <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-400">Тестовые тренировки</h2>
              <LegacyMCTests subjectIds={portal.mcSubjectIds} />
            </section>
          ) : null}
          <ExternalPlatformLinks subjectSlug={slug} />
        </div>
      )}

      {tab === "lessons" && slug === "physiology" && (
        <PhysiologyPractice backHref={`/subjects/${encodeURIComponent(subjectId)}?tab=plan`} backLabel="К учебному плану" />
      )}
    </>
  );
}
