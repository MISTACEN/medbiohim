"use client";

/**
 * Лабораторная скамья: вкладки титрования, электрохимии, спектроскопии,
 * кондуктометрии и органической лаборатории. Реализация вкладок разнесена
 * по `./lab/` (model.ts — перечень вкладок и форматирование, ui.tsx — общие
 * примитивы, TitrationTab / ElectrochemistryTab / SpectroscopyTab /
 * OrganicLabs — содержимое), кондуктометрия — ./ConductometryLab.
 */
import { useState } from "react";

import ConductometryLab from "./ConductometryLab";

import { Tabs } from "@/components/ui/Tabs";

import { ElectrochemistryTab } from "./lab/ElectrochemistryTab";
import { TABS, type Tab } from "./lab/model";
import { OrganicLabs } from "./lab/OrganicLabs";
import { SpectroscopyTab } from "./lab/SpectroscopyTab";
import { TitrationTab } from "./lab/TitrationTab";


export function LabBench() {
  const [tab, setTab] = useState<Tab>("titration");
  return (
    <section className="space-y-4">
      <Tabs
        className="print:hidden"
        variant="outline"
        label="Опыты"
        value={tab}
        onChange={setTab}
        items={TABS.map(({ id, label, Icon }) => ({ id, label, icon: Icon }))}
      />

      <div className="card p-4 sm:p-5">
        {tab === "titration" && <TitrationTab />}
        {tab === "electrochemistry" && <ElectrochemistryTab />}
        {tab === "spectroscopy" && <SpectroscopyTab />}
        {tab === "conductometry" && <ConductometryLab />}
        {tab === "organic" && <OrganicLabs />}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Опыты 5.1–5.6, 9.1–9.5, 10.3 и 11.1–11.3 — конспект методички для группы МБХ-201: уравнения,
        объяснения и ответы на вопросы. Вкладки с титрованием, элементом Нернста, спектроскопией и
        кондуктометрией — расчётные симуляции, а не запись реального эксперимента: они показывают,
        что должно получиться при указанных параметрах.
      </p>
    </section>
  );
}

export default LabBench;
