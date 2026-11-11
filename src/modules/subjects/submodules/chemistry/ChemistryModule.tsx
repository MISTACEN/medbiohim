"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { ReactionBalancer } from "@/components/chemistry/ReactionBalancer";
import { ChemistryWorkbench } from "./ChemistryWorkbench";
import ChemTools from "./ChemTools";
import { LabBench } from "./LabBench";
import { PeriodicTable } from "./PeriodicTable";
import { PracticeRunner } from "./PracticeRunner";

/**
 * Химический модуль целиком, а не только справочник структур.
 *
 * Раньше в панели лекции были структуры и два механизма, а уравнивание
 * реакций, растворы/pH, лаборатория, генератор вариантов и таблица элементов
 * жили отдельными страницами, до которых из лекции было не добраться.
 * Здесь они собраны в один модуль с разделами.
 *
 * Разделы монтируются при первом открытии и остаются в дереве (скрыты через
 * `hidden`): переключение не теряет введённое уравнение или ввод задачи, но
 * открытие панели в лекции не тянет 118 элементов и графики лаборатории.
 */
export type ChemistrySection =
  | "structures"
  | "reactions"
  | "solutions"
  | "lab"
  | "practice"
  | "elements";

const SECTIONS: Array<{ id: ChemistrySection; label: string; hint: string }> = [
  {
    id: "structures",
    label: "Структуры",
    hint: "Название, формула или SMILES → 2D, 3D, VSEPR, проекции Фишера/Haworth/Newman/Chair и механизмы со стрелками электронов.",
  },
  {
    id: "reactions",
    label: "Реакции",
    hint: "Уравнение со знаком «->», «→» или «=»: решатель расставит коэффициенты и проверит атомы и заряд.",
  },
  {
    id: "solutions",
    label: "Растворы",
    hint: "Разведение C₁V₁ = C₂V₂, pH сильных и слабых электролитов, буферные системы.",
  },
  {
    id: "lab",
    label: "Лаборатория",
    hint: "Расчётные опыты: титрование с индикатором, уравнение Нернста, закон Бугера–Ламберта–Бера.",
  },
  {
    id: "practice",
    label: "Практика",
    hint: "Вариант задач по seed: ответы проверяются, решения по шагам, выгрузка CSV и печать.",
  },
  {
    id: "elements",
    label: "Элементы",
    hint: "118 элементов: поиск по символу и названию, фильтр по категориям, карточка элемента.",
  },
];

export function ChemistryModule({ className }: { className?: string }) {
  const [section, setSection] = useState<ChemistrySection>("structures");
  const [opened, setOpened] = useState<ChemistrySection[]>(["structures"]);

  function select(next: ChemistrySection) {
    setSection(next);
    setOpened((prev) => (prev.includes(next) ? prev : [...prev, next]));
  }

  const active = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <section className={className || "space-y-4"}>
      <Tabs
        variant="outline"
        label="Разделы химического модуля"
        idPrefix="chem-tab"
        value={section}
        onChange={select}
        items={SECTIONS.map(({ id, label }) => ({ id, label }))}
      />

      <p className="text-xs leading-5 text-[var(--muted)]">{active.hint}</p>

      {SECTIONS.filter((item) => opened.includes(item.id)).map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`chem-section-${item.id}`}
          aria-labelledby={`chem-tab-${item.id}`}
          hidden={section !== item.id}
          className="min-w-0"
        >
          {item.id === "structures" && <ChemistryWorkbench embedded />}
          {item.id === "reactions" && <ReactionBalancer />}
          {item.id === "solutions" && <ChemTools />}
          {item.id === "lab" && <LabBench />}
          {item.id === "practice" && <PracticeRunner />}
          {item.id === "elements" && <PeriodicTable />}
        </div>
      ))}
    </section>
  );
}

export default ChemistryModule;
