"use client";

/**
 * Английский внутри предмета: топики и лексика для медиков. Раньше это была
 * отдельная страница /english, хотя предмет «Иностранный язык» уже существует.
 */
import Link from "next/link";
import ArchiveLectures from "@/components/portals/ArchiveLectures";

export function EnglishArea() {
  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-bold">Топики и лексика</h2>
        <p className="mt-1 text-sm text-slate-500">
          Конспекты для подготовки к парам и зачёту: письмо, профессия, ДВГМУ, врач-биохимик.
          Тренажёр рецептов и термины — во вкладке «Рецепты» предмета{" "}
          <Link href="/subjects/latin?tab=latin" className="font-semibold text-indigo-600 hover:underline">
            латыни
          </Link>
          .
        </p>
      </div>
      <ArchiveLectures setId="english" />
    </section>
  );
}

export default EnglishArea;
