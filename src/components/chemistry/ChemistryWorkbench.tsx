"use client";

import { FormEvent, useState } from "react";
import type { ChemicalMolecule } from "@/lib/chemistry/types";
import type { ProjectionKind } from "@/lib/chemistry/projections";
import { StructureView } from "@/components/chemistry/StructureView";
import { ProjectionView } from "@/components/chemistry/ProjectionView";
import { MechanismView } from "@/components/chemistry/MechanismView";
import { VseprView } from "@/components/chemistry/VseprView";
import { mechanismDemos } from "@/lib/chemistry/mechanism";

const structureTabs = [
  { key: "2d", label: "2D", available: true },
  { key: "3d", label: "3D", available: true },
  { key: "vsepr", label: "VSEPR", available: true },
  { key: "fischer", label: "Fischer", available: true },
  { key: "haworth", label: "Haworth", available: true },
  { key: "newman", label: "Newman", available: true },
  { key: "chair", label: "Chair", available: true },
] as const;

type TabKey = (typeof structureTabs)[number]["key"];
const projectionKeys: ProjectionKind[] = ["fischer", "haworth", "newman", "chair"];

/** Химическое ядро: resolver + 2D/3D + проекции + механизмы. */
export function ChemistryWorkbench({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("glucose");
  const [molecule, setMolecule] = useState<ChemicalMolecule | null>(null);
  const [tab, setTab] = useState<TabKey>("2d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showMech, setShowMech] = useState(0);

  async function resolve(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/chemistry/resolve?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      const payload = data?.data ?? data;
      if (!response.ok || data?.error) throw new Error(data?.error?.message || data?.error || "Не удалось найти вещество");
      const raw = payload?.molecule;
      if (!raw) throw new Error("Вещество не найдено");
      const normalized: ChemicalMolecule = {
        ...raw,
        molecularWeight: raw.molecularWeight ?? raw.weight,
        canonicalSmiles: raw.canonicalSmiles ?? raw.smiles,
        isomericSmiles: raw.isomericSmiles ?? raw.smiles,
        image2dUrl: raw.image2dUrl ?? raw.image,
        provenance: raw.provenance ?? { source: "pubchem", label: "PubChem" },
      };
      setMolecule(normalized);
      setTab("2d");
    } catch (e) {
      setMolecule(null);
      setError(e instanceof Error ? e.message : "Не удалось найти вещество");
    } finally {
      setLoading(false);
    }
  }

  const isProjection = projectionKeys.includes(tab as ProjectionKind);

  return (
    <section className={embedded ? "space-y-4" : "mx-auto max-w-6xl space-y-6"}>
      {!embedded && (
        <header>
          <p className="text-sm font-medium text-slate-500">MedBioHim · Химическое ядро</p>
          <h1 className="mt-2 text-3xl font-bold">Химический справочник</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Resolver + 2D/3D + проекции Фишера / Haworth / Newman / Chair. Механизмы со стрелками электронов — учебные
            SVG-схемы поверх того же ядра.
          </p>
        </header>
      )}

      <form onSubmit={resolve} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="glucose, benzene, SMILES:CCO…"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300"
          aria-label="Химический запрос"
        />
        <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">
          {loading ? "Поиск…" : "Получить структуру"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] p-4 text-sm text-[var(--status-critical-fg)]">{error}</p>}

      {molecule && (
        <section className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {structureTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!t.available}
                onClick={() => setTab(t.key)}
                className={
                  "rounded-lg border px-3 py-2 text-sm disabled:opacity-40 " +
                  (tab === t.key
                    ? "border-indigo-600 bg-indigo-600 font-semibold text-white"
                    : "border-[var(--border)] text-slate-700 hover:border-indigo-300")
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_1fr]">
            {tab === "vsepr" ? (
              <div className="md:col-span-2">
                <VseprView molecule={molecule} />
              </div>
            ) : isProjection ? (
              <ProjectionView molecule={molecule} kind={tab as ProjectionKind} />
            ) : (
              <StructureView molecule={molecule} representation={tab === "3d" ? "3d" : "2d"} />
            )}

            <div className="space-y-3 text-sm text-slate-700">
              <h2 className="text-2xl font-semibold text-slate-900">{molecule.name}</h2>
              {molecule.formula && (
                <p><strong>Формула:</strong> {molecule.formula}</p>
              )}
              {molecule.molecularWeight != null && (
                <p><strong>Молекулярная масса:</strong> {molecule.molecularWeight}</p>
              )}
              {molecule.isomericSmiles && (
                <p className="break-all text-xs"><strong>SMILES:</strong> {molecule.isomericSmiles}</p>
              )}
              <div className="space-y-1 rounded-xl border border-[var(--border)] p-4 text-xs">
                <p><strong>Источник записи:</strong> {molecule.provenance.label || molecule.provenance.source}</p>
                {molecule.cid != null && <p><strong>CID:</strong> {molecule.cid}</p>}
                {molecule.provenance.sourceUrl && (
                  <a className="mt-2 inline-block font-semibold text-indigo-700 underline" href={molecule.provenance.sourceUrl} target="_blank" rel="noreferrer">
                    Открыть источник
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Fischer/Haworth — попробуйте glucose. Newman/Chair — учебные шаблоны.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
        <header>
          <h2 className="text-xl font-bold">Механизмы · стрелки электронов</h2>
          <p className="mt-1 text-sm text-slate-500">Curly arrows (пары e⁻). Позже — привязка к атомам RDKit и анимация шагов.</p>
        </header>
        <div className="flex flex-wrap gap-2">
          {mechanismDemos.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setShowMech(i)}
              className={
                "rounded-lg border px-3 py-2 text-sm " +
                (showMech === i
                  ? "border-indigo-600 bg-indigo-600 font-semibold text-white"
                  : "border-[var(--border)] text-slate-700 hover:border-indigo-300")
              }
            >
              {m.name}
            </button>
          ))}
        </div>
        <MechanismView mechanism={mechanismDemos[showMech]} />
      </section>
    </section>
  );
}

export default ChemistryWorkbench;
