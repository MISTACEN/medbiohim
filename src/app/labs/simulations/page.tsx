import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import SimulationRunner from "@/components/labs/SimulationRunner";
import { resolveSubjectAreaKey, subjectAreaName } from "@/lib/learning/modules";

export const metadata: Metadata = {
  title: "Симуляции — MEDBIOHIM",
  description:
    "Интерактивные учебные модели: кинетика ферментов, титрование слабой кислоты, мембранный потенциал покоя.",
};

function pick(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function SimulationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedSubject = pick(params.subject);
  const areaKey = requestedSubject
    ? resolveSubjectAreaKey({ slug: requestedSubject, name: requestedSubject })
    : null;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600">
            <FlaskConical className="h-4 w-4" /> Симуляции
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Интерактивные модели</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Меняйте параметры и смотрите, как меняется результат. Это учебные модели с явными
            ограничениями — не замена учебнику и не клинический расчёт.
          </p>
          {areaKey ? (
            <p className="mt-2 inline-block rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
              Модели для предмета: {subjectAreaName(areaKey)}
            </p>
          ) : null}
        </div>
        <Link
          href="/labs"
          className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:border-indigo-300"
        >
          К лабораторным
        </Link>
      </header>

      <SimulationRunner initialSlug={pick(params.slug)} subjectSlug={areaKey ?? requestedSubject} />
    </div>
  );
}
