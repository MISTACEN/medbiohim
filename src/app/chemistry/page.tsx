"use client";

import { FormEvent, useState } from "react";
import type { ChemicalMolecule } from "@/lib/chemistry/types";
import type { ProjectionKind } from "@/lib/chemistry/projections";
import { StructureView } from "@/components/chemistry/StructureView";
import { ProjectionView } from "@/components/chemistry/ProjectionView";
import { MechanismView } from "@/components/chemistry/MechanismView";
import { mechanismDemos } from "@/lib/chemistry/mechanism";

const structureTabs = [
  { key: "2d", label: "2D", available: true },
  { key: "3d", label: "3D", available: true },
  { key: "fischer", label: "Fischer", available: true },
  { key: "haworth", label: "Haworth", available: true },
  { key: "newman", label: "Newman", available: true },
  { key: "chair", label: "Chair", available: true },
] as const;

type TabKey = (typeof structureTabs)[number]["key"];

const projectionKeys: ProjectionKind[] = ["fischer", "haworth", "newman", "chair"];

export default function ChemistryPage() {
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
      const response = await fetch(`/api/chemistry/resolve?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Не удалось найти вещество");
      if (!data.molecule) throw new Error("Вещество не найдено");
      setMolecule(data.molecule);
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
    <main className="mx-auto max-w-6xl space-y-10 p-6">
      <header>
        <p className="text-sm font-medium opacity-70">MedBioHim · Химическое ядро</p>
        <h1 className="mt-2 text-3xl font-bold">Химический справочник</h1>
        <p className="mt-2 max-w-3xl opacity-80">
          Resolver + 2D/3D + проекции Фишера / Haworth / Newman / Chair. Механизмы со стрелками
          электронов — учебные SVG-схемы поверх того же ядра.
        </p>
      </header>

      <form onSubmit={resolve} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="glucose, benzene, SMILES:CCO…"
          className="min-w-0 flex-1 rounded-xl border bg-transparent px-4 py-3"
          aria-label="Химический запрос"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl border px-5 py-3 font-medium disabled:opacity-50"
        >
          {loading ? "Поиск…" : "Получить структуру"}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-xl border p-4 text-sm">
          {error}
        </p>
      )}

      {molecule && (
        <section className="space-y-5 rounded-2xl border p-6">
          <div className="flex flex-wrap gap-2">
            {structureTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!t.available}
                onClick={() => setTab(t.key)}
                className={
                  "rounded-lg border px-3 py-2 text-sm disabled:opacity-40 " +
                  (tab === t.key ? "font-semibold" : "opacity-80")
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_1fr]">
            {isProjection ? (
              <ProjectionView molecule={molecule} kind={tab as ProjectionKind} />
            ) : (
              <StructureView
                molecule={molecule}
                representation={tab === "3d" ? "3d" : "2d"}
              />
            )}

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold">{molecule.name}</h2>
              {molecule.formula && (
                <p>
                  <strong>Формула:</strong> {molecule.formula}
                </p>
              )}
              {molecule.molecularWeight != null && (
                <p>
                  <strong>Молекулярная масса:</strong> {molecule.molecularWeight}
                </p>
              )}
              {molecule.isomericSmiles && (
                <p className="break-all text-sm">
                  <strong>SMILES:</strong> {molecule.isomericSmiles}
                </p>
              )}
              <div className="rounded-xl border p-4 text-sm space-y-1">
                <p>
                  <strong>Источник записи:</strong>{" "}
                  {molecule.provenance.label || molecule.provenance.source}
                </p>
                {molecule.cid != null && (
                  <p>
                    <strong>CID:</strong> {molecule.cid}
                  </p>
                )}
                {molecule.provenance.sourceUrl && (
                  <a
                    className="mt-2 inline-block underline"
                    href={molecule.provenance.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть источник
                  </a>
                )}
              </div>
              <p className="text-xs opacity-60">
                Совет: для Fischer/Haworth попробуйте glucose. Newman/Chair — учебные шаблоны.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-2xl border p-6">
        <header>
          <h2 className="text-xl font-bold">Механизмы · стрелки электронов</h2>
          <p className="mt-1 text-sm opacity-75">
            Curly arrows (пары e⁻). Позже — привязка к атомам RDKit и анимация шагов.
          </p>
        </header>
        <div className="flex flex-wrap gap-2">
          {mechanismDemos.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setShowMech(i)}
              className={
                "rounded-lg border px-3 py-2 text-sm " +
                (showMech === i ? "font-semibold" : "opacity-80")
              }
            >
              {m.name}
            </button>
          ))}
        </div>
        <MechanismView mechanism={mechanismDemos[showMech]} />
      </section>
    </main>
  );
}
