"use client";

/**
 * Химия внутри страницы предмета: ядро, таблица элементов, уравнивание реакций,
 * растворы и pH, генератор вариантов, лаборатория и растворимость — всё
 * рендерится здесь же, без перехода на отдельные страницы.
 *
 * Раньше эти разделы жили на `/chemistry/*`, `/periodic` и во вкладках «Инструментов»,
 * то есть одно и то же открывалось из трёх мест. Теперь единственная точка входа —
 * вкладка «Химия» предмета; старые адреса редиректят сюда с нужной секцией
 * (`?tab=chem&section=…`).
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Atom, Beaker, Calculator, Droplets, FlaskConical, Layers, ListChecks, Sigma } from "lucide-react";
import {
  ChemTools,
  ChemistryWorkbench,
  EffectsReference,
  LabBench,
  PeriodicTable,
  PracticeRunner,
  ReactionBalancer,
} from "@/modules/subjects/submodules/chemistry";
import { SolubilityTableView } from "@/components/tools/SolubilityTableView";

type ChemSection = "core" | "effects" | "elements" | "reactions" | "solutions" | "practice" | "lab" | "solubility";

const SECTIONS: Array<{ id: ChemSection; label: string; Icon: typeof Atom }> = [
  { id: "core", label: "Ядро", Icon: Layers },
  { id: "effects", label: "Эффекты", Icon: Sigma },
  { id: "elements", label: "Элементы", Icon: Atom },
  { id: "reactions", label: "Реакции", Icon: FlaskConical },
  { id: "solutions", label: "Растворы и pH", Icon: Droplets },
  { id: "practice", label: "Практика", Icon: ListChecks },
  { id: "lab", label: "Лаборатория", Icon: Beaker },
  { id: "solubility", label: "Растворимость", Icon: Calculator },
];

function isChemSection(value: string | null): value is ChemSection {
  return SECTIONS.some((section) => section.id === value);
}

export function ChemistryArea() {
  const search = useSearchParams();
  const [section, setSection] = useState<ChemSection>(() => {
    const fromUrl = search.get("section");
    return isChemSection(fromUrl) ? fromUrl : "core";
  });

  useEffect(() => {
    const fromUrl = search.get("section");
    if (isChemSection(fromUrl) && fromUrl !== section) setSection(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const switchSection = useCallback((next: ChemSection) => {
    setSection(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "chem");
      url.searchParams.set("section", next);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* история недоступна — секция всё равно переключилась */
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="mobile-scroll-x flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Разделы химии">
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => switchSection(id)}
            className={clsx(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition",
              section === id
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-[var(--border)] bg-white text-slate-700 hover:border-indigo-300",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {section === "core" && <ChemistryWorkbench embedded />}
      {section === "effects" && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Электронные эффекты</h2>
          <p className="mt-1 text-sm text-slate-500">
            ±I и ±M по заместителям, ориентация в аренах и следствия для кислотности, основности и реакций —
            с поиском и переходом в тест по теме 1.2.
          </p>
          <div className="mt-4">
            <EffectsReference />
          </div>
        </section>
      )}
      {section === "elements" && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Периодическая таблица</h2>
          <p className="mt-1 text-sm text-slate-500">
            118 элементов: поиск по символу, названию или номеру, фильтр по категориям и карточка элемента.
          </p>
          <div className="mt-4">
            <PeriodicTable />
          </div>
        </section>
      )}
      {section === "reactions" && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Уравнивание реакций</h2>
          <p className="mt-1 text-sm text-slate-500">
            Метод Гаусса над точными дробями: минимальные целые коэффициенты, проверка сохранения атомов и заряда.
          </p>
          <div className="mt-4">
            <ReactionBalancer />
          </div>
        </section>
      )}
      {section === "solutions" && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Растворы и pH</h2>
          <p className="mt-1 text-sm text-slate-500">
            Разведение C₁V₁ = C₂V₂, pH сильных и слабых электролитов, буферные системы.
          </p>
          <div className="mt-4">
            <ChemTools />
          </div>
        </section>
      )}
      {section === "practice" && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Генератор вариантов</h2>
          <p className="mt-1 text-sm text-slate-500">
            Задачи по seed: пошаговые решения, проверка ответа, CSV и печать — вариант можно продиктовать группе.
          </p>
          <div className="mt-4">
            <PracticeRunner />
          </div>
        </section>
      )}
      {section === "lab" && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Виртуальная лаборатория</h2>
          <p className="mt-1 text-sm text-slate-500">
            Опыты органики из методички и расчётные симуляции: титрование, элемент Нернста, Бугер–Ламберт–Бер,
            кондуктометрия.
          </p>
          <div className="mt-4">
            <LabBench />
          </div>
        </section>
      )}
      {section === "solubility" && (
        <section className="card p-4 sm:p-5">
          <h2 className="text-lg font-bold">Таблица растворимости</h2>
          <p className="mt-1 text-sm text-slate-500">Катионы × анионы: где осадок, где газ, где раствор остаётся прозрачным.</p>
          <div className="mt-4">
            <SolubilityTableView />
          </div>
        </section>
      )}
    </div>
  );
}

export default ChemistryArea;
