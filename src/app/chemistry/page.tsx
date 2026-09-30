"use client";

import { FormEvent, useState } from "react";
import type { ChemicalMolecule } from "@/lib/chemistry/types";
import { StructureView } from "@/components/chemistry/StructureView";

const tabs = [
  { key: "2d", label: "2D", available: true },
  { key: "3d", label: "3D", available: true },
  { key: "fischer", label: "Fischer", available: false },
  { key: "haworth", label: "Haworth", available: false },
  { key: "newman", label: "Newman", available: false },
  { key: "chair", label: "Chair", available: false },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export default function ChemistryPage() {
  const [query, setQuery] = useState("benzene");
  const [molecule, setMolecule] = useState<ChemicalMolecule | null>(null);
  const [tab, setTab] = useState<TabKey>("2d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <header>
        <p className="text-sm font-medium opacity-70">MedBioHim · Химическое ядро</p>
        <h1 className="mt-2 text-3xl font-bold">Химический справочник</h1>
        <p className="mt-2 max-w-3xl opacity-80">
          Название / SMILES / InChI → Chemical Resolver → структура с provenance.
          Источник изображения всегда виден: verified (PubChem) или generated (RDKit SVG, если
          подключён WASM).
        </p>
      </header>

      <form onSubmit={resolve} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="benzene, aspirin, SMILES:CCO, InChI=..."
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
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!t.available}
                onClick={() => setTab(t.key)}
                className="rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                title={t.available ? t.label : "Renderer в разработке (beta)"}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_1fr]">
            <StructureView
              molecule={molecule}
              representation={tab === "3d" ? "3d" : "2d"}
            />

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
              {molecule.inchi && (
                <p className="break-all text-sm">
                  <strong>InChI:</strong> {molecule.inchi}
                </p>
              )}
              {molecule.inchikey && (
                <p className="break-all text-sm">
                  <strong>InChIKey:</strong> {molecule.inchikey}
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
                {molecule.provenance.retrievedAt && (
                  <p>
                    <strong>Получено:</strong>{" "}
                    {new Date(molecule.provenance.retrievedAt).toLocaleString()}
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
                Одно вещество → много представлений. Fischer / Haworth / Newman / Chair и Ketcher
                подключаются поверх того же ChemicalMolecule (эксперименты на beta).
              </p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
